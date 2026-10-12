> **Estado actualizado, 12/10/2026:** esta auditoría se refiere al SHA original de #71 y documenta fallos históricos. La implementación corregida quedó fusionada mediante [#119](https://github.com/EspacioKoop/espaciokoop-office/pull/119) (atomicidad de aceptación, control de autorización en rollback y bloqueo de doble rollback), con CI Node 22/24 verde. Sus defectos reproducidos deben mantenerse como regresiones; no deducir automáticamente que siguen presentes en `main`.

# Auditoría de Seguridad y Código: PR #71 (Ledger de Intercambios)

**Fecha de evaluación:** 12 de octubre de 2026
**Revisión/HEAD auditado:** `ca7702538b80513cb16c3879671c69b85caa6023`
**Rama del autor auditada:** `agent/53-office-trade-ledger-13579615321041413391`
**Rama base:** `main` (`f452c35`)
**Archivos evaluados:**
- `src/office-trade-ledger.mjs`
- `test/office-trade-ledger.test.mjs`

---

## 1. Resumen Ejecutivo

Esta auditoría analiza la implementación del ledger puro de transacciones lúdicas e intercambios introducida en la PR #71 (`ca7702538b80513cb16c3879671c69b85caa6023`). La evaluación se ha realizado de forma **completamente aislada y de solo lectura**, sin alterar la rama del autor.

### Resumen de hallazgos:
1. **3 Defectos Reales (Bugs de severidad Alta/Media):**
   - **Corrupción parcial de estado** en `trade.accept` cuando la deducción del segundo avatar falla.
   - **Reversión repetible (Double-Rollback)** en `gift.send` y `trade.direct` que permite extraer saldos de forma ilimitada.
   - **Falta de control de acceso** en `trade.rollback` que permite a cualquier actor no autorizado revertir operaciones ajenas.
2. **2 Puntos de Diseño No Decididos:**
   - Manejo de excepciones en conflicto de idempotencia (rechazo vía Promise vs payload devuelto).
   - Ausencia de restricciones de cuota o actor en `avatar.register`.
3. **7 Aspectos Verificados y Conformes:**
   - Autorización por avatar en operaciones principales (`gift.send`, `trade.propose`, `trade.accept`, `trade.reject`, `trade.cancel`).
   - Idempotencia nominal con fingerprint idéntico.
   - Serialización de ejecución en memoria evitando condiciones de carrera de doble aceptación.
   - Ausencia absoluta de secretos o credenciales en la serialización.
   - Filtro estricto de objetos privados (`is_private`, `private`, `visibility`) y diccionario de términos no lúdicos (`FORBIDDEN_WORDS`).
   - Alcance estrictamente limitado a activos y objetos lúdicos ficticios (sin activos ni dinero real).
   - Mecanismo de recuperación y transición de estado `reconcile()` para operaciones no confirmadas.

---

## 2. Evidencia y Pruebas Reales Ejecutadas

Las pruebas se ejecutaron mediante scripts dinámicos con `node` (Node.js v22.22.1) invocando directamente las funciones exportadas de `src/office-trade-ledger.mjs` en el SHA `ca7702538b80513cb16c3879671c69b85caa6023`.

### Comando de prueba ejecutado:
```bash
node --input-type=module -e "
import { createOfficeTradeLedger } from './src/office-trade-ledger.mjs';

async function safeExec(ledger, req) {
  try {
    return await ledger.execute(req);
  } catch (err) {
    return { error: true, code: err.code, message: err.message, status: err.status };
  }
}

async function runAuditTests() {
  console.log('=== TEST 1: IDEMPOTENCY CONFLICT ===');
  const l1 = createOfficeTradeLedger();
  await safeExec(l1, { operation_id: 'op1', actor_id: 'o1', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a1', owner_id: 'o1', initial_balance: 100, initial_items: [] } });
  await safeExec(l1, { operation_id: 'op2', actor_id: 'o2', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a2', owner_id: 'o2', initial_balance: 10, initial_items: [] } });
  const res1 = await safeExec(l1, { operation_id: 'gift1', actor_id: 'a1', capability: 'gift.send', expected_versions: {}, input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 10, items: [] } });
  console.log('Gift 1 status:', res1.status);
  const resConflict = await safeExec(l1, { operation_id: 'gift1', actor_id: 'a1', capability: 'gift.send', expected_versions: {}, input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 20, items: [] } });
  console.log('Conflict result:', resConflict);

  console.log('\n=== TEST 2: PARTIAL STATE MUTATION ON FAILED ACCEPT ===');
  const l2 = createOfficeTradeLedger();
  await safeExec(l2, { operation_id: 'op1', actor_id: 'o1', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a1', owner_id: 'o1', initial_balance: 100, initial_items: [] } });
  await safeExec(l2, { operation_id: 'op2', actor_id: 'o2', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a2', owner_id: 'o2', initial_balance: 5, initial_items: [] } });
  await safeExec(l2, { operation_id: 'p1_op', actor_id: 'a1', capability: 'trade.propose', expected_versions: {}, input: { proposal_id: 'p1', proposer_avatar_id: 'a1', counterparty_avatar_id: 'a2', offered_currency: 20, offered_items: [], requested_currency: 50, requested_items: [] } });
  console.log('a1 balance before accept:', l2.getAvatar('a1').balance);
  const acceptRes = await safeExec(l2, { operation_id: 'acc1_op', actor_id: 'a2', capability: 'trade.accept', expected_versions: {}, input: { proposal_id: 'p1', acceptor_avatar_id: 'a2' } });
  console.log('Accept result:', acceptRes.status, acceptRes.code);
  console.log('a1 balance AFTER failed accept:', l2.getAvatar('a1').balance);

  console.log('\n=== TEST 3: REPEATABLE ROLLBACK ===');
  const l3 = createOfficeTradeLedger();
  await safeExec(l3, { operation_id: 'op1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] } });
  await safeExec(l3, { operation_id: 'op2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {}, input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 100, initial_items: [] } });
  await safeExec(l3, { operation_id: 'g1', actor_id: 'a1', capability: 'gift.send', expected_versions: {}, input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 30, items: [] } });
  console.log('Balances after gift: a1=', l3.getAvatar('a1').balance, 'a2=', l3.getAvatar('a2').balance);
  const rb1 = await safeExec(l3, { operation_id: 'rb1', actor_id: 'unauthorized_actor', capability: 'trade.rollback', expected_versions: {}, input: { target_operation_id: 'g1' } });
  console.log('Rollback 1 status:', rb1.status, 'a1=', l3.getAvatar('a1').balance, 'a2=', l3.getAvatar('a2').balance);
  const rb2 = await safeExec(l3, { operation_id: 'rb2', actor_id: 'unauthorized_actor', capability: 'trade.rollback', expected_versions: {}, input: { target_operation_id: 'g1' } });
  console.log('Rollback 2 status:', rb2.status, 'a1=', l3.getAvatar('a1').balance, 'a2=', l3.getAvatar('a2').balance);
}
runAuditTests();
"
```

### Resultado real de la consola:
```
=== TEST 1: IDEMPOTENCY CONFLICT ===
Gift 1 status: applied
Conflict result: {
  error: true,
  code: 'IDEMPOTENCY_CONFLICT',
  message: 'El identificador de operación ya corresponde a otra petición.',
  status: 409
}

=== TEST 2: PARTIAL STATE MUTATION ON FAILED ACCEPT ===
a1 balance before accept: 100
Accept result: rejected INSUFFICIENT_FUNDS
a1 balance AFTER failed accept: 80

=== TEST 3: REPEATABLE ROLLBACK ===
Balances after gift: a1= 70 a2= 130
Rollback 1 status: applied a1= 100 a2= 100
Rollback 2 status: applied a1= 130 a2= 70
```

---

## 3. Análisis Detallado por Categoría

### A. Defectos Reales (Bugs)

#### Defecto 1: Mutación parcial de estado en `trade.accept` ante fallo secundario
- **Ubicación:** `src/office-trade-ledger.mjs`, líneas 402–406.
- **Mecanismo del fallo:** En la ejecución de `trade.accept`, el código realiza:
  ```javascript
  deductAssets(proposer, proposal.offered_currency, proposal.offered_items);
  deductAssets(counterparty, proposal.requested_currency, proposal.requested_items);
  ```
  Si `proposer` dispone del saldo ofrecido, `deductAssets(proposer)` modifica inmediatamente `proposer.balance` e `items` en memoria. A continuación, si `counterparty` no posee los fondos/objetos requeridos, `deductAssets(counterparty)` lanza un error `INSUFFICIENT_FUNDS`. La excepción es capturada por el bloque `catch`, marcando el resultado de la operación como `status: 'rejected'`. Sin embargo, la deducción realizada en `proposer` **no se revierte**, causando una pérdida definitiva e irrecuperable de activos para el proponente sin que la propuesta se haya aceptado.
- **Severidad:** Alta (Corrupción de estado financiero/inventario).

#### Defecto 2: Rollback repetible (Double-Rollback) en `gift.send` y `trade.direct`
- **Ubicación:** `src/office-trade-ledger.mjs`, líneas 481–502.
- **Mecanismo del fallo:** Cuando se invoca `trade.rollback` sobre una operación `gift.send` o `trade.direct`, el ledger descuenta los activos del destinatario y se los devuelve al emisor. Sin embargo, el registro de la operación objetivo (`targetRecord`) **no se actualiza ni se marca como revertido**. Mientras el destinatario conserve saldo suficiente, la misma `target_operation_id` puede ser revertida repetidamente N veces, permitiendo al emisor drenar el saldo del destinatario.
- **Demostración:** En el Test 3 de evidencia, `a1` regala 30 a `a2` (saldos: `a1`=70, `a2`=130). Rollback 1 deja `a1`=100, `a2`=100. Rollback 2 sobre la misma operación deja `a1`=130, `a2`=70.
- **Severidad:** Alta (Invariante de conservación de activos destruida).

#### Defecto 3: Falta de autorización en la capacidad `trade.rollback`
- **Ubicación:** `src/office-trade-ledger.mjs`, líneas 473–530.
- **Mecanismo del fallo:** A diferencia de `gift.send`, `trade.propose`, `trade.accept`, etc., que invocan explícitamente `checkActorAuthorization(rawRequest.actor_id, avatar_id)`, el bloque `capability === 'trade.rollback'` no valida en absoluto `rawRequest.actor_id`. Cualquier actor arbitrario que conozca un `operation_id` puede forzar la reversión de transacciones ajenas.
- **Severidad:** Media-Alta (Salto de autorización).

---

### B. Diseño No Decidido / Puntos Abiertos

#### Punto 1: Comportamiento de excepciones en conflicto de idempotencia
- **Ubicación:** `src/office-trade-ledger.mjs`, línea 185.
- **Análisis:** Cuando un `operation_id` ya existe en el registro pero con un `fingerprint` diferente, se ejecuta:
  ```javascript
  insist(existingRecord.fingerprint === requestFingerprint, 'IDEMPOTENCY_CONFLICT', 'El identificador de operación ya corresponde a otra petición.', 409);
  ```
  Esta comprobación está situada **fuera** del bloque `try {}` interno de la transacción. Como consecuencia, `execute()` devuelve un rechazo de Promise (`throw OfficeError` 409) en lugar de un objeto `{ status: 'rejected', code: 'IDEMPOTENCY_CONFLICT' }`.
- **Estatus:** Diseño no decidido. Debe especificarse en el contrato si las violaciones de protocolo e idempotencia lanzan excepciones no capturadas o devuelven payloads estructurados con `status: 'rejected'`.

#### Punto 2: Alcance y límites de `avatar.register`
- **Análisis:** `avatar.register` permite a cualquier `actor_id` registrar cualquier `avatar_id` con cualquier `initial_balance` y lista de objetos sin comprobación previa de permisos ni cuotas globales.
- **Estatus:** Diseño pendiente. En una arquitectura multi-inquilino o multi-equipo, la creación de avatares debería estar acoplada a la presencia autenticada o restringida por política.

---

### C. Aspectos Verificados y Conformes

1. **Autorización por Avatar en Flujos Nominativos:**
   Verificado que `trade.propose`, `trade.accept`, `trade.reject`, `trade.cancel`, `gift.send` y `trade.direct` verifican mediante `checkActorAuthorization` que el `actor_id` coincide con el `avatar_id` o su `owner_id`. Intentos de personificación son rechazados con `FORBIDDEN` (403).

2. **Idempotencia Nominal:**
   Reenviar exactamente la misma petición (mismo `operation_id` e idéntico payload/fingerprint) devuelve la respuesta en caché mediante `structuredClone(existingRecord.result)` sin modificar el estado ni incrementar las versiones.

3. **Serialización y Prevención de Concurrencia:**
   Todas las operaciones se encolan mediante `serialize()` (`pending = pending.then(...)`). Se ha verificado que dos solicitudes concurrentes para aceptar la misma propuesta no sufren condiciones de carrera: la primera establece `status = 'accepted'`, y la segunda es rechazada con `PROPOSAL_NOT_PENDING` (409).

4. **Serialización Limpia y Aislamiento de Secretos:**
   La estructura de datos de avatares, propuestas y registros no almacena ni expone tokens, claves de API, contraseñas ni cabeceras Bearer. Las lecturas mediante `getAvatarSnapshot` y `getProposalSnapshot` devuelven copias defensivas.

5. **Rechazo de Objetos Privados y Términos No Lúdicos:**
   `validateItem` rechaza explícitamente cualquier objeto con `is_private: true`, `private: true` o `visibility: 'private'` con el código `FORBIDDEN_ITEM`. Adicionalmente, `checkLudicText` comprueba que los identificadores y etiquetas de objetos no contengan palabras reservadas de credenciales (`secret`, `token`, `password`, `key`, `admin`, `bearer`, etc.).

6. **Separación de Contexto y Objetos Lúdicos:**
   Se confirma que el libro de contabilidad gestiona únicamente balances y objetos virtuales dentro del entorno de simulación/RPG. No existe vinculación ni conversión a activos reales, monedas externas o infraestructura de producción.

7. **Recuperación tras Error (`reconcile`):**
   La función `reconcile(operationId)` permite inspeccionar operaciones. Si una operación quedó etiquetada con `status: 'unknown'` (debido a un error interno no previsto), `reconcile` actualiza su estado de forma segura a `status: 'failed'` (`code: 'NOT_APPLIED'`).

---

## 4. Recomendaciones Mínimas para el Autor de PR #71

Para subsanar los defectos identificados antes de cualquier integración en `main`, se recomiendan los siguientes ajustes mínimos:

1. **Transaccionalidad atómica en `trade.accept`:**
   Validar los saldos y posesión de objetos de **ambas** partes antes de realizar cualquier mutación de saldos en memoria, o realizar copias defensivas antes del intercambio:
   ```javascript
   // Verificar previamente que ambos avatares tienen fondos suficientes
   deductAssets(proposer, proposal.offered_currency, proposal.offered_items, { dryRun: true });
   deductAssets(counterparty, proposal.requested_currency, proposal.requested_items, { dryRun: true });
   ```
2. **Control de reversión única en `trade.rollback`:**
   Marcar el registro objetivo `targetRecord` como revertido (o añadir un indicador `targetRecord.rolled_back = true`) y rechazar intentos posteriores de rollback sobre la misma operación.
3. **Autorización en `trade.rollback`:**
   Verificar que `rawRequest.actor_id` pertenezca a uno de los avatares participantes de la transacción objetivo.
4. **Manejo de excepciones de idempotencia:**
   Mover la comprobación de idempotencia al interior del bloque `try {}` de `execute()` para garantizar respuestas estructuradas uniformes.

---

## 5. Estado de la Tarea y Siguientes Pasos

- **Naturaleza de la entrega:** Exclusivamente auditoría documental sobre `docs/reviews/pr71-trade-ledger-security-review.md`.
- **Acciones sobre el código:** No se ha modificado la rama del autor `agent/53-office-trade-ledger-13579615321041413391`.
- **Reserva de rutas (#18):** Se mantiene el registro CLAIM para la ruta exclusiva `docs/reviews/pr71-trade-ledger-security-review.md`.
- **Siguiente paso:** Publicación de PR con esta auditoría, notificación `PR_READY` en #18 y solicitud de revisión por los administradores acordados (Varo/Eloy).
