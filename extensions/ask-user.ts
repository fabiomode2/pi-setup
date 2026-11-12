/**
 * ask_user: el modelo pregunta al usuario y espera la respuesta en la TUI
 * (selector con opciones, o campo de texto libre). Inspirado en la tool de
 * opencode. Sin UI (print/JSON mode) devuelve un error explicable.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OTHER = "Otro (escribir)";
const CANCEL = "Cancelar";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask user",
		description:
			"Haz una pregunta al usuario y espera su respuesta en la terminal. Úsala solo cuando la respuesta cambie lo que vas a hacer y no puedas deducirla del repo. Pasa `options` para ofrecer alternativas (se elige con flechas) o déjalo vacío para texto libre.",
		parameters: Type.Object({
			question: Type.String({ description: "Pregunta, corta y concreta" }),
			options: Type.Optional(Type.Array(Type.String(), { description: "Alternativas para elegir" , maxItems: 9 })),
			detail: Type.Optional(Type.String({ description: "Contexto extra para el usuario (2-3 líneas)" })),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			if (!ctx.hasUI) {
				return { content: [{ type: "text", text: "ask_user no está disponible en modo no interactivo" }], isError: true };
			}

			const question = params.detail ? `${params.question}\n\n${params.detail}` : params.question;
			const options = (params.options ?? []).filter((option) => option.trim().length > 0);

			if (options.length === 0) {
				const answer = await ctx.ui.input(params.question);
				if (!answer) return { content: [{ type: "text", text: "El usuario no respondió" }] };
				return { content: [{ type: "text", text: `Respuesta del usuario: ${answer}` }] };
			}

			const choice = await ctx.ui.select(question, [...options, `${OTHER}`, CANCEL]);
			if (!choice || choice === CANCEL) {
				return { content: [{ type: "text", text: "El usuario canceló la pregunta" }] };
			}
			if (choice === OTHER) {
				const answer = await ctx.ui.input(params.question);
				if (!answer) return { content: [{ type: "text", text: "El usuario no respondió" }] };
				return { content: [{ type: "text", text: `Respuesta del usuario: ${answer}` }] };
			}
			return { content: [{ type: "text", text: `Respuesta del usuario: ${choice}` }] };
		},
	});
}
