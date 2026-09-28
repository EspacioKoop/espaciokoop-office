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

### Alternativa B — integración mínima, elegida por Eloy

La primera prueba termina al demostrar `requested → accepted → delivered → reviewed` sobre un único repositorio autorizado, con presencia caducable y evidencia real. El estado de tareas se lee inicialmente desde GitHub y la oficina lo representa sin mantener un segundo Kanban. Conocimiento, premios y arrastre operativo pasan a entregas posteriores.

Formulada inicialmente en los análisis de Curro y Odiseo. **Eloy la ha adoptado como posición propia** en su intervención humana del debate ([https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5604666362](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5604666362)), por lo que su procedencia ya no es la de un análisis de agente: es un requisito propuesto por un propietario, con el mismo peso que las preferencias de Varo.

#### Estado de la elección

| Propietario | Posición | Evidencia |
|---|---|---|
| Eloy | Alternativa B | [Intervención humana en #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5604666362) |
| Varo | Pendiente | — |

**El alcance bilateral sigue sin aprobar.** Una sola mitad no autoriza implementación: mientras Varo no confirme B, la combine con parte de A o formule una tercera, no hay alcance de la primera vertical y no se puede construir ni desplegar.

Lo que sí cambia es que la elección de Eloy ya es evidencia enlazable a efectos de la condición de arranque, y que su argumento acota qué queda por decidir. Razón registrada: **la A no se puede verificar**. Sus cuatro entregables —ciclo, lección validada y reutilizada, premio trazable, Kanban con arrastre— pueden estar «hechos» a la vez sin estar conectados entre sí, y no hay forma de notarlo desde fuera; una lección validaría trabajo que aún no se ha medido y un premio recompensaría una entrega cuyo criterio de aceptación todavía se está escribiendo. Eso no falla de forma visible: se queda enseñando números que nadie ha comprobado. La B tiene la propiedad contraria: **su criterio de aceptación es una cadena, no una lista** — o el ciclo pasa de extremo a extremo, o no pasa, y no hay manera de entregar tres cuartas partes y que parezca terminado.

#### Lo que Eloy traslada de la A a la primera entrega

**La asignación con alternativa accesible al arrastre**, y solo eso. No como concesión de alcance: es el único elemento de la lista A que resulta más caro de añadir después que de hacer desde el principio, porque condiciona cómo se estructura la interfaz entera. Conocimiento, premios e historia se cuelgan de un ciclo que ya funciona; un patrón de interacción, no.

## Aceptación negativa

Probar identidad suplantada, destinatario no autorizado, duplicados, mensajes fuera de orden, desconexión, evento caducado, propuesta maliciosa, evidencia inaccesible, presupuesto agotado y revocación. El resultado seguro no puede depender de ocultar información solo en la interfaz.

La revocación durante una tarea activa es un caso P0: después de retirar el acceso, el agente no puede continuar leyendo ni actuando sobre el proyecto; el sistema conserva un estado explícito y auditable de la tarea; y las reglas para retener, transferir o descartar el artefacto parcial impiden exponer datos o simular una entrega válida.

## Decisiones bilaterales abiertas

1. Alojamiento del servicio, acceso privado compartido, autenticación y revocación.
2. Frontera de proyectos, campos y artefactos autorizados para cada agente.
3. Alcance de la primera vertical entre las alternativas anteriores.
4. ~~Fuente de verdad inicial del Kanban y, si procede, dirección de sincronización.~~ **Posición de Eloy: GitHub. La oficina representa, no almacena.** Pendiente de confirmación de Varo — ver más abajo.
5. Momento de incorporar arrastre operativo, conocimiento, premios e historia.
6. Stack de cliente, servidor y adaptadores, después de fijar el contrato y el modelo de autoridad.
7. Agentes concretos del lado de Eloy y ficha de onboarding confirmada por él.
8. Registro de componentes de terceros: fuente, commit, licencia, avisos, modificaciones, uso y estrategia de actualización.

### Orden propuesto por Eloy

Las decisiones **1** (alojamiento, acceso, autenticación y revocación) y **2** (frontera de proyectos y artefactos autorizados) deben cerrarse **antes** que la **6** (stack), y no al revés: el modelo de autoridad condiciona la elección técnica, no a la inversa. Elegir stack primero equivale a decidir el motor antes de saber si el juego es cooperativo.

### Sobre la decisión 4 — fuente de verdad del estado

Regla propuesta por Eloy, importada del simulador, donde la pregunta equivalente («¿sigue siendo jugable si Foundry desaparece?») decide si algo pertenece al núcleo o a la integración:

> **¿Sigue sirviendo la oficina si el Kanban propio desaparece?**

Si la respuesta debe ser sí, la fuente de verdad de tareas es GitHub y la oficina **representa** el estado en vez de almacenarlo. Un segundo Kanban que se sincroniza son, en la práctica, dos Kanbans que se contradicen; y el día que se contradicen ninguno de los dos es fiable.

Esto no cierra la puerta a nada: si más adelante hace falta estado que GitHub no sepa representar, se añade entonces, con el caso concreto delante y no por anticipado.

### Sobre la decisión 8 — registro de componentes de terceros

Eloy la da por acordada tal como está escrita, con un subrayado sobre por qué no es burocracia: una comprobación automática de licencia verifica que el uso esté permitido, **no que la atribución sea cierta**. Un caso real reciente en el repositorio del simulador acreditaba tres paquetes de assets al autor equivocado siendo los archivos libres y la licencia permisiva; lo detectó una persona leyendo el `Readme.txt` incluido en el paquete. Por eso el registro debe recoger **quién lo dice y dónde lo dice**, no solo el identificador de licencia.

## Condición para autorizar el arranque

La fase de definición solo puede darse por cerrada cuando el [debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1) conserve evidencia enlazable de que Varo y Eloy han aceptado la misma alternativa —o una tercera formulación común—. Esa decisión debe fijar, como mínimo:

- alcance incluido y excluido de la primera vertical;
- criterios positivos, negativos y evidencias exigidas para aceptarla;
- fuente de verdad de tareas y estado, con responsables por adaptador y componente común;
- alojamiento, acceso, presupuesto y datos autorizados, sin inferirlos del acceso al repositorio;
- procedimiento de revocación, recuperación y traspaso entre ambos administradores.

El acuerdo se reflejará después en esta especificación y en los documentos técnicos afectados. Una aprobación de PR documental confirma el cambio de texto, pero no sustituye por sí sola la autorización bilateral de implementación.

**Estado de esta condición:** una mitad cubierta. Eloy ha dejado evidencia enlazable de su elección; falta la de Varo. Hasta que exista, la fase de definición **no está cerrada** y no hay autorización de arranque.

## No objetivos del bootstrap

No hay despliegue, nuevos crons, llamadas a modelos, conexión de agentes, cambios en otros repositorios ni importación de memorias. La documentación no equivale a compatibilidad probada.

## Fuentes compartidas

- [Debate director #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1).
- [Preferencias vigentes de Varo](product-preferences-varo.md).
- [Análisis de Curro, agente del entorno de Eloy](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5548366347).
- [Análisis de Odiseo publicado desde el entorno de Eloy](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5548373550).
- [Intervención humana de Eloy: elección de alternativa B](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5604666362).
