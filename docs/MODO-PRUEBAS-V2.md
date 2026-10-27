# Modo Pruebas V2

El panel React incorpora el configurador matemático, el recorrido maestro–alumno, intentos individuales con recuperación y reconexión, supervisión, cierre y publicación de resultados/recompensas. Incluye un editor visual de recompensas fijas o por intervalos de porcentaje, selección de destinatarios con búsqueda y aprobación con resumen previo. Al editar una prueba que también asigna grupos, la interfaz conserva esas asignaciónes aunque solo permita cambiar alumnos individuales. La pantalla clásica sigue disponible en `/maestro-clasico`.

Las divisiónes con residuo requieren respuesta escrita: el formato de opción múltiple y voz no representa el cociente y el residuo como una sola respuesta. Los porcentajes de recompensas usan aciertos / reactivos totales, incluidos los no contestados. Los intervalos nuevos usan límites contiguos sin solapamiento; las configuraciónes históricas conservan su interpretación anterior.

Para compilar y comprobar:

```powershell
npm run build:maestro
npm --prefix src/client/maestro/react-app run lint
npm run check:math-test-configurations
npm run check:exam-write-mode-ui
npm run check:pruebas-react-student-e2e
npm run check:test-last-attempt-closure
npm run check:exam-websocket-heartbeat
npm run check:test-end-to-end
npm run check:responsive
```

La revisión visual de PRUEBAS.4 cubrió configuración con varias operaciónes, ampliación de multiplicación, hueco de intervalos, destinatarios, pantalla de juego con barra de respuesta y diálogo de aprobación en 360×800, 390×844, 768×1024, 1366×768 y 1920×1080. El alumno y la prueba de las capturas usan datos ficticios. Playwright comprobó ancho general y límites de los controles de respuesta en la configuración y el juego, y que el diálogo queda en el viewport en los cinco tamaños. La revisión adicional del nombre corto, largo y de una palabra extensa confirmó que el encabezado usa hasta dos líneas y ofrece un diálogo accesible con el nombre completo. Inspeccioné capturas de móvil, tableta, escritorio, hueco de validación y los diálogos; en móvil el diálogo cabe y conserva sus acciones. La prueba también ejercita los dos temporizadores, una división con residuo escrita, reconexión, pausa, aprobación y el acceso clásico al juego. Las barras internas que presentan listas conservan desplazamiento propio.

Las pruebas de teclado confirman consulta del nombre con Enter, cierre con Escape y retorno del foco; el diálogo de aprobación también inicia en el campo de motivo, conserva el foco con Shift+Tab y devuelve el foco al botón de origen. No se hizo una inspección manual completa de todas las rutas y estados del alumno en los cinco tamaños, ni una prueba de lectura con tecnologías asistivas. Las capturas ficticias de PRUEBAS.4 se mantienen en la copia aislada `MATH-ATTACK-PRUEBAS4/evidence/pruebas4/` y no forman parte de los recursos de ejecución.

## PRUEBAS.5: verificación y recuperación tras reinicio

Al arrancar, el servidor reconstruye el catálogo y los anunciós de pruebas activas desde las pruebas y asignaciónes persistidas, incluidas las asignaciónes grupales. El botón **Verificar** del historial activo contrasta intentos, participaciones cerradas y cupos, repara disponibilidad recuperable y muestra el estado por alumno. Requiere autorización administrativa; registrar la verificación usa el historial de eventos existente y no crea ni modifica intentos o recompensas. Las pruebas e intentos pausados se mantienen pausados.

En un cierre ordenado, el servidor congela los relojes al detenerse. Tras una interrupción abrupta, el reinicio conserva el último punto de progreso durable y reancla los temporizadores al arranque: el tiempo apagado no se descuenta, aunque el avance ocurrido después del último guardado puede no estar disponible.

Checks dirigidos: `npm run check:test-restart-recovery`, `npm run check:test-verify-live-e2e`, `npm run check:exam-websocket-heartbeat`, `npm run check:student-test-recovery`, `npm run check:responsive` y `npm --prefix src/client/maestro/react-app run lint`. El E2E usa persistencia y cuentas ficticias temporales; abre el panel React y cuatro navegadores alumno reales, reinicia el servidor, y observa el `exam_start` recibido por los WebSockets normales tras pulsar **Verificar**. Comprueba que no se repitan eventos o intentos, que alumnos terminados/no asignados no reciban invitación, la pausa docente, entrada al intento existente con pregunta/respuesta/estado de color/relojes preservados y la recuperación automática de un alumno que entra después sin pulsar **Verificar**. La primera sesión ahora se reporta después de restaurar el checkpoint para evitar guardar temporalmente un reloj en cero.

La revisión visual de este cierre cubrió aviso y botón del alumno, pantalla de intento recuperado, diálogo de nombre largo y resumen de Verificar en 360×800, 390×844, 768×1024, 1366×768 y 1920×1080, con datos ficticios. La auditoría automática comprobó que no hubiera desbordamiento horizontal general, foco por Tab y límites del diálogo; también inspeccioné manualmente capturas representativas. En móviles/tableta el banner persistente sustituye al toast flotante, que antes cubría la marca. El nombre de alumno largo se trunca en el encabezado y puede consultarse completo en un diálogo accesible. La invitación del alumno muestra cantidad/operaciónes, no el título de la prueba; el título largo sí se comprobó en la tarjeta del maestro. Las capturas están en `evidence/pruebas5-live/` y fuera de los recursos de ejecución. Las pruebas comparan hashes de persistencia antes/después; los JSON del proyecto no cambiaron.

## PRUEBAS.6: configurador, orden y destinatarios

El configurador React conserva multiplicación rápida y exacta, matriz con tabla/factor cero, ampliaciones, deduplicación y límite de 100 preguntas. La preferencia **En orden / En desorden** se conserva al guardar y reabrir; la presentación global por bloques prevalece sobre la mezcla por operación. El grado de la prueba y el grado registrado del alumno limitan asignación, aviso y acceso; los incompatibles se conservan y bloquean guardar/iniciar hasta resolver la discrepancia. Destinatarios ofrece filtros visuales por grado y búsqueda sin retirar asignaciónes. Se aplicaron los estilos clásicos de operaciónes y destinatarios; el panel clásico sigue disponible en `/maestro-clasico`.

Checks dirigidos disponibles: `npm run check:test-multiplication-modes`, `npm run check:test-multiplication-react-ui`, `npm run check:test-multiplication-manner-e2e`, `npm run check:test-recipients-grid-ui` y `npm run check:test-grade-eligibility-e2e`. En la validación reciente pasaron build, lint y los checks de multiplicación/Manera y cuadrícula de destinatarios; el E2E usa servidor y persistencia temporal, y los hashes de los JSON del proyecto se mantuvieron. La matriz, el selector de multiplicación y destinatarios tienen capturas automáticas en cinco tamaños de referencia. La inspección manual se limitó a capturas representativas; no equivale a revisar manualmente todos los estados en los cinco tamaños. La comparación automática del selector clásico de destinatarios no estuvo disponible en la última corrida porque su fixture no mostró el panel clásico; el recorrido React sí pasó.

La causa del cambio de hash reportado anteriormente para `devices.json` sigue siendo desconocida: no se encontró un hash inicial comparable ni una copia previa autorizada, y no se atribuye el cambio a una persona o a una prueba. Las verificaciónes recientes de Modo Pruebas usan persistencia temporal. No hay en las notas revisadas un fixture heredado fallido confirmado; la batería histórica completa no se ejecutó en esta publicación, así que los checks no ejecutados permanecen sin evaluar. La modificación local de `pruebas.json` y las carpetas de evidencias no forman parte de la publicación.

## Regresión integral reproducible

Ejecutar `npm run check:pruebas-regression` para correr 46 checks secuenciales en una copia temporal con datos ficticios. La última corrida integrada terminó con 46 aprobados, 0 fallidos y 0 omitidos; los artefactos de captura ficticios se conservaron localmente y se excluyen del paquete publicado. Los SHA-256 de `pruebas.json`, `players.json`, `ranking.json`, `groups.json`, `config.json`, `devices.json` y `aureosLog.json` reales permanecieron iguales. La batería previa fue 43/43; se incorporaron exactamente tres checks nuevos de PRUEBAS.7 (servicio, interfaz React y recorrido Maestro-alumno real), sin sustituir ni retirar otros checks.

## PRUEBAS.7: programación, archivo y borradores

La biblioteca React permite programar apertura y cierre en America/Mexico_City, abrir o cerrar manualmente, retirar una programación, archivar/restaurar pruebas finalizadas y eliminar borradores solo cuando no tienen intentos ni registros derivados. La evaluación también corre al consultar el servidor y desde el planificador periódico. Cerrar detiene nuevos inicios e intentos pendientes; los intentos iniciados pueden continuar y recuperarse tras reinicio. Los overrides manuales se conservan frente al planificador y la pausa docente sigue siendo independiente.

Checks específicos: **node scripts/check-pruebas7-regression.js**, **node scripts/check-pruebas7-react-ui.js** y **node scripts/check-pruebas7-live-e2e.js**; ejecución conjunta: **npm run check:pruebas-regression**. El servicio probó límites horarios exactos con reloj controlado, overrides, retiro de programación, archivo/restauración y protección de borrado. React cubrió validaciones, teclado/foco, conversión de hora local a ISO, historial y los cinco tamaños acordados. El E2E real conectó Maestro React, alumno y WebSocket; abrió una prueba programada, recibió el aviso, bloqueó un intento pendiente al cierre y permitió continuar el mismo intento y responder la pregunta siguiente tras reiniciar el servidor.

El E2E detectó que el avance se reportaba tarde; un cierre o reinicio inmediato podía perder el índice/respuesta más reciente. **math-attack.html** ahora guarda el checkpoint y reporta progreso al cargar cada pregunta. La verificación confirmó que la primera respuesta queda guardada, la pregunta siguiente se conserva al reanudar y el intento termina correctamente. Las capturas ficticias de React y del recorrido WebSocket se inspeccionaron localmente; `evidence/` se excluye del paquete publicado. El modal se revisó en los cinco viewports; el E2E real tras reinicio se hizo en móvil estrecho y escritorio. Las capturas/checks visuales abarcan los cinco tamaños, pero no se ejecutó el alumno real con servidor en cada uno.

Build **npm run build:maestro**, lint **npm --prefix src/client/maestro/react-app run lint** y la batería integrada de 46 checks pasaron. No se hizo commit ni push.

## Cierre de los siete fallos de regresión

| Check | Resultado observado inicialmente | Causa y clasificación | Corrección | Resultado final |
|---|---|---|---|---|
| Configurador React de multiplicación | Selector ausente o timeout al cambiar de estado | La corrida que falló servía un bundle de `/maestro` desfasado respecto de la fuente React; tras `build:maestro`, la regresión completa pasó | Reconstruir el bundle y sincronizar el test con `data-operation` + `aria-pressed`; mantener diagnóstico de navegador/API/estado | Aprobado tras recompilar |
| Recorrido React maestro-alumno | Playwright encontró dos botones llamados Historial | Selector accesible por coincidencia parcial, test desactualizado | Nombre exacto Historial | Aprobado |
| Intentos, asignaciónes y reinicio | Aserción de no disponible recibió alumno no asignado | Fixture sin alumno elegible; ocultaba la validación de estado | Asignar alumno ficticio elegible a borrador, programada y cancelada; se mantiene el caso no asignado | Aprobado |
| Elegibilidad por grado | Segundo selector ambiguo de Historial | Selector accesible por coincidencia parcial, test desactualizado | Nombre exacto Historial | Aprobado |
| Servicio de asignaciónes de grupo | Programar prueba fallo por no tener destinatarios elegibles | Fixture programaba antes de asignar grupo | Expandir y asignar grupo antes de programar; los rechazos sin elegibles siguen cubiertos | Aprobado |
| Destinatarios en vivo | HTTP respondió write y el WebSocket anunció options | Defecto funcional: body prevalecía sobre answerMode del snapshot guardado | El snapshot ahora manda en pruebas con testId. El test enfrenta valores contradictorios y cubre división con residuo y combinación incompatible | Aprobado |
| Flujo integral de prueba y liquidación | Programar fallo por no tener alumnos elegibles | Fixture asignaba alumnos después de programar | Asignar alumno y grupo ficticios antes de programar | Aprobado |

La regresión adicional del progreso live cubre acierto, error, timeout, última respuesta, reinicio, repetición de eventos y escrituras atrasadas durante pausa/finalización. La verificación específica y el recorrido real con navegador pasaron sin duplicar respuestas ni resultados. La batería final secuencial pasó 46/46 en código integrado, tras recompilar el bundle desfasado; verificó hashes de persistencia reales sin cambios. La reproducción previa se clasificó temporalmente como sincronización frágil, pero el bundle obsoleto explica el fallo del check integrado. No quedan fallos de esa corrida.
