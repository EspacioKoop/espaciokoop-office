import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { OfficeError } from '../src/domain.mjs';
import {
  createKnowledgeRecipeEngine,
  RECIPE_PROTOCOL_VERSION,
} from '../src/knowledge-recipe.mjs';

const TEAM_IDS = [
  'equipo-alpha',
  'equipo-beta',
  'equipo-gamma',
  'equipo-delta',
  'equipo-epsilon',
];

const OUTPUT_HASH = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const EV_HASH_DELIVERY = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
const EV_HASH_REVIEW = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function createMultiTeamPolicy() {
  return {
    version: 1,
    members: TEAM_IDS.map((id, index) => ({
      id,
      label: `Equipo ${id}`,
      githubLogin: id,
      keyHash: String(index + 1).repeat(64),
    })),
    projects: [
      {
        repo: 'EspacioKoop/espaciokoop-office',
        label: 'Office Project',
        readers: [...TEAM_IDS],
        tasks: [{ issue: 100, pullRequest: null }],
      },
    ],
  };
}

function makeRecipe(id, requester, target, overrides = {}) {
  return {
    recipe_id: id,
    version: RECIPE_PROTOCOL_VERSION,
    source: 'EspacioKoop/espaciokoop-office',
    author: `${requester}:agent-1`,
    requester_team_id: requester,
    target_team_id: target,
    title: `Receta sintética ${id}`,
    description: `Descripción para ${id}`,
    lesson: {
      summary: `Resumen de lección ${id}`,
      steps: ['Paso 1 de entrenamiento', 'Paso 2 de verificación'],
      expected_output_hash: OUTPUT_HASH,
    },
    evidence_hashes: ['a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'],
    capabilities: [],
    ...overrides,
  };
}

test('ACL isolation 1: list() entre 5 equipos solo devuelve recetas participantes y rechaza team_id falsificados', () => {
  const policy = createMultiTeamPolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  // Crear 4 recetas sintéticas con distintas combinaciones de equipos
  // R1: alpha -> beta
  // R2: beta -> gamma
  // R3: gamma -> delta
  // R4: delta -> epsilon
  const recipesMeta = [
    { id: 'recipe-ab', req: 'equipo-alpha', target: 'equipo-beta' },
    { id: 'recipe-bg', req: 'equipo-beta', target: 'equipo-gamma' },
    { id: 'recipe-gd', req: 'equipo-gamma', target: 'equipo-delta' },
    { id: 'recipe-de', req: 'equipo-delta', target: 'equipo-epsilon' },
  ];

  for (const r of recipesMeta) {
    engine.execute({
      operation_id: `op-create-${r.id}`,
      actor_team_id: r.req,
      action: 'create',
      recipe_id: r.id,
      expected_version: null,
      payload: makeRecipe(r.id, r.req, r.target),
    });
  }

  // 1. Verificar list() para cada equipo
  for (const teamId of TEAM_IDS) {
    const listResult = engine.list({ actor_team_id: teamId });
    const expectedIds = recipesMeta
      .filter(r => r.req === teamId || r.target === teamId)
      .map(r => r.id);

    assert.equal(listResult.length, expectedIds.length);
    for (const item of listResult) {
      assert.ok(
        item.requester_team_id === teamId || item.target_team_id === teamId,
        `El equipo ${teamId} no debería ver la receta ${item.recipe_id}`
      );
      assert.ok(expectedIds.includes(item.recipe_id));
    }
  }

  // 2. Filtros falsificados team_id != actor_team_id deben rechazarse con FORBIDDEN
  for (const actorTeam of TEAM_IDS) {
    for (const spoofedTeam of TEAM_IDS) {
      if (actorTeam === spoofedTeam) continue;
      assert.throws(
        () => engine.list({ actor_team_id: actorTeam, team_id: spoofedTeam }),
        err => err instanceof OfficeError && err.code === 'FORBIDDEN' && err.status === 403,
        `El filtro falsificado team_id=${spoofedTeam} para actor=${actorTeam} no fue rechazado`
      );
    }
  }

  // 3. Propiedad estática con fast-check para combinaciones aleatorias de consultas
  fc.assert(
    fc.property(
      fc.constantFrom(...TEAM_IDS),
      fc.option(fc.constantFrom(...TEAM_IDS, 'equipo-desconocido')),
      (actorTeam, filterTeam) => {
        if (filterTeam !== undefined && filterTeam !== actorTeam) {
          assert.throws(
            () => engine.list({ actor_team_id: actorTeam, team_id: filterTeam }),
            err => err instanceof OfficeError && err.code === 'FORBIDDEN'
          );
        } else {
          const listResult = engine.list({ actor_team_id: actorTeam });
          for (const item of listResult) {
            assert.ok(item.requester_team_id === actorTeam || item.target_team_id === actorTeam);
          }
        }
      }
    ),
    { numRuns: 100, seed: 13579 }
  );
});

test('ACL isolation 2: read() falla cerrado en actores no participantes o anónimos, inexistente y revocado', () => {
  const policy = createMultiTeamPolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  // Crear receta R1 (alpha -> beta)
  engine.execute({
    operation_id: 'op-create-read-1',
    actor_team_id: 'equipo-alpha',
    action: 'create',
    recipe_id: 'recipe-read-1',
    expected_version: null,
    payload: makeRecipe('recipe-read-1', 'equipo-alpha', 'equipo-beta'),
  });

  // A. Lectura de actor no participante en receta (gamma, delta, epsilon) -> FORBIDDEN
  for (const nonParticipant of ['equipo-gamma', 'equipo-delta', 'equipo-epsilon']) {
    assert.throws(
      () => engine.read('recipe-read-1', { actor_team_id: nonParticipant }),
      err => err instanceof OfficeError && err.code === 'FORBIDDEN' && err.status === 403
    );
  }

  // B. Lectura anónima o con identidades no autorizadas/fuera de política -> FORBIDDEN
  const invalidActors = [undefined, null, '', 'equipo-desconocido', 'equipo-intruder', 123, {}];
  for (const actor of invalidActors) {
    assert.throws(
      () => engine.read('recipe-read-1', { actor_team_id: actor }),
      err => err instanceof OfficeError && err.code === 'FORBIDDEN' && err.status === 403
    );
  }

  // C. Receta inexistente:
  // - Para miembros de la política: retorna null (no existe la receta)
  for (const memberTeam of TEAM_IDS) {
    assert.equal(engine.read('recipe-inexistente', { actor_team_id: memberTeam }), null);
  }
  // - Para actor no incorporado a la política o anónimo: falla cerrado con FORBIDDEN (no se revela estado)
  for (const invalidActor of [undefined, null, '', 'equipo-intruder', 'equipo-desconocido']) {
    assert.throws(
      () => engine.read('recipe-inexistente', { actor_team_id: invalidActor }),
      err => err instanceof OfficeError && err.code === 'FORBIDDEN' && err.status === 403
    );
  }

  // D. Receta revocada:
  // Revocar la receta por parte del participante (beta)
  engine.execute({
    operation_id: 'op-revoke-read-1',
    actor_team_id: 'equipo-beta',
    action: 'revoke',
    recipe_id: 'recipe-read-1',
    expected_version: 1,
    payload: { reason: 'Revocación de prueba QA' },
  });

  // - Participante lee la receta revocada -> ve stage: 'revoked'
  const revokedRecord = engine.read('recipe-read-1', { actor_team_id: 'equipo-alpha' });
  assert.ok(revokedRecord !== null);
  assert.equal(revokedRecord.stage, 'revoked');

  // - No participante/anónimo leyendo la receta revocada -> FORBIDDEN (no enumeración accidental)
  for (const actor of ['equipo-gamma', 'equipo-delta', undefined, null, 'equipo-intruder']) {
    assert.throws(
      () => engine.read('recipe-read-1', { actor_team_id: actor }),
      err => err instanceof OfficeError && err.code === 'FORBIDDEN' && err.status === 403
    );
  }

  // E. Propiedad fast-check para peticiones de lectura aleatorias
  fc.assert(
    fc.property(
      fc.constantFrom('recipe-read-1', 'recipe-inexistente', 'recipe-aleatoria'),
      fc.option(fc.constantFrom(...TEAM_IDS, 'equipo-intruder', 'equipo-fake')),
      (recipeId, actorTeam) => {
        const isAuthorizedTeamInPolicy = TEAM_IDS.includes(actorTeam);

        if (!isAuthorizedTeamInPolicy) {
          // Actor anónimo o no en política -> FORBIDDEN
          assert.throws(
            () => engine.read(recipeId, { actor_team_id: actorTeam }),
            err => err instanceof OfficeError && err.code === 'FORBIDDEN'
          );
        } else if (recipeId === 'recipe-read-1') {
          // Receta existente recipe-read-1
          const isParticipant = actorTeam === 'equipo-alpha' || actorTeam === 'equipo-beta';
          if (isParticipant) {
            const res = engine.read(recipeId, { actor_team_id: actorTeam });
            assert.equal(res.stage, 'revoked');
          } else {
            // No participante en receta existente -> FORBIDDEN
            assert.throws(
              () => engine.read(recipeId, { actor_team_id: actorTeam }),
              err => err instanceof OfficeError && err.code === 'FORBIDDEN'
            );
          }
        } else {
          // Receta inexistente para equipo en política -> null
          const res = engine.read(recipeId, { actor_team_id: actorTeam });
          assert.equal(res, null);
        }
      }
    ),
    { numRuns: 100, seed: 24680 }
  );
});

test('ACL isolation 3: copia defensiva e inmunidad a mutaciones en read() y list()', () => {
  const policy = createMultiTeamPolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  engine.execute({
    operation_id: 'op-create-defensive',
    actor_team_id: 'equipo-alpha',
    action: 'create',
    recipe_id: 'recipe-defensive',
    expected_version: null,
    payload: makeRecipe('recipe-defensive', 'equipo-alpha', 'equipo-beta'),
  });

  // 1. Mutar el objeto retornado por read()
  const read1 = engine.read('recipe-defensive', { actor_team_id: 'equipo-alpha' });
  read1.title = 'Título Hackeado';
  read1.lesson.steps.push('Paso Malicioso');
  read1.lesson.expected_output_hash = '0000000000000000000000000000000000000000000000000000000000000000';
  read1.history.push({ stage: 'fake', actor_team_id: 'equipo-gamma' });
  read1.capabilities.push('admin');

  // Segunda lectura desde el mismo actor
  const read2 = engine.read('recipe-defensive', { actor_team_id: 'equipo-alpha' });
  assert.equal(read2.title, 'Receta sintética recipe-defensive');
  assert.equal(read2.lesson.steps.length, 2);
  assert.equal(read2.lesson.expected_output_hash, OUTPUT_HASH);
  assert.equal(read2.history.length, 1);
  assert.deepEqual(read2.capabilities, []);

  // Lectura desde el segundo participante (equipo-beta)
  const read3 = engine.read('recipe-defensive', { actor_team_id: 'equipo-beta' });
  assert.equal(read3.title, 'Receta sintética recipe-defensive');
  assert.equal(read3.lesson.steps.length, 2);

  // 2. Mutar los objetos y array retornados por list()
  const list1 = engine.list({ actor_team_id: 'equipo-beta' });
  assert.equal(list1.length, 1);
  list1[0].title = 'Título Corrompido En Lista';
  list1[0].lesson.steps = [];
  list1.pop();

  const list2 = engine.list({ actor_team_id: 'equipo-beta' });
  assert.equal(list2.length, 1);
  assert.equal(list2[0].title, 'Receta sintética recipe-defensive');
  assert.equal(list2[0].lesson.steps.length, 2);

  // 3. Propiedad fast-check: mutaciones aleatorias en copias no afectan lecturas posteriores
  fc.assert(
    fc.property(
      fc.string(),
      fc.array(fc.string()),
      (fakeTitle, fakeSteps) => {
        const obj = engine.read('recipe-defensive', { actor_team_id: 'equipo-alpha' });
        obj.title = fakeTitle;
        obj.lesson.steps = fakeSteps;

        const fresh = engine.read('recipe-defensive', { actor_team_id: 'equipo-alpha' });
        assert.equal(fresh.title, 'Receta sintética recipe-defensive');
        assert.equal(fresh.lesson.steps.length, 2);
      }
    ),
    { numRuns: 50, seed: 98765 }
  );
});

test('ACL isolation 4: invariantes de visibilidad y ciclo de vida de transiciones (create -> accept -> deliver -> review -> revoke)', () => {
  const policy = createMultiTeamPolicy();
  const engine = createKnowledgeRecipeEngine(policy);

  const recipeId = 'recipe-lifecycle-1';
  const reqTeam = 'equipo-alpha';
  const targetTeam = 'equipo-beta';
  const nonParticipants = ['equipo-gamma', 'equipo-delta', 'equipo-epsilon'];

  // Helper para verificar visibilidad estricta
  function assertVisibilityInvariants(expectedStage, expectedVersion, historyLength) {
    // Participantes ven la receta con el estado y versión correctos
    for (const p of [reqTeam, targetTeam]) {
      const rec = engine.read(recipeId, { actor_team_id: p });
      assert.ok(rec !== null);
      assert.equal(rec.stage, expectedStage);
      assert.equal(rec.effective_version, expectedVersion);
      assert.equal(rec.history.length, historyLength);

      // Historial ordenado y con estructura coherente (sin depender de reloj de pared)
      assert.ok(Array.isArray(rec.history));
      rec.history.forEach((h, idx) => {
        assert.equal(h.version, idx + 1);
        assert.ok(typeof h.timestamp === 'string' && h.timestamp.length > 0);
      });

      const l = engine.list({ actor_team_id: p });
      assert.ok(l.some(item => item.recipe_id === recipeId && item.stage === expectedStage));
    }

    // No participantes no pueden leer ni ver en list()
    for (const np of nonParticipants) {
      assert.throws(
        () => engine.read(recipeId, { actor_team_id: np }),
        err => err instanceof OfficeError && err.code === 'FORBIDDEN'
      );
      const l = engine.list({ actor_team_id: np });
      assert.ok(!l.some(item => item.recipe_id === recipeId));
    }
  }

  // 1. CREATE -> requested
  engine.execute({
    operation_id: 'op-lc-create',
    actor_team_id: reqTeam,
    action: 'create',
    recipe_id: recipeId,
    expected_version: null,
    payload: makeRecipe(recipeId, reqTeam, targetTeam),
  });
  assertVisibilityInvariants('requested', 1, 1);

  // 2. ACCEPT -> accepted
  engine.execute({
    operation_id: 'op-lc-accept',
    actor_team_id: targetTeam,
    action: 'accept',
    recipe_id: recipeId,
    expected_version: 1,
    payload: { explicit_consent: { consent: true, team_id: targetTeam } },
  });
  assertVisibilityInvariants('accepted', 2, 2);

  // 3. DELIVER -> delivered
  engine.execute({
    operation_id: 'op-lc-deliver',
    actor_team_id: targetTeam,
    action: 'deliver',
    recipe_id: recipeId,
    expected_version: 2,
    payload: {
      delivery_evidence_hash: EV_HASH_DELIVERY,
      output_hash: OUTPUT_HASH,
    },
  });
  assertVisibilityInvariants('delivered', 3, 3);

  // 4. REVIEW -> reviewed
  engine.execute({
    operation_id: 'op-lc-review',
    actor_team_id: reqTeam,
    action: 'review',
    recipe_id: recipeId,
    expected_version: 3,
    payload: {
      decision: 'approved',
      review_evidence_hash: EV_HASH_REVIEW,
    },
  });
  assertVisibilityInvariants('reviewed', 4, 4);

  // 5. REVOKE -> revoked
  engine.execute({
    operation_id: 'op-lc-revoke',
    actor_team_id: reqTeam,
    action: 'revoke',
    recipe_id: recipeId,
    expected_version: 4,
    payload: { reason: 'Finalización de ciclo de vida y revocación tras revisión.' },
  });
  assertVisibilityInvariants('revoked', 5, 5);
});
