import { OfficeError, insist, digest, clean } from './domain.mjs';

export const RECIPE_STAGES = Object.freeze(['requested', 'accepted', 'delivered', 'reviewed', 'revoked']);
export const RECIPE_PROTOCOL_VERSION = 1;

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const hashPattern = /^[a-f0-9]{64}$/i;
const secretPatterns = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /Bearer\s+[a-zA-Z0-9._~+/-]+=*/i,
  /-----BEGIN\s+(?:EC|RSA|OPENSSH|PRIVATE)\s+KEY-----/,
  /(?:password|secret|token|api_key|private_key)\s*[:=]\s*\S+/i,
  /\bmnemosyne\b/i,
  /\breal_user_memory\b/i,
];

function exact(value, keys, code = 'INVALID_RECIPE') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, 'Objeto no válido.');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), code, 'Propiedades no permitidas.');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return digest(JSON.stringify(canonical(value)));
}

function scanSecrets(text) {
  const str = String(text ?? '');
  for (const pattern of secretPatterns) {
    insist(!pattern.test(str), 'SECRET_DETECTED', 'La receta contiene datos privados, secretos o credenciales no permitidos.');
  }
}

export function validateKnowledgeRecipe(raw, policy = null) {
  exact(raw, [
    'recipe_id',
    'version',
    'source',
    'author',
    'requester_team_id',
    'target_team_id',
    'title',
    'description',
    'lesson',
    'evidence_hashes',
    'capabilities',
  ], 'INVALID_RECIPE');

  insist(typeof raw.recipe_id === 'string' && idPattern.test(raw.recipe_id), 'INVALID_RECIPE', 'Identificador de receta no válido.');
  insist(raw.version === RECIPE_PROTOCOL_VERSION, 'VERSION', 'Versión de protocolo de receta no admitida.');

  scanSecrets(raw.recipe_id);
  scanSecrets(raw.author);
  scanSecrets(raw.title);
  scanSecrets(raw.description);

  if (policy) {
    insist(Array.isArray(policy.projects) && policy.projects.some(p => p.repo.toLowerCase() === String(raw.source).toLowerCase()),
      'PROVENANCE_REJECTED', 'La fuente no está autorizada en la política de proyectos.', 403);
    const memberIds = new Set(policy.members.map(m => m.id));
    insist(memberIds.has(raw.requester_team_id), 'PROVENANCE_REJECTED', 'El equipo solicitante no está incorporado a la política.', 403);
    insist(memberIds.has(raw.target_team_id), 'PROVENANCE_REJECTED', 'El equipo destinatario no está incorporado a la política.', 403);
  }

  insist(typeof raw.source === 'string' && raw.source.length > 0 && raw.source.length <= 120, 'PROVENANCE_REJECTED', 'Fuente de la receta no válida.');
  insist(typeof raw.author === 'string' && idPattern.test(raw.author), 'PROVENANCE_REJECTED', 'Autor con identidad no válida.');
  insist(typeof raw.requester_team_id === 'string' && idPattern.test(raw.requester_team_id), 'PROVENANCE_REJECTED', 'Equipo solicitante no válido.');
  insist(typeof raw.target_team_id === 'string' && idPattern.test(raw.target_team_id), 'PROVENANCE_REJECTED', 'Equipo destinatario no válido.');
  insist(raw.requester_team_id !== raw.target_team_id, 'INVALID_RECIPE', 'La receta debe ser bilateral entre equipos distintos.');

  insist(typeof raw.title === 'string' && raw.title.length > 0 && raw.title.length <= 120, 'INVALID_RECIPE', 'Título de receta no válido.');
  insist(typeof raw.description === 'string' && raw.description.length <= 500, 'INVALID_RECIPE', 'Descripción de receta demasiado larga.');

  exact(raw.lesson, ['summary', 'steps', 'expected_output_hash'], 'INVALID_RECIPE');
  insist(typeof raw.lesson.summary === 'string' && raw.lesson.summary.length > 0 && raw.lesson.summary.length <= 240, 'INVALID_RECIPE', 'Resumen de lección no válido.');
  scanSecrets(raw.lesson.summary);

  insist(Array.isArray(raw.lesson.steps) && raw.lesson.steps.length > 0 && raw.lesson.steps.length <= 10, 'INVALID_RECIPE', 'Pasos de la lección no válidos.');
  for (const step of raw.lesson.steps) {
    insist(typeof step === 'string' && step.length > 0 && step.length <= 240, 'INVALID_RECIPE', 'Paso de lección no válido.');
    scanSecrets(step);
  }

  insist(typeof raw.lesson.expected_output_hash === 'string' && hashPattern.test(raw.lesson.expected_output_hash),
    'INVALID_RECIPE', 'El hash de resultado reproducible no es un SHA-256 hex válido.');

  insist(Array.isArray(raw.evidence_hashes) && raw.evidence_hashes.length > 0 && raw.evidence_hashes.length <= 10,
    'PROVENANCE_REJECTED', 'Se requiere al menos un hash de evidencia válido.');
  for (const h of raw.evidence_hashes) {
    insist(typeof h === 'string' && hashPattern.test(h), 'PROVENANCE_REJECTED', 'Hash de evidencia no válido.');
  }

  insist(Array.isArray(raw.capabilities), 'INVALID_RECIPE', 'El campo capabilities debe ser una lista.');
  insist(raw.capabilities.length === 0, 'CAPABILITY_ESCALATION_FORBIDDEN', 'Una receta de aprendizaje no puede conceder ni elevar capacidades.', 403);

  return structuredClone({
    recipe_id: raw.recipe_id,
    version: raw.version,
    source: raw.source,
    author: raw.author,
    requester_team_id: raw.requester_team_id,
    target_team_id: raw.target_team_id,
    title: clean(raw.title, 120),
    description: clean(raw.description, 500),
    lesson: {
      summary: clean(raw.lesson.summary, 240),
      steps: raw.lesson.steps.map(s => clean(s, 240)),
      expected_output_hash: raw.lesson.expected_output_hash.toLowerCase(),
    },
    evidence_hashes: raw.evidence_hashes.map(h => h.toLowerCase()),
    capabilities: [],
  });
}

export function createKnowledgeRecipeEngine(policy) {
  insist(policy && typeof policy === 'object', 'POLICY', 'Política de equipo requerida.');

  const recipes = new Map();
  const operations = new Map();

  function assertActorInPolicy(actorTeamId) {
    insist(typeof actorTeamId === 'string' && idPattern.test(actorTeamId), 'FORBIDDEN', 'Identificador de equipo actor no válido.', 403);
    const memberIds = new Set(Array.isArray(policy.members) ? policy.members.map(m => m.id) : []);
    insist(memberIds.has(actorTeamId), 'FORBIDDEN', 'El equipo actor no está autorizado en la política.', 403);
  }

  function readInternal(recipeId) {
    insist(typeof recipeId === 'string' && idPattern.test(recipeId), 'INVALID_RECIPE', 'Identificador de receta no válido.');
    const recipe = recipes.get(recipeId);
    return recipe ? structuredClone(recipe) : null;
  }

  function read(recipeId, options = {}) {
    const actorTeamId = options?.actor_team_id;
    assertActorInPolicy(actorTeamId);

    const recipe = readInternal(recipeId);
    if (!recipe) return null;

    if (recipe.requester_team_id !== actorTeamId && recipe.target_team_id !== actorTeamId) {
      return null;
    }

    return recipe;
  }

  function execute(rawOperation) {
    exact(rawOperation, ['operation_id', 'actor_team_id', 'action', 'recipe_id', 'expected_version', 'payload'], 'OPERATION');
    insist(typeof rawOperation.operation_id === 'string' && idPattern.test(rawOperation.operation_id), 'OPERATION', 'Identificador de operación no válido.');
    insist(typeof rawOperation.actor_team_id === 'string' && idPattern.test(rawOperation.actor_team_id), 'OPERATION', 'Identificador de actor no válido.');
    insist(['create', 'accept', 'deliver', 'review', 'revoke'].includes(rawOperation.action), 'OPERATION', 'Acción no reconocida.');
    insist(typeof rawOperation.recipe_id === 'string' && idPattern.test(rawOperation.recipe_id), 'OPERATION', 'Identificador de receta no válido.');
    insist(rawOperation.expected_version === null || (Number.isSafeInteger(rawOperation.expected_version) && rawOperation.expected_version >= 0),
      'OPERATION', 'Versión esperada no válida.');

    const memberIds = new Set(policy.members.map(m => m.id));
    insist(memberIds.has(rawOperation.actor_team_id), 'FORBIDDEN', 'El equipo actor no está autorizado en la política.', 403);

    const opFingerprint = fingerprint(rawOperation);
    const existingOp = operations.get(rawOperation.operation_id);
    if (existingOp) {
      insist(existingOp.fingerprint === opFingerprint, 'IDEMPOTENCY_CONFLICT', 'El identificador de operación ya fue utilizado con un payload diferente.', 409);
      return structuredClone(existingOp.result);
    }

    const current = readInternal(rawOperation.recipe_id);

    if (rawOperation.action === 'create') {
      insist(current === null && rawOperation.expected_version === null, 'VERSION_CONFLICT', 'La receta ya existe o la versión esperada no es nula.', 409);
      const validated = validateKnowledgeRecipe(rawOperation.payload, policy);
      insist(validated.recipe_id === rawOperation.recipe_id, 'INVALID_RECIPE', 'El recipe_id de la petición no coincide con la receta.');
      insist(rawOperation.actor_team_id === validated.requester_team_id, 'FORBIDDEN', 'Solo el equipo solicitante puede crear la solicitud de receta.', 403);

      const record = {
        ...validated,
        stage: 'requested',
        effective_version: 1,
        history: [{
          stage: 'requested',
          actor_team_id: rawOperation.actor_team_id,
          timestamp: new Date().toISOString(),
          version: 1,
        }],
      };

      recipes.set(validated.recipe_id, record);

      const readBack = readInternal(validated.recipe_id);
      insist(readBack !== null && readBack.effective_version === 1 && readBack.stage === 'requested',
        'READBACK_MISMATCH', 'Inconsistencia en la verificación de lectura (read-back).', 500);

      const result = {
        recipe_id: validated.recipe_id,
        stage: 'requested',
        effective_version: 1,
        status: 'applied',
      };

      operations.set(rawOperation.operation_id, { fingerprint: opFingerprint, result });
      return structuredClone(result);
    }

    insist(current !== null, 'NOT_FOUND', 'Receta de aprendizaje no encontrada.', 404);
    insist(rawOperation.expected_version === current.effective_version, 'VERSION_CONFLICT', 'La versión de la receta ha cambiado.', 409);
    insist(current.stage !== 'revoked', 'REVOKED', 'La receta de aprendizaje ha sido revocada.', 409);

    const nextVersion = current.effective_version + 1;
    let nextStage = current.stage;

    if (rawOperation.action === 'accept') {
      insist(current.stage === 'requested', 'INVALID_STATE_TRANSITION', 'Solo se puede aceptar una receta en estado requested.', 409);
      insist(rawOperation.actor_team_id === current.target_team_id, 'FORBIDDEN', 'Solo el equipo destinatario puede aceptar la receta.', 403);

      const consent = rawOperation.payload?.explicit_consent;
      const isExplicit = consent === true || (consent && typeof consent === 'object' && consent.consent === true && consent.team_id === current.target_team_id);
      insist(isExplicit, 'IMPLICIT_ACCEPTANCE_REJECTED', 'Aceptación implícita no permitida. Se requiere consentimiento específico.', 400);

      nextStage = 'accepted';
      current.history.push({
        stage: 'accepted',
        actor_team_id: rawOperation.actor_team_id,
        timestamp: new Date().toISOString(),
        version: nextVersion,
      });
    } else if (rawOperation.action === 'deliver') {
      insist(current.stage === 'accepted', 'INVALID_STATE_TRANSITION', 'Solo se puede entregar una receta en estado accepted.', 409);
      insist(rawOperation.actor_team_id === current.target_team_id, 'FORBIDDEN', 'Solo el equipo destinatario/proveedor puede entregar la receta.', 403);

      exact(rawOperation.payload, ['delivery_evidence_hash', 'output_hash'], 'OPERATION');
      insist(typeof rawOperation.payload.delivery_evidence_hash === 'string' && hashPattern.test(rawOperation.payload.delivery_evidence_hash),
        'PROVENANCE_REJECTED', 'Hash de evidencia de entrega no válido.');
      insist(typeof rawOperation.payload.output_hash === 'string' && hashPattern.test(rawOperation.payload.output_hash),
        'REPRODUCIBILITY_FAILED', 'El hash de resultado no es válido.');

      const outputMatches = rawOperation.payload.output_hash.toLowerCase() === current.lesson.expected_output_hash.toLowerCase();
      insist(outputMatches, 'REPRODUCIBILITY_FAILED', 'El resultado entregado no coincide con el resultado reproducible esperado de la receta.', 400);

      const newEvHash = rawOperation.payload.delivery_evidence_hash.toLowerCase();
      if (!current.evidence_hashes.includes(newEvHash)) {
        current.evidence_hashes.push(newEvHash);
      }

      nextStage = 'delivered';
      current.history.push({
        stage: 'delivered',
        actor_team_id: rawOperation.actor_team_id,
        evidence_hash: newEvHash,
        output_hash: rawOperation.payload.output_hash.toLowerCase(),
        timestamp: new Date().toISOString(),
        version: nextVersion,
      });
    } else if (rawOperation.action === 'review') {
      insist(current.stage === 'delivered', 'INVALID_STATE_TRANSITION', 'Solo se puede revisar una receta en estado delivered.', 409);
      insist(rawOperation.actor_team_id === current.requester_team_id, 'FORBIDDEN', 'Solo el equipo solicitante puede realizar la revisión independiente.', 403);

      exact(rawOperation.payload, ['decision', 'review_evidence_hash'], 'OPERATION');
      insist(rawOperation.payload.decision === 'approved', 'REVIEW_REJECTED', 'La decisión de revisión debe ser approved.');
      insist(typeof rawOperation.payload.review_evidence_hash === 'string' && hashPattern.test(rawOperation.payload.review_evidence_hash),
        'PROVENANCE_REJECTED', 'Hash de evidencia de revisión no válido.');

      const newEvHash = rawOperation.payload.review_evidence_hash.toLowerCase();
      if (!current.evidence_hashes.includes(newEvHash)) {
        current.evidence_hashes.push(newEvHash);
      }

      nextStage = 'reviewed';
      current.history.push({
        stage: 'reviewed',
        actor_team_id: rawOperation.actor_team_id,
        decision: 'approved',
        evidence_hash: newEvHash,
        timestamp: new Date().toISOString(),
        version: nextVersion,
      });
    } else if (rawOperation.action === 'revoke') {
      insist(['requester_team_id', 'target_team_id'].some(k => current[k] === rawOperation.actor_team_id),
        'FORBIDDEN', 'Solo un equipo participante puede revocar la receta.', 403);

      exact(rawOperation.payload, ['reason'], 'OPERATION');
      insist(typeof rawOperation.payload.reason === 'string' && rawOperation.payload.reason.length > 0 && rawOperation.payload.reason.length <= 240,
        'OPERATION', 'Motivo de revocación no válido.');
      scanSecrets(rawOperation.payload.reason);

      nextStage = 'revoked';
      current.history.push({
        stage: 'revoked',
        actor_team_id: rawOperation.actor_team_id,
        reason: clean(rawOperation.payload.reason, 240),
        timestamp: new Date().toISOString(),
        version: nextVersion,
      });
    }

    current.stage = nextStage;
    current.effective_version = nextVersion;
    recipes.set(current.recipe_id, current);

    const readBack = readInternal(current.recipe_id);
    insist(readBack !== null && readBack.effective_version === nextVersion && readBack.stage === nextStage,
      'READBACK_MISMATCH', 'Inconsistencia en la verificación de lectura (read-back).', 500);

    const result = {
      recipe_id: current.recipe_id,
      stage: nextStage,
      effective_version: nextVersion,
      status: 'applied',
    };

    operations.set(rawOperation.operation_id, { fingerprint: opFingerprint, result });
    return structuredClone(result);
  }

  function list(filter = {}) {
    const actorTeamId = filter?.actor_team_id;
    assertActorInPolicy(actorTeamId);

    let result = Array.from(recipes.values())
      .filter(r => r.requester_team_id === actorTeamId || r.target_team_id === actorTeamId)
      .map(r => structuredClone(r));

    if (filter.stage) {
      result = result.filter(r => r.stage === filter.stage);
    }
    if (filter.source) {
      result = result.filter(r => r.source.toLowerCase() === String(filter.source).toLowerCase());
    }
    if (filter.team_id) {
      result = result.filter(r => r.requester_team_id === filter.team_id || r.target_team_id === filter.team_id);
    }
    return result;
  }

  return {
    read,
    execute,
    list,
  };
}
