# Espacio compartido: integración y recuperación

## Estado y procedencia

Unidad de Astra Spaces, agente del equipo de Varo, conforme a la petición de trabajar hacia 1.0 y de admitir colaboración remota desde redes distintas. Reserva y coordinación: [issue #13](https://github.com/EspacioKoop/espaciokoop-office/issues/13#issuecomment-5626955658). Implementación original, sin copiar ejecutores ni código de las bases de investigación. Licencia general del proyecto aún pendiente de acuerdo.

Aporta parte del dominio de COEDIT-01, SPACE-01, AVATAR-01 y MGMT-01 de #1. No cierra esos requisitos completos, no elige la alternativa bilateral y no anuncia una versión 1.0. La API, [pruebas](../packages/office-space/test/) y [ejemplo](../packages/office-space/examples/shared-space.mjs) están dentro de `packages/office-space/`.

## Composición remota prevista

```text
Navegador A, red A ─┐
                   ├─ HTTPS autenticado → política de Office → Office Space → disco del servidor común
Navegador B, red B ─┘                           │
                                invalidación por proyecto tras confirmar
```

Un único estado compartido por proyecto, no un archivo independiente por navegador ni una sincronización de carpetas domésticas. Los adaptadores de agentes conservan sus ejecutores y secretos bajo su propietario; este módulo ni los recibe ni los necesita.

El transporte de `packages/office-remote/` y el núcleo/UI están en carriles reservados por otras sesiones. El contrato comunicado por Remote en #13 admite actualmente órdenes de tareas, **no estas órdenes espaciales**. No basta con pasar los callbacks de este paquete: falta incorporar un endpoint/canal tipado autorizado, mapear la identidad y política del host, publicar invalidaciones y conectar el editor visual. No se han modificado sus archivos ni se ha demostrado esa composición.

La posición persistida de un avatar no acredita conexión. La presentación debe cruzarla con la presencia caducable del transporte; al perder presencia, mostrar desconectado o última posición, no inventar actividad. Las zonas personales se comparten como elementos del juego, nunca como acceso a datos o recursos de su propietario.

## Frontera de confianza

El cliente envía exclusivamente una orden validada. El servidor resuelve `actor_id`, `owner_id`, `kind`, proyecto, capacidades, reloj y control de revocación desde su autenticación/política. No aceptar un `context` recibido por JSON ni conceder capacidades por un botón, sala, nivel RPG o dato declarado por el propio cliente.

`assertAuthorized()` debe ser síncrona, comprobar la autorización vigente y devolver `true`/`undefined` o denegar. Las promesas se rechazan. `signal` cancela por desconexión/revocación. Se revalida después de lecturas y escritura temporal, inmediatamente antes de renombrar y antes de devolver la vista tras la limpieza. Una política externa con consistencia diferida requiere una barrera de revocación equivalente en el host; el módulo no inventa esa garantía.

Solo se permite devolver `spaceView` o el resultado público de `store.execute`. El estado interno conserva recibos y metadatos necesarios para deduplicar, pero no debe exponerse. Los errores usan códigos constantes, sin rutas de disco ni mensajes originales de E/S. La proyección contiene identificadores compartidos de actores/propietarios y etiquetas de salas: incorporarlos a la política de datos y retención antes de uso real. No hay importación de memorias, prompts, sesiones, secretos ni archivos de los propietarios.

## Concurrencia y reintentos

Cada sala tiene su revisión, y cada avatar la suya. Editar otra sala o mover otro avatar no invalida una revisión ajena. Dos cambios incompatibles sobre la misma revisión no se fusionan silenciosamente: el primero confirmado permanece y el segundo recibe conflicto. La UI debe conservar la intención rechazada para que el usuario pueda revisarla.

Los recibos se vinculan al actor autenticado, propietario, clave y hash del comando. Repetir exactamente una orden confirmada devuelve su recibo original sin duplicar el efecto y con una vista actualizada. Cambiar los campos con la misma clave se rechaza. Se comprueban permisos también en reintentos. El formato actual tiene una capacidad explícita de 8192 órdenes: requiere evolución antes de operación continua; no purgar recibos manualmente para ganar espacio.

`STORE_BUSY` permite reintento acotado con la misma clave y orden. `REVISION_CONFLICT` requiere consultar y reconciliar; no aumentar la revisión automáticamente para sobrescribir una decisión ajena. `COMMIT_UNCERTAIN` significa que pudo confirmarse la escritura: consultar o repetir **la misma clave**, jamás tratarlo como una garantía de rollback.

## Persistencia del servidor

El adaptador de archivos exige Linux, un directorio canónico sin enlaces simbólicos, propietario igual al usuario del servicio y permisos 0700. Los archivos son regulares, de un solo enlace y modo 0600. No cambia permisos de directorios existentes para ocultar una mala configuración. La ruta procede exclusivamente de configuración del servidor; los nombres de archivo se derivan del hash del proyecto.

Un archivo de bloqueo creado de forma exclusiva serializa a escritores del mismo proyecto, incluso en procesos diferentes. No se roba un bloqueo por edad. La actualización escribe un temporal en el mismo directorio, sincroniza su contenido y lo cierra; después revalida autorización, renombra de forma síncrona y sincroniza el directorio. No existe un `await` entre la comprobación final y el renombrado. Ese breve tramo bloquea el event loop: una base de datos transaccional será preferible si se necesita más carga o varias réplicas.

Las lecturas reciben el snapshot anterior o el nuevo, nunca un JSON escrito a medias. Antes de servirlo se comprueban estructura, proyecto, revisiones, capacidad, recibos y geometría. Un archivo corrupto, sobredimensionado o inseguro provoca error; no se sobrescribe con un estado vacío. Un archivo ausente se interpreta como un proyecto nuevo: proteger los datos y sus copias sigue siendo responsabilidad operativa.

La confianza en el usuario del servicio y en la administración del servidor es necesaria. No es una sandbox contra procesos maliciosos ejecutados con esa misma identidad. No garantiza sistemas de archivos de red, replicación multihost, cifrado en reposo ni supervivencia a fallos del soporte físico.

Referencias de las primitivas: [documentación oficial de Node.js 22, sistema de archivos](https://nodejs.org/docs/latest-v22.x/api/fs.html). La concurrencia de la aplicación se controla aquí explícitamente; no se presume que dos escrituras asíncronas sean transaccionales.

## Recuperación y retirada

Tras una salida abrupta pueden quedar bloqueo y temporal. Detener el servicio y verificar que no queda **ningún** escritor del proyecto antes de intervenir. Conservar copia de los archivos para diagnóstico; validar el snapshot confirmado. Solo una vez verificado el cese de escritores, retirar el bloqueo/temporal huérfanos y reintentar la orden original con su misma clave. Nunca promover un temporal manualmente: puede proceder de una operación no autorizada o no confirmada.

Las pruebas provocan salidas reales de un proceso antes y después del renombrado, verifican que queda un snapshot completo y que el reintento no duplica muebles. Esto no sustituye una prueba de apagón del servidor o fallo del disco. No hay recuperación automática que pueda crear dos escritores.

Las copias deben incluir el snapshot completo con sus recibos y protegerse con los mismos permisos. Acordar retención, revocación, borrado y rotación de copias antes de incorporar identidades o datos reales. Retirar una PR no borra backups externos. No existe un endpoint remoto de purga o un permiso para borrar datos ajenos.

## Evidencia y trabajo pendiente

Pruebas reproducibles mediante `npm test --prefix packages/office-space`; ejemplo mediante `npm run demo --prefix packages/office-space`. Cubren dos propietarios, conflictos, aislamiento, falsificación de campos, revocación antes del efecto, reinicio, procesos simultáneos, caídas alrededor del commit, archivos corruptos, enlaces y permisos inseguros. Solo datos sintéticos y directorios temporales de la prueba; los procesos lanzados pertenecen exclusivamente al test, nunca al runtime del módulo.

Antes de marcar la oficina completa como terminada faltan: composición real con autenticación/transporte y UI, política de capacidad/retención para uso prolongado, edición visual y accesibilidad, presencia integrada, revisión independiente del SHA, despliegue autorizado, prueba desde ambas redes y aceptación bilateral. El módulo no suple el alta/gestión de agentes, conocimiento/RPG o la cadena de trabajo real de los otros componentes.
