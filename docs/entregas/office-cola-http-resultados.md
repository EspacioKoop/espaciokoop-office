# Cola de agencia por HTTP

Base de trabajo: `0429ddef8ec29d11482690deafa6836ca291e4fe`. Entrega local para integración, sin despliegue, sin conexión de agentes reales y sin cambios en `web/`. El SHA exacto de este corte se obtiene con `git rev-parse HEAD`.

## Contrato implementado

La sesión del propietario crea un trabajo con `POST /api/agency/jobs` (`operation_id`, `title`, `instruction`, `agent_id`). El servidor deriva el propietario de la sesión y el conector del agente incorporado; el cuerpo no puede imponer `owner` ni conector. Solo se admite un agente propio, incorporado, disponible y con conector vigente. `title` admite hasta 160 caracteres e `instruction` hasta 4096. El identificador de operación es idempotente por propietario: el mismo cuerpo devuelve la misma ID y otro cuerpo produce 409, también tras reiniciar el servidor. Un reintento no crea un segundo trabajo.

`GET /api/agency` incluye los trabajos propios con `id`, `title`, `status`, `agent_id` y `result`; no expone instrucciones, leases, rutas ni secretos. `GET /api/agency/jobs/:id` devuelve el detalle propio saneado y responde 403 si el trabajo pertenece a otro propietario. El orden de la cola es de inserción, no el orden aleatorio de los identificadores.

El conector autenticado con Bearer usa `POST /api/agency/connectors/jobs/claim` con `{operation_id}`. La respuesta es `{job: ...}` o `{job: null}`. Repetir la misma operación devuelve el mismo trabajo y lease mientras siga vigente; si ya terminó, caducó o la primera respuesta fue vacía, devuelve `null` y nunca reclama otro trabajo con esa operación. Para intentar reclamar otro hay que usar una operación nueva. Dos operaciones distintas simultáneas no reclaman el mismo trabajo, y un agente ocupado no permite encolar ni simular ejecución.

El conector envía `heartbeat` con `{lease}` y `result` con `{lease,state,summary,artifact_id}` bajo `/api/agency/connectors/jobs/:id/`. El resultado solo se acredita después de recibirlo y queda persistido. Los estados `queued`, `running`, `succeeded`, `failed` y `unknown` son fieles. Un lease caducado pasa a `unknown`, sin reejecución automática. Las credenciales revocadas o caducadas no reclaman ni terminan trabajos. Los recibos de claim guardan identificadores, no leases ni instrucciones.

El origen de las peticiones POST se comprueba con la protección CSRF existente. La base SQLite permanece en el directorio privado configurado, con permisos 0600. No se añade shell, proceso ni ejecutor al servidor.

## Pruebas

- `npm ci`: dependencias fijadas instaladas.
- `TMPDIR=~/projects/espaciokoop-office/local/t/q132 node --test test/agency-queue.test.mjs test/agency-http.test.mjs`: 8/8 con Node 26.11.1 y SQLite real.
- `npm test`: 523 pruebas, 522 correctas, 1 omitida (recorrido de Chromium sin Playwright), 0 fallos.
- `npm run check`: 81 módulos, 0 errores.
- Las pruebas HTTP arrancan el servidor real, usan dos propietarios, dos conectores sintéticos, concurrencia de creación y claim, heartbeat, resultado, reinicio del proceso, caducidad y revocación. También comprueban que un agente `busy` no admite trabajo y que un resultado `failed` se conserva.

## Límites

Esto no acredita que Hermes ni Claude Code ejecuten trabajos: solo se ha probado un conector sintético. El conector de runtime real y su autorización son el siguiente tramo. No hay despliegue, producción, red externa, credenciales reales ni datos personales. No se modifican `web/`, `package*.json` ni otras pruebas.

## Rollback

Revertir los commits de este tramo en la rama `agent/office-cola-http-resultados`. El cambio de esquema es aditivo (`agency_claims` y columna `agent`); las bases anteriores siguen abriendo. Para retirar la función basta con dejar de configurar `OFFICE_AGENCY_DIR`; no se borra trabajo de otros agentes ni se toca producción.

## Para la memoria

- La cola durable conserva un lease caducado como `unknown` sin reejecución automática y el claim repetido con la misma `operation_id` devuelve el mismo trabajo o `null`, nunca otro.
- El puente HTTP de agencia ya cubre creación, claim, heartbeat y resultado persistido con aislamiento por propietario y conector; no acredita todavía un runtime real.
