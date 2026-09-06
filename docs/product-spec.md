# Especificación de producto — base bilateral por consolidar

**Estado:** borrador, no especificación completa ni acuerdo bilateral cerrado. El [README](../README.md), las [preferencias actualizadas de Varo](product-preferences-varo.md) y el [debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1) recogen las ampliaciones de gestión, RPG, construcción, avatares, investigación, estasis e historia. Deben incorporarse a requisitos detallados y aceptación conjunta antes de dar esta base por completa.

## Objetivo

Ver a los agentes de Varo y Eloy trabajar e interactuar de verdad en una oficina compartida, intercambiar información pertinente, aprender y obtener premios. Ambos propietarios deben poder participar y relevarse en la administración. No limitar el producto al simulador ni a un único runtime.

## Regla de interpretación y procedencia

- Las preferencias de Varo son requisitos propuestos por Varo; no representan por sí solas un acuerdo de Eloy.
- Los análisis de Curro y Odiseo publicados desde la cuenta de Eloy son aportaciones de agentes de su entorno. Sus propios textos indican que no sustituyen la opinión ni la autorización de Eloy.
- La coincidencia entre propuestas es una señal útil para preparar una decisión, no una decisión humana cerrada.
- Solo una confirmación explícita de Varo y Eloy convierte una alternativa bilateral en alcance autorizado de implementación. Hasta entonces se permite consolidar documentación, no construir ni desplegar el producto.

## Requisitos candidatos del producto completo

1. Identidad estable por propietario, equipo y agente; nombre visible separado de la identidad autenticada. Una ejecución efímera se asocia al agente sin fingir nuevos trabajadores permanentes.
2. Oficina con puestos, salas por proyecto, reuniones, pizarras, zonas sociales, decoración, fichas de agente y feed filtrable.
3. Trabajo real: petición de ayuda, aceptación, reserva de tarea, entrega, revisión y cierre con referencia a evidencia. Ninguna animación cierra una tarea.
4. Interacciones reales entre ambos equipos, bidireccionales y gobernadas; las escenas ambientales están marcadas como ficción y no generan aprendizaje ni premios operativos.
5. Conocimiento individual y de proyecto: propuesta → revisión → validación → reutilización → obsolescencia/revocación. Fuente, versión, alcance, responsable y evidencia de utilidad obligatorios. Aprender aquí no implica entrenar pesos del modelo.
6. Premios operativos por aportaciones validadas y cooperación útil, separados de las reglas de progresión y recompensas del juego. Experiencia, medallas, objetos, regalos e intercambios pueden tener efectos lúdicos, no solo cosméticos. No incentivar mensajes, tokens, commits vacíos ni autoevaluaciones favorables. No conceder autoridad, permisos ni presupuesto por nivel.
7. Personalidad visual y diálogos propios sin manipulación, castigos por inactividad o dependencia emocional. Humor de oficina, no copia de personajes ni guiones de terceros.
8. Accesibilidad, controles semánticos, teclado, movimiento reducido y estado visible aun sin animación. PC primero; móvil y TV adaptados.
9. Visibilidad por autorización: cada propietario selecciona qué agentes, proyectos, campos y artefactos incorpora. Lo no autorizado no se recoge, ni siquiera para anonimizarlo después.

## Primera vertical real: alternativas pendientes de acuerdo

Las dos alternativas comparten un núcleo: identidad de un agente autorizado por propietario, petición, aceptación, entrega, revisión, evidencia verificable, estado auténtico y aislamiento por proyecto. Difieren en el alcance que debe demostrarse antes de considerar terminada la primera entrega.

### Alternativa A — experiencia acumulativa propuesta por Varo

Dos adaptadores completan el ciclo bilateral y la oficina lo representa. La vertical incluye además una lección validada y reutilizada, un premio trazable y reversible, Kanban visitable y asignación operativa con alternativa accesible al arrastre.

### Alternativa B — integración mínima propuesta por Curro y Odiseo

La primera prueba termina al demostrar `requested → accepted → delivered → reviewed` sobre un único repositorio autorizado, con presencia caducable y evidencia real. El estado de tareas se lee inicialmente desde GitHub y la oficina lo representa sin mantener un segundo Kanban. Conocimiento, premios y arrastre operativo pasan a entregas posteriores.

Ninguna alternativa está aprobada como alcance bilateral. Elegir una, combinarlas o definir una tercera requiere confirmación explícita de Varo y Eloy.

## Aceptación negativa

Probar identidad suplantada, destinatario no autorizado, duplicados, mensajes fuera de orden, desconexión, evento caducado, propuesta maliciosa, evidencia inaccesible, presupuesto agotado y revocación. El resultado seguro no puede depender de ocultar información solo en la interfaz.

La revocación durante una tarea activa es un caso P0: después de retirar el acceso, el agente no puede continuar leyendo ni actuando sobre el proyecto; el sistema conserva un estado explícito y auditable de la tarea; y las reglas para retener, transferir o descartar el artefacto parcial impiden exponer datos o simular una entrega válida.

## Decisiones bilaterales abiertas

1. Alojamiento del servicio, acceso privado compartido, autenticación y revocación.
2. Frontera de proyectos, campos y artefactos autorizados para cada agente.
3. Alcance de la primera vertical entre las alternativas anteriores.
4. Fuente de verdad inicial del Kanban y, si procede, dirección de sincronización.
5. Momento de incorporar arrastre operativo, conocimiento, premios e historia.
6. Stack de cliente, servidor y adaptadores, después de fijar el contrato y el modelo de autoridad.
7. Agentes concretos del lado de Eloy y ficha de onboarding confirmada por él.
8. Registro de componentes de terceros: fuente, commit, licencia, avisos, modificaciones, uso y estrategia de actualización.

## Condición para autorizar el arranque

La fase de definición solo puede darse por cerrada cuando el [debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1) conserve evidencia enlazable de que Varo y Eloy han aceptado la misma alternativa —o una tercera formulación común—. Esa decisión debe fijar, como mínimo:

- alcance incluido y excluido de la primera vertical;
- criterios positivos, negativos y evidencias exigidas para aceptarla;
- fuente de verdad de tareas y estado, con responsables por adaptador y componente común;
- alojamiento, acceso, presupuesto y datos autorizados, sin inferirlos del acceso al repositorio;
- procedimiento de revocación, recuperación y traspaso entre ambos administradores.

El acuerdo se reflejará después en esta especificación y en los documentos técnicos afectados. Una aprobación de PR documental confirma el cambio de texto, pero no sustituye por sí sola la autorización bilateral de implementación.

## No objetivos del bootstrap

No hay despliegue, nuevos crons, llamadas a modelos, conexión de agentes, cambios en otros repositorios ni importación de memorias. La documentación no equivale a compatibilidad probada.

## Fuentes compartidas

- [Debate director #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1).
- [Preferencias vigentes de Varo](product-preferences-varo.md).
- [Análisis de Curro, agente del entorno de Eloy](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5548366347).
- [Análisis de Odiseo publicado desde el entorno de Eloy](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5548373550).
