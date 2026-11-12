/**
 * TPS real para Pi.
 *
 * Por qué existe: pi-token-speed contaba "1 token por delta" del stream. Los
 * providers agrupan ~4 tokens por delta, así que reportaba ~1/4 del valor real
 * (30 tok/s cuando el modelo iba a 116, medido contra usage.output).
 *
 * - Durante el stream: ventana deslizante de 3s sobre tokens estimados
 *   (chars / ratio). El ratio se recalibra con cada mensaje terminado.
 * - Al terminar el mensaje: tokens reales del provider / tiempo real de
 *   generación, descartando pausas > 300ms (stalls del server) y sin contar
 *   el tiempo de tools entre mensajes.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendFileSync } from "node:fs";
const dbg = (o: unknown) => { try { appendFileSync("/tmp/tps2.log", JSON.stringify(o) + "\n"); } catch {} };

const STATUS_KEY = "tps";
const WINDOW_MS = 3000;
const DEFAULT_CHARS_PER_TOKEN = 3.0;
const MIN_TOKENS_FOR_CALIBRATION = 80;
const STALL_MS = 300;

type Sample = { at: number; tokens: number };

type MessageState = {
  startAt: number;
  firstDeltaAt: number;
  lastDeltaAt: number;
  activeMs: number;
  chars: number;
  samples: Sample[];
};

/** Suaviza el valor en vivo (EMA) y lo acota: picos de un burst no son TPS real. */
export function smooth(prev: number, next: number): number {
	if (prev <= 0) return next;
	return prev * 0.6 + next * 0.4;
}

/** Tokens estimados en la ventana deslizante / segundos de la ventana. */
export function liveTps(samples: Sample[], now: number): number {
  const from = now - WINDOW_MS;
  let tokens = 0;
  let earliest = Infinity;
  for (const s of samples) {
    if (s.at < from) continue;
    tokens += s.tokens;
    if (s.at < earliest) earliest = s.at;
  }
  if (tokens <= 0) return 0;
  // Suelo de 0.5s: sin él, un par de deltas seguidos dan picos absurdos.
  const span = Math.max((now - Math.max(from, earliest)) / 1000, 0.5);
  return tokens / span;
}

/** TPS real: tokens del provider / tiempo de generación (sin stalls ni tools). */
export function finalTps(outputTokens: number, activeMs: number): number {
  const seconds = activeMs / 1000;
  if (outputTokens <= 0 || seconds <= 0) return 0;
  return outputTokens / seconds;
}

export function calibrate(prev: number, chars: number, outputTokens: number): number {
  if (chars <= 0 || outputTokens < MIN_TOKENS_FOR_CALIBRATION) return prev;
  const observed = chars / outputTokens;
  // Media exponencial: se adapta sin dar bandazos por un mensaje raro.
  return prev * 0.7 + observed * 0.3;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

export default function (pi: ExtensionAPI) {
  let charsPerToken = DEFAULT_CHARS_PER_TOKEN;
  let state: MessageState | null = null;
  // Totales del turno: un mensaje corto aislado da cifras sin sentido.
  let turnTokens = 0;
  let turnActiveMs = 0;
  let live = 0;

  const render = (ctx: ExtensionContext, build: (fg: (color: string, text: string) => string) => string) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    ctx.ui.setStatus(STATUS_KEY, build((color, text) => theme.fg(color as never, text)));
  };

  pi.on("agent_start", async (_event, ctx) => {
    state = null;
    turnTokens = 0;
    turnActiveMs = 0;
    live = 0;
    render(ctx, (fg) => fg("dim", "… tok/s"));
  });

  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    state = { startAt: performance.now(), firstDeltaAt: 0, lastDeltaAt: 0, activeMs: 0, chars: 0, samples: [] };
  });

  pi.on("message_update", async (event, ctx) => {
    const stream = event.assistantMessageEvent;
    if (!state || !stream) return;
    if (stream.type !== "text_delta" && stream.type !== "thinking_delta" && stream.type !== "toolcall_delta") {
      return;
    }

    const deltaChars = (stream.delta ?? "").length;
    if (deltaChars === 0) return;

    const now = performance.now();
    if (state.lastDeltaAt > 0) {
      // Solo cuenta el tiempo "generando": las pausas largas del server fuera.
      state.activeMs += Math.min(now - state.lastDeltaAt, STALL_MS);
    }
    if (state.firstDeltaAt === 0) state.firstDeltaAt = now;
    state.lastDeltaAt = now;
    state.chars += deltaChars;

    state.samples.push({ at: now, tokens: deltaChars / charsPerToken });
    // La ventana solo necesita los últimos segundos.
    const cutoff = now - WINDOW_MS - 500;
    while (state.samples.length > 0 && state.samples[0].at < cutoff) state.samples.shift();

    live = smooth(live, liveTps(state.samples, now));
    if (live > 0) {
      render(ctx, (fg) => `${fg("accent", `~${Math.min(live, 400).toFixed(0)}`)} ${fg("dim", "tok/s")}`);
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const current = state;
    state = null;
    if (!current) return;

    const output = event.message.usage?.output ?? 0;
    charsPerToken = calibrate(charsPerToken, current.chars, output);
    turnTokens += output;
    turnActiveMs += current.activeMs;

    const tps = finalTps(output, current.activeMs);
    dbg({ at: "end", output, activeMs: Math.round(current.activeMs), tps: Math.round(tps), hasUI: ctx.hasUI });
    // Mensajes de pocos tokens o de menos de 300ms: la cifra es ruido.
    if (tps <= 0 || output < 40 || current.activeMs < 300) return;

    render(
      ctx,
      (fg) =>
        `${fg("success", tps.toFixed(0))} ${fg("dim", "tok/s")}` + fg("muted", ` · ${formatTokens(output)} tok`),
    );
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (turnTokens < 50 || turnActiveMs < 300) return;
    const tps = finalTps(turnTokens, turnActiveMs);
    if (tps <= 0) return;
    render(
      ctx,
      (fg) =>
        `${fg("success", tps.toFixed(0))} ${fg("dim", "tok/s")}` + fg("muted", ` · ${formatTokens(turnTokens)} tok (turno)`),
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
