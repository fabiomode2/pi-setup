# Copiar comandos bash

- `extensions/copy-cmd.ts`: `alt+c` o `/cc` copian el último comando bash
  (`wl-copy`, fallback `xclip`).
- `pi-minimalist/src/tool-renderer.ts`: chip `⧉` en las filas de bash y clic en
  una fila de bash no expandida = copiar el comando (también evita el overlay de
  Pi, que se dibuja sin fondo y deja ver el transcript por detrás).
- `extensions/tabs.ts`: el ctx se toma del último evento (nunca el capturado),
  `handleMouse`/`render`/`draw` envueltos en try/catch y `safeRender` para que un
  ctx caducado tras `/new`, `/reload` o cambio de sesión no tumbe el proceso.
