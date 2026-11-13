/**
 * Mientras el agente trabaja con thinking/tools colapsados, la línea de estado
 * enseña lo último que está haciendo: el final del razonamiento o el comando en
 * marcha. Una sola línea, recortada.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX = 90;

const clip = (text: string) => {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > MAX ? `…${clean.slice(-MAX)}` : clean;
};

export default function (pi: ExtensionAPI) {
	let thinking = "";

	pi.on("agent_start", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingMessage("Pensando…");
	});

	pi.on("message_update", async (event, ctx) => {
		const stream = event.assistantMessageEvent;
		if (!stream || !ctx.hasUI) return;
		if (stream.type === "thinking_delta") {
			thinking += stream.delta ?? "";
			if (thinking.length > 800) thinking = thinking.slice(-800);
			const tail = clip(thinking);
			if (tail) ctx.ui.setWorkingMessage(`💭 ${tail}`);
			return;
		}
		if (stream.type === "text_delta" && (stream.delta ?? "").trim()) {
			ctx.ui.setWorkingMessage("Escribiendo…");
		}
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		thinking = "";
		const args = (event.args ?? {}) as { command?: string; path?: string; pattern?: string };
		const detail = args.command ?? args.path ?? args.pattern ?? "";
		ctx.ui.setWorkingMessage(`⚙ ${event.toolName}${detail ? `: ${clip(detail)}` : ""}`);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingMessage("Pensando…");
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingMessage();
	});
}
