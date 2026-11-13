/**
 * Lazy tools: al arrancar solo quedan declaradas las built-in (read, bash, edit, write)
 * y `load_tools`. El resto se oculta y el modelo lo carga bajo demanda, ahorrando sus
 * schemas y prompt guidelines en cada request.
 *
 * Las tools ocultas siguen registradas y activas; `prepareLoadout` solo omite su
 * declaración. Al cargarlas con `load_tools` se activan y se declaran en la siguiente
 * llamada al modelo.
 *
 * No se aplica en sesiones hijas (subagentes), que crean sesiones in-memory con su
 * propio system prompt y necesitan las tools que les haya pasado su padre.
 */
import type { ExtensionAPI, ToolInfo, ToolLoadout } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOADER = "load_tools";
const ALWAYS = new Set(["read", "bash", "edit", "write", LOADER]);
const MAX_SUMMARY = 110;

function isBuiltin(tool: ToolInfo): boolean {
	return tool.sourceInfo.source === "builtin" || tool.sourceInfo.path.startsWith("builtin:");
}

/** Primera línea de la descripción, recortada: el catálogo no necesita el detalle. */
function summary(tool: Pick<ToolInfo, "description">): string {
	const line = (tool.description.trim().split(/\r?\n/)[0] ?? "").trim();
	return line.length > MAX_SUMMARY ? `${line.slice(0, MAX_SUMMARY - 1).trimEnd()}…` : line;
}

/** Loadout que el transcript declara: replay de toolsAdded/toolsRemoved, como hace pi al restaurar. */
function recordedTools(entries: readonly unknown[]): Set<string> {
	const names = new Set<string>();
	for (const raw of entries) {
		const entry = raw as {
			type?: string;
			message?: { role?: string; toolsAdded?: { name: string }[]; toolsRemoved?: { name: string }[] };
		};
		if (entry?.type !== "message" || entry.message?.role !== "system") continue;
		for (const tool of entry.message.toolsAdded ?? []) names.add(tool.name);
		for (const tool of entry.message.toolsRemoved ?? []) names.delete(tool.name);
	}
	return names;
}

export default function (pi: ExtensionAPI) {
	// Estado por sesión: la factory se invoca una vez por runtime, subagentes incluidos.
	const loadedTools = new Set<string>();
	let enabled = false;

	const allTools = () => pi.getAllTools();
	const find = (name: string) => allTools().find((tool) => tool.name === name);

	/** Tools que el modelo puede cargar: registradas, declarables y todavía sin cargar. */
	function loadable(): ToolInfo[] {
		return allTools().filter(
			(tool) =>
				!ALWAYS.has(tool.name) &&
				!loadedTools.has(tool.name) &&
				tool.exposure !== "hidden" &&
				tool.exposure !== "codemode" &&
				tool.exposure !== "deferred" &&
				(tool.name !== "powershell" || process.platform === "win32"),
		);
	}

	function catalog(): string {
		const tools = loadable();
		if (tools.length === 0) return "Every tool is already loaded.";
		return tools.map((tool) => `- ${tool.name}: ${summary(tool)}`).join("\n");
	}

	const description = () =>
		`Load tools that are not declared yet. Pass the exact names in \`tools\`, or "*" to load all of them. ` +
		`Loaded tools are available from your next call. Call without arguments to list what can be loaded.\n\n` +
		`Loadable now:\n${catalog()}`;

	pi.registerTool({
		name: LOADER,
		label: "Load tools",
		description:
			'Load tools that are not declared yet. Pass the exact names in `tools`, or "*" to load all of them. ' +
			"Loaded tools are available from your next call. Call without arguments to list what can be loaded.",
		promptSnippet: "Load additional tools by name when the declared ones cannot do the task",
		promptGuidelines: [
			"Only a minimal tool set is declared at start. Call load_tools with the exact tool names (see its catalogue) when you need web, memory, skill, subagent, or other tools.",
			"Do not say a capability is unavailable before checking the load_tools catalogue.",
		],
		parameters: Type.Object({
			tools: Type.Optional(
				Type.Array(Type.String(), {
					description: 'Exact tool names to activate, e.g. ["web_browser", "pdf_extract"]. Use ["*"] for all.',
				}),
			),
		}),
		// Mantiene el catálogo al día sin gastar contexto en las descripciones completas.
		prepareLoadout(loadout: ToolLoadout) {
			if (!enabled) return undefined;
			const hidden = loadout.declared
				.map((tool) => tool.name)
				.filter((name) => {
					if (ALWAYS.has(name) || loadedTools.has(name)) return false;
					const tool = find(name);
					return tool ? !isBuiltin(tool) : false;
				});
			return {
				descriptions: { [LOADER]: description() },
				hiddenDeclarations: hidden,
			};
		},
		async execute(_toolCallId, params) {
			const wanted = (params.tools ?? []).map((name) => name.trim()).filter(Boolean);
			if (wanted.length === 0) {
				return {
					content: [{ type: "text", text: `Tools that can be loaded:\n${catalog()}` }],
					details: { loaded: [] as string[] },
				};
			}

			const names = wanted.includes("*") ? loadable().map((tool) => tool.name) : wanted;
			const valid = names.filter((name) => {
				const tool = find(name);
				return tool !== undefined && tool.exposure !== "hidden";
			});
			const unknown = names.filter((name) => !valid.includes(name));

			const active = pi.getActiveTools();
			const added = valid.filter((name) => !active.includes(name));
			const already = valid.filter((name) => active.includes(name) && loadedTools.has(name));

			for (const name of valid) loadedTools.add(name);
			// setActiveTools siempre: rebuild del system prompt para que prepareLoadout
			// deje de ocultar lo recién cargado.
			pi.setActiveTools([...active, ...added]);

			const lines = valid
				.filter((name) => !ALWAYS.has(name))
				.map((name) => `- ${name}: ${summary(find(name)!)}`);
			const parts: string[] = [];
			if (lines.length > 0) parts.push(`Loaded (available from your next call):\n${lines.join("\n")}`);
			if (already.length > 0) parts.push(`Already loaded: ${[...new Set(already)].join(", ")}`);
			if (unknown.length > 0) parts.push(`Unknown or unavailable: ${unknown.join(", ")}`);
			if (parts.length === 0) parts.push("No tools loaded.");

			return {
				content: [{ type: "text", text: parts.join("\n\n") }],
				details: { loaded: valid, unknown },
			};
		},
	});

	pi.on("session_start", (event, ctx) => {
		// Los subagentes usan sesiones in-memory y un system prompt propio: no tocar.
		const topLevel =
			ctx.sessionManager.getSessionFile() !== undefined ||
			ctx.getSystemPrompt().includes("coding assistant running inside pi");
		if (!topLevel) {
			enabled = false;
			return;
		}
		enabled = true;

		const active = pi.getActiveTools();
		if (event.reason === "startup" || event.reason === "new") {
			loadedTools.clear();
			// Deja activas solo las built-in (read/bash/edit/write por defecto) y el loader.
			const keep = active.filter((name) => {
				if (ALWAYS.has(name)) return true;
				const tool = find(name);
				return tool ? isBuiltin(tool) : false;
			});
			pi.setActiveTools([...new Set([...keep, LOADER])]);
			return;
		}

		// resume/fork/reload: restaura el loadout que el transcript declara y asegura el loader.
		const recorded = recordedTools(ctx.sessionManager.getBranch());
		const keep = active.filter((name) => {
			if (ALWAYS.has(name) || recorded.has(name)) return true;
			const tool = find(name);
			return tool ? isBuiltin(tool) : false;
		});
		loadedTools.clear();
		for (const name of keep) if (!ALWAYS.has(name)) loadedTools.add(name);
		pi.setActiveTools([...new Set([...keep, LOADER])]);
	});
}
