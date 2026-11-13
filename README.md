# pi-setup

Mi configuración de [Pi](https://pi.dev): extensiones propias, parches que sobreviven a `pi update` y unos cuantos detalles de TUI.

```
┌────────────────────────────────────────────────────────────┐
│  transcript                                    │  ● 1 refactor
│                                                │  ✓ 2 docs
│  ▌ ✓ think ×2, bash ×1 · ⏱ 4.0s · máx 30s     │  ⊟ colapsar
└────────────────────────────────────────────────────────────┘
  -- ✸ Rumiando -------------------------------------------------
  ❯ _
```

## Qué incluye

**TUI**

| Extensión | Qué hace |
| --- | --- |
| `tabs.ts` | Columna de sesiones a la derecha, clicable, estados `●` pendiente / `✓` leída, árbol de subagentes, `/tabs` (`new`, `close`, `rename`, `next`, `N`). |
| `tps.ts` | Tokens/s reales con calibración chars→tokens y ventana de 3 s. |
| `cache-ttl.ts` | Cuenta atrás del prompt cache: `⏳ cache 4:42`. |
| `omp-look.ts` | Spinner animado + palabras rotando mientras trabaja (`Cocinando`, `Rumiando`…). |
| `live-preview.ts` | La frase actual del razonamiento, solo en la última fila de tools. |
| `bash-eta.ts` | `⏱ 4.0s · ~6s · máx 30s` por comando, aprendido de ejecuciones previas. |
| `thinking-preview.ts` | Cola del thinking en la etiqueta colapsada. |
| `ctrl-p-menu.ts` | `ctrl+p` abre ajustes rápidos (modelo, thinking, reanudar). |

**Trabajo**

| Extensión | Qué hace |
| --- | --- |
| `ask-user.ts` | Tool `ask_user`: el modelo pregunta y espera respuesta en la TUI. |
| `status.ts` | `/status`: consulta paralela al mismo modelo, sin interrumpir. Queda como tarjeta en el chat. |
| `zoom.ts` | `/zoom` o `alt+z`: última imagen a pantalla completa, `+`/`-` para zoom. |
| `copy-cmd.ts` | `alt+c` o `/cc`: copia el último comando bash. |
| `core-patch.ts` | Inyecta `switchSession` en contextos que no lo tienen (necesario para cambiar de sesión desde un clic). |
| `repatch.ts` | Reaplica los parches npm al arrancar tras un `pi update`. |

## Instalación

```bash
git clone git@github.com:fabiomode2/pi-setup.git
cd pi-setup
./install.sh          # extensiones, keybindings, parches, ajustes y paquetes
./apply-patches.sh    # parchea los bundles de Pi (arranque más rápido)
```

Reinicia Pi. Los paquetes se instalan con `pi install npm:…`; si alguno falla, instálalo a mano.

## Parches

`patches/manifest.json` guarda, por fichero: paquete, versión, ruta y un marcador único.

- El marcador sigue ahí → no se toca.
- El marcador desapareció y **la versión coincide** → se reaplica (`~/.pi/agent/bin/repatch`).
- La versión cambió → **no** se aplica y avisa: el parche hay que revisarlo contra la versión nueva.

| Paquete | Qué se cambia |
| --- | --- |
| `pi-minimalist` | Fila de tools con ETA y frase viva, clic en bash copia el comando, chip `⧉`. |
| `pi-topping-web-tools` | Rutas de `$HOME` sin confirmar; permisos por carpeta en vez de por fichero. |
| `pi-topping-splash` | Splash al 85 % y respetando la transparencia del terminal. |

## Estructura

```
extensions/     extensiones propias (TypeScript, sin build)
patches/        manifest.json + files/ (ficheros ya parcheados)
bin/repatch     reaplica los parches a mano
apply-patches.sh  parchea los bundles de Pi
install.sh      instalador
```

## Ajustes de Pi

- `defaultThinkingLevel: max`, `hideThinkingBlock: true`
- `ctrl+p` liberado de los built-ins (`keybindings.json`) para el menú rápido

## Créditos

Construido sobre Pi y sus paquetes: `pi-minimalist`, `awesome-pi-themes`,
`pi-subagents-lite`, `pi-hermes-memory`, `pi-topping-splash`, `pi-topping-web-tools`.

## Licencia

MIT
