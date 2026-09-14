# Espacio compartido: contrato candidato y evidencia

## Alcance y procedencia

Petición actual de Varo: trabajar hacia 1.0 **con colaboración remota entre sus
agentes y los de Eloy, desde redes diferentes**. Este módulo implementa una pieza
independiente de COEDIT-01, SPACE-01, AVATAR-01 y MGMT-01 de #1, reservada en #13.
No atribuye a Eloy decisiones de producto, infraestructura o datos. No reduce la
visión completa a un editor ni declara 1.0 terminada.

El módulo se coloca detrás del servicio común autenticado. Los clientes remotos
no acceden al disco, no sincronizan carpetas y no necesitan estar en la misma LAN.
El disco local es el almacenamiento **del servidor**, no una limitación del acceso
remoto. No se ha desplegado ese servidor ni conectado los equipos reales.

## Qué implementa

Salas comunes editables con capacidad explícita y salas propias editables solo
por su propietario. Todos los miembros autorizados del proyecto pueden visitar
esas salas **del juego**, nunca directorios o recursos privados del propietario.
Se pueden crear, renombrar, redimensionar y retirar salas vacías; colocar, mover,
girar y retirar muebles del catálogo; y guardar la posición del avatar humano
que realiza la petición. No existe un campo de cliente para controlar otro avatar.

Las dimensiones usan una cuadrícula de 4–64 celdas por eje. Los muebles tienen
huellas y no se solapan ni salen de la sala; la entrada (0,0) permanece libre.
No se puede colocar un mueble sobre un avatar ni mover un avatar dentro de un
mueble. No se reduce ni borra una sala recortando su contenido. **No se implementa
pathfinding ni una garantía de conectividad entre todas las celdas.**

Mover muebles o avatares no asigna tareas, mueve agentes operativos, pausa
procesos, cambia permisos, despierta modelos ni modifica GitHub. La posición
persistente no significa presencia: hay que combinarla con la presencia caducable
del transporte. Sin esa señal debe mostrarse como última posición, no «conectado».

## API de dominio

```js
import {
  createSpaceState, applySpaceCommand, spaceView,
} from '../packages/office-space/src/space.mjs';

const state = createSpaceState('fixture/office');
// Este contexto lo construye el servidor DESPUÉS de autenticar y autorizar.
// Nunca deserializar context desde req.body ni confiar en un owner_id del cliente.
const context = {
  actor_id: 'fixture-human-a',
  owner_id: 'fixture-owner-a',
  kind: 'human',
  project_id: 'fixture/office',
  capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'],
  now: 1700000000000, // reloj del servidor; fijo solo en este ejemplo sintético
  assertAuthorized: () => true, // SOLO fixture; producción consulta política viva
};
const command = {
  type: 'room.create', idempotency_key: 'create-room-1', expected_revision: 0,
  room_id: 'lobby', label: 'Sala común', scope: 'common', width: 16, height: 12,
};
const transaction = applySpaceCommand(state, command, context);
// Persistir transaction.state atómicamente/CAS antes de confirmar el cambio.
const view = spaceView(transaction.state, context);
```

El dominio es puro: no escribe disco, no consulta relojes ni programa timers.
Cada invocación valida contexto, estado y campos; los fallos no mutan sus entradas.
El servidor debe proporcionar una guardia **síncrona** que lance un error o devuelva
false al revocar acceso. Un Promise o un booleano enviado por el cliente no sirve.
`signal` es opcional y permite invalidar solicitudes con AbortSignal.

### Comandos estrictos

Todos requieren `type`, `idempotency_key` y `expected_revision`. Solo se admiten
los campos adicionales de esta tabla; se rechazan propiedades desconocidas,
versiones no válidas y nombres de tipos/catálogo arbitrarios.

| Tipo | Campos adicionales | Revisión esperada |
|---|---|---|
| `room.create` | `room_id, label, scope, width, height` | 0; ID nunca utilizado |
| `room.update` | `room_id, label, width, height` | De la sala |
| `room.delete` | `room_id` | De la sala; debe estar vacía |
| `furniture.place` | `room_id, item_id, kind, x, y, rotation` | De la sala |
| `furniture.move` | `room_id, item_id, x, y, rotation` | De la sala |
| `furniture.remove` | `room_id, item_id` | De la sala |
| `avatar.move` | `room_id, x, y` | Del avatar autenticado; 0 si nuevo |
| `avatar.leave` | Ninguno | Del avatar autenticado |

`scope`: `personal` o `common`. El propietario se deriva del contexto, no de la
petición. El catálogo exportado es `desk`, `chair`, `plant`, `sofa`, `table`, `board`;
los giros admitidos son 0, 90, 180 y 270 grados. No se admiten modelos, rutas, URLs,
HTML o scripts como mobiliario. Las etiquetas son texto acotado; la interfaz debe
seguir usando `textContent`, nunca `innerHTML`.

`space.read` es obligatorio. Editar requiere `space.edit`; las salas comunes
requieren además `space.edit_common`. Mover/sacar el avatar requiere `space.move`.
No se concede una capacidad porque el cliente la solicite ni por nivel RPG.

### Concurrencia y reintentos

Las revisiones de sala son independientes entre salas y de las revisiones de
cada avatar. Dos propietarios sobre la misma revisión reciben un conflicto, no
una sobrescritura silenciosa. No se fusionan automáticamente ediciones distintas
dentro de una misma sala: el cliente recarga la proyección, muestra el conflicto
y permite reaplicar la intención sobre la nueva revisión.

La clave es única por actor y proyecto. El mismo comando con la misma clave
conserva su recibo; cambiar el contenido usando esa clave da
`IDEMPOTENCY_CONFLICT`. El recibo se guarda **junto al estado**, no en una caché de
proceso. Permisos y propietario se revalidan también al reintentar. Una revisión
global canónica identifica cambios del mundo. No usar el reloj del cliente como
orden ni como autorización. No reutilizar IDs de salas retiradas.

## Almacén del servicio compartido

```js
import { SpaceFileStore } from '../packages/office-space/src/store.mjs';
// Ruta elegida por el administrador, no por la petición remota.
const store = new SpaceFileStore({
  directory: '/var/lib/office/space', project_id: 'fixture/office',
});
// await store.apply(command, trustedContext) -> { receipt, duplicate, view }
// await store.read(trustedContext) -> proyección autorizada
```

El almacén admite un servidor Linux con sistema de ficheros local de confianza.
Puede atender a clientes de cualquier red detrás de HTTPS. **No es un almacén
para múltiples réplicas sobre NFS, almacenamiento de objetos o discos distintos.**
Para réplicas se necesita otro adaptador con transacciones/CAS; ejecutar el
reductor puro sobre dos copias y guardar ambas no sería seguro.

Cada proyecto tiene un fichero cuyo nombre se deriva de su identificador; el
cliente nunca aporta una ruta. Directorio 0700, archivos 0600; enlaces simbólicos,
permisos inseguros, JSON malformado, estado de otro proyecto y contenido no válido
se rechazan. No se «recupera» una corrupción borrando el mundo.

La escritura usa bloqueo exclusivo por proyecto, temporal en el mismo directorio,
fsync del fichero, rename y fsync del directorio. Todas las escrituras deben usar
este protocolo. La guardia se comprueba tras las esperas y justo antes de solicitar
el rename. Una revocación posterior no deshace retroactivamente una transacción
ya confirmada. Si el acceso se retira antes de responder, no se devuelve la vista.

Si falla el fsync posterior al rename se informa `COMMIT_UNCERTAIN`, no rollback:
consultar el estado o reintentar **la misma clave** bajo autorización vigente.
La prueba de reinicio no sustituye una prueba de pérdida de alimentación/fsync.

Un bloqueo abandonado no se roba por antigüedad: antes de retirarlo, un operador
debe verificar que no queda un escritor vivo y validar el último fichero. La
biblioteca no mata procesos. Copias de seguridad, retención, monitorización,
borrado de backups y recuperación operativa deben acordarse antes de datos reales.
Este módulo no implementa cifrado en reposo; requiere un volumen privado adecuado.

### Límites explícitos

Por proyecto: 64 identidades de sala durante toda su vida, 128 muebles por sala,
128 avatares, 8192 comandos confirmados y archivo de 16 MiB como máximo. Se
conservan 128 eventos de edición recientes; no es el archivo histórico completo
ni una fuente de evidencias de trabajo. La proyección informa capacidad restante.

No se expulsan recibos silenciosamente para permitir reejecuciones. Al agotar
capacidad se falla cerrado y se necesita una migración revisada que mantenga
idempotencia. **La persistencia actual no está preparada para posiciones a 60 Hz
ni uso prolongado ilimitado.** Interpolar la animación en cliente y no persistir
cada fotograma. Dimensionado/capacidad y política de purga siguen pendientes para
el producto estable; no borrar recibos o reiniciar revisiones para «hacer sitio».

## Composición pendiente con Core y Remote

El transporte reservado en #13 admite actualmente comandos de tareas; no se ha
modificado su lista para introducir los de este paquete. La integración requiere
una revisión explícita del contrato y del editor, no reenviar JSON arbitrario.

1. Autenticar actor y proyecto mediante el transporte, con TLS, sesión/CSRF cuando
   corresponda y límites de peticiones. Construir el contexto desde política viva.
2. Validar un sobre versionado, seleccionar el almacén del proyecto en el servidor
   y llamar `store.apply`; nunca devolver `load()` ni el estado interno.
3. Tras commit confirmado, invalidar/publicar el proyecto mediante el servicio
   remoto existente. El cliente vuelve a leer `spaceView`; no aplicar éxito visual
   antes de la confirmación ni aceptar la vista de otro cliente como autoridad.
4. Mostrar estados pendientes, conflicto, error y desconexión. Ofrecer controles
   de selección/teclado equivalentes a arrastrar; ninguna de estas acciones puede
   convertirse en una orden para agentes operativos.
5. Combinar posiciones con presencia caducable y comprobar el recorrido real entre
   los dos equipos antes de afirmar colaboración remota aceptada.

Errores de dominio se pueden mapear a respuestas tipadas: `FORBIDDEN`/
`ACCESS_REVOKED` (403), `NOT_FOUND` (404), conflictos/ocupación (409), entrada
incorrecta (400), capacidad (409) y `STORE_BUSY` (503, reintento acotado). Errores
de disco y corrupción deben registrarse de forma saneada y devolver un código
interno genérico. **Nunca publicar `error.message`, stack, rutas o configuración**
del sistema de ficheros en respuestas/eventos. No iniciar bucles de reintento sin
límite. `COMMIT_UNCERTAIN` exige resolver la ambigüedad mediante la misma clave.

## Evidencia de esta entrega

Verificación ejecutada en Linux / Node 22.16.0: **71 pruebas aprobadas, 0 fallos,
0 omitidas**. Incluye dos actores, dos instancias concurrentes y un proceso Node
nuevo que restaura el estado y reconoce un recibo anterior; validación negativa,
revocación antes del rename y durante lectura, corrupción, symlinks y permisos.

El ejemplo sintético termina con revisión global 5, una sala, dos muebles y dos
avatares; detecta `REVISION_CONFLICT` y reconoce el duplicado tras restauración.
No contiene un renderizador, captura del producto, agentes reales o conexión entre
dos casas. El workflow limita CI a estos archivos, sin secretos ni despliegues;
su resultado remoto debe comprobarse sobre el SHA de la PR.

No se cierran #1, #3, #11 ni la aceptación de #13. Quedan revisión independiente,
composición de módulos, interfaz, capacidad/retención de producción, despliegue
privado autorizado y prueba bilateral con aceptación de ambos propietarios.

Fuentes técnicas primarias utilizadas para las garantías y restricciones de E/S:
[Node.js File System](https://nodejs.org/api/fs.html) y
[Node.js Test Runner](https://nodejs.org/download/release/v22.17.0/docs/api/test.html).
No se ha ejecutado código de proyectos de referencia ni reutilizado su runtime.
