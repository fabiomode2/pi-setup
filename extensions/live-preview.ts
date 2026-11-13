/**
 * Mientras el agente trabaja con thinking/tools colapsados, la línea de estado
 * enseña lo último que está haciendo: el final del razonamiento o el comando en
 * marcha. Una sola línea, recortada.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX = 90;

/**
 * Frase que se enseña en la fila de tools: la última frase *cerrada* del
 * razonamiento, o la primera del último párrafo completo. Nunca a medio escribir.
 */
const lastClosedPhrase = (text: string): string => {
	const sentences = text.split(/(?<=[.!?:;])\s+/);
	if (sentences.length > 1) {
		const closed = sentences[sentences.length - 2]?.replace(/\s+/g, " ").trim() ?? "";
		if (closed.length >= 12) return closed;
	}
	const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
	if (paragraphs.length > 1) {
		const previous = paragraphs[paragraphs.length - 2] ?? "";
		const first = previous.split(/(?<=[.!?:;])\s+/)[0] ?? previous;
		if (first.length >= 12) return first;
	}
	return "";
};

const publish = (phrase: string, tool: string) => {
	(globalThis as Record<string, unknown>).__piLive = { phrase, tool };
};

const clip = (text: string) => {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > MAX ? `…${clean.slice(-MAX)}` : clean;
};

export default function (pi: ExtensionAPI) {
	let thinking = "";
	let published = "";

	pi.on("agent_start", async () => {
		thinking = "";
		published = "";
		publish("", "");
	});

	pi.on("message_update", async (event, ctx) => {
		const stream = event.assistantMessageEvent;
		if (!stream || !ctx.hasUI) return;
		if (stream.type === "thinking_delta") {
			thinking += stream.delta ?? "";
			if (thinking.length > 800) thinking = thinking.slice(-800);
			const phrase = lastClosedPhrase(thinking);
			if (phrase && phrase !== published) {
				published = phrase;
				publish(clip(phrase), "");
			}
			return;
		}

	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		const args = (event.args ?? {}) as { command?: string; path?: string; pattern?: string };
		const detail = args.command ?? args.path ?? args.pattern ?? "";
		publish("", `⚙ ${event.toolName}${detail ? `: ${clip(detail)}` : ""}`);
	});

	pi.on("tool_execution_end", async () => {});

	pi.on("agent_settled", async () => {});
}
