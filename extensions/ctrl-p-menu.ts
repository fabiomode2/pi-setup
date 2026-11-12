/**
 * ctrl+p abre un menú rápido en vez de ciclar modelos (keybindings.json libera
 * la tecla). Todo lo que necesita un contexto de comando se lanza escribiendo
 * el comando en el editor y enviando Enter.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

const run = (ctx: { ui: { setEditorText: (text: string) => void; notify: (m: string, t?: "info" | "warning" | "error") => void } }, command: string) => {
	try {
		(process.stdin as unknown as { unshift?: (buffer: Buffer) => void }).unshift?.(Buffer.from(`${command}\r`));
	} catch {
		ctx.ui.setEditorText(command);
		ctx.ui.notify(`Escribe ${command} y pulsa Enter`, "warning");
	}
};

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+p", {
		description: "Ajustes rápidos (modelo / thinking / sesiones)",
		handler: async (ctx) => {
			const models = (ctx.scopedModels.length > 0 ? ctx.scopedModels.map((item) => item.model) : ctx.modelRegistry.getAvailable()).slice(0, 30);

			const action = await ctx.ui.select("Ajustes rápidos", [
				`Modelo (${ctx.model?.id ?? "ninguno"})`,
				`Thinking (${ctx.thinkingLevel})`,
				"Reanudar una sesión anterior",
				"Abrir /settings completo",
			]);
			if (!action) return;

			if (action.startsWith("Modelo")) {
				const labels = models.map((model) => `${model.provider}/${model.id}`);
				const picked = await ctx.ui.select("Modelo", labels);
				if (!picked) return;
				const model = models[labels.indexOf(picked)];
				if (model) await pi.setModel(model);
				return;
			}

			if (action.startsWith("Thinking")) {
				const picked = await ctx.ui.select("Thinking", [...THINKING]);
				if (!picked) return;
				pi.setThinkingLevel(picked as (typeof THINKING)[number]);
				return;
			}

			if (action.startsWith("Reanudar")) return run(ctx, "/tabs resume");
			run(ctx, "/settings");
		},
	});
}
