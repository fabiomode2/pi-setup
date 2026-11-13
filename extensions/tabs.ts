/**
 * Pestañas de sesión en una columna a la derecha, clicables.
 *
 * - Lista por directorio de trabajo (~/.pi/agent/pi-tabs.json), sobrevive reinicios.
 * - Estado por pestaña: en marcha (spinner), terminada sin leer (●), leída (✓).
 * - Clic en una fila para cambiar de pestaña.
 * - Los subagentes en marcha se listan debajo (eventos de pi-subagents-lite).
 *
 *   /tabs            selector
 *   /tabs new        nueva pestaña        /tabs close   cerrar actual
 *   /tabs rename X   renombrar
 *
 * Atajos: ctrl+alt+←/→, alt+1…9, alt+. / alt+,
 */
import type { Component, ExtensionAPI, ExtensionContext, TuiMouseEvent } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Tab = { path: string; name: string; auto?: boolean; seenAt?: number };

const STORE_PATH = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "pi-tabs.json");
const COLUMN_WIDTH = 36;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function loadStore(): Record<string, { tabs: Tab[]; active?: string }> {
	try {
		return JSON.parse(readFileSync(STORE_PATH, "utf8"));
	} catch {
		return {};
	}
}

export default function (pi: ExtensionAPI) {
	let store = loadStore();
	let cwd = process.cwd();
	let active: string | undefined;
	let busy = false;
	let expandedGuess = false;
	let spinnerIndex = 0;
	let pollTimer: ReturnType<typeof setInterval> | undefined;
	const agents = new Map<string, string>();

	const save = () => {
		try {
			mkdirSync(dirname(STORE_PATH), { recursive: true });
			writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
		} catch {
			// sin persistencia seguimos en memoria
		}
	};

	// Varias ventanas de Pi comparten pi-tabs.json: releemos antes de cada cambio
	// para no pisar las pestañas que haya abierto otro proceso.
	const refresh = () => {
		store = loadStore();
	};
	const entry = () => (store[cwd] ??= { tabs: [] });

	/** Una pestaña sin ningún mensaje de usuario no molesta: se descarta. */
	const isEmptySession = (path: string): boolean => {
		try {
			const raw = readFileSync(path, "utf8");
			for (const line of raw.split("\n")) {
				if (line.includes('"role":"user"')) return false;
			}
			return true;
		} catch {
			return true; // sin fichero todavía: no hay nada escrito
		}
	};

	const dropEmptyTabs = (keep?: string) => {
		const tabs = entry().tabs;
		const kept = tabs.filter((tab) => tab.path === keep || !isEmptySession(tab.path));
		if (kept.length !== tabs.length) {
			store[cwd] = { tabs: kept, active };
			save();
		}
		return kept;
	};
	const setActive = (path: string | undefined) => {
		active = path;
		entry().active = path;
		const tab = entry().tabs.find((item) => item.path === path);
		if (tab) tab.seenAt = Date.now();
		save();
	};

	/** Una pestaña está sin leer si su sesión se escribió después de verla. */
	const isUnread = (tab: Tab): boolean => {
		if (tab.path === active) return false;
		try {
			const mtime = statSync(tab.path).mtimeMs;
			return mtime > (tab.seenAt ?? 0);
		} catch {
			return false;
		}
	};

	const WIDGET_ROWS = 6;

	class TabsColumn implements Component {
		constructor(private readonly ctx: ExtensionContext) {}

		render(width: number): string[] {
			const theme = this.ctx.ui.theme;
			const tabs = entry().tabs;
			const expanded =
				(this.ctx.ui as unknown as { getToolsExpanded?: () => boolean }).getToolsExpanded?.() ?? expandedGuess;

			const body: string[] = [];
			tabs.slice(0, WIDGET_ROWS - 1).forEach((tab, index) => {
				const isActiveTab = tab.path === active;
				const unread = isUnread(tab);
				const glyph = isActiveTab && busy ? SPINNER[spinnerIndex % SPINNER.length] : unread ? "●" : "✓";
				const color = isActiveTab ? "accent" : unread ? "warning" : "success";
				const label = `${index + 1} ${tab.name}`;
				const room = COLUMN_WIDTH - 4;
				const clipped = label.length > room ? `${label.slice(0, room - 1)}…` : label;
				body.push(
					isActiveTab
						? theme.bg("selectedBg", theme.fg("accent", ` ${glyph} ${clipped}`))
						: theme.fg(color, ` ${glyph} `) + theme.fg(unread ? "text" : "dim", clipped),
				);
			});

			if (expanded) body.push(theme.fg("warning", " ⊟ colapsar todo"));
			while (body.length < WIDGET_ROWS) body.push("");

			// Alto fijo: todas las filas ocupan el mismo ancho y siempre son WIDGET_ROWS.
			return body.slice(0, WIDGET_ROWS).map((text) => {
				const line = `${theme.fg("borderAccent", "│")} ${text}${" ".repeat(Math.max(0, COLUMN_WIDTH - 2 - visibleWidth(text)))}`;
				return `${" ".repeat(Math.max(0, width - visibleWidth(line)))}${line}`;
			});
		}

		handleMouse(event: TuiMouseEvent) {
			if (event.type !== "press" && event.type !== "click") return undefined;
			if (event.button !== "left") return undefined;
			const tabs = entry().tabs;
			const expanded =
				(this.ctx.ui as unknown as { getToolsExpanded?: () => boolean }).getToolsExpanded?.() ?? expandedGuess;
			if (expanded && event.y === tabs.length) {
				(this.ctx.ui as unknown as { setToolsExpanded?: (value: boolean) => void }).setToolsExpanded?.(false);
				expandedGuess = false;
				return { handled: true };
			}
			if (event.y < 0 || event.y >= Math.min(tabs.length, WIDGET_ROWS - 1)) return undefined;
			this.onPick(event.y);
			return { handled: true };
		}

		onPick: (index: number) => void = () => {};
		invalidate() {}
	}

	class CollapseButton implements Component {
		constructor(private readonly ctx: ExtensionContext) {}

		render(): string[] {
			return [this.ctx.ui.theme.bg("selectedBg", this.ctx.ui.theme.fg("warning", " ⊟ colapsar todo "))];
		}

		handleMouse(event: TuiMouseEvent) {
			import("node:fs").then((fs) => fs.appendFileSync("/tmp/click.log", `${JSON.stringify(event)} rows=${JSON.stringify(this.rows)}\n`)).catch(() => {});
			if (event.type !== "press" && event.type !== "click") return undefined;
			(this.ctx.ui as unknown as { setToolsExpanded?: (value: boolean) => void }).setToolsExpanded?.(false);
			return { handled: true };
		}

		invalidate() {}
	}

	let requestRender: (() => void) | undefined;
	let widgetInstalled = false;

	/** Instala el widget una sola vez; los cambios solo piden repintar. */
	const draw = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (entry().tabs.length === 0) {
			ctx.ui.setWidget("tabs", undefined);
			widgetInstalled = false;
			return;
		}
		if (!widgetInstalled) {
			widgetInstalled = true;
			const column = new TabsColumn(ctx);
			column.onPick = (index) => requestSwitch(ctx, index);
			ctx.ui.setWidget("tabs", (tui) => {
				requestRender = () => tui.requestRender();
				return column;
			});
		}
		requestRender?.();
	};

	/**
	 * Solo un contexto de comando puede cambiar de sesión (ExtensionCommandContext).
	 * Desde un atajo o un clic dejamos el comando escrito en el editor.
	 */
	const requestSwitch = (ctx: ExtensionContext, index: number) => {
		refresh();
		const target = entry().tabs[index];
		if (!target) return;
		// Con el parche del bundle, hasta el contexto de un clic puede cambiar de
		// sesión; si no está, se ejecuta el comando como si se tecleara.
		if (typeof (ctx as unknown as { switchSession?: unknown }).switchSession === "function") {
			void switchTo(ctx, target);
			return;
		}
		try {
			(process.stdin as unknown as { unshift?: (buffer: Buffer) => void }).unshift?.(
				Buffer.from(`/tabs ${index + 1}\r`),
			);
		} catch {
			ctx.ui.setEditorText(`/tabs ${index + 1}`);
			ctx.ui.notify(`Escribe /tabs ${index + 1} y pulsa Enter`, "warning");
		}
	};


	const switchTo = async (ctx: ExtensionContext, target: Tab) => {
		if (target.path === active) return;
		refresh();
		try {
			const result = await ctx.switchSession(target.path, {
				withSession: async (freshCtx) => {
					const file = freshCtx.sessionManager.getSessionFile();
					if (file) {
						setActive(file);
						draw(freshCtx);
					}
				},
			});
			if (result.cancelled) ctx.ui.notify("Cambio de pestaña cancelado", "warning");
		} catch (error) {
			store[cwd] = { tabs: entry().tabs.filter((tab) => tab.path !== target.path), active };
			save();
			draw(ctx);
			ctx.ui.notify(`No se pudo abrir esa pestaña: ${(error as Error).message}`, "error");
		}
	};

	const cycle = async (ctx: ExtensionContext, step: 1 | -1) => {
		const tabs = entry().tabs;
		if (tabs.length < 2) return;
		const index = tabs.findIndex((tab) => tab.path === active);
		await switchTo(ctx, tabs[(index + step + tabs.length) % tabs.length]!);
	};

	const stepRequest = (ctx: ExtensionContext, step: 1 | -1) => {
		const tabs = entry().tabs;
		if (tabs.length < 2) return;
		const index = tabs.findIndex((tab) => tab.path === active);
		const nextIndex = (index + step + tabs.length) % tabs.length;
		requestSwitch(ctx, nextIndex);
	};

	const closeCurrent = async (ctx: ExtensionContext) => {
		refresh();
		dropEmptyTabs(active);
		const tabs = entry().tabs;
		const index = tabs.findIndex((tab) => tab.path === active);
		if (index === -1) return;
		const remaining = tabs.filter((_, i) => i !== index);
		if (remaining.length === 0) {
			setActive(undefined);
			draw(ctx);
			ctx.ui.notify("Pestaña cerrada. La sesión sigue guardada.", "info");
			return;
		}
		const next = remaining[Math.min(index, remaining.length - 1)]!;
		store[cwd] = { tabs: remaining, active: next.path };
		active = next.path;
		save();
		await switchTo(ctx, next);
	};

	const shorten = (text: string): string => (text.length > 20 ? `${text.slice(0, 19)}…` : text);

	const firstUserText = (ctx: ExtensionContext): string | undefined => {
		for (const entryItem of ctx.sessionManager.getBranch()) {
			if (entryItem.type !== "message" || entryItem.message.role !== "user") continue;
			const text = (entryItem.message.content as { type: string; text?: string }[])
				.filter((part) => part.type === "text")
				.map((part) => part.text ?? "")
				.join(" ")
				.replace(/\s+/g, " ")
				.trim();
			if (text.length >= 3) return text;
		}
		return undefined;
	};

	const labelFor = (ctx: ExtensionContext): string => {
		const name = ctx.sessionManager.getSessionName();
		if (name) return name;
		const file = ctx.sessionManager.getSessionFile();
		if (!file) return "New Session";
		return "New Session";
	};

	pi.on("session_start", async (_event, ctx) => {
		refresh();
		cwd = ctx.sessionManager.getCwd();
		// Sin filtrar por existsSync: una sesión recién creada aún no tiene .jsonl.
		const tabs = dropEmptyTabs();
		store[cwd] = { tabs, active: store[cwd]?.active };
		const file = ctx.sessionManager.getSessionFile();
		if (file) {
			let tab = tabs.find((item) => item.path === file);
			if (!tab) {
				tab = { path: file, name: labelFor(ctx), auto: true };
				tabs.push(tab);
			}
			// Al volver con /resume el nombre puede seguir siendo el id: usa el
			// primer mensaje de la sesión y, si no hay, deja que el modelo lo ponga.
			if (tab.auto) {
				const firstUser = firstUserText(ctx);
				if (firstUser) tab.name = shorten(firstUser);
			}
			setActive(file);
		}
		widgetInstalled = false;
		draw(ctx);
		stopPoll();
		pollTimer = setInterval(() => {
			spinnerIndex++;
			requestRender?.();
		}, 900);
		(pollTimer as unknown as { unref?: () => void }).unref?.();
	});

	const stopPoll = () => {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = undefined;
	};

	pi.on("session_shutdown", async (_event, ctx) => {
		stopPoll();
		widgetInstalled = false;
		requestRender = undefined;
		if (ctx.hasUI) ctx.ui.setWidget("tabs", undefined);
	});

	pi.on("agent_start", async (_event, ctx) => {
		busy = true;
		draw(ctx);
	});
	pi.on("agent_settled", async (_event, ctx) => {
		busy = false;
		draw(ctx);
	});

	const titled = new Set<string>();

	/** Pide al modelo un título corto para la sesión (una sola vez por pestaña). */
	const generateTitle = async (ctx: ExtensionContext, tab: Tab) => {
		if (titled.has(tab.path) || !ctx.model) return;
		titled.add(tab.path);
		const texts = ctx.sessionManager
			.getBranch()
			.filter((entry) => entry.type === "message" && entry.message.role === "user")
			.slice(0, 2)
			.map((entry) =>
				(entry.message.content as { type: string; text?: string }[])
					.filter((part) => part.type === "text")
					.map((part) => part.text ?? "")
					.join(" "),
			)
			.join("\n");
		if (texts.trim().length < 10) return;

		try {
			const call = ctx.modelRegistry.complete(
				ctx.model,
				{
					messages: [
						{
							role: "user",
							timestamp: Date.now(),
							content: [
								{
									type: "text",
									text: `Pon un título de 3 o 4 palabras a esta sesión de trabajo. Responde SOLO el título, sin comillas ni punto final.\n\n${texts.slice(0, 1500)}`,
								},
							],
						},
					],
				},
				{ maxTokens: 24, sessionId: ctx.sessionManager.getSessionId() },
			);
			const result = await Promise.race([
				call,
				new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8000)),
			]);
			if (!result) {
				// Sin respuesta del modelo: al menos un nombre legible.
				const first = texts.split("\n")[0]!.trim();
				tab.name = first.length > 20 ? `${first.slice(0, 19)}…` : first || tab.name;
				tab.auto = false;
				save();
				draw(ctx);
				return;
			}
			const raw = (result.content as { type: string; text?: string }[])
				.filter((part) => part.type === "text")
				.map((part) => part.text ?? "")
				.join(" ")
				.replace(/[\r\n]+/g, " ")
				.replace(/^["'«»]+|["'«»]+$/g, "")
				.trim();
			if (!raw) return;
			tab.name = raw.slice(0, 24);
			tab.auto = false;
			save();
			pi.setSessionName(tab.name);
			draw(ctx);
		} catch {
			// Si el modelo falla, se queda el nombre corto de la sesión.
		}
	};

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "user") return;
		refresh();
		const tab = entry().tabs.find((item) => item.path === active);
		if (!tab?.auto) return;
		const text = event.message.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (text.length < 3) return;
		// Nombre inmediato y legible; el título del modelo lo sustituye si llega.
		tab.name = text.length > 20 ? `${text.slice(0, 19)}…` : text;
		save();
		draw(ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		refresh();
		const tab = entry().tabs.find((item) => item.path === active);
		if (tab?.auto) await generateTitle(ctx, tab);
	});

	// El payload de subagentes no trae nombre legible: lo cogemos del `description`
	// que el padre pasa a la tool Agent justo antes de lanzarlo.
	let pendingAgentLabel: string | undefined;
	pi.on("tool_execution_start", async (event) => {
		if (event.toolName !== "Agent") return;
		const args = (event.args ?? {}) as { description?: string; prompt?: string };
		const label = (args.description ?? args.prompt ?? "").replace(/\s+/g, " ").trim();
		pendingAgentLabel = label ? label.slice(0, 30) : undefined;
	});

	// Subagentes de pi-subagents-lite (convención subagents:*)
	pi.events.on("subagents:child:session-created", (payload: unknown) => {
		const data = payload as { sessionId?: string; name?: string };
		if (data?.sessionId) {
			agents.set(data.sessionId, pendingAgentLabel ?? data.name ?? data.sessionId.slice(0, 8));
			pendingAgentLabel = undefined;
		}
	});
	pi.events.on("subagents:child:disposed", (payload: unknown) => {
		const data = payload as { sessionId?: string };
		if (data?.sessionId) agents.delete(data.sessionId);
	});

	// El modelo puede poner título a la sesión cuando le parezca.
	pi.registerTool({
		name: "set_session_title",
		label: "Set session title",
		description: "Pon un título corto (3-5 palabras) a la sesión actual, para identificarla en la lista de pestañas. Úsala una vez al principio, cuando ya sepas de qué va la tarea.",
		parameters: Type.Object({
			title: Type.String({ description: "Título corto, sin comillas" }),
		}),
		execute: async (_toolCallId: string, params: { title?: string }) => {
			const raw = (params.title ?? "").replace(/\s+/g, " ").replace(/^["'«»]+|["'«»]+$/g, "").trim();
			if (!raw) return { content: [{ type: "text", text: "título vacío" }], isError: true };
			const name = raw.slice(0, 24);
			refresh();
			const tab = entry().tabs.find((item) => item.path === active);
			if (tab) {
				tab.name = name;
				tab.auto = false;
				save();
			}
			pi.setSessionName(name);
			return { content: [{ type: "text", text: `título: ${name}` }] };
		},
	});

	pi.registerCommand("tabs", {
		description: "Pestañas de sesión: listar, crear, cerrar o renombrar",
		handler: async (args, ctx) => {
			refresh();
			const sub = (args ?? "").trim();
			if (sub === "new") return void (await ctx.newSession({}));
			if (sub === "resume") {
				const { SessionManager } = await import("@earendil-works/pi-coding-agent");
				const sessions = await SessionManager.list(ctx.cwd);
				const options = sessions
					.filter((item) => item.path !== active)
					.slice(0, 30)
					.map((item) => item.name || item.path.split("/").pop() || item.path);
				const picked = await ctx.ui.select("Reanudar sesión", options);
				if (!picked) return;
				const target = sessions.filter((item) => item.path !== active)[options.indexOf(picked)];
				if (!target) return;
				await ctx.switchSession(target.path);
				return;
			}
			if (sub === "next") {
				const tabs = entry().tabs;
				const index = tabs.findIndex((tab) => tab.path === active);
				const target = tabs[(index + 1 + tabs.length) % tabs.length];
				if (target) await switchTo(ctx, target);
				return;
			}
			if (sub === "prev") {
				const tabs = entry().tabs;
				const index = tabs.findIndex((tab) => tab.path === active);
				const target = tabs[(index - 1 + tabs.length) % tabs.length];
				if (target) await switchTo(ctx, target);
				return;
			}
			if (/^\d+$/.test(sub)) {
				const target = entry().tabs[Number.parseInt(sub, 10) - 1];
				if (target) await switchTo(ctx, target);
				return;
			}
			if (sub === "close") return void (await closeCurrent(ctx));
			if (sub.startsWith("rename")) {
				const name = sub.slice("rename".length).trim();
				if (!name) return void ctx.ui.notify("Uso: /tabs rename <nombre>", "warning");
				const tab = entry().tabs.find((item) => item.path === active);
				if (tab) {
					tab.name = name.slice(0, 20);
					tab.auto = false;
					save();
					draw(ctx);
				}
				return;
			}
			const tabs = entry().tabs;
			const options = [
				...tabs.map((tab, i) => `${i + 1}. ${tab.name}${tab.path === active ? "  ●" : ""}`),
				"＋ Nueva pestaña",
				"✕ Cerrar actual",
			];
			const choice = await ctx.ui.select("Pestañas", options);
			if (!choice) return;
			if (choice.startsWith("＋")) return void (await ctx.newSession({}));
			if (choice.startsWith("✕")) return void (await closeCurrent(ctx));
			const target = tabs[Number.parseInt(choice, 10) - 1];
			if (target) await switchTo(ctx, target);
		},
	});

	for (let i = 1; i <= 9; i++) {
		pi.registerShortcut(`alt+${i}`, {
			description: `Ir a la pestaña ${i}`,
			handler: (ctx) => requestSwitch(ctx, i - 1),
		});
	}
	pi.registerShortcut("alt+.", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("alt+,", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
	pi.registerShortcut("ctrl+alt+right", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("ctrl+alt+left", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
	pi.registerShortcut("ctrl+shift+right", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("ctrl+shift+left", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
}
