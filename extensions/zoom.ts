/**
 * /zoom (y alt+z): abre en grande la última imagen de la conversación, en un
 * overlay con zoom por teclado (+/-) y cierre con Esc.
 *
 * Las imágenes del transcript las pinta el core de Pi sin manejador de ratón,
 * así que el zoom tiene que entrar por comando o atajo.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Image } from "@earendil-works/pi-tui";

type ImagePart = { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function lastImage(messages: readonly unknown[]): ImagePart | undefined {
	let found: ImagePart | undefined;
	for (const message of messages) {
		const content = (message as { content?: unknown }).content;
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			if ((part as { type?: string }).type === "image") found = part as ImagePart;
		}
	}
	return found;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("zoom", {
		description: "Ver en grande la última imagen de la conversación",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const part = lastImage(ctx.sessionManager.buildSessionContext().messages);
			if (!part) {
				ctx.ui.notify("No hay imágenes en esta conversación", "warning");
				return;
			}

			await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
				let cells = 100;
				let image = new Image(
					part.source.data,
					part.source.media_type,
					{ fallbackColor: (text: string) => theme.fg("muted", text) },
					{ maxWidthCells: cells },
				);

				const rebuild = () => {
					image = new Image(
						part.source.data,
						part.source.media_type,
						{ fallbackColor: (text: string) => theme.fg("muted", text) },
						{ maxWidthCells: cells },
					);
					tui.requestRender();
				};

				return {
					render: (width: number) => image.render(Math.min(width, cells)),
					handleInput(data: string) {
						const cancel = keybindings.matches(data, "tui.select.cancel");
						if (cancel) {
							done(undefined);
							return;
						}
						if (data === "+" || data === "=") {
							cells = Math.min(300, cells + 20);
							rebuild();
						} else if (data === "-") {
							cells = Math.max(30, cells - 20);
							rebuild();
						}
					},
					invalidate() {},
				};
			});
		},
	});

	pi.registerShortcut("alt+z", {
		description: "Zoom de la última imagen",
		handler: async (ctx) => {
			const part = lastImage(ctx.sessionManager.buildSessionContext().messages);
			if (!part) {
				ctx.ui.notify("No hay imágenes en esta conversación", "warning");
				return;
			}
			void part;
			await ctx.ui.custom<void>((_tui, theme, keybindings, done) => {
				const image = new Image(
					part.source.data,
					part.source.media_type,
					{ fallbackColor: (text: string) => theme.fg("muted", text) },
					{ maxWidthCells: 100 },
				);
				return {
					render: (width: number) => image.render(Math.min(width, 100)),
					handleInput(data: string) {
						if (keybindings.matches(data, "tui.select.cancel")) done(undefined);
					},
					invalidate() {},
				};
			});
		},
	});
}
