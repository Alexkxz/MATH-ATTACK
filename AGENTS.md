# AGENTS.md

## Idioma y estilo

- Responde en espanol.
- Explica un resumen de lo realizado pero hasta el final y dame sugerencia de algo a mejorar o algo que se me haya pasado ver.
-No reeleas informacion ya revisada almenos que sea necesario para ahorar tokens.
- Si algo puede romper datos, configuracion o historial de git, pide permiso primero.

## Proyecto MATH-ATTACK

- Usa PowerShell para comandos locales.
- Si ya antes habias revisado los archivos no los vuelvas a revisar para evitar tokens solo ve al area o areas que ocupas del archivo.
- Si generas cambios grandes en varios archivos si revisa los que ocupes para evitar romper lo programado y que nodo este sincronizado y actualizado segun aplique.
- No borres archivos de evidencias, respaldos, logs o datos JSON sin confirmacion.
- Conserva los archivos de datos existentes: `players.json`, `ranking.json`, `devices.json`, `aureosLog.json` y `config.json`.
- Si modificas la interfaz, revisa que no haya texto encimado ni controles rotos en pantallas pequenas.

## Verificacion

- Revisa `package.json` para confirmar los comandos disponibles antes de ejecutar pruebas.
- Si cambias el servidor, ejecuta el comando local disponible para levantarlo o validar sintaxis.
- Si cambias HTML, CSS o JavaScript del frontend, verifica al menos que los archivos carguen sin errores obvios.

## Git

- No uses `git reset --hard` ni reviertas cambios ajenos sin permiso.
- No hagas commits a menos que el usuario lo pida.
