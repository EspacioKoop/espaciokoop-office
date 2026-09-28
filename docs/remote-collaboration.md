# Servicio común: candidato de la primera parte de #21

Preparado por **Astra Taller (equipo de Varo)**. Incorpora `main` con #14 integrada.
Solo código y pruebas sintéticas: **no desplegado ni aceptado por personas**.
La interfaz y la presencia no forman parte de esta ronda. Los controles locales
completos pasan dos veces seguidas; la PR sigue en borrador por la comparación
pendiente de las regresiones de esta ronda contra el candidato anterior.

## Configuración del administrador

La entrada ejecutable es `node src/server.mjs --live` (o `--demo` para fixtures).
El administrador configura las variables antes de iniciar el proceso. No se
cargan desde peticiones, cabeceras reenviadas ni archivos enviados por clientes.

| Variable | Uso |
|---|---|
| `OFFICE_PUBLIC_ORIGIN` | Origen HTTP/HTTPS exacto, por ejemplo `https://oficina.ejemplo`. Determina el único Host y Origin aceptados. Sin rutas, credenciales, query ni fragmento. |
| `OFFICE_BIND` | Dirección literal de escucha; por defecto loopback. `localhost` se fija a loopback IPv4, sin resolver DNS. |
| `OFFICE_PORT` | Puerto de escucha; se conserva el valor local predeterminado y el intervalo 1024–65535. |
| `OFFICE_TLS_KEY`, `OFFICE_TLS_CERT` | Rutas privadas elegidas por el administrador. Se requieren juntas. Activan HTTPS nativo y requieren un origen https. Nunca incorporarlas al repositorio. |
| `OFFICE_PRIVATE_TUNNEL` | Solo el valor `1` permite escucha no-loopback sin TLS: **únicamente detrás de un túnel cifrado privado**. No crea ni verifica ese túnel. |
| `OFFICE_POLICY` | Política de miembros y proyectos del núcleo, con una clave independiente por miembro. |
| `OFFICE_GITHUB_TOKEN` | Credencial local de solo lectura del núcleo, inyectada mediante el gestor de secretos. No es una clave de sesión Office. |
| `OFFICE_SPACE_PROJECT` | Identificador exacto del proyecto de oficina, presente en la política. Cada miembro debe ser lector de ese proyecto. |
| `OFFICE_SPACE_DIR` | Directorio privado de almacenamiento local, configurado por el administrador; nunca procedente del body. |

En modo conectado, las dos variables de espacio deben aparecer juntas. Si no
se configura ninguna, el núcleo anterior sigue funcionando, pero la API de
espacios responde 503. En demo el proyecto predeterminado es el del fixture
compartido; se usa un temporal propio y se ignora el directorio persistente.
El cierre normal retira ese temporal; una terminación forzada no garantiza su
limpieza. Las sesiones siempre se pierden al reiniciar.

## Opciones de transporte, sin desplegar

1. HTTPS nativo: configurar el origen `https://oficina.ejemplo`, las dos rutas
   TLS y la interfaz autorizada. El certificado debe corresponder al origen y
   ser de confianza para los clientes. Aquí solo se generan certificados
   efímeros dentro de pruebas, nunca certificados reales.
2. Terminación HTTPS en un proxy del mismo servidor: mantener el backend en
   loopback, fijar `OFFICE_PUBLIC_ORIGIN=https://oficina.ejemplo` y conservar
   el Host público y Origin originales. No se confía en `Forwarded` ni
   `X-Forwarded-*`; no habilitar CORS. El proxy debe permitir SSE sin buffering.
   Si el salto al backend atraviesa una red, necesita TLS o túnel privado.
3. Túnel cifrado privado: configurar la interfaz autorizada, el origen de
   ejemplo `http://oficina.ejemplo` y `OFFICE_PRIVATE_TUNNEL=1`. El operador
   debe garantizar que solo sea accesible por el túnel y limitar su alcance.
   La bandera no configura firewall, VPN, cifrado ni autenticación del túnel.

Un origen https añade `Secure` tanto a la cookie de sesión como a su borrado;
HTTP conserva `HttpOnly` y `SameSite=Strict`, pero no añade `Secure`.
Sin configuración se mantienen el origen y la escucha locales anteriores.
No usar las claves públicas de los fixtures para un servicio real.

## API y autoridad

`GET /api/space` devuelve exclusivamente la proyección `spaceView`.
`POST /api/space/command` acepta JSON de hasta 2048 bytes y exactamente los
comandos y campos de [office-space.md](office-space.md). No hay sobre de
contexto aportado por el cliente ni selección remota de directorio/proyecto.
El resultado confirmado contiene `receipt`, `duplicate` y `view`.

El backend deriva `actor_id` y `owner_id` del miembro de sesión, fija
`kind: human`, proyecto y reloj, y concede `space.read`, `space.edit`,
`space.edit_common` y `space.move`. El módulo protege salas personales.
La guardia síncrona revalida sesión y política durante la operación y antes
del commit. Un cambio de política revoca todas las sesiones anteriores,
conservando la semántica conservadora del núcleo; no solo la del miembro editado.
El vigilante SSE comprueba revocación cada 750 ms, además de las peticiones.

Sin sesión válida al entrar, ambas rutas de espacios devuelven **401 `AUTH`**,
igual que el núcleo. Una sesión ya autenticada que pierde su validez durante
la operación devuelve **403 `ACCESS_REVOKED`** y emite `event: revoke` por SSE.
En cambio, **403 `FORBIDDEN` no revoca la sesión**: un miembro sin permiso para
ese espacio conserva su acceso al núcleo y su canal SSE. La comprobación con
Marea consulta `/api/snapshot` después del rechazo y exige que siga dando 200.

Un commit confirmado emite `event: space` con `data: {}` a las sesiones del
proyecto. Es una invalidación, no estado, presencia ni confirmación visual.
El cliente debe releer la API; al reconectar también debe releer, porque no
existe replay de eventos SSE. Los duplicados no generan otro commit/evento.
La interfaz actual todavía no consume estas señales de espacio.

Errores tipados: autenticación inicial 401, permisos/revocación en curso 403, recurso inexistente 404,
conflictos/ocupación/capacidad 409, entrada inválida 400, bloqueo de almacén
503. `COMMIT_UNCERTAIN` es 503 y exige releer/reintentar la misma clave, no
asumir rollback. Fallos de disco/corrupción devuelven `SPACE_UNAVAILABLE`
(503), sin mensajes de excepción ni rutas. JSON excesivo devuelve 413,
Content-Type incorrecto 415 y límites de peticiones 429. Se admite una
operación de espacio por sesión, cuatro globales y 60 comandos/minuto/sesión.

Toda respuesta de error del núcleo o de espacios, si aún no se ha consumido
el cuerpo declarado (`Content-Length` positivo o `chunked`), lleva
`Connection: close`. Se pausa la lectura y se destruye el socket después de
enviar la respuesta completa, sin drenar el cuerpo restante. También se
entrega el 413 antes del cierre. Las pruebas usan un cliente TCP que mantiene
abierta su mitad de escritura para no confundir un FIN con el cese de lectura:
declaran 50 MiB (o usan chunks sin terminar) y exigen el cierre antes de intentar
enviar 1 MiB adicional tras la respuesta. No es una prueba de carga de producción.

## Persistencia y límites

Un servidor Linux, un disco local privado, sin réplicas ni NFS. Se conservan
estado y recibo juntos antes de confirmar. Al reiniciar se requiere otra
sesión, pero la misma identidad puede reintentar la misma clave. Se mantienen
los límites y el protocolo de recuperación documentados por el paquete:
8192 comandos por proyecto; no es un almacén para posiciones a alta frecuencia.
No borrar recibos ni robar bloqueos. Antes de datos reales deben acordarse
capacidad, retención, backups y recuperación con ambos administradores.

## Evidencia y límites de la ronda 3

La [revisión independiente del candidato anterior](https://github.com/EspacioKoop/espaciokoop-office/pull/25#issuecomment-5869328130)
repitió 86/86 del núcleo tres veces, 123/123 del paquete y CI en verde sobre
`5edb9cfd54401a0559dac8316c64eed11346d6ff`. Ese resultado no se atribuye al nuevo SHA.

Tras las correcciones, **dos ejecuciones completas consecutivas** en Node
22.23.2 dieron el mismo resultado:

| Control | Ejecución 1 | Ejecución 2 |
|---|---|---|
| `npm run check` | 13 módulos, 0 errores | 13 módulos, 0 errores |
| `npm test` | 114/114 | 114/114 |
| `node --test packages/office-space/test/*.test.mjs` | 123/123 | 123/123 |

Cero fallos, canceladas u omitidas en ambas ejecuciones finales. Hay 28 casos
nuevos: conservación de sesión tras `FORBIDDEN`, `AUTH` inicial y rechazo de
cuerpos parciales en las dos familias de rutas. La prueba existente de operación
en curso exige ahora el código exacto `ACCESS_REVOKED` además del evento SSE,
con una barrera que acredita que la petición pasó la autenticación inicial.

Un intento previo de esta ronda terminó con 112/114: fallaron dos arranques y uno
registró `pthread_create: Resource temporarily unavailable`. Se acotaron los
pools de hilos de los procesos hijos de prueba, sin elevar el presupuesto ni
cambiar el servidor. Después pasaron las dos ejecuciones completas anteriores.
Esto no demuestra retrospectivamente la causa del antiguo 85/86.

**Bloqueo para PR_READY:** la preparación de la copia aislada de
`5edb9cfd54401a0559dac8316c64eed11346d6ff` fue denegada por el control de seguridad.
No se ha eludido esa aprobación ni demostrado todavía qué casos nuevos fallan
contra ese SHA. La siguiente acción es autorizar esa preparación y ejecutar la
comparación, distinguiendo regresiones de cobertura de comportamiento conservado.
El SHA publicado, el resultado de CI y el estado de la entrega se registran en
la [PR #25](https://github.com/EspacioKoop/espaciokoop-office/pull/25).

Siguen pendientes la revisión de las correcciones y la autorización de integración.
No están probados despliegue, dos redes reales, uso por personas, navegador conjunto,
apagón físico ni certificados de producción. No se cierran #21, #1, #3 o #11.
Rollback de código: descartar esta rama; no se ha migrado dato real alguno.
