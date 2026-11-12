/**
 * ctrl+p abre un menú rápido en vez de ciclar modelos (que es lo que hace Pi
 * por defecto). Para liberar la tecla, keybindings.json desactiva
 * `app.model.cycleForward` y `app.model.cycleBackward`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+p", {
		description: "Ajustes rápidos (modelo / thinking)",
		handler: async (ctx) => {
			const models = (ctx.scopedModels.length > 0 ? ctx.scopedModels.map((item) => item.model) : ctx.modelRegistry.getAvailable()).slice(0, 30);

			const action = await ctx.ui.select("Ajustes", [
				`Modelo (${ctx.model?.id ?? "ninguno"})`,
				`Thinking (${ctx.thinkingLevel})`,
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

			ctx.ui.notify("Escribe /settings y Enter", "info");
		},
	});
}
