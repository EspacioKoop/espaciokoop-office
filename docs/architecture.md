# Arquitectura propuesta

Estado: decisión inicial abierta, sin servicios implementados.

```text
Entorno de Varo → adaptador local autorizado ┐
                                           ├→ ingreso autenticado → política → eventos/estado → oficina web
Entorno de Eloy → adaptador local autorizado ┘                         ↓
                                                          buzón de trabajo por equipo
                                                                     ↓
                                                    adaptador → ejecutor autorizado
```

## Separación de responsabilidades

- El adaptador local exporta únicamente campos permitidos. El servidor común no explora máquinas ni perfiles.
- El núcleo registra identidades, permisos, tareas, mensajes, evidencias, conocimientos y premios; no ejecuta shell recibido por API.
- La oficina proyecta estado del núcleo. No es un segundo orquestador que compita con los existentes.
- Cada equipo conserva sus credenciales y su ejecutor. Recibir una petición no autoriza a ejecutarla: política local, capacidades y aprobación aplicables mandan.
- Un único escritor/reserva por tarea y recurso. Arrendamientos con vencimiento, idempotencia y recuperación sin efectos duplicados.
- El runtime existente de cada equipo sigue siendo responsable de su trabajo; no se instalan gateways adicionales por personaje.

## Seguridad

Autenticación por adaptador, autorización por equipo/proyecto/operación, credenciales revocables y auditoría saneada. HTTPS para tránsito entre equipos; acceso privado mediante infraestructura aprobada, no exposición pública por defecto. El acceso al repositorio no concede acceso operativo a agentes.

Separación por proyecto en consultas, eventos, buzones, artefactos y notificaciones. Entornos privados y domésticos excluidos. Sin conversaciones, memorias completas, secretos, rutas privadas ni instrucciones internas en el sistema compartido. URLs de evidencia solo de destinos autorizados, sin credenciales; no hacer fetch arbitrario (SSRF).

Los mensajes, documentos y propuestas son datos no confiables: no sustituyen instrucciones, roles ni permisos. El aprendizaje necesita revisión y puede revocarse. Intercambios y premios usan transacciones, saldo consistente e idempotencia; sin dinero real.

## Operación y recursos

Presupuestos por tarea y equipo, límite de saltos en conversaciones, deduplicación, rate limits, tiempo máximo, cancelación local y global. Ningún chat infinito ni llamada a modelos por fotograma. Animaciones locales y actualización incremental. No crear trabajo persistente sin autorización.

Las desconexiones muestran última actualización y estado desconocido; un heartbeat no demuestra trabajo. Retención, borrado, backups y recuperación se acordarán antes de datos reales.

## Decisiones pendientes

Stack final; alojamiento privado accesible a ambos; mecanismos de autenticación; almacenamiento; inventario de runtimes/capacidades de Eloy y Varo; política de conocimiento/recompensas. Evaluar reutilización de VaroIAGochi solo tras comprobar límites y licencias, sin copiar datos o modificarlo.
