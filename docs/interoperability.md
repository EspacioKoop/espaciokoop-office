# Contrato interoperable — propuesta v0.1

Este documento es una especificación inicial, no una API operativa ni una garantía de compatibilidad. Implementación y conformidad pendientes.

## Registro y capacidades

Cada integración declara `adapter_id`, `protocol_versions`, `owner_id`, `team_id`, agentes permitidos y capacidades. La identidad del emisor se vincula a su autenticación; nunca se confía solo en un campo JSON. Nombres de agentes con espacio de nombres por equipo evitan colisiones.

Capacidades negociables: `presence.publish`, `task.request`, `task.accept`, `artifact.share`, `review.submit`, `knowledge.propose`, `knowledge.validate`. Conceder una capacidad requiere política explícita. Un adaptador de observación no recibe ejecución por defecto. Las capacidades no implementadas se rechazan de forma explícita.

## Sobre común

Campos requeridos: `protocol_version`, `event_id`, `event_type`, `occurred_at` (UTC RFC3339), `expires_at`, `team_id`, `agent_id`, `project_id`, `correlation_id`, `visibility`, `payload`.

Para peticiones: `recipient_id`, `task_id`, `idempotency_key`, presupuesto autorizado y plazo. Para respuestas: `in_reply_to`. El servidor añade `received_at` y secuencia canónica; no confía en el reloj del cliente para ordenar efectos.

`visibility` comienza en `project`, nunca público. El esquema rechaza campos adicionales no declarados, tamaños excesivos, proyectos no autorizados y versiones mayores desconocidas. Cada tipo tendrá esquema JSON versionado antes de implementar el transporte.

## Eventos

- `agent.presence`: estado abstracto, caducidad y tarea visible si está autorizada.
- `task.requested`, `task.accepted`, `task.blocked`, `task.delivered`, `task.reviewed`, `task.completed`, `task.cancelled`.
- `help.requested`, `help.responded`: intercambio vinculado a una tarea y limitado por presupuesto/saltos.
- `artifact.shared`: referencia autorizada, tipo, versión y digest cuando esté disponible. Nunca un volcado de conversación.
- `knowledge.proposed`, `knowledge.validated`, `knowledge.reused`, `knowledge.revoked`.
- `reward.granted`, `reward.revoked`, `item.transferred`: el núcleo calcula/autoriza; el agente no se concede premios a sí mismo.

## Transporte propuesto

API HTTPS para publicar eventos y consultar buzones; SSE/WebSocket o polling para novedades. El renderizador no necesita conocer qué herramienta ejecuta el agente. Los adaptadores pueden consultar buzones salientes sin abrir puertos entrantes en los equipos.

Entrega al menos una vez, con deduplicación persistente por emisor/evento. Confirmar recepción no significa aceptar tarea ni completar trabajo. Reintentos acotados con backoff; error estructurado para autorización, conflicto, caducidad, versión o límite de recursos. Estados terminales no se reabren mediante eventos atrasados.

## Aprendizaje y premios

Una lección incluye fuente, proyecto, versión, autor, revisor, evidencia y vigencia. Proponer no escribe automáticamente la memoria de otro agente. Validar no concede ejecución. Reutilizar exige evidencia de una tarea posterior, no un contador.

Un premio referencia una regla versionada y evidencias verificadas; restricción única por contribución/regla, revisión independiente cuando proceda y revocación con historial. Transferir objetos exige propietario válido, consentimiento/política y transacción atómica.

## Conformidad

Los dos adaptadores deben pasar el mismo conjunto de pruebas con datos sintéticos, incluyendo duplicación, reconexión, suplantación, permisos, límites y revocación. Después se realiza una prueba bilateral con un agente real autorizado de cada equipo. Solo entonces se declara la combinación concreta compatible.
