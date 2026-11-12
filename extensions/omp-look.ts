/**
 * Detalles visuales estilo OMP: spinner de "working" con la secuencia de
 * asteriscos y un indicador de pensamiento animado. Solo estética; no toca
 * prompts, tools ni contexto.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Misma secuencia que OMP usa mientras el modelo piensa.
const FRAMES = ["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"] as const;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const theme = ctx.ui.theme;
		const frames = FRAMES.map((glyph, index) => {
			const color = index < 3 ? "thinkingLow" : index < 6 ? "thinkingMedium" : "thinkingMax";
			return theme.fg(color, glyph);
		});
		ctx.ui.setWorkingIndicator({ frames, intervalMs: 110 });
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingIndicator();
	});
}
