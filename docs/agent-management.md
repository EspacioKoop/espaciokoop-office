# Gestión de agentes — contrato de definición

**Estado:** propuesta documental vinculada al [issue #3](https://github.com/EspacioKoop/espaciokoop-office/issues/3). No hay adaptador de gestión implementado, agentes conectados ni autorización de despliegue. El catálogo final y el reparto por entregas requieren acuerdo de Varo y Eloy.

## Propósito y límites

Office debe poder dar de alta, conectar y gestionar agentes mediante operaciones tipadas y verificables. No será una consola shell, un editor genérico de perfiles ni un explorador de máquinas. Cada propietario conserva la autoridad sobre sus agentes, credenciales, entornos y presupuesto.

Hermes es la integración solicitada para el lado de Varo. Otros runtimes pueden ofrecer menos capacidades sin fingir compatibilidad. Un formulario visible, un avatar o un registro en Office no prueban que exista una ejecución real.

Quedan fuera de esta definición la creación efectiva de perfiles, la conexión a entornos reales, los cambios de credenciales, la elección de stack y el despliegue.

## Trazabilidad con el issue #3

| Requisito | Cobertura en este documento |
|---|---|
| `AGENT-01` — alta guiada | Capacidades y flujo «Crear un agente» |
| `AGENT-02` — conectar existentes | Entidades y flujo «Conectar un agente existente» |
| `AGENT-03` — gestión de conectados | Estado multidimensional y garantías de interfaz |
| `AGENT-04` — edición y parámetros | `agent.config.*`, validación por capacidad y decisiones pendientes |
| `AGENT-05` — cambios efectivos y recuperables | Estado de operación, lectura posterior, idempotencia y rollback |
| `AGENT-06` — ciclo de vida | Capacidades `agent.lifecycle.*` y separación entre desconectar, parar, retirar y borrar |
| `AGENT-07` — experiencia integrada | Garantías de interfaz y alternativa accesible al arrastre |
| `AGENT-08` — extensibilidad | Catálogo por adaptador y rechazo explícito de operaciones no soportadas |

## Entidades que no deben confundirse

| Entidad | Significado | Fuente de verdad propuesta |
|---|---|---|
| Identidad de agente | Registro estable, propietario, equipo, nombre visible y proyectos permitidos | Núcleo de Office, vinculado a identidad autenticada |
| Perfil local | Configuración que interpreta un runtime concreto | Entorno y adaptador del propietario |
| Ejecución | Proceso o sesión efímera que realiza trabajo | Runtime local |
| Conexión | Canal entre Office y un adaptador | Adaptador y núcleo, con antigüedad visible |
| Avatar | Representación de juego y estado autorizado | Office; nunca concede capacidades |

Un agente puede estar registrado sin conexión, conectado sin ejecución activa o tener varias ejecuciones históricas sin convertirse en varias identidades.

## Capacidades declaradas

Cada adaptador publicará versión y capacidades admitidas. El núcleo rechazará una operación ausente en el catálogo efectivo; la interfaz la mostrará como no disponible, no como un botón que falla después.

| Capacidad propuesta | Operación permitida | No implica |
|---|---|---|
| `agent.register` | Vincular un agente existente tras comprobar identidad y propietario | Descubrir todos los perfiles del equipo |
| `agent.create` | Crear un agente mediante una plantilla autorizada | Clonar credenciales, memoria o permisos de otro agente |
| `agent.config.read` | Leer campos expresamente compartibles y su versión efectiva | Leer ficheros completos o secretos |
| `agent.config.write` | Cambiar campos admitidos por política y adaptador | Editar cualquier parámetro local |
| `agent.lifecycle.start` | Solicitar una ejecución cuando runtime y política lo permitan | Crear un servicio permanente |
| `agent.lifecycle.pause` | Pausar cuando exista soporte verificable | Garantizar coste cero ni detener procesos ajenos |
| `agent.lifecycle.resume` | Reanudar una ejecución pausada | Arrancar procesos que estaban detenidos |
| `agent.lifecycle.stop` | Detener una ejecución conforme a la política de tareas en curso | Desconectar Office ni borrar estado local |
| `agent.lifecycle.disconnect` | Desvincular el canal con Office | Parar o borrar el agente local |
| `agent.lifecycle.retire` | Retirar el registro compartido conforme a retención acordada | Desinstalar runtime o borrar datos locales |

Los nombres son una propuesta de contrato, no una API aprobada. Deben reconciliarse con el [contrato interoperable](interoperability.md) antes de versionar esquemas.

## Estado multidimensional

No se usará una sola etiqueta como «activo» para ocultar estados distintos. Office mostrará por separado:

1. **Registro:** `registered` o `retired`.
2. **Conexión:** `disconnected`, `connecting`, `online` o `stale`.
3. **Ejecución:** `unknown`, `idle`, `busy`, `paused`, `stopped` o `error`.
4. **Política de estasis:** `active` o `frozen`.
5. **Antigüedad:** instante de última confirmación y versión del adaptador.

`online` solo confirma el canal. `busy` necesita una tarea identificable que sea visible para ese proyecto. `frozen` significa que el adaptador rechaza nuevas llamadas dentro del alcance suspendido; no se deduce de una animación, un heartbeat ausente o un texto del agente. Si el adaptador no puede garantizarlo, declarará la estasis como no soportada.

## Estado de una operación de gestión

Cada cambio tendrá `operation_id`, idempotencia, actor autenticado, objetivo, versión esperada, capacidad, campos permitidos y resultado saneado.

```text
requested
  → validating
      → rejected
      → applying
          → applied
          → failed
          → rolled_back
```

- `requested`: Office ha registrado la intención; no afirma efectos.
- `validating`: se comprueban autoridad, versión, capacidad, presupuesto, tarea en curso y límites.
- `rejected`: no hubo aplicación; se informa un motivo seguro.
- `applying`: el adaptador aceptó el intento, todavía sin éxito confirmado.
- `applied`: el adaptador leyó de vuelta el estado efectivo esperado.
- `failed`: no se alcanzó el estado esperado; conserva evidencia y estado anterior conocido.
- `rolled_back`: se verificó la restauración conforme a una política previamente acordada.

Un timeout o una desconexión durante `applying` deja resultado `unknown` hasta reconciliar por `operation_id`; no se reintenta como una operación nueva ni se muestra como fallo sin efectos.

## Flujos mínimos

### Conectar un agente existente

1. El propietario elige un entorno previamente autorizado; no hay descubrimiento global.
2. El adaptador presenta identidad local, versión y capacidades saneadas.
3. Office comprueba que la vinculación no duplica otra identidad ni amplía proyectos.
4. El propietario confirma los campos compartibles y la política aplicable.
5. Office registra la identidad y lee de vuelta conexión y capacidades efectivas.

### Crear un agente

1. Se parte de una plantilla versionada y expresamente compartible.
2. La interfaz solo ofrece campos que `agent.create` admite en ese adaptador.
3. El backend valida propietario, destino, nombre, proyectos, modelo permitido, herramientas, límites y colisiones.
4. El adaptador crea el perfil o equivalente sin arrancar servicios no solicitados.
5. Office comprueba la identidad real y separa creación de registro, conexión y arranque.
6. Un fallo conserva la versión anterior y permite recuperar sin borrar otros perfiles.

## Escrituras, tareas en curso y recuperación

- Un único escritor efectivo por agente y versión de configuración. Las ediciones usan control optimista; una versión obsoleta produce conflicto visible.
- Cambiar de proyecto, herramientas, modelo o límites no interrumpe una tarea en curso salvo política explícita. La interfaz ofrece aplicar después, cancelar de forma segura o rechazar la edición.
- Desconectar, parar, retirar y borrar son operaciones distintas. Office no incluirá borrado local dentro de `disconnect` o `retire`.
- Credenciales se mantienen localmente mediante referencias opacas. No aparecen en respuestas, eventos, historial, exportaciones ni artefactos de error.
- Reintentos usan el mismo `operation_id`. La lectura de estado reconcilia resultados inciertos antes de intentar otra escritura.
- Un cambio que requiera nueva sesión o reinicio se marca como pendiente; no corta silenciosamente un servicio protegido.

## Garantías de interfaz

La ficha de gestión mostrará propietario, runtime/adaptador y versión, conexión, ejecución, estasis, tarea visible, última confirmación y operaciones disponibles. Distinguirá valor editado, valor aceptado y valor efectivo.

Toda operación tendrá alternativa a arrastrar, navegación por teclado y explicación textual del resultado. Los errores de autorización no revelarán qué agentes, perfiles o parámetros existen fuera del alcance del usuario.

## Matriz mínima de aceptación

| Caso | Resultado exigido |
|---|---|
| Alta autorizada con plantilla válida | Identidad real comprobada; registro único; ningún servicio extra |
| Conexión repetida del mismo agente | Devuelve la misma identidad o conflicto explícito; no duplica ejecución |
| Capacidad ausente | Control no disponible y petición rechazada sin efectos |
| Actor intenta editar un agente ajeno | Rechazo sin filtrar configuración ni existencia fuera de su visibilidad |
| Edición sobre versión obsoleta | Conflicto; no sobrescribe el cambio vigente |
| Adaptador cae durante `applying` | Estado incierto visible y reconciliación idempotente al volver |
| Cambio incompatible con tarea en curso | Se difiere o rechaza según política; conserva tarea y artefactos |
| Estasis soportada | Nuevas llamadas bloqueadas por el adaptador y estado leído de vuelta |
| Estasis no soportada | Operación ausente; no se simula mediante estado visual |
| Retirada del registro | Office deja de mostrarlo según retención; no borra perfil local |
| Error de validación o aplicación | Sin secretos en UI, eventos, logs compartidos o exportaciones |

Las pruebas usarán primero fixtures sintéticos por adaptador. La conformidad sintética, la integración real, el despliegue y la aceptación de ambos propietarios se informarán por separado.

## Decisiones conjuntas pendientes

Varo y Eloy deben acordar el catálogo final de campos y capacidades, roles administrativos, política de estasis, retención, aislamiento, tratamiento de tareas en curso, creación frente a plantillas, compatibilidad mínima por adaptador y reparto por fases. Ninguna de estas decisiones se considera resuelta por esta propuesta ni por el silencio de una parte.
