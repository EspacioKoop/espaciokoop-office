# Cola del equipo en la interfaz

La vista **Trabajo y evidencias** muestra primero la cola del equipo autenticado
y después sus proyectos autorizados. Ambas listas representan metadatos de
GitHub. Dirigir una tarea a la cola no la acepta ni acredita presencia o ejecución.
La búsqueda por título o número se aplica también a la cola; cada tarea es un
botón que abre el detalle de fase, SHA, CI, revisión y evidencia existente.
Los títulos se insertan como texto, nunca como HTML.

La interfaz necesita el endpoint de la PR #36. Lee `/api/snapshot` y
`/api/queue` secuencialmente para respetar la exclusión por sesión del servicio.
Solo pinta la nueva vista cuando ambas respuestas pertenecen al mismo equipo y
siguen vigentes. Usa el menor vencimiento; una respuesta que caduca mientras se
espera la segunda se descarta. No mantiene un Kanban propio ni guarda la cola.

Cola vacía y fallo de carga tienen resultados distintos: la primera muestra un
mensaje explícito y conserva los proyectos; el segundo retira ambas listas y
el diálogo. La caducidad, revocación SSE, pérdida de conexión, pestaña oculta y
cierre de sesión también retiran los datos. Una respuesta o un error de una
consulta anterior no puede restaurar una vista revocada ni borrar su aviso.

`node --test test/team-queue-ui.test.mjs` ejecuta el cliente real con DOM,
transporte y reloj aislados, sin dependencias nuevas. Cubre renderizado,
búsqueda, detalle y evidencia, cola vacía, errores, revocación durante lectura,
respuesta tardía, caducidad y mezcla de equipos. Estas pruebas no acreditan
presencia real ni una prueba bilateral.
