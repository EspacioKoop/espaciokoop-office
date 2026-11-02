# Puente HTTP de agencia: entrega parcial

Base: `d8a3c69e19c03b0fddb8be73b1bfabec70ff7a09`. Este corte **no cumple la fase completa** y no está listo para revisión de producto. No hay ejecutor ni agentes creados o conectados. El SHA del corte se obtiene con `git rev-parse HEAD`.

## Implementado y ejercitado por HTTP

- `POST /api/agency/connectors` con sesión y `{operation_id,runtime}` registra un conector del propietario autenticado. Devuelve `{id,token,duplicate:false}`; el token de máquina solo se devuelve al crear. Repetir la operación devuelve `{id,duplicate:true}` sin token; cambiar el runtime bajo la misma operación da 409. Runtimes admitidos: `hermes` y `claude-code`.
- `POST /api/agency/connectors/heartbeat` con `Authorization: Bearer <token>`, origen válido y `{}` comprueba el hash del token, la política y la revocación; actualiza `last_seen_at`.
- `POST /api/agency/connectors/:id/revoke` con sesión y `{}` revoca solo un conector propio; el token revocado ya no autentica.
- Las demás rutas de agencia devuelven 503 tras autenticar la sesión. Sin `OFFICE_AGENCY_DIR`, las rutas de agencia devuelven 503 tras autenticación; no se anuncia funcionalidad inexistente.

`OFFICE_AGENCY_DIR` debe ser una ruta absoluta a un directorio privado existente, sin enlace simbólico y sin permisos de grupo ni otros. La cola existente crea `agency.sqlite` con permisos 0600. La tabla añadida `agency_connectors` contiene identificador, propietario, runtime, hash SHA-256 del token, operación y huella de idempotencia, revocación y último heartbeat. La cola `work` sigue siendo propiedad de `agency-queue.mjs`. Las claves y fixtures de las pruebas son sintéticas.

## Pendiente para aceptar la fase

Faltan el snapshot `GET /api/agency`, agentes, operaciones pendientes y recibos, tareas HTTP y claim/resultado/cancelación/reconciliación por lease, secciones, asignaciones, ciclo de vida, ACL de proyecto y aprendizajes. El protocolo de conectores todavía no puede ejecutar ni reclamar trabajo. La revocación aún no tiene `operation_id`; el registro no tiene límites de capacidad ni gestión del token perdido. Deben completarse las validaciones y pruebas de concurrencia, política cambiante, ACL y del protocolo de punta a punta antes de integrar. No hay PR_READY ni autorización de merge.

## Pruebas

- `TMPDIR=… node --test test/agency-*.mjs`: 4/4 con Node 26.11.1 y con Node 22.23.2.
- `npm ci --ignore-scripts --no-audit --no-fund` con Node 22.23.2: instala las dependencias fijadas para pruebas.
- `npm test` con Node 22.23.2: 518/518. Un primer intento sin dependencias terminó 496/500, con cuatro módulos fallidos por ausencia de `fast-check`; se repitió tras instalar las dependencias.
- `npm run check` con Node 22.23.2: 80 módulos, 0 errores.
- Las pruebas HTTP usan dos sesiones, dos conectores sintéticos y reinicio real del proceso servidor. La prueba de lease caducado es de la cola, no de HTTP.

## Para la memoria

- La cola `agency-queue.mjs` conserva un lease caducado como `unknown` y no lo reasigna automáticamente; existe una regresión local que lo comprueba tras reabrir el almacén.
- El puente HTTP de agencia sigue incompleto: este corte solo registra, recibe heartbeat y revoca conectores sintéticos; no acredita agentes reales ni ejecución.
