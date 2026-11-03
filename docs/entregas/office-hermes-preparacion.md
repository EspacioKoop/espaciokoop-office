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
plazo y limpia el grupo POSIX del proceso; no reintenta. Un descendiente que
crea otra sesión con `setsid` puede escapar de ese grupo: no se garantiza la
limpieza de todos los descendientes posibles. Tras éxito revalida el perfil y
el probe decide la disponibilidad. No reclama trabajos ni crea servicios.

## Perfil efímero del probe

Hermes crea `hooks` al cargar su configuración. El puente comprueba los HOME
privados, abre `HERMES_HOME` sin seguir enlaces y exige que `hooks` no exista,
incluso como enlace colgante. Crea un directorio vacío propio con modo 0700 y
conserva su descriptor e identidad. Al terminar, incluso ante excepciones
ordinarias, comprueba que las rutas mantienen su identidad y que ese directorio
sigue siendo el mismo, privado y vacío. Solo entonces lo retira con `rmdir`
relativo al descriptor y revalida las hojas prohibidas. No borra contenido ni
retira directorios sustituidos. La salida de éxito se emite después de limpiar.

`config.yaml`, `.env`, `hooks`, `plugins` y `mcp.json` siguen prohibidos,
incluidos enlaces colgantes. Un residuo por interrupción, incluido SIGKILL,
se rechaza en la siguiente validación y requiere inspección del titular; no
hay recuperación automática. Las comprobaciones no garantizan protección ante
un escritor malicioso del mismo UID entre llamadas al sistema.

Con Hermes instalado y un HOME sintético nuevo, dos probes consecutivos sin
credenciales y con red bloqueada devolvieron `auth_unavailable`; el perfil
siguió aceptado y sin `hooks`. Esto no demuestra compatibilidad de un perfil
autenticado ni autoriza configuración adicional. La autenticación nativa no
usa este contexto. La [documentación del proveedor](https://hermes-agent.nousresearch.com/docs/integrations/providers/)
describe el flujo de dispositivo y el almacén propio.

La interacción se ha ejercitado con fixtures y PTY, sin login real. El éxito de
un fixture no acredita autenticación efectiva, disponibilidad de proveedor,
inferencia, conexión de agentes ni despliegue. Para revertir el candidato, se
pueden revertir sus commits; no hay servicios desplegados que revertir.
