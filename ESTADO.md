# Estado del proyecto

Punto de entrada para retomar el trabajo sin depender de ningún chat. Fuentes canónicas: plan [#17](https://github.com/EspacioKoop/espaciokoop-office/issues/17), registro [#18](https://github.com/EspacioKoop/espaciokoop-office/issues/18) y debate de producto [#1](https://github.com/EspacioKoop/espaciokoop-office/issues/1). Si este archivo contradice a esas fuentes o al estado remoto, prevalecen ellas y se corrige este archivo.

**Actualizado:** 28-09-2026 · `main` en `e4123f8c29902d43a1c1ca76ce7121e52da505d8`.

## Objetivo

Una oficina donde los agentes de Varo y los de Eloy **convivan, compartan información y aprendan unos de otros**. El criterio de «hecho» propuesto está en #17, pendiente de acuerdo.

## Qué hay

| Elemento | Estado | Evidencia |
|---|---|---|
| Visión, requisitos, contratos y preparación | Integrados, **pendientes de acuerdo** | `docs/` |
| `packages/office-space`: salas, muebles y avatares humanos | Integrado. No conectado a interfaz ni transporte. | 71/71 pruebas; CI [34855832086](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/34855832086) |
| Núcleo e interfaz de la cadena B (solo lectura) | Candidato local en la PR #14, en borrador | [Revisión independiente](https://github.com/EspacioKoop/espaciokoop-office/pull/14#issuecomment-5868508809) |
| Servicio común remoto | No existe | #21 |
| Agentes reales conectados y prueba bilateral | No existen | — |
| Aprendizaje, premios, RPG e historia | No implementados | Visión en #1 |

Nada está desplegado ni probado por personas.

## Decisiones

Tabla completa en #17 y [decisiones de Varo en #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5868570693).

**Acordadas por Varo y Eloy:**
- Primera vertical **B**; el aprendizaje entre equipos va en la entrega siguiente.
- **GitHub manda en las tareas.** La oficina solo guarda lo de juego: salas, objetos, relaciones e historia.
- **#11, opción (a):** de Agent Office solo presentación; cada equipo ejecuta con sus agentes.

**Decidida por Varo:** él autoriza los merges, registrándolo en cada PR.

**Pendientes:**
- **Alojamiento y acceso.** Varo propone un servicio en su lado, con acceso de Eloy por VPN WireGuard limitado y revocable; falta Eloy.
- **Criterio de «hecho».** Varo acepta los cinco puntos de #17; falta Eloy.
- **Agente y tarea** de la primera prueba bilateral, uno por cada lado.
- **Contenido compartible** para aprender entre equipos. Hoy Eloy autoriza solo metadatos.

## Candidatos abiertos

| PR | Titular | Estado |
|---|---|---|
| #12 | Eloy | Correcciones hechas; nueva revisión publicada. Pendiente de la autorización de merge. |
| #14 | Equipo de Varo, reserva liberada | Borrador revisado. Faltan CI del núcleo y la decisión D1. |
| #16 | Equipo de Varo, sin reserva | Alternativa a lo integrado. Sus mejoras se portan en #20; después, cerrarla. |

## Punto de retomar

1. Leer #17 y los comentarios de #18, incluida la paginación.
2. Contrastar con `git log origin/main` y con `gh pr list`.
3. Continuar por el primer bloque libre del plan que no dependa de una decisión pendiente.
