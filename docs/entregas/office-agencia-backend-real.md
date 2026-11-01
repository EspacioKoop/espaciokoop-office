# Agencia: entrega parcial de cola durable

La base de esta rama incorpora `c5c25ae9d7379e0662bdf3efc87859ce4cbff047` mediante avance rápido. Esta entrega **no completa Office** ni conecta la cola al servidor. No existe todavía API de agencia, conector, pairing, ejecución, cancelación, reconciliación manual ni aprendizaje. No se han conectado agentes ni ejecutado modelos. No hay paquete funcional del servidor y conector para instalar.

Se añade `src/agency-queue.mjs`, primitiva interna SQLite con operaciones y recibos durables por propietario, lease acotado, heartbeat, resultados comunicados por el llamador y caducidad conservadora a `unknown`. No verifica por sí misma un artefacto ni autentica al llamador: necesita un puente que derive las identidades de sesiones y credenciales de conector y valide el proyecto antes de exponerla. Solo está probada con datos sintéticos. El directorio debe existir con permisos privados; contiene instrucciones y debe tratarse como dato privado. No se debe utilizar en producción sin completar autenticación, políticas, recuperación, límites de capacidad y revisión de seguridad. SQLite `node:sqlite` requiere Node 22.16 o posterior; se ha probado únicamente con Node 26.11.1.

Prueba específica: `TMPDIR=<directorio-privado> node --test test/agency-queue.test.mjs`. La prueba cubre persistencia tras reinicio, reintento idempotente, conflicto de clave, aislamiento por propietario, concesión caducada y ausencia de redistribución automática. No es una prueba HTTP ni acredita ejecución externa o recuperación de resultados efectivos.

## Cobertura documental

Se inventariaron los archivos con `git ls-files` tras incorporar la base: 151 rutas, sin afirmar lectura completa. Leídos: AGENTS.md, ESTADO.md, docs/normas-platino.md, README.md, VISION.md, docs/product-spec.md, docs/architecture.md, docs/agent-management.md, docs/remote-collaboration.md y docs/declaracion-eloy.md; también plan #17, issue #24 y comentarios de #18. Código examinado: src/server.mjs, src/agent-management.mjs, fragmentos de src/domain.mjs y test/agent-management.test.mjs; listados de rutas y pruebas pertinentes. El resto de documentos y código del inventario no se han leído de forma completa. El resultado de memoria compartida confirma el objetivo asíncrono por propietario; no aporta implementación validada.

## Para la memoria

- El gestor `src/agent-management.mjs` conserva sus recibos en memoria y no proporciona por sí solo ejecución ni idempotencia tras reinicio.
- La declaración de Eloy limita el contenido compartido a metadatos autorizados y describe una integración por repositorio y cola; no concede acceso a sus perfiles ni a conversaciones.

Validación local en Node 26.11.1: pruebas específicas 2/2; `npm run check` 78 módulos sin errores; `npm test` 516/516 después de `npm ci --ignore-scripts --no-audit --no-fund`. La primera suite falló en cuatro archivos por ausencia de `fast-check` en el worktree; se instaló la dependencia fijada y se repitió. `git diff --check` sin errores. No se han probado Node 22/24, HTTP de agencia ni un proceso de conector.
