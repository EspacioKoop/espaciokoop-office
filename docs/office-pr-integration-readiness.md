# Matriz de Integración Verificable de PRs de Office y Gates para Varo

**Fecha de referencia:** 11 de octubre de 2026; **revalidación técnica:** 12 de octubre de 2026
**SHA base de main:** `66e445e7582f26c398e172456c33d48b071c61b1` (Merge PR #73)
**Autor:** Jules (agente en cola para Varo / Eloy)
**Propósito:** Proporcionar un mapa auditable y determinista para desbloquear y ordenar la integración de las PRs abiertas en `EspacioKoop/espaciokoop-office`, garantizando la estabilidad del producto, el aislamiento de responsabilidades y el cumplimiento de las [Normas Platino](../AGENTS.md).

---

## 1. Resumen Ejecutivo y Estado General

Actualmente existen **24 PRs abiertas** dirigidas a `main` (o a ramas base intermedias). Ninguna PR abierta presenta conflictos sintácticos de merge directamente sobre `main` en este momento; sin embargo, existen **solapamientos críticos de archivos** (`web/app.mjs`, `web/style.css`, `src/integration-adapter.mjs`) y **dependencias lógicas en cascada** que requieren un orden de fusión estrictamente secuencial mediante *gates* humanos de aprobación por parte de Varo.

### Principales hallazgos:
1. **Evidencia Sintética de Eloy (251/251 tests, 38 módulos):**
   - La prueba sintética de integración ejecutada por Eloy sobre el lote `#80, #81, #82, #83, #85 (inc #84), #87, #89, #91` fusiona de manera 100% limpia sobre `main` (`66e445e`).
   - **Vigencia:** Revalidación independiente del 12-10-2026 con los HEAD actuales de `#80/#81/#82/#83/#85/#87/#89/#91/#93` sobre `main@66e445e`: los nueve merges de prueba fueron limpios; `npm ci --offline --ignore-scripts --no-audit --no-fund`, `npm test` **251/251** y `npm run check` **38 módulos / 0 errores**. `fast-check` es una **devDependency** de #83 y debe instalarse con `npm ci` para ejecutar la suite completa; no es un fallo de las pruebas ni una dependencia de runtime.
   - **Límite de la evidencia:** Esta prueba valida la compatibilidad de código y tipos sintéticos locales, pero **NO constituye CI remoto oficial** de GitHub Actions ni acredita interacción de dos propietarios reales desde redes distintas (Gate 1 de `ESTADO.md`).
2. **PRs Superadas vs. PRs Necesitadas:**
   - **PR #44 y PR #50 (UI de Presencia / 3D):** Han sido superadas funcionalmente por el trabajo posterior de endurecimiento de API (`#41`) y la refactorización modular. La PR #44 edita `web/app.mjs` de forma directa sin pasar por el flujo seguro de tokens de sesión ni el aislamiento de adaptadores de `#84/#85`.
   - **PR #47:** PR de documentación superada/redundante que intenta corregir una auditoría de presencia sobre la base antigua de #44.
   - **PR #85 sobre PR #84:** La PR #85 es una corrección crítica de seguridad (*fail-closed*) cuya base es la rama de la PR #84. La PR #84 NO debe fusionarse sola sin incluir el fix de #85.
3. **Ausencia de auto-merge:**
   - Ninguna PR debe cerrarse o fusionarse de forma automática. Todas las acciones requieren la aprobación previa y explícita de Varo.

---

## 2. Clasificación Detallada de PRs Abiertas

A continuación se detalla la clasificación individual de cada PR relevante, analizando su dependencia exacta, rutas modificadas, estado de CI remoto en el SHA, conflicto frente a `main` (`66e445e`) y el gate humano requerido.

> **Nota de CI (revisada 12-10-2026):** el estado de CI debe comprobarse **para el SHA HEAD actual** de cada PR. Se ha contrastado con los runs GitHub Actions de los commits HEAD de #85, #87, #89 y #91: resultado `completed/success`. Para el resto se conserva "Desconocido" si no se ha comprobado su último commit; no significa necesariamente que la API esté inaccesible. La integración sintética local no equivale a CI oficial del commit resultante de una combinación.

| PR | Autor | Título / Propósito | SHA Head | Archivos Modificados | Dependencia Exacta | Conflicto Git | CI en SHA (API) | Gate Humano Requerido | Estado Operativo |
|---|---|---|---|---|---|---|---|---|---|
| **#44** | eGurucharri | feat(ui): mostrar presencia autenticada | `97c7abf` | `test/presence-ui.test.mjs`, `web/app.mjs`, `web/style.css` | Ninguna (base main antigua) | No (merge-tree limpio) | Desconocido | Varo | **Superada / A revisar.** Modifica UI de forma desacoplada del adaptador #84/#85. |
| **#47** | eGurucharri | docs(office): corregir auditoría de presencia distinguiendo main y PR44 | `4532edc` | `docs/presencia-revocacion-auditoria.md` | PR #44 | No | Desconocido | Varo | **Superada.** Corresponde al flujo antiguo de #44. |
| **#48** | eGurucharri | test(presence): reforzar revocación por agente | `177c6a8` | `test/presence-api.test.mjs`, `test/presence.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Test).** Refuerza la suite de presencia existente. |
| **#49** | eGurucharri | feat(office): núcleo puro del contrato de reservas (#18) | `85bfe06` | `src/claim-registry.mjs`, `test/claim-registry.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Core Puro).** Implementación pura sin dependencias de red. |
| **#50** | eGurucharri | feat(ui): vincular vista 3D mínima a presencia | `8e66673` | `test/office-3d-ui.test.mjs`, `test/team-queue-ui.test.mjs`, `web/app.mjs`, `web/style.css` | PR #44 | No | Desconocido | Varo | **Solapamiento UI.** Se solapa con `web/app.mjs` de #44 y #80. |
| **#57** | eGurucharri | Office #55: matriz accesible y reproducible de presencia y sala 3D | `ac611f2` | `docs/qa-accesibilidad-presencia-3d.md` | Ninguna | No | Desconocido | Varo | **Apta (Docs/QA).** Documentación de matriz de pruebas. |
| **#58** | eGurucharri | test(office): añadir tests de alta/baja/revocación de agentes #3 | `34c3b42` | `test/agent-management.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Test).** Amplía tests de gestión de agentes. |
| **#66** | eGurucharri | feat: implement deterministic avatar pathfinding and keyboard movement (#51) | `39da5c6` | `src/avatar-pathfinding.mjs`, `test/avatar-pathfinding.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Lógica pura).** Motor determinista de pathfinding. |
| **#67** | eGurucharri | feat(space): add room layout planner pure adapter (#51) | `bfbd109` | `src/room-layout-planner.mjs`, `test/room-layout-planner.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Adaptador puro).** Planificador de distribución de salas. |
| **#68** | eGurucharri | feat: journal and newspaper for office history (#54) | `6bf9371` | `src/office-history-journal.mjs`, `test/office-history-journal.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Módulo funcional).** Periódico e historial de la oficina. |
| **#69** | eGurucharri | feat(learning): recetas de aprendizaje verificables con procedencia (#52) | `02dfa98` | `src/knowledge-recipe.mjs`, `test/knowledge-recipe.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Módulo funcional).** Recetas de conocimiento con procedencia. |
| **#70** | eGurucharri | feat(events): calendario determinista de eventos y presencia voluntaria (#54) | `725778f` | `src/office-events.mjs`, `test/office-events.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Módulo funcional).** Calendario de eventos determinista. |
| **#71** | eGurucharri | Transacciones lúdicas de inventario y regalos sin duplicados (#53) | `ca77025` | `src/office-trade-ledger.mjs`, `test/office-trade-ledger.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Módulo funcional).** Registro de intercambios e inventario. |
| **#72** | eGurucharri | feat(life-needs): motor determinista de necesidades y recuperación de avatares (#53) | `2f1ff2e` | `src/life-needs.mjs`, `test/life-needs.test.mjs` | Ninguna | No | Desconocido | Varo | **Apta (Módulo funcional).** Motor de necesidades de avatares. |
| **#74** | VaroTv7 | docs: tutorial para Eloy — Jules, alta y conexión de agentes | `57a942b` | `docs/agent-onboarding.md` | Ninguna | No | Desconocido | Varo / Eloy | **Apta (Docs).** Manual de onboarding para agentes. |
| **#80** | eGurucharri | test: add accessibility test suite for presence panel and team queue | `592b338` | `test/accessibility-presence-panel.test.mjs`, `test/accessibility-team-queue-ui.test.mjs`, `test/fixtures/accessibility.mjs` | Ninguna | No | Desconocido | Varo | **Apta (QA/Accessibility).** Suite de accesibilidad para la interfaz. |
| **#81** | eGurucharri | Implement pure persistence adapter for office journal and recipes | `aafb58d` | `src/persistence-adapter.mjs`, `src/persistence-types.mjs`, `test/persistence-adapter.test.mjs` | PR #68, #69 | No | Desconocido | Varo | **Apta (Persistencia).** Adaptador de persistencia puro para historial y recetas. |
| **#82** | eGurucharri | Implement pure deterministic state recovery engine | `e3e8cd0` | `src/recovery-engine.mjs`, `src/recovery-types.mjs`, `test/recovery-engine.test.mjs` | PR #81 | No | Desconocido | Varo | **Apta (Recuperación).** Motor determinista de recuperación de estado. |
| **#83** | eGurucharri | Add property-based contract tests for presence, team-queue, and agent-management | `3840d29` | `.github/workflows/core-tests.yml`, `package.json`, `package-lock.json`, `test/contracts/*` | Ninguna | No | Desconocido | Varo | **Requiere Fast-Check.** Añade workflow de contratos y tests generativos. |
| **#84** | eGurucharri | feat: add pure integration adapter for office space | `d74cda5` | `src/integration-adapter.mjs`, `src/integration-contracts.mjs`, `test/integration-adapter.test.mjs` | Ninguna | No | Desconocido | Varo | **Incompleta sin #85.** Presenta un hueco de seguridad *fail-open*. |
| **#85** | eGurucharri | fix(security): cerrar fail-open del adaptador de espacios de #84 | `1c81a27` | `src/integration-adapter.mjs`, `src/integration-contracts.mjs`, `test/integration-adapter.test.mjs` | **Depende de PR #84** | No | [CI verde](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/38175538112) | Varo | **CRÍTICA (Seguridad).** Cierra el fallo de seguridad de #84. Debe fusionarse *junto* o *sobre* #84. |
| **#87** | eGurucharri | Añadir suite sintética de regresión del ciclo de vida SSE y aislamiento entre propietarios | `9f086a6` | `test/sse-lifecycle-owners.test.mjs` | Ninguna | No | CI verde en HEAD (GitHub Actions) | Varo | **Apta (Seguridad/SSE).** Suite sintética de regresión para aislamiento SSE. |
| **#89** | eGurucharri | test: contrato de cupos SSE por sesión y liberación tras abortar | `a578cf8` | `test/sse-capacity-per-session.test.mjs` | Ninguna | No | CI verde en HEAD (GitHub Actions) | Varo | **Apta (Seguridad/SSE).** Validación de cupos de conexión por sesión HTTP. |
| **#91** | eGurucharri | test: add sse session rotation and revocation tests | `618c8a7` | `test/sse-session-rotation.test.mjs` | Ninguna | No | CI verde en HEAD (GitHub Actions) | Varo | **Apta (Seguridad/SSE).** Tests de rotación de tokens SSE y revocación. |

---

**CI HEAD verificadas (12-10-2026):** #85: [run 38175538112](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/38175538112); #87: [run 38182160000](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/38182160000); #89: [run 38182686133](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/38182686133); #91: [run 38184757040](https://github.com/EspacioKoop/espaciokoop-office/actions/runs/38184757040). Todas con conclusión `success` en el HEAD comprobado; si esos HEAD cambian, repetir la consulta.

## 3. Matriz de Solapamiento de Rutas de Archivos

Para evitar colisiones al aplicar lotes, se mapean las PRs que tocan las mismas rutas de código o documentación:

```
Ruta de archivo                               Archivos / PRs Solapadas
---------------------------------------------------------------------------------------------------------
docs/agent-onboarding.md                      PR #74
docs/presencia-revocacion-auditoria.md        PR #47
docs/qa-accesibilidad-presencia-3d.md         PR #57
src/avatar-pathfinding.mjs                    PR #66
src/claim-registry.mjs                        PR #49
src/integration-adapter.mjs                   PR #84, PR #85 (Corrección directa sobre #84)
src/knowledge-recipe.mjs                      PR #69, PR #81
src/life-needs.mjs                            PR #72
src/office-events.mjs                         PR #70
src/office-history-journal.mjs                PR #68, PR #81
src/office-trade-ledger.mjs                   PR #71
src/persistence-adapter.mjs                   PR #81, PR #82
src/recovery-engine.mjs                       PR #82
src/room-layout-planner.mjs                   PR #67
web/app.mjs                                   PR #44, PR #50
web/style.css                                 PR #44, PR #50
test/accessibility-*.test.mjs                 PR #80
test/agent-management.test.mjs                PR #58
test/contracts/*.test.mjs                     PR #83
test/presence-*.test.mjs                      PR #44, PR #48
test/sse-*.test.mjs                           PR #87, PR #89, PR #91
```

---

## 4. Orden por Lotes Mínimo y Seguro para Varo

Para proceder sin riesgo de degradación en `main`, se establece una hoja de ruta dividida en **tres lotes estrictos**. Cada lote debe ser validado antes de habilitar el siguiente.

```
                    ┌─────────────────────────────────────────┐
                    │     LOTE 1: Preparatorios y Docs        │
                    │      (#49, #57, #74, #80, #87, #89, #91) │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │     LOTE 2: Contratos y Seguridad       │
                    │        (#84 + #85, #81, #82, #83)       │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │  LOTE 3: Capas Funcionales / RPG / UI   │
                    │(#48, #58, #66, #67, #68, #69, #70, #71) │
                    └─────────────────────────────────────────┘
```

### Lote 1: Preparatorios Independientes, Documentación y Regression Tests SSE
- **PRs compuestas:** `#49` (Núcleo de reservas #18), `#57` (QA Accesibilidad), `#74` (Tutorial Onboarding Eloy), `#80` (Tests de accesibilidad UI), `#87` (Regresión ciclo de vida SSE), `#89` (Cupos SSE por sesión), `#91` (Rotación y revocación SSE).
- **Razón de seguridad:** Ninguna de estas PRs modifica el runtime del servidor (`src/server.mjs`) ni introduce dependencias. Añaden adaptadores puros aislados, documentación y suites de pruebas de seguridad SSE sin riesgo de regresión sobre `main`.
- **Rutas tocadas:** `src/claim-registry.mjs`, `docs/qa-accesibilidad-presencia-3d.md`, `docs/agent-onboarding.md`, `test/accessibility-*.mjs`, `test/sse-*.mjs`.

### Lote 2: Contratos, Adaptadores Integrados y Persistencia
- **PRs compuestas:** `#84` + `#85` (Adaptador de integración de espacio + Cierre de fail-open de seguridad), `#81` (Adaptador de persistencia puro), `#82` (Motor determinista de recuperación), `#83` (Tests de contratos de calidad / fast-check).
- **Condición crítica de ejecución:** La PR `#84` **NO** debe fusionarse de forma independiente sin haber integrado previamente o simultáneamente los cambios del commit `1c81a27` de la PR `#85`.
- **Razón de seguridad:** Garantiza que los adaptadores de integración entre la oficina y los espacios remotos sean completamente *fail-closed* ante fallos de autenticación o políticas.
- **Rutas tocadas:** `src/integration-adapter.mjs`, `src/persistence-adapter.mjs`, `src/recovery-engine.mjs`, `test/contracts/`.

### Lote 3: Capas Funcionales, RPG y UI
- **PRs compuestas:** `#48` (Tests revocación presencia), `#58` (Tests gestión agentes), `#66` (Pathfinding avatares), `#67` (Room layout planner), `#68` (History journal), `#69` (Knowledge recipes), `#70` (Office events), `#71` (Trade ledger), `#72` (Life needs).
- **Tratamiento especial para UI (#44 / #50 / #47):** Varo debe revisar si la interfaz propuesta en #44/#50 debe adaptarse para consumir el nuevo `integration-adapter` de #84/#85 antes de autorizar su fusión.
- **Rutas tocadas:** `src/avatar-pathfinding.mjs`, `src/room-layout-planner.mjs`, `src/office-history-journal.mjs`, `src/knowledge-recipe.mjs`, `src/office-events.mjs`, `src/office-trade-ledger.mjs`, `src/life-needs.mjs`.

---

## 5. Pasos Concretos de Validación entre Lotes y Plan de Rollback

### Pasos de Validación Inter-Lote:
1. **Ejecución local de la suite:** Tras aplicar cada lote en una rama de integración o en `main`, ejecutar la verificación reproducible offline:
   ```bash
   npm test
   npm run check
   git diff --check
   ```
2. **Criterio de Aceptación:**
   - 0 errores en `tools/check.mjs` (comprobación de módulos, ausencia de dependencias no autorizadas en `src/`, ausencia de espacios al final de línea).
   - 100% de los tests en verde (180/180 en el estado actual de `main`, o la suma correspondiente al incorporar nuevos archivos de prueba).
   - Ausencia de cambios en `package.json` bajo la sección `dependencies` (solo `devDependencies` si aplica).

### Criterio de Bloqueo (Fail-Safe):
- Si un lote provoca la caída de cualquier test existente en `main` o genera un error en `tools/check.mjs`, el flujo de integración queda **automáticamente bloqueado**.
- Si un archivo de `src/` intenta importar librerías externas o utilizar eval/child_process, el proceso se aborta inmediatamente.

### Plan de Rollback:
- Puesto que cada lote se valida mediante git commits aislados sobre la rama objetivo antes del push definitivo, la reversión de un lote fallido se realiza mediante revert limpio de Git:
  ```bash
  git revert -m 1 <SHA_DEL_MERGE_DE_LOTE>  # solo para merge commits
  # si se integró mediante squash, usar git revert <SHA_DEL_SQUASH>
  ```
- No se requiere ninguna limpieza de base de datos o almacenamiento remoto, ya que el sistema opera con estado persistente puramente determinista basado en archivos/fixturas locales.

---

## 6. Verificación Reproducible Offline

Todas las validaciones descritas en esta matriz pueden ser ejecutadas en un entorno local aislado, sin necesidad de credenciales de red, claves API ni acceso a VPN/WireGuard:

```bash
# 1. Asegurar instalación limpia de dependencias existentes
npm ci  # en entorno aislado puede emplearse --offline si la caché está completa

# 2. Ejecutar la suite troncal de pruebas unitarias y de integración
npm test

# 3. Validar reglas de estilo, ausencia de trailing whitespace y salud de módulos
npm run check

# 4. Verificar limpieza de diferencias de git
git diff --check
```

---

## 7. Declaración de Cumplimiento y Gates para Varo

1. **Sin Fusiones Automáticas:** Ninguna PR clasificada en este documento debe ser fusionada sin la autorización explícita registrada por Varo en la PR correspondiente.
2. **Sin Modificación de Ficheros Reservados:** Este análisis genera exclusivamente el archivo autorizado `docs/office-pr-integration-readiness.md`. No se ha modificado `src/`, `web/`, `test/`, `AGENTS.md`, `ESTADO.md` ni ningún archivo de reclamación activo.
3. **Respeto a las Normas Platino:** La evidencia sintética previa (251 tests) ha sido verificada respecto a su vigencia técnica, pero se mantiene formalmente deslindada de cualquier acreditación de CI remoto oficial o prueba de dos propietarios en producción.
