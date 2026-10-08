# Presencia HTTP por agente

Estos endpoints incorporan el registro local de presencia al servicio común.
No conectan agentes reales, no ejecutan herramientas y no cambian tareas ni
posiciones guardadas de avatares. GitHub conserva las fases de trabajo.

## Configuración local

El administrador configura conjuntamente `OFFICE_AGENT_DIRECTORY` (ruta a un
JSON local, máximo 64 000 bytes) y `OFFICE_PRESENCE_PROJECT` (un proyecto
seleccionado en la política). Sin configuración, los endpoints están
desactivados. Configuración inválida impide arrancar o devuelve
`PRESENCE_UNAVAILABLE` (503) durante el servicio.

El JSON contiene exactamente `agents` y `credentials`. `agents` usa el contrato
de `validateAgentDirectory`: `id`, `label`, `ownerId`, `projects`, con un máximo
de 100 identidades. `credentials` contiene exactamente una entrada
`{ "agentId": "marea/worker", "keyHash": "<SHA-256 de la clave local>" }`
por agente. Este identificador es sintético; el marcador no es un hash válido.
La clave es distinta de la clave de sesión de equipo y del token de GitHub;
los hashes no pueden repetirse ni reutilizar los de los miembros de la política.
El administrador debe generar claves aleatorias largas, conservarlas fuera del
repositorio y transmitirlas solo mediante el transporte privado autorizado.

## Publicar heartbeat

`POST /api/presence/heartbeat` requiere `Authorization: Bearer <clave local>`,
`Content-Type: application/json` y `Origin` igual al origen del servicio, como
el resto de POST. El cuerpo contiene solo:

```json
{ "projectId": "demo/observatorio", "sequence": 1 }
```

La credencial determina agente y propietario; la cookie de equipo no acredita
al agente y el cuerpo no admite `agentId`, propietario ni campos adicionales.
Solo se publica al proyecto configurado y declarado para ese agente. La
secuencia debe ser un entero seguro no negativo, estrictamente creciente.
Duplicados o retrasos devuelven `PRESENCE_CONFLICT` (409) sin renovar presencia.
La respuesta contiene `agentId`, `projectId`, `status` y `seenAt`, nunca claves,
hashes ni configuración del runtime.

El servicio autentica antes de leer el cuerpo y revalida política y configuración
al completarlo. Una revocación o rotación durante esa espera descarta la
publicación (`PRESENCE_REVOKED`, 403; configuración rota, 503). Se comparte la
lectura del cuerpo limitada a 2048 bytes del servicio. Hay un máximo de cuatro
publicaciones simultáneas, una por agente, 60 intentos autenticados por agente
y 120 intentos globales por minuto (`RATE_LIMIT`, 429). Las reservas se liberan
incluso si el cuerpo o la publicación fallan.

## Consultar presencia

`GET /api/presence` requiere la sesión local de equipo. El proyecto procede de
configuración, sin parámetros de consulta, y sus lectores se autorizan en el
backend. Devuelve `projectId`, `generatedAt`, `expiresAt` (un segundo) y
`agents`: identidades autorizadas, nombre visible, propietario, estado y última
observación. No devuelve hashes ni secuencias de publicación.

El registro calcula `online` hasta cinco segundos desde la última observación,
`stale` hasta quince y después `offline`; sin observación también es `offline`.
No demuestra que haya trabajo en ejecución. La posición persistente del avatar
no interviene en el cálculo. Los consumidores deben respetar el vencimiento y
borrar la vista al fallar la consulta o revocarse la sesión. Este corte no cambia
la UI para representar presencia.

Cualquier cambio observado en política o directorio retira toda la presencia
efímera anterior; una configuración rota también la retira. Recuperar la
configuración nunca restaura heartbeats antiguos. Tras cambio o reinicio del
proceso se crea un registro vacío y comienza otra época de secuencias; esta
versión no persiste presencia ni números de secuencia entre épocas. Una
configuración restaurada autoriza explícitamente nuevos heartbeats, pero
no reanuda peticiones que ya estaban esperando en la época anterior.

## Verificación

`node --test test/presence-api.test.mjs` prueba HTTP con dos agentes sintéticos,
claves separadas, TTL/reconexión, suplantación, permisos por proyecto, cuerpos
parciales durante revocación, recuperación vacía, fichero inválido, límites
por agente/globales, liberación tras errores y ausencia de secretos en respuesta.
El puente aísla y valida la política antes de crear el registro; no depende de
la mutabilidad del objeto que entrega el cargador.

No se ha desplegado ni validado presencia bilateral real. La PR se basa en
#36; tras integrar esa dependencia debe retargetearse a `main` y repetir CI.
