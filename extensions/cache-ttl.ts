/**
 * Cuenta atrás del prompt cache en la barra de estado.
 *
 * Tras cada respuesta del modelo arranca un contador con el TTL declarado por
 * el modelo (`promptCache.short`), 5 min por defecto. Si haces otra petición
 * antes de que llegue a cero, el cache sigue caliente y no pagas input otra vez.
 * Se reinicia en cada mensaje del asistente.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "cache-ttl";
const DEFAULT_TTL_S = 300;

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let expiresAt = 0;
	let ttlMs = DEFAULT_TTL_S * 1000;

	const render = (ctx: ExtensionContext) => {
		if (!ctx.hasUI || expiresAt === 0) return;
		const remaining = Math.max(0, expiresAt - Date.now());
		const theme = ctx.ui.theme;
		if (remaining <= 0) {
			ctx.ui.setStatus(STATUS_KEY, theme.fg("muted", "⏳ cache expired"));
			return;
		}
		const total = Math.ceil(remaining / 1000);
		const minutes = Math.floor(total / 60);
		const seconds = String(total % 60).padStart(2, "0");
		const text = `⏳ cache ${minutes}:${seconds}`;
		const color = remaining < 60_000 ? "warning" : "success";
		ctx.ui.setStatus(STATUS_KEY, theme.fg(color, text));
	};

	const stop = () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	};

	const restart = (ctx: ExtensionContext) => {
		const declared = (ctx.model as { promptCache?: { short?: number } } | undefined)?.promptCache?.short;
		ttlMs = (declared && declared > 0 ? declared : DEFAULT_TTL_S) * 1000;
		expiresAt = Date.now() + ttlMs;
		render(ctx);
		stop();
		timer = setInterval(() => {
			render(ctx);
			if (Date.now() >= expiresAt) stop();
		}, 1000);
		timer.unref?.();
	};

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		restart(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stop();
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
