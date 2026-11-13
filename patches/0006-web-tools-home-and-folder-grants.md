# web-tools: home preaprobado y permisos por carpeta

`@underactive/pi-topping-web-tools/src/permissions.ts`

- `isInsideCwd(path)` devuelve `true` también para cualquier ruta dentro de `$HOME`
  (el usuario ya tiene permiso de SO ahí): deja de preguntar fichero a fichero.
- `permissionKey(url)` para `file:` usa `dirname(pathname)`, así que un permiso
  concedido cubre toda la carpeta en lugar de un único fichero.

```diff
-export function isInsideCwd(resolvedPath: string): boolean {
-	const rel = relative(process.cwd(), resolvedPath);
-	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
-}
+const isWithin = (base: string, target: string): boolean => {
+	const rel = relative(base, target);
+	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
+};
+
+export function isInsideCwd(resolvedPath: string): boolean {
+	if (isWithin(process.cwd(), resolvedPath)) return true;
+	// El usuario ya tiene permiso de SO sobre su propio home: no preguntamos.
+	const home = homedir();
+	return home !== "" && isWithin(home, resolvedPath);
+}
@@
-		if (parsed.protocol === "file:") {
-			return `file://${parsed.pathname}`;
-		}
+		if (parsed.protocol === "file:") {
+			// Permiso por carpeta, no por fichero: aprobar una vez cubre el resto.
+			return `file://${dirname(parsed.pathname)}`;
+		}
```
