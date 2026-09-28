# Servicio común: candidato de la primera parte de #21

Preparado por **Astra Taller (equipo de Varo)**. Depende del núcleo de #14.
Solo código y pruebas sintéticas: **no desplegado ni aceptado por personas**.
La interfaz y la presencia no forman parte de esta ronda. Esta entrega está
pausada antes de la verificación final; no debe integrarse todavía.

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

Un commit confirmado emite `event: space` con `data: {}` a las sesiones del
proyecto. Es una invalidación, no estado, presencia ni confirmación visual.
El cliente debe releer la API; al reconectar también debe releer, porque no
existe replay de eventos SSE. Los duplicados no generan otro commit/evento.
La interfaz actual todavía no consume estas señales de espacio.

Errores tipados: permisos/revocación 403, recurso inexistente 404,
conflictos/ocupación/capacidad 409, entrada inválida 400, bloqueo de almacén
503. `COMMIT_UNCERTAIN` es 503 y exige releer/reintentar la misma clave, no
asumir rollback. Fallos de disco/corrupción devuelven `SPACE_UNAVAILABLE`
(503), sin mensajes de excepción ni rutas. JSON excesivo devuelve 413,
Content-Type incorrecto 415 y límites de peticiones 429. Se admite una
operación de espacio por sesión, cuatro globales y 60 comandos/minuto/sesión.

## Persistencia y límites

Un servidor Linux, un disco local privado, sin réplicas ni NFS. Se conservan
estado y recibo juntos antes de confirmar. Al reiniciar se requiere otra
sesión, pero la misma identidad puede reintentar la misma clave. Se mantienen
los límites y el protocolo de recuperación documentados por el paquete:
8192 comandos por proyecto; no es un almacén para posiciones a alta frecuencia.
No borrar recibos ni robar bloqueos. Antes de datos reales deben acordarse
capacidad, retención, backups y recuperación con ambos administradores.

## Evidencia y pendiente

La base de #14 pasó 62/62 pruebas del núcleo y 123/123 del paquete, sin cambios.
El primer control completo del candidato dio 85/86 en el núcleo ampliado:
un proceso de prueba no arrancó. La API pasó después aisladamente. Se ha
cambiado su arnés para asignar el puerto atómicamente dentro del hijo;
**falta repetir el control completo sobre ese arnés final**. No se presenta
ese ajuste como causa demostrada ni como corrección verificada del fallo.

Pendientes: regresiones contra la base, revisión independiente, CI del SHA
final y autorización de integración. No están probados despliegue real,
dos redes reales, uso por personas, navegación conjunta de esta API,
apagón físico ni certificados de producción. No se cierran #21, #1, #3 o #11.
Rollback de código: descartar esta rama; no se ha migrado dato real alguno.
