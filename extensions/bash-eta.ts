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
	const s = Math.max(0, Math.round(total));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

declare global {
	// pi-minimalist lo consulta al pintar cada fila de tool.
	var __piBashEtaBadge: (() => string) | undefined;
}

export default function (pi: ExtensionAPI) {
	const stats = loadStats();
	let startedAt = 0;
	let currentKey: string | undefined;
	let lastTimeout: number | undefined;

	const clearBadge = () => {
		globalThis.__piBashEtaBadge = undefined;
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

		clearBadge();
		globalThis.__piBashEtaBadge = () => {
			const parts: string[] = [];
			if (estimate !== undefined) parts.push(`~${formatSeconds(estimate)}`);
			if (timeout !== undefined) parts.push(`máx ${formatSeconds(timeout)}`);
			return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
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
		globalThis.__piBashEtaBadge = () => {
			const parts: string[] = [`${formatSeconds(seconds)}`];
			if (est !== undefined) parts.push(`~${formatSeconds(est)}`);
			if (ceiling !== undefined) parts.push(`máx ${formatSeconds(ceiling)}`);
			return `⏱ ${parts.join(" · ")}`;
		};
		const key = currentKey;
		currentKey = undefined;
		startedAt = 0;
		if (seconds < 1 || !key) return;
		const stat = stats[key];
		stats[key] = stat ? { avg: stat.avg * 0.6 + seconds * 0.4, n: stat.n + 1 } : { avg: seconds, n: 1 };
		saveStats(stats);
	});

	pi.on("session_shutdown", async () => {
		clearBadge();
	});
}
