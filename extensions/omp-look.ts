/**
 * Detalles visuales estilo OMP: spinner de "working" con la secuencia de
 * asteriscos y un indicador de pensamiento animado. Solo estética; no toca
 * prompts, tools ni contexto.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Misma secuencia que OMP usa mientras el modelo piensa.
const FRAMES = ["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"] as const;

// Palabras que sustituyen a "Working": nada de thinking ni comandos ahí.
const WORDS = [
	"Cocinando",
	"Maquinando",
	"Rumiando",
	"Hilando",
	"Tramando",
	"Digeriendo",
	"Cableando",
	"Pensando",
	"Afilando",
	"Barajando",
	"Urgando",
	"Cosiendo",
] as const;

export default function (pi: ExtensionAPI) {
	let wordTimer: ReturnType<typeof setInterval> | undefined;

	const rotate = (ctx: Parameters<NonNullable<Parameters<ExtensionAPI["on"]>[1]>>[1]) => {
		const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
		ctx.ui.setWorkingMessage(pick());
		clearInterval(wordTimer);
		wordTimer = setInterval(() => {
			try {
				ctx.ui.setWorkingMessage(pick());
			} catch {
				clearInterval(wordTimer);
				wordTimer = undefined;
			}
		}, 3500);
		(wordTimer as unknown as { unref?: () => void }).unref?.();
	};

	pi.on("agent_start", async (_event, ctx) => {
		if (ctx.hasUI) rotate(ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		clearInterval(wordTimer);
		wordTimer = undefined;
		try {
			if (ctx.hasUI) ctx.ui.setWorkingMessage();
		} catch {
			// ctx caducado tras reload
		}
	});

	pi.on("session_shutdown", async () => {
		clearInterval(wordTimer);
		wordTimer = undefined;
	});

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
