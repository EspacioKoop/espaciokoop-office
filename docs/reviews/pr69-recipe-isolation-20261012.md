> **Seguimiento:** los métodos `read` / `list` sin identidad deben mantenerse fuera de endpoints sin guardia; esta auditoría corresponde al SHA de #69 todavía pendiente de integración y no es prueba de un fallo en el servidor actual.

> **Estado de la Auditoría, 12/10/2026:** Esta auditoría evalúa la PR #69 (`02dfa98aa7cc32bf8388b32cea856a9e12cb5eab`), enfocada en el aislamiento de consultas, el modelo de procedencia, el flujo de transiciones de recetas de aprendizaje entre equipos y la validación de políticas. La rama #69 se evalúa de forma inmutable y autónoma, sin alterar el código de producción de `main` ni abrir endpoints HTTP.

# Auditoría de Seguridad y Código: PR #69 (Aislamiento y Procedencia de Recetas de Aprendizaje)

**Fecha de evaluación:** 12 de octubre de 2026
**SHA de la fuente inmutable auditada:** `02dfa98aa7cc32bf8388b32cea856a9e12cb5eab`
**Archivos evaluados:**
- `src/knowledge-recipe.mjs`
- `test/knowledge-recipe.test.mjs`
**Rama de trabajo de auditoría:** `jules-2590646049189502144-a40b4e30` (basada en `main`)
**Archivo de informe entregado:** `docs/reviews/pr69-recipe-isolation-20261012.md`

---

## 1. Resumen Ejecutivo

Esta auditoría analiza la implementación del motor y esquema de recetas de aprendizaje inter-equipos introducido en la PR #69. La evaluación se ha realizado de forma **aislada y autónoma**, verificando el cumplimiento de las Normas Platino, controles de acceso, sanitización de secretos y seguridad de estado.

### Resumen de hallazgos:

1. **Riesgo de Integración / Exposición en Lectura Desprotegida (Severidad Media):**
   - Las funciones `engine.read(recipeId)` y `engine.list()` del motor puro no requieren un argumento `actor_team_id`. Si un host o adaptador HTTP expone directamente estos métodos en un endpoint sin aplicar un middleware de guardia o filtrado por `team_id`, cualquier cliente autenticado o no autenticado podría consultar el contenido completo de recetas de otros equipos.
   - *Nota:* En la prueba aislada del motor puro `engine.list({ team_id })` filtra correctamente cuando se le pasa el filtro, pero el motor en sí no fuerza la autorización en la lectura. Se clasifica como **Riesgo de Integración en Host / Servidor**.

2. **6 Aspectos Verificados y Conformes (Comportamiento Fail-Closed y de Seguridad):**
   - **Flujo Bilateral Completo:** Secuencia pura `create` (requested) → `accept` (accepted) → `deliver` (delivered) → `review` (reviewed) → `revoke` (revoked) con incrementos de versión efectivas nominales (1 → 2 → 3 → 4 → 5).
   - **Idempotencia y Control de Versiones:** La reejecución de operaciones idénticas retorna el resultado almacenado mediante `structuredClone`. Operaciones con versión esperada incongruente son rechazadas con `VERSION_CONFLICT` (409) y operaciones con identificador repetido y distinto payload lanzan `IDEMPOTENCY_CONFLICT` (409).
   - **Validación de Política y Rechazo Fail-Closed (`validateKnowledgeRecipe`):** Políticas incompletas, proyectos no autorizados, equipos solicitantes/destinatarios no incluidos en la política o intentos de elevación de capacidades (`capabilities` no vacías) son rechazados de forma inmediata (*fail-closed*).
   - **Filtrado Estricto de Propiedades Extra y Secretos:** `exact()` rechaza campos no autorizados en payloads de creación, entrega, revisión y revocación. `scanSecrets()` bloquea patrones de tokens y credenciales (`sk-`, `AKIA`, `ghp_`, `Bearer`, private keys, etc.) y términos restringidos de memoria privada.
   - **Aceptación Explícita Exigida:** Se rechaza cualquier aceptación implícita si no incluye el objeto `explicit_consent` específico del equipo destinatario.
   - **Distinción entre Hashes de Evidencia y Autenticación del Servidor:** Se verifica que los hashes SHA-256 de entrega/revisión y de resultado (`expected_output_hash`) acreditan exclusivamente la sintaxis de procedencia y la reproducibilidad del artefacto, pero **NO** sustituyen la autenticación y verificación de identidad del `actor_team_id` realizada por el servidor HTTP.

---

## 2. Entorno y Comandos de Prueba Ejecutados

Todas las pruebas se ejecutaron mediante la suite de Node.js v22.22.1 en un entorno aislado (`/tmp/pr69_runner`) que replica exactamente las versiones del SHA `02dfa98aa7cc32bf8388b32cea856a9e12cb5eab`.

### Comandos de preparación y ejecución:
```bash
# 1. Extracción inmutable de los archivos de la PR #69 desde git
git show 02dfa98aa7cc32bf8388b32cea856a9e12cb5eab:src/knowledge-recipe.mjs > /tmp/pr69_runner/src/knowledge-recipe.mjs
git show 02dfa98aa7cc32bf8388b32cea856a9e12cb5eab:test/knowledge-recipe.test.mjs > /tmp/pr69_runner/test/knowledge-recipe.test.mjs

# 2. Ejecución de la suite unitaria oficial de PR #69
node --test /tmp/pr69_runner/test/knowledge-recipe.test.mjs
```

### Resultado de la suite unitaria oficial de PR #69:
```
1..10
# tests 10
# pass 10
# fail 0
# duration_ms 651.28
```

---

## 3. Pruebas Adversarias Reproducibles

A continuación se detallan los scripts mínimos ejecutados para verificar cada uno de los 5 vectores requeridos por la auditoría.

### Prueba 1: Lectura sin guardia y aislamiento de host (`engine.read` y `engine.list`)

```javascript
node --input-type=module -e "
import { createKnowledgeRecipeEngine } from '/tmp/pr69_runner/src/knowledge-recipe.mjs';

const policy = {
  version: 1,
  members: [
    { id: 'equipo-eloy', label: 'Equipo Eloy' },
    { id: 'equipo-varo', label: 'Equipo Varo' },
    { id: 'equipo-espiad', label: 'Equipo Espiad' }
  ],
  projects: [{ repo: 'EspacioKoop/espaciokoop-office', members: ['equipo-eloy', 'equipo-varo'] }]
};

const engine = createKnowledgeRecipeEngine(policy);

engine.execute({
  operation_id: 'op-1',
  actor_team_id: 'equipo-eloy',
  action: 'create',
  recipe_id: 'receta-confidencial-1',
  expected_version: null,
  payload: {
    recipe_id: 'receta-confidencial-1',
    version: 1,
    source: 'EspacioKoop/espaciokoop-office',
    author: 'eloy',
    requester_team_id: 'equipo-eloy',
    target_team_id: 'equipo-varo',
    title: 'Aprender optimizacion',
    description: 'Descripcion confidencial',
    lesson: { summary: 'Resumen', steps: ['Paso 1'], expected_output_hash: 'a'.repeat(64) },
    evidence_hashes: ['b'.repeat(64)],
    capabilities: []
  }
});

// engine.read(recipeId) sin actor
const readResult = engine.read('receta-confidencial-1');
console.log('UNGUARDED READ RESULT:', readResult ? 'EXPOSED! Title: ' + readResult.title : 'NOT EXPOSED');

// engine.list() sin actor
const listResult = engine.list();
console.log('UNGUARDED LIST ALL count:', listResult.length);

// engine.list con filtro team_id para equipo no participante
const listFilteredEspiad = engine.list({ team_id: 'equipo-espiad' });
console.log('LIST FILTERED FOR ESPIAD count:', listFilteredEspiad.length);
"
```

#### Salida real obtenida:
```
UNGUARDED READ RESULT: EXPOSED! Title: Aprender optimizacion
UNGUARDED LIST ALL count: 1
LIST FILTERED FOR ESPIAD count: 0
```

#### Evaluación de Riesgo:
- **Riesgo de Integración (Severidad Media):** `engine.read(recipeId)` no solicita ni comprueba `actor_team_id`. Si una capa HTTP expone `GET /recipes/:id` mapeando directamente `engine.read()`, un equipo o cliente sin permisos podría leer recetas ajenas.
- **Demostración de Aislamiento:** Al invocar `engine.list({ team_id: 'equipo-espiad' })`, el motor filtra adecuadamente y devuelve 0 resultados. La recomendación es requerir `actor_team_id` en las lecturas de la capa HTTP.

---

### Prueba 2: Política incompleta / malformada y rechazo Fail-Closed

```javascript
node --input-type=module -e "
import { validateKnowledgeRecipe } from '/tmp/pr69_runner/src/knowledge-recipe.mjs';

const validPayload = {
  recipe_id: 'receta-1',
  version: 1,
  source: 'EspacioKoop/espaciokoop-office',
  author: 'eloy',
  requester_team_id: 'equipo-eloy',
  target_team_id: 'equipo-varo',
  title: 'Titulo',
  description: 'Desc',
  lesson: { summary: 'Resumen', steps: ['Paso 1'], expected_output_hash: 'a'.repeat(64) },
  evidence_hashes: ['b'.repeat(64)],
  capabilities: []
};

// 1. Proyecto no listado en la política
try {
  validateKnowledgeRecipe(validPayload, { members: [{ id: 'equipo-eloy' }, { id: 'equipo-varo' }] });
} catch (e) {
  console.log('Missing projects policy:', e.code, e.message);
}

// 2. Requester_team_id fuera de la política
try {
  validateKnowledgeRecipe(validPayload, {
    projects: [{ repo: 'EspacioKoop/espaciokoop-office' }],
    members: [{ id: 'equipo-varo' }]
  });
} catch (e) {
  console.log('Requester missing in policy:', e.code, e.message);
}

// 3. Intento de elevación de capacidades
try {
  validateKnowledgeRecipe({ ...validPayload, capabilities: ['ADMIN_EXEC'] }, null);
} catch (e) {
  console.log('Capability escalation:', e.code, e.message);
}
"
```

#### Salida real obtenida:
```
Missing projects policy: PROVENANCE_REJECTED La fuente no está autorizada en la política de proyectos.
Requester missing in policy: PROVENANCE_REJECTED El equipo solicitante no está incorporado a la política.
Capability escalation: CAPABILITY_ESCALATION_FORBIDDEN Una receta de aprendizaje no puede conceder ni elevar capacidades.
```

---

### Prueba 3: Flujo Bilateral create → accept → deliver → review → revoke e Idempotencia

```javascript
node --input-type=module -e "
import { createKnowledgeRecipeEngine } from '/tmp/pr69_runner/src/knowledge-recipe.mjs';

const policy = {
  version: 1,
  members: [{ id: 'equipo-eloy' }, { id: 'equipo-varo' }],
  projects: [{ repo: 'EspacioKoop/espaciokoop-office' }]
};

const engine = createKnowledgeRecipeEngine(policy);
const recipePayload = {
  recipe_id: 'receta-flow-1',
  version: 1,
  source: 'EspacioKoop/espaciokoop-office',
  author: 'eloy',
  requester_team_id: 'equipo-eloy',
  target_team_id: 'equipo-varo',
  title: 'Flujo Bilateral',
  description: 'Desc',
  lesson: { summary: 'L', steps: ['P1'], expected_output_hash: '11'.repeat(32) },
  evidence_hashes: ['22'.repeat(32)],
  capabilities: []
};

// CREATE (v1)
const r1 = engine.execute({ operation_id: 'op-1', actor_team_id: 'equipo-eloy', action: 'create', recipe_id: 'receta-flow-1', expected_version: null, payload: recipePayload });
// ACCEPT (v2)
const r2 = engine.execute({ operation_id: 'op-2', actor_team_id: 'equipo-varo', action: 'accept', recipe_id: 'receta-flow-1', expected_version: 1, payload: { explicit_consent: { consent: true, team_id: 'equipo-varo' } } });
// DELIVER (v3)
const r3 = engine.execute({ operation_id: 'op-3', actor_team_id: 'equipo-varo', action: 'deliver', recipe_id: 'receta-flow-1', expected_version: 2, payload: { delivery_evidence_hash: '33'.repeat(32), output_hash: '11'.repeat(32) } });
// REVIEW (v4)
const r4 = engine.execute({ operation_id: 'op-4', actor_team_id: 'equipo-eloy', action: 'review', recipe_id: 'receta-flow-1', expected_version: 3, payload: { decision: 'approved', review_evidence_hash: '44'.repeat(32) } });
// REVOKE (v5)
const r5 = engine.execute({ operation_id: 'op-5', actor_team_id: 'equipo-varo', action: 'revoke', recipe_id: 'receta-flow-1', expected_version: 4, payload: { reason: 'Revocacion justificada de prueba' } });

console.log('Final stage:', engine.read('receta-flow-1').stage, 'effective_version:', engine.read('receta-flow-1').effective_version);
"
```

#### Salida real obtenida:
```
Final stage: revoked effective_version: 5
```

---

### Prueba 4: Sanitización de Secretos y Propiedades Extra Inesperadas

```javascript
node --input-type=module -e "
import { createKnowledgeRecipeEngine } from '/tmp/pr69_runner/src/knowledge-recipe.mjs';

const policy = {
  version: 1,
  members: [{ id: 'equipo-eloy' }, { id: 'equipo-varo' }],
  projects: [{ repo: 'EspacioKoop/espaciokoop-office' }]
};

const engine = createKnowledgeRecipeEngine(policy);
// ... setup recipe in 'accepted' stage ...

// 1. Extra field in deliver payload
try {
  engine.execute({
    operation_id: 'op-del-extra',
    actor_team_id: 'equipo-varo',
    action: 'deliver',
    recipe_id: 'receta-sec-1',
    expected_version: 2,
    payload: { delivery_evidence_hash: '33'.repeat(32), output_hash: '11'.repeat(32), extra_secret: 'sk-12345678901234567890' }
  });
} catch (e) {
  console.log('Extra field in deliver rejected:', e.code, e.message);
}

// 2. Secret in revoke reason
try {
  engine.execute({
    operation_id: 'op-rev-sec',
    actor_team_id: 'equipo-varo',
    action: 'revoke',
    recipe_id: 'receta-sec-1',
    expected_version: 2,
    payload: { reason: 'Revoco porque ghp_123456789012345678901234567890123456 se expuso' }
  });
} catch (e) {
  console.log('Secret in revoke reason rejected:', e.code, e.message);
}
"
```

#### Salida real obtenida:
```
Extra field in deliver rejected: OPERATION Propiedades no permitidas.
Secret in revoke reason rejected: SECRET_DETECTED La receta contiene datos privados, secretos o credenciales no permitidos.
```

---

### Prueba 5: Verificación de Identidad Servidor vs Hashes de Evidencia

```javascript
node --input-type=module -e "
import { createKnowledgeRecipeEngine } from '/tmp/pr69_runner/src/knowledge-recipe.mjs';

const policy = {
  version: 1,
  members: [{ id: 'equipo-eloy' }, { id: 'equipo-varo' }, { id: 'equipo-impostor' }],
  projects: [{ repo: 'EspacioKoop/espaciokoop-office' }]
};

const engine = createKnowledgeRecipeEngine(policy);
// ... setup recipe in 'accepted' stage (target_team_id: 'equipo-varo') ...

// Impostor team tries to deliver with a valid delivery_evidence_hash and valid output_hash
try {
  engine.execute({
    operation_id: 'op-impostor-deliver',
    actor_team_id: 'equipo-impostor',
    action: 'deliver',
    recipe_id: 'receta-prov-1',
    expected_version: 2,
    payload: { delivery_evidence_hash: '33'.repeat(32), output_hash: '11'.repeat(32) }
  });
} catch (e) {
  console.log('Impostor rejected by actor_team_id check:', e.code, e.message);
}
"
```

#### Salida real obtenida:
```
Impostor rejected by actor_team_id check: FORBIDDEN Solo el equipo destinatario/proveedor puede entregar la receta.
```

#### Conclusión sobre Identidad y Evidencias:
- Los hashes de evidencia (`delivery_evidence_hash`, `review_evidence_hash`) certifican que se adjunta una huella sintácticamente válida (64 caracteres hex SHA-256) del artefacto entregado o revisado.
- Dichos hashes **NO** autentican quién emite la llamada. El motor confía en que la propiedad `rawOperation.actor_team_id` fue validada por el servidor/host HTTP mediante token o firma criptográfica. Si el servidor no autentica al cliente y acepta cualquier `actor_team_id` proporcionado en el body HTTP, un suplantador podría ejecutar acciones en nombre de otro equipo.

---

## 4. Clasificación de Severidades

| Hallazgo / Aspecto | Severidad | Descripción |
|---|---|---|
| Lectura desprotegida en `engine.read` / `engine.list` | **Media (Riesgo de Integración)** | El motor no filtra por actor en `read()`. La capa de servicio HTTP debe imponer guardia de autorización por `actor_team_id`. |
| Confianza implícita en `actor_team_id` | **Media (Riesgo de Integración)** | Los hashes de evidencia no sustituyen la autenticación de sesión/firma. La capa HTTP debe verificar la identidad real antes de llamar a `engine.execute()`. |
| Validación de política y fail-closed | **Conforme / Informativo** | `validateKnowledgeRecipe` rechaza estrictamente miembros no autorizados, proyectos no registrados y elevación de capacidades. |
| Flujo bilateral e idempotencia | **Conforme / Informativo** | FSM secuencial estricta, verificación de versión esperada y deduplicación idéntica mediante fingerprints. |
| Sanitización de secretos | **Conforme / Informativo** | Bloqueo efectivo de expresiones de tokens, claves SSH/AWS/GitHub y frases reservadas. |

---

## 5. Recomendación de Parche para Futura Integración (Sin alterar producción en esta PR)

Para cuando la PR #69 o su equivalente vaya a ser integrada en un adaptador o servicio HTTP:

1. **Añadir guardia de autorización en `read` / `list`:**
   Mapear las lecturas a un método que exija `actor_team_id` y restrinja el resultado a aquellas recetas donde `requester_team_id === actor` o `target_team_id === actor`.
2. **Garantizar autenticación en el Servidor HTTP:**
   Asegurar que `actor_team_id` provenga de una sesión autenticada (p. ej. token Bearer o firma de clave en cabeceras) y nunca directamente de parámetros no validados de la URL o del body.
3. **Mantener inmutabilidad de la presente PR:**
   Esta PR entrega únicamente el informe de auditoría autorizado en `docs/reviews/pr69-recipe-isolation-20261012.md` sin realizar merges ni modificaciones en `src/`.
