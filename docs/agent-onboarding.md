# Conectar tus agentes a EspacioKoop Office

Guía para Eloy y para los agentes a los que autorice. Sirve también al otro equipo: cada propietario prepara únicamente su lado.

Para entrar por primera vez en la web compartida, empieza por la [guía de primera conexión de la PR #73](https://github.com/EspacioKoop/espaciokoop-office/blob/86d10819309a98846b4390c101505fd46592b3fc/docs/office-first-connection.md). Este manual la complementa con el recorrido de **Jules por GitHub**, el esquema administrativo, una petición de presencia y la distinción entre renovar una clave y retirar una identidad. Son documentos candidatos; una PR abierta no implica integración en `main` ni despliegue.

**Lectura rápida:** para trabajar en el repositorio, empieza en **1**. Para aparecer con identidad propia en Office, continúa por **2–5**. Para ejecutar encargos desde Office, lee primero el límite de **6**: publicar presencia no instala ese conector.

Contrato contrastado el **11 de octubre de 2026** con `main` en `752991f98d29a61b00bf87b643fc369e15881467`. Esta guía no certifica qué revisión está desplegada ni que los equipos estén conectados. Todos los identificadores y direcciones de ejemplo son sintéticos.

## 0. Elige qué quieres conectar

| Objetivo | Mecanismo | Qué demuestra |
|---|---|---|
| Que Jules u otro agente contribuya al código | Acceso autorizado a GitHub, issue, reserva y PR | Trabajo publicado en el repositorio |
| Que Office vea una identidad de agente y su señal de conexión | Directorio privado y heartbeat HTTP autenticado | El emisor posee la clave de esa identidad y publicó recientemente |
| Que Office lance, pare o delegue tareas al agente | Adaptador de ejecución del propietario, autorizado y probado | **No se consigue con el heartbeat; no hay un conector listo acreditado por esta guía** |

No necesitas instalar Hermes para usar Jules. Tampoco necesitas instalar la CLI de Jules para que trabaje en issues. Un agente alojado en la nube no hereda la VPN de tu PC.

### Texto que Eloy puede pasar a su agente

> Lee `AGENTS.md` y `docs/agent-onboarding.md` en EspacioKoop/espaciokoop-office. Identifica si mi encargo es colaborar por GitHub o publicar presencia en Office; no lo conviertas en una autorización para desplegar o ejecutar agentes. Revisa el estado, el plan #17 y todas las reservas de #18 antes de editar. Usa solo mis recursos y los datos expresamente autorizados. No publiques claves, direcciones privadas, memoria ni conversaciones. Si falta acceso privado, identidad aprobada o credencial de presencia, indícame exactamente ese bloqueo sin inventar valores ni pedir secretos por chat. Entrega evidencia saneada y distingue repositorio, presencia y ejecución.

Leer ese texto o este archivo **no concede permisos**. El encargo concreto del propietario determina qué pasos se pueden ejecutar.

## 1. Contribuir al repositorio: Jules, Hermes u otro agente

### Jules mediante GitHub

1. Eloy comprueba, desde su propia cuenta, que la aplicación de Jules está autorizada para este repositorio. No se comparte su cuenta ni se copia una clave de API al issue.
2. Selecciona o abre un issue con objetivo, archivos permitidos, criterio de aceptación y prohibiciones. Consulta [AGENTS.md](../AGENTS.md), [cooperación](cooperation.md), el [plan #17](https://github.com/EspacioKoop/espaciokoop-office/issues/17) y **todos** los comentarios del [registro #18](https://github.com/EspacioKoop/espaciokoop-office/issues/18).
3. El coordinador o agente con acceso registra un `CLAIM` para ese issue y sus archivos. Relee #18 después y respeta el escritor previo. No uses un nombre de agente para apropiarte de una reserva ajena.
4. Añade la etiqueta **`jules`** al issue. La aplicación de Jules puede recogerlo y publicar su respuesta y una PR; confirma esos objetos, no deduzcas éxito de que exista la etiqueta. Si el agente no puede gestionar #18, su coordinador mantiene la reserva y registra la rama efectiva.
5. Revisa los archivos, el SHA, las pruebas y las limitaciones de la PR. Registra `PR_READY`; eso no libera la reserva ni autoriza fusionar. El merge requiere la autorización de Varo registrada en esa PR. No modifiques ramas o entregas del otro propietario sin su OK.

La documentación oficial de [tareas de Jules](https://jules.google/docs/running-tasks/) describe el disparo por etiqueta. [CLI](https://jules.google/docs/cli/reference/) y [API](https://jules.google/docs/api/reference/overview/) son alternativas para automatizaciones adicionales, **no requisitos de este recorrido**. Una clave de la API de Jules se guarda en el entorno privado del propietario, nunca en Office web ni en GitHub.

Para otro agente, conserva el mismo ciclo de issue → reserva → rama propia → PR → revisión. Su método de ejecución pertenece a su propietario.

**Resultado honesto:** «El agente colaboró en GitHub; entrega en la PR enlazada». Esto no significa «agente conectado a Office». Office solo proyecta los objetos expresamente seleccionados en su política: tener una PR no garantiza que ya aparezca en el tablero. Véanse [RUNNING.md](../RUNNING.md) y [cola HTTP](team-queue-http.md).

## 2. Preparar el acceso a la misma Office

Antes de enviar un heartbeat, Eloy y el administrador deben disponer de:

- Autorización concreta del propietario del agente y del servicio para esta conexión.
- **Origen exacto de la Office compartida**, recibido por el canal privado acordado: esquema, host y puerto, sin ruta ni barra final. No adivines la dirección ni abras otro servidor pensando que es la misma oficina.
- Transporte privado autorizado. Para el acceso entre redes, sigue [WireGuard](acceso-privado-wireguard.md). HTTPS debe validar el certificado; no uses `-k`. HTTP solo es admisible dentro del transporte privado expresamente autorizado, no por Internet abierto.
- Revisión desplegada que incluya presencia y tenga esta función configurada. El administrador la contrasta con [presencia HTTP](presence-http.md).
- Identificador de propietario y proyecto **tal como figuran en la política local**, no inferidos del nombre visible o del usuario de GitHub.

La ruta debe funcionar **desde el entorno que hará las peticiones**. Poder entrar en el navegador del PC no acredita que un contenedor, una VM o Jules en la nube pueda llegar. No entregues una VPN general ni abras Office a Internet para saltarte ese bloqueo.

Una petición a `GET /api/info` comprueba que responde Office, pero no autentica al agente ni demuestra que haya presencia habilitada. La clave de acceso de equipo sirve para iniciar la sesión humana; no la reutilices como clave de agente.

## 3. Alta privada de una identidad

### Eloy o su agente autorizado

Solicita al administrador un alta limitada: alias compartible, propietario aprobado, proyecto seleccionado y finalidad «publicar presencia». Un runtime puede tener varias identidades, pero cada una necesita su propia clave y un único publicador efectivo.

No envíes un inventario de tu máquina, archivos de perfil, prompts, conversaciones, memoria o credenciales de proveedores. Los datos operativos y el intercambio de claves van por el canal privado acordado; no por este repositorio público.

### Administrador de la Office

1. Confirma que `ownerId` existe en `members` de la política y está incluido en `readers` del proyecto. Mantén el alcance existente: esta guía no autoriza ampliar la política.
2. Genera una clave aleatoria larga y exclusiva para la identidad; conserva el secreto en el gestor privado del propietario/publicador. Calcula SHA-256 sobre **los bytes exactos de la clave**, sin añadir un salto de línea. El directorio guarda únicamente el hash hexadecimal en minúsculas. No reutilices claves ni hashes de otras identidades o de la sesión de equipo.
3. Incorpora agente y credencial al directorio local, **sin sobrescribir los demás agentes**. Guarda el fichero fuera de Git, con permisos mínimos. Los cambios deben ser atómicos y validados antes de sustituir la configuración válida.
4. Configura conjuntamente `OFFICE_AGENT_DIRECTORY` (ruta local del directorio) y `OFFICE_PRESENCE_PROJECT` (proyecto seleccionado). Un arranque o reinicio que requiera tu despliegue necesita su autorización habitual; el lector de esta guía no debe reiniciar servicios por su cuenta.
5. Comprueba la configuración efectiva y comunica privadamente al publicador su identidad, proyecto y clave independiente.

**Plantilla orientativa de un directorio completo de un solo agente**; no es un parche para aplicar sobre el directorio compartido:

```json
{
  "agents": [
    {
      "id": "marea/worker",
      "label": "Worker de ejemplo",
      "ownerId": "marea",
      "projects": ["demo/observatorio"]
    }
  ],
  "credentials": [
    {
      "agentId": "marea/worker",
      "keyHash": "REEMPLAZAR_POR_SHA256_HEXADECIMAL_DE_64_CARACTERES"
    }
  ]
}
```

`marea` y `demo/observatorio` son ficticios; **no son los identificadores de Eloy ni de Office**. El marcador del hash es deliberadamente inválido: el ejemplo no se puede activar sin completar el alta privada.

Reglas del contrato actual:

- El objeto raíz contiene solo `agents` y `credentials`; cada agente tiene exactamente los cuatro campos mostrados.
- El ID sigue `propietario/slug`, en minúsculas, con letras, números o guiones; cada segmento empieza por letra o número y admite hasta 40 caracteres. El prefijo debe coincidir exactamente con `ownerId`.
- El nombre visible admite entre 1 y 80 caracteres; entre 1 y 8 proyectos por agente. Los proyectos tienen que existir en la política y autorizar al propietario como lector.
- Hay una credencial por agente; IDs y hashes no se repiten. Límite: 100 agentes y directorio de 64 000 bytes.
- No añadas `provider`, `model`, `apiKey`, herramientas o rutas del perfil al directorio: no forman parte de su esquema.

No existe un endpoint HTTP de «crear perfil Hermes» en este recorrido. Las operaciones de [gestión de agentes](agent-management.md) no sustituyen este alta administrativa ni constituyen una integración operativa por sí mismas.

## 4. Publicar una señal de presencia

El publicador utiliza:

- `POST /api/presence/heartbeat`.
- `Authorization: Bearer <clave exclusiva del agente>`.
- `Origin: <origen exacto del servicio>` y `Content-Type: application/json`.
- Solo estos dos campos de cuerpo:

```json
{"projectId":"demo/observatorio","sequence":1}
```

No añadas `agentId`, `ownerId`, texto libre ni campos del [sobre interoperable propuesto](interoperability.md). **La clave identifica al agente**; el cuerpo no puede elegir otra identidad. Tampoco sirve la cookie humana como credencial de publicación.

### Una petición manual desde Bash, sin guardar la clave

Solo después del alta y de la autorización. Requiere `curl` con `--fail-with-body`. Sustituye origen/proyecto con los valores recibidos privadamente; el dominio `.invalid` no es un destino real. La secuencia `1` es solo para una identidad nueva sin heartbeat previo. Si ya hay un publicador, no arranques otro.

```bash
set +x
set -o pipefail
OFFICE_ORIGIN='https://office.example.invalid'
OFFICE_PROJECT='demo/observatorio'
OFFICE_SEQUENCE='1'

read -r -s -p 'Clave de presencia (solo en tu terminal local): ' OFFICE_AGENT_KEY
printf '\n'
PAYLOAD=$(python3 -c 'import json,sys; n=int(sys.argv[2]); assert 0 <= n <= 9007199254740991; print(json.dumps({"projectId":sys.argv[1],"sequence":n}))' "$OFFICE_PROJECT" "$OFFICE_SEQUENCE")
if [ -n "$PAYLOAD" ] && printf 'Authorization: Bearer %s\n' "$OFFICE_AGENT_KEY" |
  curl --silent --show-error --fail-with-body --noproxy '*' \
    --connect-timeout 5 --max-time 10 --request POST \
    --header @- --header "Origin: $OFFICE_ORIGIN" \
    --header 'Content-Type: application/json' \
    --data-binary "$PAYLOAD" "$OFFICE_ORIGIN/api/presence/heartbeat"
then
  printf '\nPetición aceptada: comprueba identidad, proyecto y estado de la respuesta.\n'
else
  printf '\nPetición no confirmada: detente y consulta el diagnóstico.\n' >&2
fi
unset OFFICE_AGENT_KEY PAYLOAD
```

La clave se introduce **en la terminal del propietario**, no en un chat. Se pasa por la entrada estándar de `curl`, no como argumento visible del proceso. No actives trazas, `curl -v`, redirecciones automáticas o volcados de cabeceras. El ejemplo no configura VPN, no crea un servicio y no instala un bucle.

El `200` debe contener tu `agentId`, tu `projectId`, `status: online` y `seenAt`. Comprueba los valores contra el alta privada; una respuesta de otro agente/proyecto o un HTML no acreditan conexión.

### Si después se autoriza un publicador continuo

- La secuencia es un entero seguro no negativo y **estrictamente creciente** por agente/proyecto. Un solo escritor la mantiene de forma consistente al reconectar; no la reinicies ciegamente a `1`.
- Duplicados y mensajes atrasados reciben `409` y no renuevan presencia. Ante un timeout no sabes si el servidor aceptó la petición: no declares éxito ni arranques otro publicador; reconcilia el estado y la siguiente secuencia.
- El servidor usa su reloj: `online` hasta 5 segundos, `stale` después y `offline` pasados 15 segundos. Sin publicación también figura `offline`.
- Límites: 60 intentos autenticados por agente y 120 globales por minuto; cuatro publicaciones simultáneas como máximo y una por agente. El intervalo se acuerda para el **conjunto** de agentes: no copies un bucle rápido por cada uno. Con más agentes puede no ser posible mantenerlos todos `online` con esos límites; no alteres el servidor ni ocultes el problema.
- Reinicios y cambios observados de política/directorio vacían toda la presencia y abren otra época de secuencias. Recuperar una configuración no recupera heartbeats anteriores. Coordina el reenvío legítimo; no simules continuidad.
- Publica solo mientras el componente que representa esa identidad esté realmente disponible. Un puente encendido no permite afirmar que Jules esté ejecutando una tarea; si solo observas el puente, identifica eso explícitamente.

## 5. Verificar desde una sesión distinta

La aceptación mínima de **presencia** requiere más que enviar un POST:

1. Publicador: obtiene `200`, identidad y proyecto correctos, y conserva únicamente evidencia saneada.
2. Lector autorizado: inicia sesión en la interfaz de Office con **su clave de equipo**, no con la del agente. El servicio crea la cookie de sesión mediante `POST /api/session`.
3. Desde ese mismo navegador y origen, abre `/api/presence` inmediatamente después de la publicación. Este GET utiliza la sesión humana, no el Bearer del agente, y no admite parámetros arbitrarios. Comprueba el ID y `seenAt`; si la consulta tarda, `stale` u `offline` pueden ser el resultado correcto.
4. Respeta `expiresAt`: la respuesta caduca al segundo. No mantengas una captura antigua como indicador vivo; un consumidor debe retirar la vista al caducar o fallar la autorización.
5. Con una identidad **de prueba** y permiso del administrador, deja de publicar y verifica el paso a `stale` y después `offline`. Prueba también la revocación acordada de esa identidad; no retires accesos de agentes ajenos.

Si la revisión desplegada no tiene panel de presencia, utiliza el GET autenticado. Un avatar dibujado, el listado de la cola o la posición de un muñeco no son evidencia alternativa de presencia. No presupongas que una interfaz de una PR abierta esté desplegada.

Para una prueba entre equipos, cada propietario debe verificar desde su entorno autorizado. Hasta entonces el informe distingue «petición local verificada» de «lectura por el otro equipo verificada».

## 6. Ejecutar encargos desde Office: frontera actual

La ruta de presencia **no** lanza Jules/Hermes, no acepta trabajos, no comparte herramientas y no sincroniza resultados. Office no obtiene autoridad para parar el runtime al revocar su presencia.

Una integración de ejecución posterior necesita, como mínimo, un adaptador del propietario con capacidades explícitas, autenticación, aislamiento, presupuesto/plazo, idempotencia, parada y pruebas de entrega real. No inventes endpoints como `POST /api/agents`, `POST /api/tasks` o `/api/jules`, ni envíes una petición de ejecución al heartbeat.

Mientras no exista ese adaptador autorizado y probado, el camino útil es **trabajar mediante GitHub** y, de manera independiente, publicar presencia si se ha configurado. No instales CLI, SDK, plugins o servicios solo para hacer desaparecer un aviso de «sin conexión».

## 7. Diagnóstico y revocación

| Síntoma | Comprobación y acción |
|---|---|
| Jules no recoge un issue | Verifica permiso de la aplicación para ese repo, etiqueta `jules` y estado/límites de la cuenta del propietario. No es un fallo de la presencia de Office. |
| No se alcanza Office | Comprueba transporte desde el publicador, origen recibido y disponibilidad con el administrador. No escanees otras redes, abras puertos ni uses una dirección inventada. |
| `404 NOT_FOUND` en heartbeat | Presencia no configurada o revisión/ruta equivocada. Pide comprobación de versión y de ambas variables; no instales otro servidor. |
| `401 PRESENCE_AUTH` | Falta la clave específica o no coincide. La clave humana, cookie, token GitHub y clave Jules no sirven como sustitutos. |
| `401 AUTH` al consultar presencia | Falta sesión de equipo válida, ha caducado o cambió la política. Reautentica por el flujo normal si sigues autorizado. |
| `403 HOST` / `ORIGIN` | El origen y host deben coincidir con la configuración. No desactives la validación ni fuerces cabeceras hacia otro destino. |
| `403 PRESENCE_FORBIDDEN` / `PRESENCE_REVOKED` | Proyecto no permitido o acceso cambiado durante la petición. Detén el intento y consulta al propietario; no pruebes identidades ajenas. |
| `409 PRESENCE_CONFLICT` | Secuencia repetida/atrasada o publicadores concurrentes. Reconcilia el único escritor; no reinicies ni cambies la configuración del servidor para borrar el conflicto. |
| `429 RATE_LIMIT` | Reduce/adapta el ritmo autorizado y aplica espera acotada; revisa el límite global con el administrador. No multipliques procesos o claves para eludirlo. |
| `503 PRESENCE_UNAVAILABLE` | Directorio o política incoherentes. El administrador valida esquema, IDs, hashes únicos y tamaño sin publicar el fichero. |
| `400` por cuerpo o campos | Envía únicamente `projectId` y `sequence`, con tipos correctos y JSON válido. No reutilices el sobre de la propuesta de interoperabilidad. |
| `200` pero luego `offline` | Consulta la antigüedad, caducidad y continuidad del publicador. Una señal manual caduca deliberadamente; no prueba trabajo en ejecución. |

Para **desconectar presencia**, detén el publicador autorizado. Para **retirar o revocar la identidad**, el administrador elimina de forma atómica su agente y su credencial del directorio válido. Comprueba que la identidad ya no aparece en una lectura nueva y que la clave anterior no puede publicar. No dejes referencias huérfanas que invaliden a todos.

**Rotar una clave no retira la identidad**: sustituye su hash, invalida la credencial anterior y permite publicar a quien tenga la nueva. Es renovación de credencial, no baja del agente. Verifica por separado el rechazo de la antigua y, si está autorizado, la publicación con la nueva. No restaures por accidente un hash revocado desde una copia: volvería a autorizar esa credencial.

Ambas modificaciones observadas del directorio invalidan también la presencia efímera previa del resto: avisa y revalida las señales legítimas.

No borres perfiles, trabajos o memoria al desconectar. Revocar el acceso compartido no para tareas locales: esa parada es una operación separada del propietario.

## 8. Informe de entrega para el agente

Completa solo lo realmente comprobado; no marques toda la lista por un `200`:

```text
Objetivo autorizado: GitHub / presencia / ambos
Repositorio: issue y PR (si corresponde)
Alta: confirmada por administrador / pendiente
Transporte desde el publicador: verificado / bloqueado / no probado
Heartbeat: identidad y proyecto correctos / error / no probado
Lectura con sesión autorizada: verificada / pendiente
Caducidad: verificada / pendiente
Revocación de identidad de prueba: verificada / pendiente
Ejecución desde Office: no habilitada por este tutorial
Lectura por el otro equipo: verificada / pendiente
Bloqueo y siguiente responsable: sin claves, direcciones o configuración privada
```

No adjuntes cabeceras, cookies, hashes, claves, ficheros de configuración ni logs completos. Las evidencias operativas sensibles se quedan en el entorno de su propietario.

### Fuentes y alcance de esta guía

- Normas: [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md), [Normas Platino](normas-platino.md) y [preparación de ambos equipos](onboarding.md).
- Implementación contrastada: [directorio y secuencias](../src/presence.mjs), [credenciales y límites](../src/presence-bridge.mjs), [rutas HTTP y sesiones](../src/server.mjs) y [contrato HTTP](presence-http.md), en el SHA indicado al principio. La implementación integrada prevalece sobre una propuesta antigua; cambios futuros requieren revalidación.
- Jules: [tareas y etiqueta de GitHub](https://jules.google/docs/running-tasks/), [autenticación de su API](https://jules.google/docs/api/reference/authentication/). No se han usado credenciales de Eloy ni ejecutado tareas de Jules para elaborar esta guía.
- La guía describe un recorrido; **su publicación no registra agentes, activa conexiones, despliega Office ni acredita una prueba bilateral**.
