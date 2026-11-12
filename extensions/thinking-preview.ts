/**
 * Mientras el modelo piensa y el bloque de thinking está colapsado, la etiqueta
 * muestra el final de lo que está pensando (una sola línea, recortada).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX = 70;

export default function (pi: ExtensionAPI) {
	let buffer = "";

	pi.on("message_start", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		buffer = "";
		if (ctx.hasUI) ctx.ui.setHiddenThinkingLabel("Thinking…");
	});

	pi.on("message_update", async (event, ctx) => {
		const stream = event.assistantMessageEvent;
		if (!stream || stream.type !== "thinking_delta" || !ctx.hasUI) return;
		buffer += stream.delta ?? "";
		if (buffer.length > 600) buffer = buffer.slice(-600);
		const tail = buffer.replace(/\s+/g, " ").trim().slice(-MAX);
		if (tail) ctx.ui.setHiddenThinkingLabel(`💭 ${tail}`);
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant" || !ctx.hasUI) return;
		buffer = "";
		ctx.ui.setHiddenThinkingLabel();
	});
}
