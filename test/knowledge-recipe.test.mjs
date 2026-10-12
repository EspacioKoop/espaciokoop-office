import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficeError } from '../src/domain.mjs';
import {
  validateKnowledgeRecipe,
  createKnowledgeRecipeEngine,
  RECIPE_STAGES,
  RECIPE_PROTOCOL_VERSION,
} from '../src/knowledge-recipe.mjs';

function fakePolicy() {
  return {
    version: 1,
    members: [
      { id: 'equipo-eloy', label: 'Equipo Eloy', githubLogin: 'eloy', keyHash: 'a'.repeat(64) },
      { id: 'equipo-varo', label: 'Equipo Varo', githubLogin: 'varo', keyHash: 'b'.repeat(64) },
    ],
    projects: [
      {
        repo: 'EspacioKoop/espaciokoop-office',
        label: 'Office Project',
        readers: ['equipo-eloy', 'equipo-varo'],
        tasks: [{ issue: 52, pullRequest: null }],
      },
    ],
  };
}

function fakeRecipe(overrides = {}) {
  return {
    recipe_id: 'recipe-001',
    version: RECIPE_PROTOCOL_VERSION,
    source: 'EspacioKoop/espaciokoop-office',
    author: 'equipo-eloy:synth-agent-1',
    requester_team_id: 'equipo-eloy',
    target_team_id: 'equipo-varo',
    title: 'Receta sintética de aprendizaje de caché',
    description: 'Instrucciones para validar caché determinista entre componentes.',
    lesson: {
      summary: 'Estrategia de invalidación determinista',
      steps: ['Calcular digest del estado', 'Verificar clave de la caché', 'Retirar clave al revocar'],
      expected_output_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
    evidence_hashes: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
    capabilities: [],
    ...overrides,
  };
}

const EV_HASH_DELIVERY = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
const EV_HASH_REVIEW = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const EXPECTED_OUTPUT = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

test('receta: validación estricta de esquema y constantes exportadas', () => {
  assert.deepEqual(RECIPE_STAGES, ['requested', 'accepted', 'delivered', 'reviewed', 'revoked']);
  assert.equal(RECIPE_PROTOCOL_VERSION, 1);

  const policy = fakePolicy();
  const valid = fakeRecipe();
  const validated = validateKnowledgeRecipe(valid, policy);

  assert.equal(validated.recipe_id, 'recipe-001');
  assert.equal(validated.source, 'EspacioKoop/espaciokoop-office');
  assert.equal(validated.lesson.expected_output_hash, EXPECTED_OUTPUT);
  assert.deepEqual(validated.capabilities, []);
});

test('receta: rechazo de secretos, tokens y memoria privada de agentes', () => {
  const policy = fakePolicy();

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    title: 'Receta con clave sk-1234567890abcdefghijklmn secreta',
  }), policy), error => error instanceof OfficeError && error.code === 'SECRET_DETECTED');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    description: 'Usar token Bearer abcdef1234567890 para autenticar',
  }), policy), error => error instanceof OfficeError && error.code === 'SECRET_DETECTED');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    lesson: {
      summary: 'Acceder a memoria mnemosyne del agente',
      steps: ['Leer datos'],
      expected_output_hash: EXPECTED_OUTPUT,
    },
  }), policy), error => error instanceof OfficeError && error.code === 'SECRET_DETECTED');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    title: 'Lectura de real_user_memory no autorizada',
  }), policy), error => error instanceof OfficeError && error.code === 'SECRET_DETECTED');
});

test('receta: rechazo de elevación de capacidades por lección', () => {
  const policy = fakePolicy();

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    capabilities: ['agent.create'],
  }), policy), error => error instanceof OfficeError && error.code === 'CAPABILITY_ESCALATION_FORBIDDEN');
});

test('receta: rechazo de procedencia dudosa o proyecto no autorizado', () => {
  const policy = fakePolicy();

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    source: 'repo/no-autorizado',
  }), policy), error => error instanceof OfficeError && error.code === 'PROVENANCE_REJECTED');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    requester_team_id: 'equipo-desconocido',
  }), policy), error => error instanceof OfficeError && error.code === 'PROVENANCE_REJECTED');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    requester_team_id: 'equipo-eloy',
    target_team_id: 'equipo-eloy',
  }), policy), error => error instanceof OfficeError && error.code === 'INVALID_RECIPE');

  assert.throws(() => validateKnowledgeRecipe(fakeRecipe({
    evidence_hashes: ['no-hash-valid'],
  }), policy), error => error instanceof OfficeError && error.code === 'PROVENANCE_REJECTED');
});

test('receta: flujo nominal puramente secuencial requested -> accepted -> delivered -> reviewed', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);
  const recipeData = fakeRecipe();

  // 1. Create -> requested
  const createOp = engine.execute({
    operation_id: 'op-create-1',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-001',
    expected_version: null,
    payload: recipeData,
  });
  assert.equal(createOp.stage, 'requested');
  assert.equal(createOp.effective_version, 1);

  let state = engine.read('recipe-001');
  assert.equal(state.stage, 'requested');
  assert.equal(state.effective_version, 1);

  // 2. Accept -> accepted (con consentimiento específico)
  const acceptOp = engine.execute({
    operation_id: 'op-accept-1',
    actor_team_id: 'equipo-varo',
    action: 'accept',
    recipe_id: 'recipe-001',
    expected_version: 1,
    payload: { explicit_consent: { consent: true, team_id: 'equipo-varo' } },
  });
  assert.equal(acceptOp.stage, 'accepted');
  assert.equal(acceptOp.effective_version, 2);

  state = engine.read('recipe-001');
  assert.equal(state.stage, 'accepted');
  assert.equal(state.effective_version, 2);

  // 3. Deliver -> delivered (con hash reproducible verificado)
  const deliverOp = engine.execute({
    operation_id: 'op-deliver-1',
    actor_team_id: 'equipo-varo',
    action: 'deliver',
    recipe_id: 'recipe-001',
    expected_version: 2,
    payload: {
      delivery_evidence_hash: EV_HASH_DELIVERY,
      output_hash: EXPECTED_OUTPUT,
    },
  });
  assert.equal(deliverOp.stage, 'delivered');
  assert.equal(deliverOp.effective_version, 3);

  state = engine.read('recipe-001');
  assert.equal(state.stage, 'delivered');
  assert.equal(state.effective_version, 3);
  assert.ok(state.evidence_hashes.includes(EV_HASH_DELIVERY));

  // 4. Review -> reviewed (revisión independiente del equipo solicitante)
  const reviewOp = engine.execute({
    operation_id: 'op-review-1',
    actor_team_id: 'equipo-eloy',
    action: 'review',
    recipe_id: 'recipe-001',
    expected_version: 3,
    payload: {
      decision: 'approved',
      review_evidence_hash: EV_HASH_REVIEW,
    },
  });
  assert.equal(reviewOp.stage, 'reviewed');
  assert.equal(reviewOp.effective_version, 4);

  state = engine.read('recipe-001');
  assert.equal(state.stage, 'reviewed');
  assert.equal(state.effective_version, 4);
  assert.equal(state.history.length, 4);
});

test('receta: rechazo de aceptación implícita sin consentimiento específico', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  engine.execute({
    operation_id: 'op-create-2',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-002',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-002' }),
  });

  assert.throws(() => engine.execute({
    operation_id: 'op-accept-implicit',
    actor_team_id: 'equipo-varo',
    action: 'accept',
    recipe_id: 'recipe-002',
    expected_version: 1,
    payload: { explicit_consent: false },
  }), error => error instanceof OfficeError && error.code === 'IMPLICIT_ACCEPTANCE_REJECTED');
});

test('receta: rechazo de entrega con resultado no reproducible', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  engine.execute({
    operation_id: 'op-create-3',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-003',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-003' }),
  });

  engine.execute({
    operation_id: 'op-accept-3',
    actor_team_id: 'equipo-varo',
    action: 'accept',
    recipe_id: 'recipe-003',
    expected_version: 1,
    payload: { explicit_consent: true },
  });

  assert.throws(() => engine.execute({
    operation_id: 'op-deliver-mismatch',
    actor_team_id: 'equipo-varo',
    action: 'deliver',
    recipe_id: 'recipe-003',
    expected_version: 2,
    payload: {
      delivery_evidence_hash: EV_HASH_DELIVERY,
      output_hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    },
  }), error => error instanceof OfficeError && error.code === 'REPRODUCIBILITY_FAILED');
});

test('receta: permisos de equipo y control de accesos por acción', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  // Destinatario intenta crear -> FORBIDDEN
  assert.throws(() => engine.execute({
    operation_id: 'op-create-forbidden',
    actor_team_id: 'equipo-varo',
    action: 'create',
    recipe_id: 'recipe-004',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-004' }),
  }), error => error instanceof OfficeError && error.code === 'FORBIDDEN');

  engine.execute({
    operation_id: 'op-create-4',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-004',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-004' }),
  });

  // Solicitante intenta aceptar -> FORBIDDEN
  assert.throws(() => engine.execute({
    operation_id: 'op-accept-forbidden',
    actor_team_id: 'equipo-eloy',
    action: 'accept',
    recipe_id: 'recipe-004',
    expected_version: 1,
    payload: { explicit_consent: true },
  }), error => error instanceof OfficeError && error.code === 'FORBIDDEN');
});

test('receta: revocación, bloqueo de transiciones posteriores y filtros de consulta', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  engine.execute({
    operation_id: 'op-create-5',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-005',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-005' }),
  });

  // Revocación por el equipo destinatario
  const revokeOp = engine.execute({
    operation_id: 'op-revoke-5',
    actor_team_id: 'equipo-varo',
    action: 'revoke',
    recipe_id: 'recipe-005',
    expected_version: 1,
    payload: { reason: 'Cambio de prioridades en el proyecto.' },
  });
  assert.equal(revokeOp.stage, 'revoked');
  assert.equal(revokeOp.effective_version, 2);

  // Transición posterior bloqueada por estar revocada
  assert.throws(() => engine.execute({
    operation_id: 'op-accept-after-revoke',
    actor_team_id: 'equipo-varo',
    action: 'accept',
    recipe_id: 'recipe-005',
    expected_version: 2,
    payload: { explicit_consent: true },
  }), error => error instanceof OfficeError && error.code === 'REVOKED');

  // Consulta por filtros
  const revokedList = engine.list({ stage: 'revoked' });
  assert.equal(revokedList.length, 1);
  assert.equal(revokedList[0].recipe_id, 'recipe-005');
});

test('receta: idempotencia y prevención de conflictos por versión', () => {
  const policy = fakePolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  const req = {
    operation_id: 'op-create-6',
    actor_team_id: 'equipo-eloy',
    action: 'create',
    recipe_id: 'recipe-006',
    expected_version: null,
    payload: fakeRecipe({ recipe_id: 'recipe-006' }),
  };

  const first = engine.execute(req);
  const second = engine.execute(structuredClone(req));
  assert.deepEqual(first, second);

  // Mismo operation_id con payload diferente -> IDEMPOTENCY_CONFLICT
  assert.throws(() => engine.execute({
    ...req,
    actor_team_id: 'equipo-varo',
  }), error => error instanceof OfficeError && error.code === 'IDEMPOTENCY_CONFLICT');

  // Transición con versión esperada obsoleta -> VERSION_CONFLICT
  assert.throws(() => engine.execute({
    operation_id: 'op-accept-stale',
    actor_team_id: 'equipo-varo',
    action: 'accept',
    recipe_id: 'recipe-006',
    expected_version: 99,
    payload: { explicit_consent: true },
  }), error => error instanceof OfficeError && error.code === 'VERSION_CONFLICT');
});
