/**
 * /status — pregunta al modelo "¿cómo va esto?" con el mismo contexto, sin
 * interrumpir el turno. El resultado queda en un panel flotante, y también en
 * una línea fija encima del editor: al acabar muestra "Estado dado · clic para
 * ver" y al pulsarla se vuelve a abrir el panel.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const QUESTION =
	"Reporta brevemente el estado de esta sesión, para mí (el usuario). En 3-5 líneas: qué estás haciendo ahora, cómo va, qué queda pendiente y una estimación aproximada. Sin código, directo.";

let lastText: string | undefined;
let running = false;

/** Panel con el informe; se cierra con Esc o con un clic. */
async function showPanel(ctx: ExtensionContext, text: string): Promise<void> {
	await ctx.ui.custom<void>((_tui, theme, keybindings, done) => {
		const source = text.split("\n");
		return {
			render(width: number) {
				const usable = Math.max(20, Math.min(width - 2, 84));
				const lines: string[] = [];
				for (const raw of source) {
					if (raw.length === 0) lines.push("");
					else for (let i = 0; i < raw.length; i += usable) lines.push(raw.slice(i, i + usable));
				}
				return [
					theme.fg("accent", "─".repeat(usable)),
					theme.bold(theme.fg("accent", " Estado de la sesión")),
					"",
					...lines.map((line) => ` ${line}`),
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
		};
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("status", {
		description: "Pregunta al modelo cómo va la tarea, sin interrumpirla",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const extra = (args ?? "").trim();
			running = true;
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
				running = false;
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
				running = false;
				ctx.ui.notify(`No se pudo preguntar: ${(error as Error).message}`, "error");
				return;
			}

			running = false;
			if (!text.trim()) {
				ctx.ui.notify("El modelo no devolvió nada", "warning");
				return;
			}

			lastText = text.trim();
			installLine(ctx);
			await showPanel(ctx, lastText);
		},
	});
}

/** Línea fija encima del editor; al pulsarla reabre el último informe. */
function installLine(ctx: ExtensionContext): void {
	const reuse = (globalThis as { __piStatusCtx?: ExtensionContext }).__piStatusCtx;
	void reuse;
	(globalThis as { __piStatusCtx?: ExtensionContext }).__piStatusCtx = ctx;

	const line = {
		render(width: number) {
			const theme = ctx.ui.theme;
			const body = running
				? theme.fg("warning", " ⏳ Pidiendo estado…")
				: theme.fg("success", " ✔ Estado dado") + theme.fg("muted", " · clic para ver");
			return [body.slice(0, width)].map((text) => `${text}${" ".repeat(Math.max(0, width - text.length))}`);
		},
		handleMouse(event: { type?: string; button?: string }) {
			if (event.type !== "press" && event.type !== "click") return undefined;
			if (event.button !== "left") return undefined;
			if (!lastText) return undefined;
			void showPanel(ctx, lastText);
			return { handled: true } as const;
		},
		invalidate() {},
	};

	try {
		ctx.ui.setWidget("status-line", () => line);
	} catch {
		// ctx caducado tras cambiar de sesión: se rehace en el siguiente /status
	}
}
