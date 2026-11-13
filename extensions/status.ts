/**
 * /status — pregunta al modelo "¿cómo va esto?" con el mismo contexto, sin
 * interrumpir el turno. El informe se apunta en el chat como una tarjeta
 * (queda arriba, como cualquier mensaje) y se puede reabrir en grande.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const QUESTION =
	"Reporta brevemente el estado de esta sesión, para mí (el usuario). En 3-5 líneas: qué estás haciendo ahora, cómo va, qué queda pendiente y una estimación aproximada. Sin código, directo.";

let lastText: string | undefined;
let latestCtx: ExtensionContext | undefined;

const wrap = (text: string, width: number): string[] => {
	const out: string[] = [];
	for (const raw of text.split("\n")) {
		if (raw.trim().length === 0) {
			out.push("");
			continue;
		}
		for (let i = 0; i < raw.length; i += width) out.push(raw.slice(i, i + width));
	}
	return out;
};

/** Panel grande con el informe completo. */
async function showPanel(ctx: ExtensionContext, text: string): Promise<void> {
	await ctx.ui.custom<void>((_tui, theme, keybindings, done) => ({
		render(width: number) {
			const usable = Math.max(20, Math.min(width - 2, 84));
			return [
				theme.fg("accent", "─".repeat(usable)),
				theme.bold(theme.fg("accent", " Estado de la sesión")),
				"",
				...wrap(text, usable - 1).map((line) => ` ${line}`),
				"",
				theme.fg("muted", " esc / clic para cerrar"),
			].map((line) => line.slice(0, width));
		},
		handleInput(data: string) {
			if (keybindings.matches(data, "tui.select.cancel")) done(undefined);
		},
		handleMouse() {
			done(undefined);
			return { handled: true } as const;
		},
		invalidate() {},
	}));
}

export default function (pi: ExtensionAPI) {
	// Tarjeta dentro del transcript: se queda arriba con el resto de mensajes.
	pi.registerEntryRenderer("status-card", (entry, _options, theme) => {
		const data = entry.data as { text: string; at: number };
		const lines = data.text.split("\n");
		const component = {
			render(width: number) {
				const usable = Math.max(20, Math.min(width - 4, 80));
				const shown: string[] = [];
				shown.push(theme.fg("accent", "─".repeat(Math.min(usable, width - 2))));
				shown.push(theme.bold(theme.fg("accent", " Estado de la sesión")));
				for (const line of wrap(data.text, usable - 1).slice(0, 8)) shown.push(` ${theme.fg("text", line)}`);
				if (lines.length > 0) shown.push(theme.fg("muted", " clic para abrir el informe completo"));
				return shown.map((line) => line.slice(0, width));
			},
			handleMouse(event: { type?: string; button?: string }) {
				if (event.type !== "press" && event.type !== "click") return undefined;
				if (event.button !== "left") return undefined;
				if (!latestCtx) return undefined;
				try {
					void showPanel(latestCtx, data.text);
				} catch {
					return undefined;
				}
				return { handled: true } as const;
			},
			invalidate() {},
		};
		return component;
	});

	pi.registerCommand("status", {
		description: "Pregunta al modelo cómo va la tarea, sin interrumpirla",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			latestCtx = ctx;
			const extra = (args ?? "").trim();
			ctx.ui.notify("Pidiendo estado…", "info");

			const projection = ctx.sessionManager.buildSessionContext();
			const messages = [
				...projection.messages,
				{
					role: "user" as const,
					timestamp: Date.now(),
					content: [{ type: "text" as const, text: extra ? `${QUESTION}\n\nFoco: ${extra}` : QUESTION }],
				},
			];

			const model = ctx.model;
			if (!model) {
				ctx.ui.notify("Sin modelo activo", "error");
				return;
			}

			let text = "";
			try {
				const stream = ctx.modelRegistry.streamSimple(model, { messages }, {
					maxTokens: 400,
					sessionId: ctx.sessionManager.getSessionId(),
				});
				for await (const event of stream) {
					if (event.type === "text_delta") text += event.delta;
				}
			} catch (error) {
				ctx.ui.notify(`No se pudo preguntar: ${(error as Error).message}`, "error");
				return;
			}

			if (!text.trim()) {
				ctx.ui.notify("El modelo no devolvió nada", "warning");
				return;
			}

			lastText = text.trim();
			pi.appendEntry("status-card", { text: lastText, at: Date.now() });
			await showPanel(ctx, lastText);
		},
	});
}
