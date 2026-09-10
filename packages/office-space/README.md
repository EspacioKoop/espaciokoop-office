# Office Space

Módulo candidato de salas compartidas, mobiliario y posiciones de avatares humanos para EspacioKoop Office. No es la aplicación completa ni una versión 1.0 estable.

Se ejecuta en el servidor común: los usuarios pueden estar en redes distintas y acceder a través del transporte HTTPS autenticado de Office. El almacenamiento en disco del servidor **no** exige compartir casa, equipo o LAN. Este paquete no abre puertos ni incorpora su propio servidor, autenticación, Kanban o ejecutor de agentes.

## Probar

Node.js 22 o superior; el adaptador de disco y sus pruebas requieren Linux. Sin dependencias de terceros ni instalación mediante npm.

```sh
npm test --prefix packages/office-space
npm run demo --prefix packages/office-space
```

El ejemplo utiliza exclusivamente identidades sintéticas y un directorio temporal que elimina al terminar. Comprueba salas propias/comunes, rechazo de edición ajena, conflicto entre dos actores, posiciones y reintento tras reinicio. No representa una conexión bilateral real.

## API

| Exportación | Función |
|---|---|
| `createSpaceState(projectId)` | Estado interno inicial, sin efectos de E/S. |
| `validateSpaceCommand(command)` | Valida el esquema cerrado de una orden. |
| `validateSpaceState(state)` | Comprueba un snapshot interno, no una importación de clientes. |
| `applySpaceCommand(state, command, context)` | Transacción pura; devuelve nuevo estado, recibo y marca de duplicado. |
| `spaceView(state, context)` | Proyección autorizada, sin recibos internos ni claves de idempotencia. |
| `openSpaceStore({directory, project_id})` | Desde `src/store.mjs`: persistencia del servidor con `read(context)` y `execute(command, context)`. |

`applySpaceCommand` no serializa por sí solo a varios escritores. Usar el almacén de disco o un adaptador con transacción/CAS equivalente. Nunca guardar dos resultados obtenidos del mismo estado sin controlar la concurrencia.

```js
import { openSpaceStore } from './src/store.mjs';

// Configuración del SERVIDOR, nunca una ruta introducida por un cliente.
const store = await openSpaceStore({ directory: serverStorageDirectory, project_id: 'demo/shared' });

// Lo construye el backend tras autenticar al usuario y resolver su política vigente.
const context = {
  actor_id: 'team-a:human', owner_id: 'team-a', kind: 'human',
  project_id: 'demo/shared', now: Date.now(),
  capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'],
  signal: requestAbortSignal,
  assertAuthorized: checkCurrentAuthorizationSynchronously,
};

const result = await store.execute({
  type: 'room.create', idempotency_key: 'room-command-001', expected_revision: 0,
  room_id: 'common', scope: 'common', label: 'Sala de encuentro', width: 8, height: 8,
}, context);
// Devolver result.view solo por un canal autenticado del proyecto.
// Publicar una invalidación tras la confirmación; los clientes vuelven a consultar.
```

El fragmento muestra los puntos de integración; `serverStorageDirectory`, `requestAbortSignal` y `checkCurrentAuthorizationSynchronously` son dependencias reales del host, no credenciales de ejemplo ni una implementación de autenticación. El recorrido ejecutable completo está en `examples/shared-space.mjs`.

## Comandos y permisos

Todas las órdenes exigen `type`, `idempotency_key` y `expected_revision`. Se rechazan campos adicionales, identidades en el JSON, coordenadas fraccionarias, tipos desconocidos y etiquetas mal formadas. El propietario se obtiene del contexto autenticado.

| Tipo | Campos específicos | Revisión y permiso |
|---|---|---|
| `room.create` | `room_id`, `label`, `scope`, `width`, `height` | Revisión 0; `space.edit`; además `space.edit_common` para comunes. |
| `room.update` | `room_id`, `label`, `width`, `height` | Revisión de sala; propietario o edición común autorizada. |
| `room.delete` | `room_id` | Igual; exige sala vacía y no reutiliza su identificador. |
| `furniture.place` | `room_id`, `item_id`, `kind`, `x`, `y`, `rotation` | Revisión de sala y permiso de edición. |
| `furniture.move` | `room_id`, `item_id`, `x`, `y`, `rotation` | Igual; no cambia el tipo de mueble. |
| `furniture.remove` | `room_id`, `item_id` | Igual. |
| `avatar.move` | `room_id`, `x`, `y` | Revisión del avatar propio; `space.move`. |
| `avatar.leave` | Ninguno | Revisión del avatar propio; conserva su contador. |

Todas las operaciones requieren `space.read`. Las salas personales son espacios del juego visibles/visitables para los miembros autorizados de ese proyecto; no son almacenes de información privada. Entrar en una sala ajena no concede editarla. Los agentes no pueden suplantar avatares humanos mediante estas órdenes.

Un conflicto devuelve `REVISION_CONFLICT`: leer el estado actualizado, mostrar el conflicto y decidir una nueva orden sobre esa revisión. Para un fallo de transporte, conservar la misma clave y el mismo contenido. Una clave reutilizada con otro contenido devuelve `IDEMPOTENCY_CONFLICT`.

## Geometría y alcance real

Salas rectangulares de 4 a 64 celdas por lado. Catálogo inicial: escritorio, silla, planta, sofá, mesa y pizarra; giros de 90 grados. Se validan límites y colisiones entre muebles y con avatares; la entrada `(0,0)` queda libre. Los humanos pueden compartir celda. Mover un avatar confirma una posición, no una ruta física: no hay pathfinding, animación ni detección de presencia en este paquete.

No incluye editor visual, arte, paredes libres, plantas de edificio, enlaces entre salas o gestión de tareas. Mover muebles no asigna agentes, cambia permisos, gasta tokens ni despierta agentes en estasis.

## Límites que impiden anunciar 1.0

Capacidad inicial por proyecto: 64 identificadores de sala durante su vida útil, 128 muebles por sala, 128 identidades de avatar y **8192 órdenes aceptadas**. Los recibos se conservan sin purga automática para no repetir efectos tras reinicios; al agotarse la capacidad se rechazan cambios con `CAPACITY_EXCEEDED`, nunca se olvidan silenciosamente las claves. La vista incluye capacidad restante. Esta política necesita migración/retención antes de sesiones prolongadas o movimiento continuo; no enviar coordenadas por fotograma.

Los últimos 128 eventos son un resumen reciente, no el archivo histórico del producto. Persistencia limitada a un sistema de archivos Linux de un servidor; no usar esta implementación como base de datos distribuida o sobre NFS. No hay despliegue, conexión de agentes reales, integración con UI/transporte, prueba entre las redes de ambos propietarios ni aceptación bilateral de la versión completa.

[Contrato de integración, almacenamiento y recuperación](../../docs/office-space.md). Trabajo coordinado en el issue #13, sin modificar los componentes reservados por otros agentes.
