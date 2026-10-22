# Modo Pruebas V2

El panel React incorpora el configurador matemático, el recorrido maestro–alumno, intentos individuales con recuperación y reconexión, supervisión, cierre y publicación de resultados/recompensas. La pantalla clásica sigue disponible en `/maestro-clasico`.

Las divisiones con residuo requieren respuesta escrita: el formato de opción múltiple y voz no representa el cociente y el residuo como una sola respuesta.

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

La captura visual de la configuración del maestro cubre 360×800, 390×844, 768×1024, 1366×768 y 1920×1080; la pantalla del alumno con barra de respuestas se capturó en esos mismos tamaños. Se revisaron configuración sencilla y avanzada, varias operaciones, error de división con residuo en opciones, resumen y respuesta escrita de residuo. Las capturas usan un alumno ficticio. El reporte automatizado registró cero errores de navegador, cero desbordamiento horizontal general y cero controles fuera de pantalla; algunas barras internas son desplazables.

La inspección visual no cubre todavía, en todos los tamaños, ambos temporizadores activos, el estado de división con residuo escrito, modales con textos extremos ni una pasada manual completa de navegación por teclado/foco en cada pantalla. La captura del alumno muestra el campo de residuo, y el reporte automatizado detectó foco visible; eso no sustituye esas revisiones pendientes. Las evidencias representativas están en `docs/evidence/`.
