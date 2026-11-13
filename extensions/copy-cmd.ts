/**
 * Copiar el último comando bash al portapapeles: alt+c o /cc.
 * Usa wl-copy (Wayland) y cae a xclip si no está.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

let lastCommand: string | undefined;

const copy = (text: string): Promise<boolean> =>
	new Promise((resolve) => {
		const candidates = [
			["wl-copy"],
			["xclip", "-selection", "clipboard"],
		];
		const attempt = (index: number) => {
			if (index >= candidates.length) return resolve(false);
			const [bin, ...args] = candidates[index];
			const child = spawn(bin, args, { stdio: ["pipe", "ignore", "ignore"] });
			child.on("error", () => attempt(index + 1));
			child.on("close", (code) => (code === 0 ? resolve(true) : attempt(index + 1)));
			child.stdin.end(text);
		};
		attempt(0);
	});

export default function (pi: ExtensionAPI) {
	pi.on("tool_execution_start", async (event) => {
		if (event.toolName !== "bash") return;
		const command = (event.args as { command?: string } | undefined)?.command;
		if (typeof command === "string" && command.trim()) lastCommand = command;
	});

	const run = async (ctx: { hasUI: boolean; ui: { notify: (msg: string, kind: "info" | "error") => void } }) => {
		if (!lastCommand) {
			if (ctx.hasUI) ctx.ui.notify("No hay ningún comando bash todavía", "error");
			return;
		}
		const ok = await copy(lastCommand);
		if (ctx.hasUI) {
			ctx.ui.notify(ok ? "Comando copiado al portapapeles" : "No se pudo copiar (¿falta wl-copy?)", ok ? "info" : "error");
		}
	};

	pi.registerShortcut("alt+c", { description: "Copiar el último comando bash", handler: run });
	pi.registerCommand("cc", { description: "Copiar el último comando bash al portapapeles", handler: run });
}
