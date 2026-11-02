# Entrega parcial: interfaz de agencia

Base: `c5c25ae9d7379e0662bdf3efc87859ce4cbff047`. Este cambio es local y no acredita integración ni despliegue. La agencia se consulta después del acceso existente. El panel muestra agentes, tareas y aprendizajes devueltos por `GET /api/agency`, y permite solicitar operaciones de agentes según el propietario y las capacidades recibidas. Una respuesta 202 se presenta como solicitud, no como creación confirmada. Los errores 401 retiran la vista; un 409 solicita lectura nueva sin repetir la escritura. Las respuestas anteriores al cierre de sesión se descartan.

## Pendiente para el integrador

- El servidor de la base no implementa `GET /api/agency` ni los endpoints del contrato de agencia. El panel muestra un aviso ante 404/503. No se ha probado contra el backend en desarrollo.
- No se han implementado avatares reales, arrastre, nueva escena, creación de tareas ni propuesta de aprendizajes. Tampoco se han completado los controles de ayuda y opinión ni los recorridos en navegador exigidos. La escena 3D heredada sigue siendo ambiental.
- No hay capturas nuevas ni pruebas de navegador con dos propietarios, móvil, WebGL, conflictos y sesión caducada. No declarar la interfaz terminada.
- La suite existente espera que la interfaz no solicite `/api/agency` y falla en `test/team-queue-ui.test.mjs:60`; debe adaptarse en integración. No se ha editado por quedar fuera del alcance autorizado.

## Comprobaciones

- `TMPDIR=…/office-sims-ui-operativa NODE_OPTIONS=--max-old-space-size=768 npm run check`: 76 módulos, sin errores.
- `TMPDIR=…/office-sims-ui-operativa NODE_OPTIONS=--max-old-space-size=768 npm test`: 491 pruebas correctas y cinco fallos: uno por la expectativa de rutas anterior y cuatro archivos que no cargaron; `fast-check` no está instalado. La suite se ejecutó antes del último ajuste de concurrencia del cliente.
- `git diff --check`: correcto.

## Para la memoria

- La base `c5c25ae9` sirve archivos web mediante una lista explícita en `src/server.mjs`; el cliente de agencia parcial se integró en `web/app.mjs` ya servido.
- En esta base no existe `/api/agency`; la integración y los recorridos de navegador siguen pendientes.
