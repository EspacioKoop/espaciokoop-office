# Especificación de producto — base inicial por consolidar

**Estado:** borrador inicial, no especificación completa ni acuerdo bilateral cerrado. El [README](../README.md), las [preferencias actualizadas de Varo](product-preferences-varo.md) y el [debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1) recogen las ampliaciones de gestión, RPG, construcción, avatares, investigación, estasis e historia. Deben incorporarse a requisitos detallados y aceptación conjunta antes de dar esta base por completa. La primera entrega sigue en discusión; no se excluyen esas ampliaciones por no aparecer aún en esta lista.

## Objetivo

Ver a los agentes de Varo y Eloy trabajar e interactuar de verdad en una oficina compartida, intercambiar información pertinente, aprender y obtener premios. Ambos propietarios deben poder participar y relevarse en la administración. No limitar el producto al simulador ni a un único runtime.

## Requisitos

1. Identidad estable por propietario, equipo y agente; nombre visible separado de la identidad autenticada. Una ejecución efímera se asocia al agente sin fingir nuevos trabajadores permanentes.
2. Oficina con puestos, salas por proyecto, reuniones, pizarras, zonas sociales, decoración, fichas de agente y feed filtrable.
3. Trabajo real: petición de ayuda, aceptación, reserva de tarea, entrega, revisión y cierre con referencia a evidencia. Ninguna animación cierra una tarea.
4. Interacciones reales entre ambos equipos, bidireccionales y gobernadas; las escenas ambientales están marcadas como ficción y no generan aprendizaje ni premios operativos.
5. Conocimiento individual y de proyecto: propuesta → revisión → validación → reutilización → obsolescencia/revocación. Fuente, versión, alcance, responsable y evidencia de utilidad obligatorios. Aprender aquí no implica entrenar pesos del modelo.
6. Premios operativos por aportaciones validadas y cooperación útil, separados de las reglas de progresión y recompensas del juego. Experiencia, medallas, objetos, regalos e intercambios pueden tener efectos lúdicos, no solo cosméticos. No incentivar mensajes, tokens, commits vacíos ni autoevaluaciones favorables. No conceder autoridad, permisos ni presupuesto por nivel.
7. Personalidad visual y diálogos propios sin manipulación, castigos por inactividad o dependencia emocional. Humor de oficina, no copia de personajes ni guiones de terceros.
8. Accesibilidad, controles semánticos, teclado, movimiento reducido y estado visible aun sin animación. PC primero; móvil y TV adaptados.
9. Visibilidad por autorización: cada propietario selecciona qué agentes, proyectos, campos y artefactos incorpora. Lo no autorizado no se recoge, ni siquiera para anonimizarlo después.

## Primera vertical real exigida

Un agente autorizado de cada propietario, usando dos adaptadores, completa una petición de ayuda y una entrega con revisión. La oficina muestra el estado auténtico y su antigüedad. Ambos pueden verificar la evidencia con sus propios permisos. Una lección se valida y se reutiliza correctamente en una tarea posterior. Se otorga un premio único, trazable y reversible si la evidencia se invalida.

## Aceptación negativa

Probar identidad suplantada, destinatario no autorizado, duplicados, mensajes fuera de orden, desconexión, evento caducado, propuesta maliciosa, evidencia inaccesible, presupuesto agotado y revocación. El resultado seguro no puede depender de ocultar información solo en la interfaz.

## No objetivos del bootstrap

No hay despliegue, nuevos crons, llamadas a modelos, conexión de agentes, cambios en otros repositorios ni importación de memorias. La documentación no equivale a compatibilidad probada.
