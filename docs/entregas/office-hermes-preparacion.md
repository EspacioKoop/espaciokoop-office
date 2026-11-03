# Preparación local de Hermes: entrega parcial

La herramienta `node tools/hermes-office-setup.mjs --config /ruta/privada.json --check`
valida la configuración del runtime y ejecuta el mismo probe de Hermes, con el
mismo intérprete aprobado, directorio de trabajo, HOME aislado y entorno mínimo.
No envía reportes ni reclama trabajos. Devuelve JSON con `ready` y un código de
razón acotado: salida 0 si está listo, 2 si no lo está y 1 si la configuración
no es válida. No incluye errores internos, rutas ni credenciales. El probe no
hace inferencia y bloquea conexiones de socket desde Python.

`--authenticate` está **bloqueado**: sin terminal devuelve
`interactive_terminal_required`; con terminal, `authentication_not_implemented`.
No inicia Hermes ni establece credenciales. Falta implementar y probar el control
del terminal para la interacción nativa y la limpieza del grupo ante cancelación,
y acreditar el perfil resultante frente a las restricciones del runtime.
No se debe interpretar este corte como un onboarding completo.

Se ha comprobado `python -m hermes_cli.main auth add --help` de la instalación
común con HOME temporal: acepta `auth add openai-codex`. En el código instalado,
ese proveedor usa el flujo de dispositivo y guarda los tokens en Hermes. La
ayuda también crea directorios y logs locales; la compatibilidad completa del
perfil tras un login sigue sin probarse. La [documentación oficial](https://hermes-agent.nousresearch.com/docs/integrations/providers/)
describe ese flujo. No se han consultado perfiles privados ni ejecutado login.

## Comprobaciones

- Node 22: siete pruebas de la herramienta con ejecutables sintéticos y sin red.
- Node 22: regresión del runtime, incluidos grupos de procesos: 13 pruebas.
- Probe real con HOME nuevo y sin credenciales: `auth_unavailable`, salida 2.
- `npm run check`: 88 módulos, sin errores tras conservar el ejecutor en `tools`.

La disponibilidad local no certifica aceptación remota, cuota ni inferencia.
No se ha conectado ningún agente, habilitado servicio ni realizado despliegue.
- Suite completa, una ejecución con `--test-concurrency=1`: 521 pruebas
  aprobadas, cuatro fallos al cargar `fast-check` ausente y tres pruebas de
  navegador omitidas. Chromium está instalado, pero no se configuró Playwright;
  no se instaló ninguna dependencia. La suite no está verde.

Para revertir este candidato, el coordinador puede revertir su commit en una
rama de integración; no hay despliegues ni cambios de credenciales que revertir.
