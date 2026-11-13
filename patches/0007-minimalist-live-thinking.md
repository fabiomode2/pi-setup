# pi-minimalist: frase viva en la fila de tools

`src/row.ts` — `summary()` añade al final la frase actual del razonamiento
(global `__piLive.phrase`, publicado por `extensions/live-preview.ts`) o la tool
en marcha.

`src/run-grouping.ts` — la frase entra en la clave de caché de `views()`, para
que la fila se recompute cuando cambia la frase (cambia por frase cerrada, no
carácter a carácter).
