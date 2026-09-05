# Cooperación entre propietarios y agentes

Guía documental derivada de la [guía de organización publicada en #4](https://github.com/EspacioKoop/espaciokoop-office/issues/4). No autoriza desarrollo, conecta agentes ni define la fuente de tareas de la futura aplicación. La definición de producto sigue abierta entre Varo y Eloy.

Se aplica junto a [Contribuir](../CONTRIBUTING.md), las [reglas para agentes](../AGENTS.md) y [Seguridad](../SECURITY.md). Una aportación de agente es su análisis o propuesta: no representa por sí sola la opinión ni la autorización de su propietario.

## Dónde va cada aportación

| Lugar | Contenido y frontera |
|---|---|
| [Debate director #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1) | Visión, requisitos humanos, decisiones y desacuerdos de ambos equipos. No convertirlo en una cola de implementaciones. |
| [Investigación](research/README.md) | Referencias públicas, revisiones consultadas y propuestas de reutilización. Estudiado no significa adoptado, ejecutado o integrado. |
| [Gestión de agentes #3](https://github.com/EspacioKoop/espaciokoop-office/issues/3) | Definición de alta, conexión, configuración y ciclo de vida. No permiso para crear agentes o alterar entornos. |
| [Cooperación #4](https://github.com/EspacioKoop/espaciokoop-office/issues/4) | Coordinación de esta guía, etiquetas, reservas y revisiones. |
| Issue acotada | Una propuesta, decisión o unidad de trabajo con alcance y aceptación. Implementación solo cuando esté autorizada. |
| PR | Candidato concreto de archivos, evidencia y revisión del SHA exacto; no acuerdo humano implícito. |

Enlazar el origen y los documentos afectados en lugar de duplicar el debate entero. El estado vivo de una reserva o revisión se consulta en su issue/PR: esta guía no mantiene otra lista de tareas ni automatiza su ejecución.

## Etiquetas: describir, no ordenar

Los grupos documentados en #4 son:

| Grupo | Etiquetas |
|---|---|
| Tipo | `type:discussion`, `type:research`, `type:decision` |
| Estado | `status:definition`, `status:awaiting-review`, `status:blocked` |
| Área | `area:product`, `area:office`, `area:interoperability`, `area:knowledge`, `area:progression`, `area:history`, `area:collaboration` |
| Prioridad | `priority:p0`, `priority:p1`, `priority:p2` |
| Estándar de uso habitual | `documentation`, `bug`, `enhancement`, `accessibility` |

Elegir un estado principal coherente y las áreas pertinentes. Actualizar o retirar el estado pendiente cuando se resuelva la revisión o el bloqueo. No asignar prioridad a toda idea ni confundir las P1/P2/P3 **de estudio** del catálogo con prioridades de ejecución acordadas.

Las etiquetas son declarativas: no disparan agentes, crons, publicaciones ni despliegues. Una etiqueta no sustituye alcance, autorización, evidencia o aceptación. Consultar las etiquetas disponibles en el repositorio antes de usarlas; esta guía no crea ni modifica ninguna.

## Proponer sin dar decisiones por cerradas

```text
Autor / equipo / humano o agente:
Objetivo y origen (enlace):
Qué proponemos y alternativas:
Evidencia y referencias:
Qué falta decidir y quién debe acordarlo:
Criterio de cierre:
Fuera de alcance:
```

Registrar las alternativas y los desacuerdos. No inventar fechas, compromisos, opiniones de otro equipo ni conformidad por silencio. Las decisiones de producto corresponden a Varo y Eloy; cada propietario autoriza sus recursos. Solicitar colaboración no equivale a que el destinatario la haya aceptado.

## Reservar una unidad autorizada

Antes de editar, leer los contratos aplicables, el estado local, las issues, las PR y sus comentarios/revisiones. Comprobar si ya existe una contribución equivalente o una reserva que afecte a los mismos archivos.

Dejar en la issue correspondiente una reserva con esta información:

```text
Objetivo / issue de origen:
Responsable que acepta / equipo:
Revisor solicitado (aceptación pendiente o enlace a su aceptación):
Alcance y recursos autorizados / origen de la autorización:
Archivos o componente reservado:
Rama o PR cuando exista:
Dependencias y bloqueos:
Criterios de aceptación:
Evidencia a entregar:
Límites, parada y recuperación:
```

- Un escritor por recurso y tarea, con rama o worktree propio. Una reserva no concede acceso adicional ni propiedad exclusiva indefinida sobre un documento.
- No sobrescribir cambios locales desconocidos ni ramas ajenas. Ante solapamiento, coordinar el reparto antes de continuar o elegir una unidad realmente independiente.
- No asignar unilateralmente trabajo a Eloy o sus agentes. Identificar al responsable que ha aceptado y distinguirlo del revisor al que se invita.
- Volver a consultar la actividad justo antes de publicar: una contribución equivalente puede haber aparecido durante el trabajo.
- Si cambia el alcance o se interrumpe la tarea, dejar constancia del candidato, el bloqueo y lo que queda reservado o liberado; no presentar un abandono como finalización.

## Entregar, revisar y cerrar sin confundir estados

Usar la [plantilla de PR](../.github/pull_request_template.md) e incluir:

```text
Issue / alcance autorizado:
Cambios y archivos afectados:
Candidato (head SHA completo):
Verificación real y evidencia:
Revisión independiente solicitada / resultado y SHA revisado:
Limitaciones y aceptación pendiente:
Reversibilidad:
```

1. Revisar el diff final y comprobar lo aplicable. Para documentación, registrar enlaces, estructura, coherencia y ausencia de contenido privado; no exigir un playtest inexistente ni afirmar compatibilidad o runtime probado.
2. Publicar el candidato y solicitar expresamente revisión independiente. Leer de vuelta la PR, su cuerpo, SHA y revisores solicitados para comprobar que la solicitud quedó registrada.
3. Evaluar el SHA exacto. Si cambia, identificar y volver a comprobar la evidencia afectada; no repetir controles válidos sin motivo. Una autorrevisión no es aprobación independiente.
4. No fusionar con revisión requerida pendiente, cambios solicitados, pruebas aplicables incompletas o aceptación requerida pendiente. Una revisión documental tampoco sustituye el acuerdo de producto de ambos propietarios.
5. Tras la integración autorizada, verificar qué se incorporó y actualizar el estado de la reserva y las etiquetas pertinentes. Cerrar una issue solo cuando cumpla sus propios criterios; una PR parcial puede dejarla abierta.

No usar `Closes #1` en incrementos documentales, investigación u organización. Preferir referencias sin cierre automático cuando el cambio solo avanza una parte de #1, #3 o #4. Publicar, solicitar revisión, aprobar, integrar y aceptar producto son estados distintos.

## Qué evidencia se puede compartir

Solo producto, contratos, investigación pública y artefactos expresamente compartibles. Mantener fuera inventarios internos, configuraciones, credenciales, prompts, conversaciones completas, memorias y análisis privados. Una comprobación local no requiere publicar los datos privados usados ni pedir acceso a máquinas del otro propietario.

Describir qué se comprobó, sobre qué candidato y con qué resultado y limitaciones, usando referencias públicas o datos sintéticos cuando proceda. Si aparece contenido sensible, detener el flujo afectado y seguir [Seguridad](../SECURITY.md), sin reproducirlo en comentarios o logs públicos.
