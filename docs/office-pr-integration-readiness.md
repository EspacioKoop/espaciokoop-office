# Estado verificable de integración de EspacioKoop Office

**Fecha de corte:** 12 de octubre de 2026. Este documento sustituye la matriz
de la [PR #93](https://github.com/EspacioKoop/espaciokoop-office/pull/93),
redactada antes de las integraciones posteriores. No certifica despliegue
en los equipos de las dos partes, ni reemplaza la autorización de Varo.

## Hechos integrados en main

| Bloque | PR definitiva | Alcance y limitaciones |
| --- | --- | --- |
| Ciclo de vida SSE y aislamiento | [#87](../pull/87) | Pruebas sintéticas |
| Cuotas SSE por sesión | [#89](../pull/89) | Tests, sin alterar las cuotas |
| Rotación y revocación SSE | [#96](../pull/96) | Recupera la antigua #91 |
| Office Space fail-closed | [#97](../pull/97) | Adaptador puro y corrección conjunta de #84/#85 |
| Refresco UI por evento space | [#98](../pull/98) | Listener + regresión de cliente de #95 |
| Accesibilidad del panel y cola | [#99](../pull/99) | Tests de teclado, foco, contraste |
| Motor de recuperación | [#100](../pull/100) | Componente puro; no reintentos autónomos |
| Persistencia de diarios y recetas | [#101](../pull/101) | Staging, opt-in para sobrescritura; no endpoints |
| Propiedades de contratos | [#102](../pull/102) | fast-check solo dev, lockfile y CI |
| Registro CLAIM/RELEASE | [#103](../pull/103) | Núcleo puro; no escribe comentarios GitHub |
| Planificador de salas | [#104](../pull/104) | Geometría y pruebas; no acceso HTTP nuevo |
| Movimiento y pathfinding | [#105](../pull/105) | Cota CPU y acceso fail-closed |
| Diario/periódico | [#106](../pull/106) | Aislamiento de eventos sin proyecto por propietario |

Las PR anteriores superaron el workflow de la rama de PR en Node 22
y Node 24 **en el SHA que se fusionó**. Eso no equivale a una prueba real
de usuarios de diferentes redes, ni acredita que la implementación de
Office esté desplegada en la infraestructura de Varo.

## Pendientes detectados en las PR abiertas

La búsqueda de GitHub del 12-10-2026 devuelve **12 PR abiertas**:

- **Docs/alta:** #74 (manual de Jules/presencia, requiere revisión del
  propietario y comprobar que el contrato siga vigente), #93 (matriz
  desactualizada; sustituir por este documento).
- **Módulos de producto:** #69 recetas de conocimiento, #70 eventos,
  #71 inventario/regalos, #72 necesidades de avatares. No activarlos
  automáticamente por su existencia como código: auditar acceso, privacidad,
  persistencia y compatibilidad entre esquemas.
- **Tests y QA:** #48 revocación por agente, #58 gestión de agentes,
  #57 QA de presencia/sala.
- **UI dependiente de versiones antiguas:** #44 presencia, #50 vista 3D,
  #47 auditoría asociada a #44. Evitar merges directos de cambios
  conflictivos en `web/app.mjs` y `web/style.css` sin adaptar los
  contratos de sesión, SSE y Office Space.

Esta lista es una fotografía, no un monitor continuo. Consultar GitHub
antes de decidir sobre cada PR y revisar la reserva de archivos en
[issue #18](https://github.com/EspacioKoop/espaciokoop-office/issues/18).

## Orden recomendado de integración

1. Revisar #48, #58 y #57 (tests/QA) contra el `main` actual,
   respetando las reservas activas.
2. Revisar independientemente #69–#72, priorizando contratos puros
   pequeños. Para #69 y #68/#101, comprobar que las recetas con
   procedencia **no son equivalentes** al sencillo formato del
   adaptador local de persistencia; diseñar mapeo explícito si se conectan.
3. Validar funcionalmente el flujo completo con Varo: conexión privada,
   identidad de dos propietarios, heartbeat, aislamiento de cola,
   revocación y vista SSE; guardar evidencias de ambos extremos.
4. Resolver UI #44/#50 mediante una integración revisada de los
   contratos actuales, no reintroduciendo la lógica obsoleta.

## Gates antes de fusionar

- Mantener un único escritor por archivo mediante CLAIM y PR_READY en
  la issue #18; `src/claim-registry.mjs` es una **verificación local**
  del contrato, no un servidor de reservas.
- Revisar diff completo y dependencias, no solo el resultado verde de CI.
- Workflow oficial de Office: `npm ci --ignore-scripts --no-audit`,
  `npm run check`, `npm test`; GitHub Actions Node 22/24 en verde.
  Las suites de `test/contracts/` ahora forman parte de `npm test`.
- Para cambios en autenticación, policy, permisos o eventos SSE,
  comprobar casos de fallo-cerrado, revocación, dueños distintos y
  presupuesto de recursos antes de habilitar rutas de producción.
- La autorización final y la evidencia de despliegue bilateral siguen
  perteneciendo a los administradores acordados (incluido Varo).
  Ninguna suite sintética acredita esa aceptación por sí misma.

## Reversión

Revertir por SHA individual de merge squash, con PR de rollback y
pruebas sobre la base actual. No usar a ciegas `git revert -m 1`,
pues estas integraciones son commits squash, no merge commits.
La reversión de código no restaura datos de usuario; el adaptador de
persistencia #101 exige control del estado y backups locales.

El presente documento no contiene claves, URL privadas ni información
de sesiones de otras personas.
