# Agencia: inventario comunicado y movimientos persistentes

Base `1b18b3c`, rama `agent/office-agencia-agentes-operativos`. El conector de la prueba es sintético: el servidor no ejecuta ni detiene runtimes. El almacén SQLite existente conserva la cola y añade inventario, secciones, operaciones idempotentes y revisiones por propietario. El reporte no altera la pertenencia ni la sección elegida por el usuario.

## Contrato HTTP

- `POST /api/agency/connectors/agents`: bearer del conector, origen permitido, `operation_id` y hasta 20 agentes declarados. Solo admite referencia, nombre, estado y capacidades acotadas. La identidad del propietario y el runtime proceden del conector.
- `GET /api/agency`: sesión; inventario y secciones propios, revisión monotónica propia y capacidades disponibles. No devuelve credenciales. Un conector o reporte con más de 60 segundos se muestra desconectado y no permite asignación. Un conector caducado debe registrarse de nuevo.
- `POST /api/agency/sections`: crea sección propia con `operation_id` y `name`.
- `POST /api/agency/agents/:id/membership`: incorpora o retira con `operation_id`, `in_office` y `expected_version`; retirar libera la sección.
- `POST /api/agency/agents/:id/assign`: cambia sección propia con `operation_id`, `job_id: null`, `section_id` y `expected_version`. Un trabajo no nulo responde `NOT_IMPLEMENTED` (501).

Los reintentos idénticos devuelven el recibo persistido; reutilizar la operación con otro cuerpo produce 409. Las mutaciones comprueban nuevamente sesión o conector y política tras recibir el cuerpo. La revocación es repetible y bloquea reportes posteriores. Las referencias están limitadas al conector y los agentes revocados no se reactivan mediante reportes.

## Recibos sintéticos

La prueba HTTP crea dos sesiones y dos conectores ficticios. Comprueba registro, reporte duplicado y conflicto, aislamiento, creación de sección, incorporación, rechazo de versión obsoleta y trabajo no implementado, asignación, heartbeat y reporte sin pérdida de posición, reinicio real, retirada, doble revocación y rechazo de reporte revocado o caducado. No se guardan tokens ni datos reales. La creación de una ficha por sí sola no añade agentes.

Validación en BIKANEL con Node 22.23.2 y directorios temporales privados:

```sh
npm ci
node --test --test-concurrency=1 test/agency-*.mjs
taskset -c 0 npm test
taskset -c 0 npm run check
```

Resultado: 5 pruebas focales superadas; `npm test` 519/519; `npm run check` 80 módulos, sin errores.

No se han implementado perfiles, trabajos, aprendizaje, ejecutores ni control de ciclo de vida; las listas correspondientes están vacías. La UI candidata se integra aparte. El alcance bilateral y los agentes reales no se han validado.

## Para la memoria

- El inventario de agencia se crea exclusivamente con reportes autenticados de conectores; el servidor no demuestra ejecución de agentes.
- La asignación y pertenencia sobreviven al reinicio y no se sustituyen al refrescar el reporte. La disponibilidad caduca a los 60 segundos sin reporte o heartbeat vigente.
