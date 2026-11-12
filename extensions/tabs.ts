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
import { visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Tab = { path: string; name: string; auto?: boolean; seenAt?: number };

const STORE_PATH = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "pi-tabs.json");
const COLUMN_WIDTH = 28;
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

	const entry = () => (store[cwd] ??= { tabs: [] });
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

	class TabsColumn implements Component {
		constructor(
			private readonly ctx: ExtensionContext,
			private readonly onPick: (index: number) => void,
		) {}

		render(width: number): string[] {
			const theme = this.ctx.ui.theme;
			const tabs = entry().tabs;
			const rows: { text: string; index?: number }[] = [];

			tabs.forEach((tab, index) => {
				const isActiveTab = tab.path === active;
				const unread = isUnread(tab);
				const glyph = isActiveTab && busy ? SPINNER[spinnerIndex % SPINNER.length] : unread ? "●" : "✓";
				const color = isActiveTab ? "accent" : unread ? "warning" : "success";
				const label = `${index + 1} ${tab.name}`;
				const room = COLUMN_WIDTH - 4;
				const clipped = label.length > room ? `${label.slice(0, room - 1)}…` : label;
				const text = isActiveTab
					? theme.bg("selectedBg", theme.fg("accent", ` ${glyph} ${clipped} `))
					: theme.fg(color, ` ${glyph} `) + theme.fg(unread ? "text" : "dim", clipped);
				rows.push({ text, index });
			});

			// Subagentes en marcha, como ramas del árbol.
			let shown = 0;
			for (const name of agents.values()) {
				if (shown >= 3) break;
				rows.push({ text: theme.fg("thinkingText", `   ↳ ${name.slice(0, COLUMN_WIDTH - 6)}`) });
				shown++;
			}

			return rows.map(({ text }) => {
				const pad = Math.max(0, width - visibleWidth(text));
				return `${" ".repeat(pad)}${text}`;
			});
		}

		handleMouse(event: TuiMouseEvent) {
			if (event.type !== "click" || event.button !== "left") return undefined;
			const rows = entry().tabs;
			const row = rows[event.y];
			if (!row) return undefined;
			this.onPick(event.y);
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
			ctx.ui.setWidget("tabs", (tui) => {
				requestRender = () => tui.requestRender();
				return new TabsColumn(ctx, (index) => {
					const target = entry().tabs[index];
					if (target) requestSwitch(ctx, target);
				});
			});
		}
		requestRender?.();
	};

	/**
	 * Solo un contexto de comando puede cambiar de sesión (ExtensionCommandContext).
	 * Desde un atajo o un clic dejamos el comando escrito en el editor.
	 */
	const requestSwitch = (ctx: ExtensionContext, target: Tab) => {
		const tabs = entry().tabs;
		const index = tabs.indexOf(target);
		if (index === -1) return;
		// Solo un contexto de comando puede cambiar de sesión, así que dejamos el
		// comando en el editor y enviamos el Enter: /tabs N se ejecuta solo.
		ctx.ui.setEditorText(`/tabs ${index + 1}`);
		try {
			(process.stdin as unknown as { unshift?: (buffer: Buffer) => void }).unshift?.(Buffer.from("\r"));
		} catch {
			ctx.ui.notify(`Escribe /tabs ${index + 1} y pulsa Enter`, "warning");
		}
	};

	const switchTo = async (ctx: ExtensionContext, target: Tab) => {
		if (target.path === active) return;
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
		const target = tabs[(index + step + tabs.length) % tabs.length]!;
		requestSwitch(ctx, target);
	};

	const closeCurrent = async (ctx: ExtensionContext) => {
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

	const labelFor = (ctx: ExtensionContext): string => {
		const name = ctx.sessionManager.getSessionName();
		if (name) return name;
		const file = ctx.sessionManager.getSessionFile();
		if (!file) return "nueva";
		return file.split("/").pop()!.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_/, "").slice(0, 10);
	};

	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.sessionManager.getCwd();
		// Sin filtrar por existsSync: una sesión recién creada aún no tiene .jsonl.
		const tabs = [...(store[cwd]?.tabs ?? [])];
		store[cwd] = { tabs, active: store[cwd]?.active };
		const file = ctx.sessionManager.getSessionFile();
		if (file) {
			if (!tabs.some((tab) => tab.path === file)) tabs.push({ path: file, name: labelFor(ctx), auto: true });
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
				{ maxTokens: 24 },
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
		const tab = entry().tabs.find((item) => item.path === active);
		if (tab?.auto) await generateTitle(ctx, tab);
	});

	// Subagentes de pi-subagents-lite (convención subagents:*)
	pi.events.on("subagents:child:session-created", (payload: unknown) => {
		const data = payload as { sessionId?: string; name?: string };
		if (data?.sessionId) agents.set(data.sessionId, data.name ?? data.sessionId.slice(0, 8));
	});
	pi.events.on("subagents:child:disposed", (payload: unknown) => {
		const data = payload as { sessionId?: string };
		if (data?.sessionId) agents.delete(data.sessionId);
	});

	pi.registerCommand("tabs", {
		description: "Pestañas de sesión: listar, crear, cerrar o renombrar",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim();
			if (sub === "new") return void (await ctx.newSession({}));
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
			handler: (ctx) => {
				const target = entry().tabs[i - 1];
				if (target) requestSwitch(ctx, target);
			},
		});
	}
	pi.registerShortcut("alt+.", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("alt+,", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
	pi.registerShortcut("ctrl+alt+right", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("ctrl+alt+left", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
	pi.registerShortcut("ctrl+shift+right", { description: "Pestaña siguiente", handler: (ctx) => stepRequest(ctx, 1) });
	pi.registerShortcut("ctrl+shift+left", { description: "Pestaña anterior", handler: (ctx) => stepRequest(ctx, -1) });
}
