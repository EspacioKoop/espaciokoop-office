# Preparación local de Hermes

`node tools/hermes-office-setup.mjs --config /ruta/privada.json --check` valida
el perfil de proyecto y ejecuta el probe offline con el intérprete aprobado. El
resultado es JSON saneado; no incluye salida nativa, rutas ni credenciales.

`--authenticate` exige stdin, stdout y stderr conectados a un terminal. Advierte
del proveedor `openai-codex`, el perfil aislado y el consentimiento del titular;
hereda directamente el terminal al proceso nativo, sin transcribir su salida.
Invoca literalmente `python -m hermes_cli.main auth add openai-codex`, sin shell,
con HOME y HERMES_HOME del perfil, LANG=C.UTF-8 y PATH=/usr/bin:/bin. Utiliza el
workspace aprobado y un grupo POSIX propio. Propaga la cancelación, limita el
plazo y termina los descendientes; no reintenta. Tras éxito revalida el perfil y
el probe decide la disponibilidad. No reclama trabajos ni crea servicios.

## Corte de compatibilidad observado

La ayuda instalada confirma `auth add openai-codex`. En el código instalado,
`hermes_cli/auth_commands.py`, función `auth_add_command`, usa para ese proveedor
el flujo de dispositivo y guarda los tokens mediante `_save_codex_tokens`; no
llama al flujo distinto `_login_openai_codex`, que actualiza `config.yaml`.
Con HOME nuevo, la ayuda solo creó `logs`. El probe offline, con el mismo HOME
nuevo y sin credenciales, devolvió `auth_unavailable` y creó `hooks`.
`hermes_cli/config.py`, funciones `_load_config_impl` y `ensure_hermes_home`,
crea ese directorio al cargar la configuración. La protección existente prohíbe
`hooks` incluso vacío, además de `config.yaml`, `.env`, `plugins` y `mcp.json`,
incluidos enlaces colgantes. La herramienta conserva ese corte y revalida el
perfil después del probe: el perfil resultante no queda aceptado. No se ha
verificado un perfil autenticado real ni se ha modificado Hermes para sortearlo.
La [documentación del proveedor](https://hermes-agent.nousresearch.com/docs/integrations/providers/)
describe el flujo de dispositivo y el almacén propio.

La interacción se ha ejercitado con fixtures y PTY, sin login real. El éxito de
un fixture no acredita autenticación efectiva, disponibilidad de proveedor,
inferencia, conexión de agentes ni despliegue. Para revertir el candidato, se
pueden revertir sus commits; no hay servicios desplegados que revertir.
