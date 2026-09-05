# Preferencias de producto de Varo — ronda interactiva

**Origen: respuestas directas de Varo. Estado: preferencias explícitas de un propietario, pendientes de acuerdo con Eloy.** No son una decisión bilateral ni autorización para desarrollar, instalar, conectar agentes, conceder permisos o gastar.

## Respuestas literales

1. **Protagonista al abrir la app:** «Equilibrio: oficina viva y gestión real, pudiendo alternar entre ambas vistas».
2. **Dirección visual:** «2D isométrico con pixel art cuidado, estilo Game Dev Tycoon».
3. **Primera versión utilizable:** «Lo anterior, incluyendo una habilidad compartida y un premio verificable».
4. **Iniciativa de sus agentes:** «Tomar también tareas elegibles de proyectos autorizados, con límites y reglas previamente acordados».
5. **Progresión:** «Más cercana a un RPG: especialidades, inventario, fabricación e intercambio de objetos».

## Interpretación para concretar requisitos

### PREF-01 — Dos vistas del mismo estado

Oficina viva y gestión real equilibradas, con posibilidad de alternar. No dos fuentes de verdad: ficha, Kanban, escena y evidencias representan el mismo estado confirmado.

### PREF-02 — Pixel art isométrico

La preferencia de Varo es 2D isométrico con pixel art cuidado, inspirado en Game Dev Tycoon. No supone elegir todavía motor ni incorporar assets ajenos sin licencia.

### PREF-03 — Primera entrega completa de colaboración

La pregunta presentó opciones acumulativas: tarea bilateral real y oficina sencilla visitable; añadir Kanban/arrastre; añadir habilidad compartida/premio. Varo eligió la tercera. Se registra como objetivo de primera versión:

- tarea real entre ambos equipos con entrega, revisión y evidencia;
- oficina visitable que represente su estado auténtico;
- Kanban y asignación operativa mediante arrastre;
- habilidad/conocimiento compartido validado y reutilizado;
- premio verificable y trazable.

**Diferencia abierta con el debate:** Curro y Odiseo propusieron una primera entrega menor y posponer varias de estas capacidades. Es una propuesta de secuenciación, no una reducción aceptada por Varo. Debe acordarse con ambos sin borrar requisitos. Se pueden construir internamente incrementos técnicos; eso no convierte un subconjunto en la primera versión pedida.

### PREF-04 — Autonomía acotada sobre tareas elegibles

Los agentes de Varo podrán tomar tareas elegibles de proyectos autorizados conforme a límites y reglas previamente acordados. Deben definirse elegibilidad, reserva, prioridad, capacidades, concurrencia, presupuesto, cancelación y recuperación. No autoriza crear trabajo ilimitado ni controlar agentes de Eloy. Las solicitudes a agentes ajenos dependen de las políticas de su propietario.

### PREF-05 — Progresión tipo RPG

Especialidades, inventario, fabricación e intercambio de objetos. Pendiente acordar qué objetos son cosméticos, qué recetas/materiales tienen sentido y cómo se relacionan con contribuciones verificadas. No se presuponen dinero real, castigos por inactividad, aumento de autoridad por nivel o aprendizaje real por fabricar un objeto.

Distinguir habilidad técnica demostrada de especialidad/objeto lúdico. Las recompensas operativas derivan de evidencias aceptadas, no de volumen de mensajes ni autoevaluación. Fabricación e intercambio requieren consistencia e idempotencia para no duplicar objetos.

## Propiedad, visitas e interacción

Se mantiene la petición de Varo recogida en la sección 10 del [debate](https://github.com/EspacioKoop/espaciokoop-office/issues/1): cada propietario gestiona sus agentes; ambos pueden ver y visitar lo incorporado al espacio común y solicitar acciones con agentes ajenos, con interacción contextual inspirada en Los Sims. Visitar/solicitar no equivale a gestionar recursos ajenos ni acceder a datos no compartidos.

## Siguiente acuerdo conjunto

Eloy puede confirmar, matizar o proponer alternativas de producto y secuencia. Estas preferencias deben integrarse en requisitos, arquitectura, contrato y plan de validación **cuando exista acuerdo**, preservando trazabilidad y desacuerdos. No modificar permisos ni cerrar la definición por silencio.
