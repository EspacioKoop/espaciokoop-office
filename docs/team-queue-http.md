# Cola HTTP por equipo

`GET /api/queue` proyecta las tareas de GitHub asignadas a la cola del equipo
identificado por la sesión local. Requiere la misma cookie `office` que
`/api/snapshot`. No admite parámetros ni operaciones de escritura.

El administrador puede configurar `OFFICE_TASK_ROUTES` con la ruta de un fichero
JSON local (máximo 16 000 bytes, 100 entradas):

```json
[
  { "project_id": "demo/observatorio", "issue": 11, "team_id": "marea" }
]
```

Estos identificadores son sintéticos. Cada entrada debe corresponder a un
proyecto y una tarea seleccionados en `OFFICE_POLICY`, y el equipo debe tener
permiso de lectura sobre ese proyecto. Una tarea solo puede estar en una cola.
El fichero decide el destino de la tarea; GitHub sigue determinando su fase,
aceptación, PR, SHA, CI, revisión y evidencia. No se almacena otro Kanban.

Sin `OFFICE_TASK_ROUTES`, la cola está vacía y no se hacen lecturas remotas.
Una configuración inválida impide arrancar. Durante el servicio devuelve un
error saneado `QUEUE_UNAVAILABLE` (503), sin una copia anterior de las tareas.

La respuesta contiene `mode`, `version`, `generatedAt`, `expiresAt`, `memberId`
y `queue`, con el contrato de `buildTeamQueue`. Solo se consultan proyectos
ruteados al equipo autenticado y autorizados por la política. Los datos de
otros equipos y las claves locales no forman parte de la respuesta.

Después de cada lectura remota y antes de responder se comprueban otra vez
la sesión, la política y las rutas. Si cambia la política, la sesión deja de
ser válida (`AUTH`, 401); si cambian las rutas válidas, se descarta el resultado
(`QUEUE_CHANGED`, 409). El cliente debe borrar la vista anterior ante cualquier
error y repetir la consulta cuando corresponda. Una respuesta tiene TTL de
12 segundos y cabeceras `no-store`; no implica ejecución ni presencia de agentes.

La cola y el snapshot comparten una lectura simultánea por sesión y un máximo
de cuatro en el servicio (`RATE_LIMIT`, 429). Se libera la reserva incluso si
el origen falla. En pruebas se puede inyectar `taskRoutesLoader`, igual que
`policyLoader`, para verificar cambios durante una consulta sin datos reales.

Verificación: `node --test test/team-queue-api.test.mjs`. Los diez casos cubren
sesión, suplantación por parámetros o POST, aislamiento previo al origen,
procedencia de fase y evidencia, cola vacía, fichero inválido, revocación y
cambios de rutas durante la lectura, ambos límites compartidos y errores del
origen sin filtración.
