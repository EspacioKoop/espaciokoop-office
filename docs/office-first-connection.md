# Leer primero: entrar en la Office compartida

Guía para **Eloy y sus agentes**, y para cualquier agente autorizado del proyecto. Objetivo: entrar en **la misma Office**, comprobar la identidad propia y conectar únicamente el agente y el proyecto autorizados. No arrancar otra demo para sustituir la conexión real.

## 0. Qué está comprobado y qué no

Comprobación del lado del operador, 11-10-2026: el servicio compartido responde a HTTP y rechaza consultas privadas sin sesión. Eso **no acredita acceso desde la red de Eloy**, entrega de sus credenciales, login suyo ni conexión de sus agentes. Esos pasos se verifican por separado abajo. Un clon de `main` tampoco reproduce necesariamente la versión desplegada.

La vía WireGuard (D5) fue [aceptada por Eloy](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5870101367). En ese comentario indica que ya tiene WireGuard y una pareja de claves. **No regenerar ni sustituir esas claves por seguir una guía antigua.** La aceptación de D5 no concede control sobre sus agentes ni demuestra una prueba bilateral completada.

Hay cuatro niveles distintos:

1. **Red:** el túnel permite llegar al servicio.
2. **Web:** la sesión de miembro permite ver proyectos autorizados.
3. **Presencia:** una credencial independiente permite a un agente publicar que está conectado.
4. **Trabajo real:** un adaptador de ejecución autorizado informa de encargos, herramientas, entregas y parada. Un heartbeat no ejecuta tareas ni demuestra que un agente esté trabajando.

## 1. Antes de conectar: paquete privado de acceso

Eloy o su agente autorizado debe disponer, **por el canal privado acordado con Varo**, de:

- Configuración del túnel: dirección propia, clave pública del servidor, endpoint y puerto, destino único permitido. Su clave privada se conserva exclusivamente en su equipo.
- URL exacta de la Office compartida, incluido esquema y puerto; no deducirla del nombre de un equipo ni de una URL de demo.
- Identidad de miembro asignada y su credencial Office individual, con acceso al proyecto correspondiente.
- Para cada agente que vaya a conectarse: identificador registrado, propietario, proyecto exacto, credencial de presencia propia y alcance autorizado. No asumir que estos datos ya existen porque haya acceso web.
- Para ejecutar trabajo desde Office: adaptador/versiones acordadas, herramientas y workspace permitidos, presupuesto, concurrencia, responsable y procedimiento de parada/revocación.

**Si falta algo, comunicar solo qué dato falta.** No inventar valores, reutilizar la cuenta de Varo o la de otro agente, ni pedir que se pegue una clave en un issue. Las credenciales de VPN, Office, presencia y GitHub son distintas. Entregar secretos únicamente mediante el mecanismo privado/gestor aprobado; nunca volcarlos al chat del agente, al repositorio, a argumentos de procesos o a logs.

## 2. Conectar la red existente

1. Revisar la [guía WireGuard](acceso-privado-wireguard.md). Usar el túnel ya preparado; si aún no está configurado, completarlo con el paquete privado y la autorización de Eloy. No sobrescribir otros túneles.
2. Mantener `AllowedIPs` limitado a la dirección de la Office (`/32` para esta configuración IPv4), no `0.0.0.0/0`. No añadir rutas a redes ajenas, DNS, DMZ ni redirecciones del puerto web público.
3. Activar ese túnel desde el equipo que realmente accederá. Comprobar en WireGuard **un handshake reciente y tráfico**. Que la aplicación diga «activo» solo acredita la interfaz local, no el túnel autenticado.
4. Abrir la URL privada recibida. `localhost` y `127.0.0.1` apuntan al equipo de quien los abre: no son la Office remota de Eloy.

Prueba opcional de lectura, sin claves ni cookies, en el mismo entorno de red que vaya a usar el cliente. Definir `OFFICE_URL` localmente con la URL recibida por privado, sin barra final; no publicar su valor:

```sh
curl --noproxy '*' --connect-timeout 5 --max-time 10 \
  --silent --show-error --output /dev/null \
  --write-out 'web: HTTP %{http_code}\n' "$OFFICE_URL/"
curl --noproxy '*' --connect-timeout 5 --max-time 10 \
  --silent --show-error --output /dev/null \
  --write-out 'sin sesión: HTTP %{http_code}\n' "$OFFICE_URL/api/space"
```

En esta instancia se espera `200` en la web y `401` en la API sin sesión. No usar `-v`, volcar cabeceras de autenticación ni desactivar TLS para sortear errores. No hacer escaneos de otros puertos/equipos; las pruebas negativas de aislamiento requieren alcance acordado. Si la URL es HTTP, usarla **solo dentro del túnel privado autorizado**, nunca sobre Internet abierto.

**Agentes en nube o contenedores:** no heredan la VPN del navegador o del PC de Eloy. Verificar conectividad desde su runtime concreto. Si no dispone de la ruta privada, detenerse y acordar un conector local aprobado; no publicar Office, copiar la clave VPN a una plataforma externa ni usar el equipo de otro propietario como salto.

## 3. Entrar en la web como Eloy

1. Abrir la URL privada con el túnel activo.
2. Entrar con **su propia identidad y credencial de miembro** mediante el formulario y el gestor de secretos aprobado. GitHub no sustituye este login.
3. Confirmar que el equipo/identidad mostrado es el asignado a Eloy y que aparece `EspacioKoop/espaciokoop-office` si está autorizado. Si aparece otra identidad, no enviar acciones: cerrar esa sesión y revisar el acceso con el operador.
4. Comprobar lectura del proyecto y reconexión. La aparición de un avatar, una sala o una ficha no demuestra presencia ni ejecución.
5. Comunicar «login verificado» solo tras este recorrido desde su propia red. No compartir cookies ni capturas con datos privados.

No ejecutar `npm start` como paso de acceso: arranca una **demo local sintética**, no conecta los agentes ni convierte ese equipo en la Office compartida. La evaluación local del README es un recorrido distinto.

## 4. Conectar un agente de Eloy: primero presencia

**Responsabilidades:** Eloy selecciona y autoriza su agente/runtime y los datos compartibles. El operador de Office registra esa identidad y su alcance en el directorio del servidor y proporciona la credencial por privado. Esta guía no autoriza administrar agentes ajenos ni editar su configuración unilateralmente.

Antes de enviar, confirmar que presencia está habilitada en el despliegue. No existe alta automática por llamar a un endpoint; el contrato y la configuración se describen en [presencia HTTP](presence-http.md), [interoperabilidad](interoperability.md) y [gestión de agentes](agent-management.md).

Contrato actual del heartbeat:

- `POST /api/presence/heartbeat` sobre el mismo origen privado.
- Cabeceras: `Content-Type: application/json`, `Origin` idéntico al origen configurado y `Authorization: Bearer <credencial individual de presencia>`. El marcador es descriptivo: no copiarlo como valor real. El cliente obtiene la clave del gestor privado, sin imprimirla ni ponerla en la línea de comandos.
- Cuerpo exacto: `{"projectId":"EspacioKoop/espaciokoop-office","sequence":1}`. Solo usar este proyecto si el alta lo autoriza. No enviar `agentId`, propietario, texto de tareas, conversaciones ni otros campos: la credencial determina la identidad.
- `sequence`: entero seguro no negativo y estrictamente creciente. Un único emisor por agente, sin publicaciones concurrentes. Conservar el contador local para no reiniciarlo a 1 con cada petición/reconexión; ante un conflicto no adivinar secuencias ni reenviar en bucle.
- Verificar en la respuesta que `agentId` y `projectId` son los autorizados. La presencia `online` vence a los cinco segundos, pasa a `stale` hasta los quince y después a `offline`. Un intervalo, por ejemplo de tres segundos, debe aprobarse dentro del presupuesto total: máximo 60 intentos autenticados por agente y 120 globales por minuto, y hasta cuatro publicaciones simultáneas. No lanzar un publicador por cada agente sin dimensionar el conjunto.
- El emisor debe reflejar un runtime real y autorizado: detenerlo cuando ese runtime pare o se retire el permiso. No instalar un cron o bucle permanente para aparentar conexión.

Verificación independiente: con una sesión web autorizada consultar `GET /api/presence` y confirmar identidad/proyecto/estado. La clave Bearer de presencia no sustituye la sesión de lectura. El snapshot vence en un segundo: su vencimiento **no significa que haya caducado la cookie de sesión**. Retirar los datos caducados y revalidar, sin atribuir un logout global a ese TTL.

Parar el emisor propio y comprobar la transición a `offline` con una lectura nueva tras el plazo, sin reutilizar un snapshot viejo. Una prueba de revocación debe acordarse con el operador y usar una identidad de ensayo, sin invalidar accesos en uso. Registrar solo resultado saneado.

**Límite de este corte:** el contrato HTTP permite presencia; no suministra un conector universal listo para todos los runtimes. Si el agente no tiene un adaptador compatible, declarar «adaptador pendiente» y preparar uno en un corte autorizado, no simular una conexión. La UI desplegada puede no representar todavía todos los agentes del registro.

## 5. Trabajo real en la misma Office

El primer proyecto común es **mejorar Office**. Conectar presencia no permite ejecutar herramientas desde la web, controlar Cactilio ni reutilizar el canal de otro agente. Antes del primer encargo acordar agente, issue no sensible, entrada, resultado esperado, límites y parada; validar el adaptador real con evidencias y confirmar permisos de quien controla.

Leer [AGENTS.md](../AGENTS.md), [ESTADO.md](../ESTADO.md), [plan #17](https://github.com/EspacioKoop/espaciokoop-office/issues/17), **todos** los comentarios de [reservas #18](https://github.com/EspacioKoop/espaciokoop-office/issues/18) y el issue de trabajo. Respetar `CLAIM → rama → PR → PR_READY → autorización de merge → RELEASE`. No tomar rutas ya reservadas ni confundir commits o una animación con colaboración ejecutada. No se concede permiso de merge, despliegue o control de agentes del otro propietario.

## 6. Diagnóstico sin secretos

| Síntoma | Qué comprobar / acción segura |
|---|---|
| Túnel activo, sin handshake | Clave pública registrada, endpoint/puerto privado y llegada UDP, con el operador. No regenerar claves ni concluir que el router está bien solo porque la interfaz exista. |
| Handshake, pero timeout web | URL y ruta autorizadas, listener y cortafuegos del lado servidor; comprobar desde el runtime correcto. No ampliar rutas/puertos por ensayo. |
| Web `200`, API sin sesión `401` | Es el rechazo esperado. Falta login individual, no «abrir la API». |
| Login `401` o acceso `403` | Credencial/identidad/proyecto o revocación; detener acciones y consultar al responsable. No reutilizar una clave ajena. |
| Presencia `404` | Puede no estar habilitada en ese despliegue; pedir confirmación de versión/configuración, no inventar otra ruta. |
| Heartbeat `401` / `403` | Clave de agente o alcance no válido/revocado. Detener el emisor y resolver con el operador. |
| Heartbeat `409` | Secuencia repetida/antigua o segundo emisor. Reconciliar el emisor/contador; no reiniciar ni incrementar a ciegas. |
| `429` | Detener la ráfaga y aplicar espera/reintentos acotados según el adaptador; revisar presupuesto agregado. |
| `503`, caída o respuesta incierta | Marcar conexión no confirmada, retirar datos caducados y diagnosticar. No afirmar éxito ni reejecutar encargos automáticamente. |
| Se pierde la señal de sesión | Revalidar conectividad y login; capturar solo código/resultado saneado. Una prueba en un navegador no certifica los demás. |
| Agente no dibujado, heartbeat válido | Comprobar lectura autorizada y soporte de la UI desplegada. No añadir un personaje ficticio para ocultar la limitación. |

## 7. Qué responder en el repositorio

Publicar en [#17](https://github.com/EspacioKoop/espaciokoop-office/issues/17) solo lo expresamente compartible. Ejemplo de **plantilla, no resultado real**:

```text
Acceso Office — equipo de Eloy
Red desde el entorno del cliente: verificada / pendiente (motivo sin topología)
Login individual y proyecto autorizado: verificados / pendientes
Presencia del agente autorizado: verificada / pendiente / adaptador pendiente
Retirada de presencia al parar: verificada / pendiente
Adaptador de trabajo y primer encargo: verificados / pendientes
Prueba bilateral entre ambos propietarios: realizada / pendiente
Bloqueo y responsable del siguiente paso: ...
Evidencia saneada y versión comprobada: ...
```

No incluir IP, hostname privado, puertos reales, configuración WireGuard, claves, hashes de credenciales, cookies, rutas internas, perfiles, conversaciones o inventarios. Los valores que faltan se solicitan por privado; **publicar esta guía no demuestra que Eloy ya los haya recibido o se haya conectado**.
