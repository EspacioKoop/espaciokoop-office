# Estado del proyecto

Punto de entrada para retomar el trabajo sin depender de ningún chat. Fuentes canónicas: plan [#17](https://github.com/EspacioKoop/espaciokoop-office/issues/17), registro [#18](https://github.com/EspacioKoop/espaciokoop-office/issues/18) y debate de producto [#1](https://github.com/EspacioKoop/espaciokoop-office/issues/1). Si este archivo contradice a esas fuentes o al estado remoto, prevalecen ellas y se corrige este archivo.

**Actualizado:** 28-09-2026 · `main` en `72cb9350b7e3df5283b132da0a325e20661be3b4`.

## Objetivo

Una oficina donde los agentes de Varo y los de Eloy **convivan, compartan información y aprendan unos de otros**. El criterio de «hecho» propuesto está en #17, pendiente de acuerdo.

## Qué hay

| Elemento | Estado | Evidencia |
|---|---|---|
| Visión, requisitos, contratos y preparación | Integrados, **pendientes de acuerdo** | `docs/` |
| `packages/office-space`: salas, muebles y avatares humanos | Integrado y blindado (#23). Aún sin interfaz ni transporte. | 123/123 pruebas |
| Núcleo e interfaz de la cadena B (solo lectura) | **Integrado** (#14), evaluación local con datos sintéticos | CI [36417854448](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/36417854448) |
| Servicio común remoto | Candidato en borrador, PR #25, con correcciones de la revisión en curso | #21 |
| Acceso privado de Eloy (WireGuard) | Guía redactada; **sin configurar** | [Guía](docs/acceso-privado-wireguard.md) · #26 |
| Oficina 3D viva | Tres bocetos locales, a la espera de que Varo elija estilo | #24 |
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
- **Alojamiento y acceso.** Varo propone un servicio en su lado, con acceso de Eloy por VPN WireGuard limitado y revocable ([guía](docs/acceso-privado-wireguard.md)); falta Eloy.
- **Criterio de «hecho».** Varo acepta los cinco puntos de #17; falta Eloy.
- **Agente y tarea** de la primera prueba bilateral, uno por cada lado.
- **Contenido compartible** para aprender entre equipos. Hoy Eloy autoriza solo metadatos.

## Candidatos abiertos

| PR | Titular | Estado |
|---|---|---|
| #25 | Equipo de Varo (Astra Taller) | Servicio común en borrador. Corrigiendo lo señalado en la [revisión](https://github.com/EspacioKoop/espaciokoop-office/pull/25#issuecomment-5869328130). |

Integradas hoy con autorización de Varo: #22, #23, #12 y #14. #16 cerrada por quedar absorbida en #23.

## Punto de retomar

1. Leer #17 y los comentarios de #18, incluida la paginación.
2. Contrastar con `git log origin/main` y con `gh pr list`.
3. Continuar por el primer bloque libre del plan que no dependa de una decisión pendiente.
