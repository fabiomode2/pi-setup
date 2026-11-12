/**
 * Reaplica los parches locales de paquetes npm tras un `pi update`.
 *
 * Los parches viven en ~/.pi/agent/patches/files y el manifiesto guarda, para
 * cada fichero, un marcador único y la versión del paquete sobre la que se hizo.
 * Si el marcador desaparece (el paquete se actualizó) y la versión coincide, se
 * vuelve a copiar el fichero parcheado. Si la versión cambió, no se toca nada y
 * se avisa: hay que revisar el parche contra la versión nueva.
 *
 * Los parches se aplican al arrancar, así que surten efecto en el siguiente
 * arranque. Para aplicarlos ya, ejecuta ~/.pi/agent/bin/repatch.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Entry = { package: string; version: string; target: string; stored: string; marker: string };

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const MANIFEST = join(AGENT_DIR, "patches", "manifest.json");

function installedVersion(pkg: string): string | undefined {
	const path = join(AGENT_DIR, "npm", "node_modules", ...pkg.split("/"), "package.json");
	try {
		return (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version;
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	let reapplied = 0;
	let drifted: string[] = [];
	let missing = 0;

	let entries: Entry[] = [];
	try {
		entries = JSON.parse(readFileSync(MANIFEST, "utf8")) as Entry[];
	} catch {
		return;
	}

	for (const entry of entries) {
		const target = join(AGENT_DIR, entry.target);
		const stored = join(AGENT_DIR, "patches", "files", entry.stored);
		if (!existsSync(target) || !existsSync(stored)) {
			missing++;
			continue;
		}
		let current = "";
		try {
			current = readFileSync(target, "utf8");
		} catch {
			missing++;
			continue;
		}
		if (current.includes(entry.marker)) continue;

		if (installedVersion(entry.package) !== entry.version) {
			drifted.push(`${entry.package} (parche v${entry.version}, instalado v${installedVersion(entry.package) ?? "?"})`);
			continue;
		}
		try {
			copyFileSync(stored, target);
			reapplied++;
		} catch {
			missing++;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		if (reapplied > 0) {
			ctx.ui.notify(`Parches locales reaplicados: ${reapplied}. Reinicia Pi para que surtan efecto.`, "warning");
		}
		if (drifted.length > 0) {
			ctx.ui.notify(`Parches obsoletos (versión nueva): ${drifted.join(", ")}. Revísalos.`, "error");
		}
		if (missing > 0) {
			ctx.ui.notify(`No pude reaplicar ${missing} parche(s): falta el fichero original.`, "error");
		}
	});
}
