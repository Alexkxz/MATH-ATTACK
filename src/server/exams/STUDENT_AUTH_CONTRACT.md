# Contrato de autenticacion de alumnos para Pruebas

Estado: `HTTP_SESSION_REQUIRED`. Este documento no cambia produccion.

## Hallazgos de la auditoria

`POST /api/players/login` valida nombre y PIN, pero responde un perfil y no crea cookie, token, sesion ni revocacion. El WebSocket crea una sesion efimera (`sessionId` en `ws.playerId` o `ws._uid`) al recibir `player_identify` o `session_update`; ambos mensajes aceptan nombre y grado del cliente. La reentrada de `sessionStore.restoreSession` busca una sesion desconectada por nombre normalizado. Por tanto `sessionId`, `connectionId`, `playerId` legado, nombre y grado no prueban una cuenta. `accountPlayerId` solo puede ser una reclamacion del payload actual.

El WebSocket existente no esta autorizado para crear, continuar ni recuperar intentos. Tampoco se aceptara `accountPlayerId` enviado libremente por HTTP o WebSocket como autoridad.

## Mecanismo requerido antes de 4B.3.7

Tras validar PIN, un endpoint futuro debe emitir un token aleatorio opaco de una sola sesion, de 15 minutos, almacenado solo en memoria inicialmente. El registro de sesion contiene: `kind: student-authenticated`, hash del token, `accountPlayerId` canonico obtenido del servidor, `issuedAt`, `expiresAt`, `revokedAt`, y los `connectionIds` vinculados. El token se transporta en cookie `HttpOnly; Secure; SameSite=Strict` o encabezado `Authorization: Bearer`; nunca en cuerpo, URL o registro.

Las rutas de intentos derivaran el alumno exclusivamente de esa sesion. `testId`, `assignmentId` y `attemptId` se validaran como UUID, y la asignacion se buscara del lado servidor. No aceptaran score, estado oficial, recompensa, nombre, grado ni identidad del cuerpo.

## Reconexion, concurrencia y revocacion

La reconexion debe presentar el mismo token valido y se vincula a un nuevo `connectionId`; solo recupera intentos cuyo `accountPlayerId` coincide. Una segunda conexion puede coexistir pero cualquier mutacion usa revision y `eventId`; opcionalmente se invalida la conexion anterior. Un logout, cambio de PIN, expiracion, desconexion administrativa o intento de suplantacion revocan el token. El reinicio del servidor invalida las sesiones en memoria y exige volver a autenticar.

## Respuestas y privacidad

Errores: `401 STUDENT_AUTH_REQUIRED`, `401 STUDENT_SESSION_EXPIRED`, `401 STUDENT_SESSION_REVOKED`, `403 STUDENT_IDENTITY_MISMATCH`, `403 STUDENT_NOT_ASSIGNED`, `404 ATTEMPT_NOT_FOUND` sin revelar datos de otro alumno, `409 REVISION_CONFLICT`, `422 INVALID_REQUEST`. El alumno solo recibe su prueba asignada, su intento y su checkpoint. El maestro autenticado puede supervisar datos minimizados y realizar acciones administrativas; PIN, tokens, historial de otros alumnos, recompensas y resultados no publicados permanecen reservados.
