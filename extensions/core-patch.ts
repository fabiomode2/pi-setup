/**
 * Da `switchSession` / `newSession` a los contextos que no son de comando
 * (atajos, eventos, clics), para que las pestañas puedan cambiar de sesión con
 * un clic. Parchea el bundle de Pi en disco; si una actualización lo revierte,
 * lo reaplica al arrancar y avisa de que hay que reiniciar.
 *
 * No guarda copias del bundle: inserta dos métodos con anclas estables y, si no
 * las encuentra (versión nueva), no toca nada y avisa.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

const ANCHOR_RUNNER = "isIdle:()=>(runner.assertActive(),runner.isIdleFn()),";
const INJECT_RUNNER =
	"switchSession:(p,o)=>(runner.assertActive(),runner.switchSessionHandler(p,o)),newSession:o=>(runner.assertActive(),runner.newSessionHandler(o)),";

const ANCHOR_SHORTCUT = 'mode:"tui",hasUI:!0,cwd:this.sessionManager.getCwd(),sessionManager:this.sessionManager,';
const INJECT_SHORTCUT =
	"switchSession:(p,o)=>(this.assertActive(),this.switchSessionHandler(p,o)),newSession:o=>(this.assertActive(),this.newSessionHandler(o)),";

function bundlePath(): string | undefined {
	try {
		const out = execFileSync("sh", ["-c", `ls -d ${AGENT_DIR}/install/releases/*/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks/chunk-*.js 2>/dev/null | tail -1`], {
			encoding: "utf8",
		}).trim();
		return out || undefined;
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	const file = bundlePath();
	if (!file) return;

	let src = "";
	try {
		src = readFileSync(file, "utf8");
	} catch {
		return;
	}

	let changed = false;
	if (!src.includes(INJECT_RUNNER) && src.includes(ANCHOR_RUNNER)) {
		src = src.replace(ANCHOR_RUNNER, INJECT_RUNNER + ANCHOR_RUNNER);
		changed = true;
	}
	if (!src.includes(INJECT_SHORTCUT) && src.includes(ANCHOR_SHORTCUT)) {
		src = src.replace(ANCHOR_SHORTCUT, ANCHOR_SHORTCUT + INJECT_SHORTCUT);
		changed = true;
	}

	if (!changed) return;
	try {
		writeFileSync(file, src);
		pi.on("session_start", async (_event, ctx) => {
			if (ctx.hasUI) ctx.ui.notify("Parche de contextos reaplicado. Reinicia Pi para que el clic cambie de pestaña.", "warning");
		});
	} catch {
		// sin permiso de escritura: se ignora
	}
}
