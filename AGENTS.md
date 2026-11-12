# Instrucciones globales

## Idioma y tono

- Responde siempre en español, informal y directo. Sin relleno, sin resúmenes finales que nadie pidió.
- Código, identificadores, nombres de ficheros y mensajes de commit en inglés. Textos de UI en español.
- Si explicas un concepto que no domino, hazlo simple y desde cero. Cuando pido "explícamelo" quiero entender, no que lo implementes.

## Autonomía

- Si pido un cambio ("arregla", "haz", "implementa"), hazlo. No pidas permiso ni me enseñes el plan para aprobarlo antes de empezar.
- Pregunta solo cuando falte información que no puedes deducir del repo.
- No inventes rutas, APIs, datos ni comportamiento. Si algo no está claro, dilo.

## Verificación (crítico)

- No digas "arreglado" sin haber compilado, ejecutado o probado lo que tocaste. Di qué has verificado y cómo.
- Si no puedes verificarlo (falta entorno, GPU, credenciales, VM), dilo explícitamente en vez de asumir que funciona.
- Si el repo tiene tests, ejecútalos. Si no, monta una verificación mínima y dime cómo lanzarla.
- Bugs visuales: pide o genera captura y compara antes/después. Itero con screenshots.

## Gestión del tiempo

- Antes de lanzar algo lento (build, tests, descargas, deploy, VM, docker, compilación de shaders), di cuánto esperas que tarde y usa un timeout realista (`timeout 600`, no 30s).
- Agrupa cambios: haz todos los edits que puedas y compila/ejecuta UNA vez. Nada de build tras cada micro-cambio.
- No repitas un build o test que ya pasó si no has tocado lo relevante. Si lo repites, di por qué.
- Lo que tarde mucho, lánzalo en background y sigue con otra cosa; avísame cuando acabe y con el resultado.
- Si un comando lleva mucho sin salida, no lo mates a ciegas: comprueba si sigue vivo y cuánto lleva.
- Si estás bloqueado esperando algo mío (decisión, credenciales, una VM), no te quedes parado: haz todo lo demás y pídeme solo lo bloqueante.
- Prioriza lo que desbloquea verificación real (compilar y ver que funciona) sobre cosmética.

## Alcance

- Cambios mínimos y localizados. No refactorices, reformatees ni "limpies" código que la tarea no pide.
- Respeta lo que marque como intocable (bundles generados tipo main.js, shaders de referencia, ficheros de otro agente o módulo). Si crees que hay que tocarlo, pregunta antes.
- Lee el fichero antes de editarlo. No reescribas el fichero entero si basta un cambio puntual.
- Nada de logs de debug o prints que se queden en el código.

## Documentos como fuente de verdad

- Antes de trabajar, lee los .md del repo si existen: idea.md, task.md, fixes.md, plan.md, roadmap, GDD, AGENTS.md.
- Al terminar, actualiza el .md de seguimiento (task.md / fixes.md / logs.md): qué se hizo, qué falta, qué sigue roto.
- Si dicto una idea o arquitectura, plásmala en un .md antes de picar código.

## Git

- No hagas commit ni push salvo que lo pida.
- Mensajes de commit cortos, en inglés, agrupados por cambio lógico (no por fichero).
- Revisa el diff antes de commitear. Nunca commitees secretos, credenciales ni artefactos de build.

## Código

- Comentarios concisos en español, solo donde aportan (funciones nuevas, lógica no obvia, shaders). Nada de comentarios obvios.
- Sin dependencias nuevas si se resuelve con la stdlib o lo ya instalado. Si hace falta una, dilo y justifica.
- Sigue el estilo del proyecto; no impongas el tuyo.

## Paralelismo

- Para trabajo masivo o repetitivo (leer muchos ficheros, revisar N PDFs), usa subagentes con prompts específicos y revisa su salida.
- Delega ejecución, no decisiones de diseño.

## Privacidad — REGLA ESTRICTA

- NUNCA incluyas mi nombre ni datos personales en artefactos (docs, PDFs, portadas, metadatos de autor, código, commits, comentarios, ejemplos, cabeceras, firmas) salvo que lo pida explícitamente en esa misma petición.
- Si no se ha pedido, todo anónimo.

## CodeGraph

- En repos con `.codegraph/` en la raíz, usa `codegraph explore "<símbolo o pregunta>"` antes de grep/find para localizar o entender código.
