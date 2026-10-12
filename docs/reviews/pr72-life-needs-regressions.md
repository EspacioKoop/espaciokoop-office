# Revisión adversarial de PR #72: Motor determinista de necesidades de avatares (#59)

- **PR evaluada:** #72
- **SHA exacto de HEAD:** `2f1ff2e08a90540b640761cd89bbbb8827319725`
- **Módulos analizados en diff:**
  - `src/life-needs.mjs` (Confirmación de nombre exacto desde el diff frente a alias del encargo)
  - `test/life-needs.test.mjs`
- **Entorno de ejecución:** Node.js v22.22.1 (Runner nativo `node --test`)
- **Rama destino de la revisión:** `main` (Informe guardado en `docs/reviews/pr72-life-needs-regressions.md` sin modificar la rama de PR #72 ni el código fuente de producción)

---

## 1. Resumen ejecutivo y veredicto

La PR #72 introduce una implementación desacoplada y determinista del motor lúdico de necesidades de avatares (`energia`, `hambre`, `descanso`, `moral`) bajo el número de issue #59.

**Veredicto:** **REQUIERE CAMBIOS MENORES (REQUEST_CHANGES)** antes de fusionar con `main`.

Si bien los 13 tests unitarios declarados en la PR pasan al 100% y el módulo cumple con la ausencia estricta de dependencias I/O y del reloj real (`Date.now`), la revisión adversarial ha detectado **dos fallos de seguridad y robustez** en el código de producción de la PR:
1. **Evasión por diferencia de mayúsculas/minúsculas en el filtro de seguridad de recursos sintéticos (`applyNeedsAction`)**: La comprobación de claves prohibidas (`permissions`, `budget`, `token`, etc.) utiliza coincidencia exacta con minúsculas, permitiendo que recursos con claves como `PERMISSIONS`, `Budget` o `Token` omitan el rechazo de seguridad.
2. **Propagación de estado corrupto y valores `NaN`**: Las funciones mutadoras de estado (`applyNeedsAction`, `tickNeeds` y `setNeedsPaused`) no validan exhaustivamente la estructura interna del estado de entrada, devolviendo objetos corruptos con valores `NaN` o aceptando versiones de estado incompatibles (`version: 999`).

---

## 2. Confirmación de nombres de archivos y estructura del diff

En el diff oficial del commit `2f1ff2e08a90540b640761cd89bbbb8827319725`, se confirman las siguientes rutas exactas:
- **Código de producción:** `src/life-needs.mjs`
- **Suite de pruebas:** `test/life-needs.test.mjs`

*(Nota de trazabilidad: La petición inicial mencionaba la posibilidad del nombre `src/office-life-needs.mjs`; se confirma mediante el diff de git que el nombre canónico registrado en PR #72 es `src/life-needs.mjs`).*

---

## 3. Evidencia de pruebas ejecutadas (Pruebas de la PR #72)

Se ejecutó la suite completa de 13 pruebas unitarias declaradas en PR #72 con el runner nativo de Node.js v22.

**Comando ejecutado:**
```bash
node --test test/life-needs.test.mjs
```

**Resultado ejecutado (Evidencia real):**
```text
TAP version 13
# Subtest: necesidades de avatar: creación nominal con valores por defecto
ok 1 - necesidades de avatar: creación nominal con valores por defecto
# Subtest: necesidades de avatar: creación con valores iniciales y saturación 0..100
ok 2 - necesidades de avatar: creación con valores iniciales y saturación 0..100
# Subtest: necesidades de avatar: validación de ID de avatar negativo/inválido
ok 3 - necesidades de avatar: validación de ID de avatar negativo/inválido
# Subtest: necesidades de avatar: ticks discretos y degradación determinista
ok 4 - necesidades de avatar: ticks discretos y degradación determinista
# Subtest: necesidades de avatar: asociatividad y determinismo de ticks
ok 5 - necesidades de avatar: asociatividad y determinismo de ticks
# Subtest: necesidades de avatar: saturación en límites de 0 y 100 con ticks masivos
ok 6 - necesidades de avatar: saturación en límites de 0 y 100 con ticks masivos
# Subtest: necesidades de avatar: pausa detiene la evolución de ticks
ok 7 - necesidades de avatar: pausa detiene la evolución de ticks
# Subtest: necesidades de avatar: acción alimentarse con recurso sintético
ok 8 - necesidades de avatar: acción alimentarse con recurso sintético
# Subtest: necesidades de avatar: acción descansar con recurso sintético
ok 9 - necesidades de avatar: acción descansar con recurso sintético
# Subtest: necesidades de avatar: seguridad - rechazo de recursos no sintéticos o con permisos/presupuestos reales
ok 10 - necesidades de avatar: seguridad - rechazo de recursos no sintéticos o con permisos/presupuestos reales
# Subtest: necesidades de avatar: exportación e importación reproducible (snapshot) y rollback
ok 11 - necesidades de avatar: exportación e importación reproducible (snapshot) y rollback
# Subtest: necesidades de avatar: validación estricta de snapshot corrupto o versión mismatch
ok 12 - necesidades de avatar: validación estricta de snapshot corrupto o versión mismatch
# Subtest: necesidades de avatar: motor lúdico encadenado y pausa/resume
ok 13 - necesidades de avatar: motor lúdico encadenado y pausa/resume
1..13
# tests 13 | pass 13 | fail 0 | duration_ms ~157ms
```

---

## 4. Análisis adversarial y hallazgos detallados

### 4.1 Invariantes de importación, reloj real y dependencias I/O
- **Invariante de reloj:** Verificado. `src/life-needs.mjs` no importa ni invoca `Date.now()`, `new Date()`, `performance.now()`, `setTimeout` ni `Math.random()`.
- **Invariante de dependencias I/O:** Verificado. Cero importaciones de paquetes externos, `node:fs` o `node:crypto`.
- **Determinismo:** Verificado. La evolución por ticks es 100% matemática y pura. Dado un estado `S` y `deltaTicks = N`, `tickNeeds(S, N)` produce idéntico resultado en cualquier ejecución.
- **Asociatividad de ticks:** Verificado. 10 ticks de 1 unidad producen el mismo estado exacto que 1 tick de 10 unidades (`tickNeeds(S, 10)` == 10x `tickNeeds(S, 1)`).

### 4.2 Saturación [0, 100] y precisión flotante
- La función interna `clamp(value)` aplica `Math.max(0, Math.min(100, Math.round(value * 100) / 100))`, garantizando que todos los valores queden acotados al rango `[0, 100]` con un máximo de 2 decimales.
- Ticks masivos (p. ej., 500 ticks) degradan con seguridad hasta saturar en `0` (`energia`, `descanso`, `moral`) y `100` (`hambre`).

### 4.3 Estado pausado y rollback por snapshot
- Cuando `state.paused === true`, `tickNeeds` retorna una copia profunda sin incrementar `tick_count` ni alterar las necesidades.
- `exportNeedsSnapshot` y `restoreNeedsSnapshot` realizan copias profundas mediante `structuredClone`, aislando la memoria interna del motor ante mutaciones externas de los objetos retornados.

---

## 5. Vulnerabilidades y fallos detectados (Evidencia ejecutada)

### Hallazgo 1 (Seguridad - Crítico): Evasión por mayúsculas en filtro de recursos reales (`SECURITY_VIOLATION`)
- **Descripción:** En `applyNeedsAction`, se verifica la lista de claves prohibidas mediante:
  ```javascript
  const forbiddenKeys = ['permissions', 'budget', 'credentials', 'token', 'access', 'realAgentId', 'api_key', 'wallet'];
  for (const key of forbiddenKeys) {
    insist(!(key in resource), 'SECURITY_VIOLATION', '...');
  }
  ```
  La búsqueda `key in resource` hace coincidencia exacta de cadena. Un invocador o payload que proporcione claves en mayúsculas/variaciones (p. ej., `PERMISSIONS`, `Budget`, `Token`) evade la comprobación sin lanzar la excepción `SECURITY_VIOLATION`.
- **Comando de prueba adversarial ejecutado:**
  ```javascript
  const s0 = createAvatarNeeds('avatar-1');
  applyNeedsAction(s0, {
    type: 'alimentarse',
    resource: { synthetic: true, PERMISSIONS: ['admin'], amount: 10 }
  });
  ```
- **Resultado ejecutado:** La acción fue procesada correctamente y modificó el estado lúdico con `PERMISSIONS: ['admin']` presente en el recurso, evadiendo la seguridad.

### Hallazgo 2 (Robustez - Medio): Inexistencia de validación de estado en `setNeedsPaused` y propagación de `NaN`
- **Descripción:**
  1. `setNeedsPaused(state, paused)` solo comprueba `typeof state === 'object'`, pero **no valida** `state.version === NEEDS_SNAPSHOT_VERSION` ni la validez de `state.needs`. Si se le pasa `{ version: 999, extra: true }`, retorna el objeto corrupto con `paused: true` sin lanzar `VERSION_MISMATCH` ni `INVALID_STATE`.
  2. `applyNeedsAction` ejecutado sobre un estado corrupto al que le falte la propiedad `needs` produce un estado retornado con valores `NaN` (`{ hambre: NaN, energia: NaN, moral: NaN }`) en lugar de rechazar el estado corrupto con `INVALID_STATE`.
  3. `tickNeeds` ejecutado sobre un estado sin propiedad `needs` lanza `TypeError` nativo no capturado (`Cannot read properties of undefined`) en lugar de lanzar una excepción de dominio `LifeNeedsError`.

### Hallazgo 3 (Predicción/Diseño): Concurrencia y rollback no ordenado en `restoreSnapshot`
- **Distinción:** *Predicción de arquitectura / análisis conceptual*.
- **Descripción:** La función `restoreSnapshot(snapshot)` en el wrapper del motor sobrescribe incondicionalmente el estado actual `state` con el snapshot restaurado. Si un sistema concurrente asíncrono invoca `restoreSnapshot` con un snapshot antiguo u fuera de orden, no existe un número de secuencia/generación de estado para detectar la reversión añeja ("stale snapshot overwrite").

---

## 6. Parches mínimos recomendados (Para incorporar en PR #72)

Sin modificar el código en la rama de la PR #72 de forma directa, se recomiendan los siguientes parches mínimos al autor de la PR:

### Parche mínimo 1: Normalización de claves en comprobación de seguridad (`src/life-needs.mjs`)
```javascript
// En applyNeedsAction:
const forbiddenKeys = ['permissions', 'budget', 'credentials', 'token', 'access', 'realagentid', 'api_key', 'wallet'];
const resourceKeys = Object.keys(resource).map(k => k.toLowerCase());
for (const key of forbiddenKeys) {
  insist(!resourceKeys.includes(key), 'SECURITY_VIOLATION', 'El recurso sintético no debe incluir datos de acceso ni presupuestos reales.');
}
```

### Parche mínimo 2: Validación consistente de estado en mutadores
```javascript
// Validar el estado en tickNeeds, applyNeedsAction y setNeedsPaused mediante exportNeedsSnapshot o un helper común
function validateState(state) {
  insist(state && typeof state === 'object', 'INVALID_STATE', 'Estado no válido.');
  insist(state.version === NEEDS_SNAPSHOT_VERSION, 'VERSION_MISMATCH', 'Versión de estado no compatible.');
  validateExactObject(state.needs, NEED_KEYS, 'INVALID_STATE', 'Estructura de necesidades no válida.');
}
```

---

## 7. Conclusión y coordinación

1. **Estado del issue #59:** El issue #59 NO debe cerrarse hasta que los parches de seguridad y validación se integren y aprueben por los propietarios del proyecto.
2. **Acción requerida:** Publicar el presente informe de revisión (`PR_READY` en la tarea de revisión), manteniendo la rama `main` limpia de código no integrado y solicitando los cambios indicados en PR #72.
