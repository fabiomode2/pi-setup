/**
 * Tiempo estimado de las tools bash, sin involucrar al modelo.
 *
 * - Si el agente pasa `timeout`, ese es el techo: se muestra como `≤Nm`.
 * - Si no, se usa la media histórica del mismo comando (primer par de palabras),
 *   aprendida de ejecuciones anteriores y persistida en bash-timings.json.
 *
 * El badge se pinta dentro de la fila de la tool (pi-minimalist lo lee de
 * globalThis.__piBashEtaBadge) y mantiene el estilo del cronómetro existente.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const STATS_PATH = join(AGENT_DIR, "bash-timings.json");

type Stat = { avg: number; n: number };

function loadStats(): Record<string, Stat> {
	try {
		return JSON.parse(readFileSync(STATS_PATH, "utf8"));
	} catch {
		return {};
	}
}

function saveStats(stats: Record<string, Stat>): void {
	try {
		if (!existsSync(AGENT_DIR)) return;
		writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
	} catch {
		// sin persistencia seguimos estimando con lo que hay en memoria
	}
}

/** Clave estable por comando: primeros dos tokens del primer tramo. */
export function commandKey(command: string): string {
	const first = command.split(/\s*(?:&&|\|\||;|\|)\s*/)[0] ?? command;
	return first.trim().split(/\s+/).slice(0, 2).join(" ").slice(0, 40);
}

export function formatSeconds(total: number): string {
	// Por debajo de 10s se enseña un decimal: si no, un comando rápido marca "0s"
	// y parece que el reloj no avanza.
	const raw = Math.max(0, total);
	if (raw < 0.1) return "<0.1s";
	if (raw < 10) return `${raw.toFixed(1)}s`;
	const s = Math.round(raw);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

declare global {
	// pi-minimalist lo consulta al pintar cada fila; sin id devuelve el bash en curso.
	var __piBashEtaBadge: ((toolCallId?: string) => string) | undefined;
}

export default function (pi: ExtensionAPI) {
	const stats = loadStats();
	let startedAt = 0;
	let currentKey: string | undefined;
	let lastTimeout: number | undefined;
	// Badge por llamada: cada fila enseña el suyo y ninguno se queda pegado al resto.
	const badges = new Map<string, string>();
	let runningId: string | undefined;

	const trim = () => {
		while (badges.size > 60) {
			const oldest = badges.keys().next().value;
			if (oldest === undefined) break;
			badges.delete(oldest);
		}
	};

	pi.on("tool_execution_start", async (event) => {
		if (event.toolName !== "bash") return;
		const args = (event.args ?? {}) as { command?: string; timeout?: number };
		const command = args.command ?? "";
		if (!command) return;

		currentKey = commandKey(command);
		startedAt = Date.now();
		const timeout = typeof args.timeout === "number" && args.timeout > 0 ? args.timeout : undefined;
		lastTimeout = timeout;
		const known = stats[currentKey];
		const estimate = known && known.n > 0 ? known.avg : undefined;

		runningId = event.toolCallId;
		const extra: string[] = [];
		if (estimate !== undefined) extra.push(`~${formatSeconds(estimate)}`);
		if (timeout !== undefined) extra.push(`máx ${formatSeconds(timeout)}`);
		const started = Date.now();
		if (extra.length > 0) badges.set(event.toolCallId, `· ${extra.join(" · ")}`);
		else badges.delete(event.toolCallId);
		trim();

		globalThis.__piBashEtaBadge = (toolCallId?: string) => {
			const id = toolCallId ?? runningId;
			if (!id) return "";
			if (id === runningId) {
				const live = extra.length > 0 ? ` · ${extra.join(" · ")}` : "";
				return `⏱ ${formatSeconds((Date.now() - started) / 1000)}${live}`;
			}
			return badges.get(id) ?? "";
		};
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== "bash") return;
		if (!currentKey || startedAt === 0) return;
		const seconds = (Date.now() - startedAt) / 1000;
		// Badge final: lo que tardó + lo estimado + el techo. Se queda puesto
		// hasta el siguiente bash, para que se lea en la fila ya colapsada.
		const est = stats[currentKey]?.n ? stats[currentKey].avg : undefined;
		const ceiling = lastTimeout;
		runningId = undefined;
		const finalParts: string[] = [`${formatSeconds(seconds)}`];
		if (est !== undefined) finalParts.push(`~${formatSeconds(est)}`);
		if (ceiling !== undefined) finalParts.push(`máx ${formatSeconds(ceiling)}`);
		badges.set(event.toolCallId, `⏱ ${finalParts.join(" · ")}`);
		trim();
		const key = currentKey;
		currentKey = undefined;
		startedAt = 0;
		if (seconds < 1 || !key) return;
		const stat = stats[key];
		stats[key] = stat ? { avg: stat.avg * 0.6 + seconds * 0.4, n: stat.n + 1 } : { avg: seconds, n: 1 };
		saveStats(stats);
	});

	pi.on("agent_start", async () => {
		badges.clear();
		runningId = undefined;
		globalThis.__piBashEtaBadge = (toolCallId?: string) => {
			const id = toolCallId ?? runningId;
			return id ? (badges.get(id) ?? "") : "";
		};
	});

	pi.on("session_shutdown", async () => {
		badges.clear();
		runningId = undefined;
		globalThis.__piBashEtaBadge = undefined;
	});
}
