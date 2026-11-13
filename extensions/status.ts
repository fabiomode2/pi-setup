/**
 * /status — pregunta al modelo "¿cómo va esto?" con el mismo contexto de la
 * conversación, sin interrumpir el turno en curso. La respuesta se muestra en
 * un panel flotante (overlay) que se cierra con Esc.
 *
 * Es la misma idea que el `btw` de oh-my-pi: una consulta paralela al mismo
 * modelo con la rama actual como contexto.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";


const QUESTION =
	"Reporta brevemente el estado de esta sesión, para mí (el usuario). En 3-5 líneas: qué estás haciendo ahora, cómo va, qué queda pendiente y una estimación aproximada. Sin código, directo.";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("status", {
		description: "Pregunta al modelo cómo va la tarea, sin interrumpirla",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const extra = (args ?? "").trim();
			ctx.ui.notify("Pidiendo estado…", "info");

			// Contexto actual + la pregunta, sin tocar el transcript.
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
				// streamSimple usa el mismo camino que el agente; complete() no
				// devolvía contenido con este provider.
				const stream = ctx.modelRegistry.streamSimple(model, { messages }, { maxTokens: 400, sessionId: ctx.sessionManager.getSessionId() });
				for await (const event of stream) {
					if (event.type === "text_delta") text += event.delta;
				}
			} catch (error) {
				ctx.ui.notify(`No se pudo preguntar: ${(error as Error).message}`, "error");
				return;
			}

			if (!text) {
				ctx.ui.notify("El modelo no devolvió nada", "warning");
				return;
			}

			await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
				const lines = text.split("\n").flatMap((line) => {
					const wrapped: string[] = [];
					for (let i = 0; i < line.length; i += 80) wrapped.push(line.slice(i, i + 80));
					return wrapped.length > 0 ? wrapped : [""];
				});
				return {
					render(width: number) {
						const box = [
							theme.fg("accent", "─".repeat(Math.max(10, Math.min(width - 2, 82)))),
							theme.bold(theme.fg("accent", " Estado de la sesión")),
							"",
							...lines.map((line) => ` ${line}`),
							"",
							theme.fg("muted", " esc para cerrar"),
						];
						return box.map((line) => line.slice(0, width));
					},
					handleInput(data: string) {
						if (keybindings.matches(data, "tui.select.cancel")) done(undefined);
					},
					invalidate() {},
				};
			});
		},
	});
}
