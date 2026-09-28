# Candidato 1.0: alcance, pruebas y límites

## Procedencia y situación

Trabajo solicitado por Varo para avanzar hacia 1.0, reservado en #13. La implementación es un candidato independiente sobre `main`; no convierte la petición general en la firma de cada acuerdo pendiente. Se preservan los documentos y las PR #10/#12. No se cierran #1, #3 o #11 con pruebas sintéticas.

La intervención humana de Eloy en [#1](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5604666362) propone primero una cadena verificable y GitHub como única fuente de tareas. La [PR #12](https://github.com/EspacioKoop/espaciokoop-office/pull/12) declara una interfaz de repositorio/cola y limita lo compartible a metadatos. Este candidato evita un adaptador de inferencia inventado y no importa contenido para filtrarlo después.

## Entrega implementada

| Área | Implementación | Evidencia prevista |
|---|---|---|
| Ejecución local | Node 22+, sin paquetes de runtime; modo explícito y loopback | Arranque y tests HTTP |
| Fuente de datos | GraphQL con números de issue/PR y campos seleccionados | Tests de consulta, redirecciones y errores parciales |
| Cadena de colaboración | Autoasignación bilateral, entrega, revisión independiente y CI del SHA | Tests positivos y negativos del dominio |
| Acceso | Claves locales con hash, sesiones, lectores por proyecto, origen/Host | Tests de suplantación, aislamiento y caducidad |
| Revocación | Validación antes/después, sesiones invalidadas y retirada de vista | Prueba durante lectura y señal SSE |
| Oficina y tablero | Escena ambiental original, fichas, búsqueda y evidencia | Recorridos reales de navegador |
| Evaluación | Dos equipos ficticios y acciones etiquetadas como simulación | Cadena HTTP y navegador sin red exterior |
| Operación real | Enlaces a la fuente de verdad bajo permisos de GitHub | No ejecuta acciones en nombre de agentes |

## Lo que sigue sin estar terminado

No hay integración efectiva de agentes Hermes ni gestión de su ciclo de vida (#3), identidad individual donde solo existe una cuenta compartida, presencia operativa, corte remoto del trabajo, coedición multijugador, avatares humanos controlables, RPG, inventario, fabricación, conocimiento adquirido, estasis real, recompensas, leyendas o periódico. La ilustración de oficina no implementa esas mecánicas y los ejemplos no las acreditan. Se conservan como requisitos, no como funciones descartadas.

Este candidato **no completa todavía la primera vertical real de dos equipos**: proyecta y comprueba una cadena representable en GitHub, pero no ha ejecutado una tarea bilateral con sus agentes. No se publica como una 1.0 estable ni se afirma paridad con la visión completa.

## Puertas para una versión estable

- [ ] Revisión independiente del SHA exacto y resolución de objeciones.
- [ ] Acuerdo humano bilateral del alcance, fronteras, responsabilidades y recuperación.
- [ ] Alojamiento y autenticación compartida acordados; el servidor actual es solo local.
- [ ] Selección de agentes/tarea de ambos equipos y capacidades comprobadas.
- [ ] Prueba real autorizada `requested → accepted → delivered → reviewed`, incluido fallo y recuperación.
- [ ] Contraste de permisos y esquema GraphQL con la combinación real; no se presume por tests con dobles.
- [ ] Prueba visual y accesible de recorridos representativos, además de automatización.
- [ ] Decisión sobre qué requisitos de juego entran en 1.0, sin recortarlos por silencio.

## Plan reproducible

`npm run check` comprueba sintaxis, espacios y ausencia de ejecución de procesos en el runtime. `npm test` prueba la lógica, consultas y servidor con datos inventados. El recorrido visual arranca `npm start` y comprueba ambos equipos, las cuatro fases, búsqueda, modal, teclado y tamaño móvil. El informe final de esta contribución registrará los resultados realmente ejecutados, no solo esta lista.

Pruebas sintéticas y revisión de código no prueban una integración bilateral, una auditoría completa de seguridad ni aceptación humana. No se copian datos de los equipos para completar las pruebas.
