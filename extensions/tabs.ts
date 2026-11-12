/**
 * Pestañas de sesión para Pi: varias sesiones abiertas en la misma ventana,
 * como en un navegador. La lista se guarda por directorio de trabajo en
 * ~/.pi/agent/pi-tabs.json, así que sobrevive a reinicios.
 *
 *   /tabs            abre el selector
 *   /tabs new        crea una sesión nueva como pestaña
 *   /tabs close      cierra la pestaña actual (no borra la sesión)
 *   /tabs rename X   renombra la pestaña actual
 *
 * Atajos: ctrl+shift+right / ctrl+shift+left  cambian de pestaña
 *         ctrl+shift+t  nueva   ·   ctrl+shift+w  cerrar
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Tab = { path: string; name: string; auto?: boolean };
type Store = Record<string, { tabs: Tab[]; active?: string }>;

const STORE_PATH = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "pi-tabs.json");

function loadStore(): Store {
	try {
		return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
	} catch {
		return {};
	}
}

function saveStore(store: Store): void {
	try {
		mkdirSync(dirname(STORE_PATH), { recursive: true });
		writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
	} catch {
		// Sin persistencia seguimos funcionando en memoria.
	}
}

function labelFor(ctx: ExtensionContext): string {
	const name = ctx.sessionManager.getSessionName();
	if (name) return name;
	const file = ctx.sessionManager.getSessionFile();
	if (!file) return "nueva";
	return file.split("/").pop()!.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_/, "").slice(0, 12);
}

export default function (pi: ExtensionAPI) {
	let store = loadStore();
	let cwd = process.cwd();
	let active: string | undefined;

	const entry = () => (store[cwd] ??= { tabs: [] });

	const persist = () => {
		entry().active = active;
		saveStore(store);
	};

	const draw = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const tabs = entry().tabs;
		if (tabs.length < 2) {
			ctx.ui.setWidget("tabs", undefined);
			return;
		}
		ctx.ui.setWidget("tabs", (tui, theme) => ({
			invalidate() {},
			render(width: number) {
				const parts: string[] = [];
				tabs.forEach((tab, index) => {
					const isActive = tab.path === active;
					const text = ` ${index + 1} ${tab.name} `;
					parts.push(isActive ? theme.bg("selectedBg", theme.fg("accent", text)) : theme.fg("dim", text));
				});
				parts.push(theme.fg("muted", "│ alt+1…9"));
				let line = parts.join(theme.fg("borderMuted", " "));
				// Recorte por ancho visible aproximado: sin ANSI contado.
				const plain = tabs.map((t) => ` ${t.name} `).join("") + "│";
				if (plain.length > width) {
					line = parts.slice(0, Math.max(1, tabs.length)).join("");
				}
				return [line];
			},
		}));
	};

	const setTabs = (ctx: ExtensionContext, tabs: Tab[], nextActive: string) => {
		store[cwd] = { tabs, active: nextActive };
		active = nextActive;
		persist();
		draw(ctx);
	};

	const addCurrent = (ctx: ExtensionContext) => {
		const file = ctx.sessionManager.getSessionFile();
		if (!file) return;
		const tabs = entry().tabs.filter((tab) => tab.path !== file && existsSync(tab.path));
		tabs.push({ path: file, name: labelFor(ctx), auto: true });
		setTabs(ctx, tabs, file);
	};

	const switchTo = async (ctx: ExtensionContext, target: Tab) => {
		if (target.path === active) return;
		let result;
		try {
			result = await ctx.switchSession(target.path, {
			withSession: async (freshCtx) => {
				const file = freshCtx.sessionManager.getSessionFile();
				if (file) {
					active = file;
					const tabs = store[cwd]?.tabs ?? [];
					const known = tabs.find((tab) => tab.path === file);
					// Solo refresca el nombre si aún no tiene uno propio.
					if (known && known.auto) known.name = labelFor(freshCtx);
					persist();
					draw(freshCtx);
				}
			},
			});
		} catch (error) {
			// Pestaña huérfana: fuera de la lista.
			store[cwd] = { tabs: entry().tabs.filter((tab) => tab.path !== target.path), active };
			persist();
			draw(ctx);
			ctx.ui.notify(`No se pudo abrir esa pestaña: ${(error as Error).message}`, "error");
			return;
		}
		if (result.cancelled) ctx.ui.notify("Cambio de pestaña cancelado", "warning");
	};

	const cycle = async (ctx: ExtensionContext, step: 1 | -1) => {
		const tabs = entry().tabs;
		if (tabs.length < 2) return;
		const index = tabs.findIndex((tab) => tab.path === active);
		const next = tabs[(index + step + tabs.length) % tabs.length]!;
		await switchTo(ctx, next);
	};

	const closeCurrent = async (ctx: ExtensionContext) => {
		const tabs = entry().tabs;
		const index = tabs.findIndex((tab) => tab.path === active);
		if (index === -1) return;
		const remaining = tabs.filter((_, i) => i !== index);
		if (remaining.length === 0) {
			store[cwd] = { tabs: [], active: undefined };
			active = undefined;
			persist();
			ctx.ui.setWidget("tabs", undefined);
			ctx.ui.notify("Pestaña cerrada. La sesión sigue guardada.", "info");
			return;
		}
		const next = remaining[Math.min(index, remaining.length - 1)]!;
		store[cwd] = { tabs: remaining, active: next.path };
		active = next.path;
		persist();
		await switchTo(ctx, next);
	};

	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.sessionManager.getCwd();
		active = ctx.sessionManager.getSessionFile();
		// Sin filtrar por existsSync: Pi crea el .jsonl perezosamente, así que una
		// sesión recién abierta todavía no tiene fichero. Se poda al fallar el cambio.
		const tabs = [...(store[cwd]?.tabs ?? [])];
		store[cwd] = { tabs, active };
		if (active && !tabs.some((tab) => tab.path === active)) {
			tabs.push({ path: active, name: labelFor(ctx), auto: true });
		}
		persist();
		draw(ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "user") return;
		const tab = entry().tabs.find((item) => item.path === active);
		if (!tab || !tab.auto) return;
		const text = event.message.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (text.length < 3) return;
		tab.name = text.length > 22 ? `${text.slice(0, 21)}…` : text;
		tab.auto = false;
		persist();
		draw(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWidget("tabs", undefined);
	});

	pi.registerCommand("tabs", {
		description: "Pestañas de sesión: listar, crear, cerrar o renombrar",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim();
			if (sub === "new") {
				await ctx.newSession({});
				return;
			}
			if (sub === "close") {
				await closeCurrent(ctx);
				return;
			}
			if (sub.startsWith("rename")) {
				const name = sub.slice("rename".length).trim();
				if (!name) {
					ctx.ui.notify("Uso: /tabs rename <nombre>", "warning");
					return;
				}
				const tab = entry().tabs.find((item) => item.path === active);
				if (tab) tab.name = name.slice(0, 24);
				persist();
				draw(ctx);
				return;
			}
			const tabs = entry().tabs;
			if (tabs.length === 0) {
				ctx.ui.notify("No hay pestañas", "info");
				return;
			}
			const options = [...tabs.map((tab, i) => `${i + 1}. ${tab.name}${tab.path === active ? "  ●" : ""}`), "＋ Nueva pestaña", "✕ Cerrar actual"];
			const choice = await ctx.ui.select("Pestañas", options);
			if (!choice) return;
			if (choice.startsWith("＋")) {
				await ctx.newSession({});
				return;
			}
			if (choice.startsWith("✕")) {
				await closeCurrent(ctx);
				return;
			}
			const index = Number.parseInt(choice, 10) - 1;
			const target = tabs[index];
			if (target) await switchTo(ctx, target);
		},
	});

	for (let i = 1; i <= 9; i++) {
		pi.registerShortcut(`alt+${i}`, {
			description: `Ir a la pestaña ${i}`,
			handler: async (ctx) => {
				const target = entry().tabs[i - 1];
				if (target) await switchTo(ctx, target);
			},
		});
	}
	pi.registerShortcut("alt+.", {

		description: "Pestaña siguiente",
		handler: (ctx) => cycle(ctx, 1),
	});
	pi.registerShortcut("alt+,", {
		description: "Pestaña anterior",
		handler: (ctx) => cycle(ctx, -1),
	});

	pi.registerShortcut("ctrl+shift+right", {
		description: "Pestaña siguiente",
		handler: (ctx) => cycle(ctx, 1),
	});
	pi.registerShortcut("ctrl+shift+left", {
		description: "Pestaña anterior",
		handler: (ctx) => cycle(ctx, -1),
	});
	pi.registerShortcut("ctrl+shift+t", {
		description: "Nueva pestaña",
		handler: async (ctx) => {
			await ctx.newSession({});
		},
	});
	pi.registerShortcut("ctrl+shift+w", {
		description: "Cerrar pestaña",
		handler: (ctx) => closeCurrent(ctx),
	});
}
