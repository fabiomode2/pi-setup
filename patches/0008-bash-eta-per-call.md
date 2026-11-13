# bash-eta + minimalist: un reloj por llamada

- `extensions/bash-eta.ts`: badge por `toolCallId` (`Map`), así una fila no hereda
  el tiempo de otra; el que está en curso devuelve el tiempo vivo; al terminar
  queda `⏱ 4.0s · ~4s · máx 30s`. Formato con decimal por debajo de 10 s.
- `pi-minimalist/src/tool-renderer.ts`: cuando el badge propio trae tiempo, no se
  pinta además el `[⏱ Ns]` de serie (dos relojes en la misma fila).
