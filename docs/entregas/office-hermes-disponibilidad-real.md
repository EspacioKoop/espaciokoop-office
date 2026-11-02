# Disponibilidad local de Hermes

La disponibilidad se comprueba antes de anunciar `available` y de reclamar
cada trabajo. El mismo intérprete, directorio de trabajo, entorno mínimo y
HOME de proyecto ejecutan `--check-runtime` en un grupo POSIX propio, con
señales y timeout acotado. El diagnóstico devuelve únicamente `ready` y un
`reason_code` fijo; si falla, Office anuncia `offline` y no reclama. Se
importan la API y el resolvedor nativos, se comprueban las firmas, se resuelve
`openai-codex` para el modelo solicitado y se construye `AIAgent` con los
argumentos reales, sin herramientas, memoria, contexto ni fallback. El probe
no realiza inferencia y bloquea conexiones de socket. No imprime credenciales,
excepciones ni salida interna. Tras un trabajo Hermes se anuncia `offline`
hasta la siguiente comprobación.

El probe comprueba requisitos locales, no certifica que el proveedor remoto
acepte una credencial, que exista cuota o que el modelo esté habilitado para
esa cuenta: sin una petición al proveedor no se pueden acreditar esos hechos.
También se verifica proveedor y modelo en el resultado real; cualquier fallo
se registra como fallo, no como éxito. El aislamiento y las restricciones de
configuración, hooks, plugins y MCP descritos en el corte anterior se mantienen.

En la instalación Hermes 0.22.2 consultada, un HOME y HERMES_HOME nuevos
con el intérprete del entorno instalado devolvieron `auth_unavailable`; no se
consultaron ni copiaron credenciales o perfiles ajenos. La API instalada y el
constructor real también se probaron sin red usando un resolvedor sintético:
`ready`, sin inferencia. El circuito HTTP → SQLite → proceso → resultado usa
un ejecutable **fixture**, no acredita una tarea real. Sin credencial propia
preparada en el perfil de proyecto no se hizo inferencia ni cancelación real.

La [documentación oficial de proveedores](https://hermes-agent.nousresearch.com/docs/integrations/providers/)
describe OAuth de OpenAI Codex mediante código de dispositivo; la
[guía de credenciales](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools/)
documenta `hermes auth add openai-codex`. Una preparación futura requiere que
el titular autorice y complete el acceso nativo para el HOME aislado de Office,
sin copiar archivos de otro perfil; este encargo no autoriza iniciar sesión.
El perfil resultante debe seguir respetando las prohibiciones de configuración,
hooks, plugins y MCP del conector para poder arrancar.
El resolvedor instalado puede buscar sesiones externas, pero el HOME aislado
no contiene las de otros perfiles. La autenticación preparada no demuestra
inferencias ni autoriza desplegar el conector.
