import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeTradeLedger, createTradeLedger, TRADE_PROTOCOL_VERSION, TRADE_CAPABILITIES } from '../src/office-trade-ledger.mjs';

test('constantes expuestas del ledger', () => {
  assert.equal(TRADE_PROTOCOL_VERSION, 1);
  assert.ok(Array.isArray(TRADE_CAPABILITIES));
  assert.ok(TRADE_CAPABILITIES.includes('avatar.register'));
  assert.ok(TRADE_CAPABILITIES.includes('gift.send'));
  assert.ok(TRADE_CAPABILITIES.includes('trade.propose'));
  assert.ok(TRADE_CAPABILITIES.includes('trade.accept'));
  assert.ok(TRADE_CAPABILITIES.includes('trade.rollback'));
});

test('registro de avatar nominal', async () => {
  const ledger = createOfficeTradeLedger();
  const res = await ledger.execute({
    operation_id: 'op1',
    actor_id: 'marea-owner',
    capability: 'avatar.register',
    expected_versions: {},
    input: {
      avatar_id: 'avatar-marea',
      owner_id: 'marea-owner',
      initial_balance: 100,
      initial_items: [{ id: 'hat-blue', label: 'Sombrero Azul', quantity: 1 }],
    },
  });

  assert.equal(res.status, 'applied');
  assert.equal(res.effective_versions['avatar-marea'], 1);

  const snap = ledger.getAvatar('avatar-marea');
  assert.equal(snap.avatar_id, 'avatar-marea');
  assert.equal(snap.balance, 100);
  assert.equal(snap.version, 1);
  assert.equal(snap.items.length, 1);
  assert.equal(snap.items[0].id, 'hat-blue');
});

test('regalo directo nominal (gift.send)', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'reg1',
    actor_id: 'marea-owner',
    capability: 'avatar.register',
    expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'marea-owner', initial_balance: 50, initial_items: [{ id: 'flower', quantity: 2 }] },
  });

  await ledger.execute({
    operation_id: 'reg2',
    actor_id: 'viento-owner',
    capability: 'avatar.register',
    expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'viento-owner', initial_balance: 10, initial_items: [] },
  });

  const res = await ledger.execute({
    operation_id: 'gift1',
    actor_id: 'a1',
    capability: 'gift.send',
    expected_versions: { a1: 1, a2: 1 },
    input: {
      from_avatar_id: 'a1',
      to_avatar_id: 'a2',
      currency: 20,
      items: [{ id: 'flower', quantity: 1 }],
    },
  });

  assert.equal(res.status, 'applied');
  assert.equal(res.effective_versions.a1, 2);
  assert.equal(res.effective_versions.a2, 2);

  const snapA1 = ledger.getAvatar('a1');
  const snapA2 = ledger.getAvatar('a2');
  assert.equal(snapA1.balance, 30);
  assert.equal(snapA1.items[0].quantity, 1);
  assert.equal(snapA2.balance, 30);
  assert.equal(snapA2.items[0].id, 'flower');
  assert.equal(snapA2.items[0].quantity, 1);
});

test('flujo de propuesta, aceptación y transferencia bidireccional', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'reg1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [{ id: 'sword', quantity: 1 }] },
  });
  await ledger.execute({
    operation_id: 'reg2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 50, initial_items: [{ id: 'shield', quantity: 1 }] },
  });

  const propRes = await ledger.execute({
    operation_id: 'prop1_op', actor_id: 'a1', capability: 'trade.propose', expected_versions: { a1: 1, a2: 1 },
    input: {
      proposal_id: 'prop1',
      proposer_avatar_id: 'a1',
      counterparty_avatar_id: 'a2',
      offered_currency: 10,
      offered_items: [{ id: 'sword', quantity: 1 }],
      requested_currency: 5,
      requested_items: [{ id: 'shield', quantity: 1 }],
    },
  });

  assert.equal(propRes.status, 'applied');
  assert.equal(ledger.getAvatar('a1').version, 2);

  const acceptRes = await ledger.execute({
    operation_id: 'acc1_op', actor_id: 'a2', capability: 'trade.accept', expected_versions: { a1: 2, a2: 1 },
    input: {
      proposal_id: 'prop1',
      acceptor_avatar_id: 'a2',
    },
  });

  assert.equal(acceptRes.status, 'applied');

  const snapA1 = ledger.getAvatar('a1');
  const snapA2 = ledger.getAvatar('a2');

  assert.equal(snapA1.balance, 95); // 100 - 10 + 5
  assert.equal(snapA1.items.length, 1);
  assert.equal(snapA1.items[0].id, 'shield');

  assert.equal(snapA2.balance, 55); // 50 + 10 - 5
  assert.equal(snapA2.items.length, 1);
  assert.equal(snapA2.items[0].id, 'sword');
});

test('flujo de rechazar y cancelar propuesta', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 10, initial_items: [{ id: 'gem', quantity: 1 }] },
  });
  await ledger.execute({
    operation_id: 'r2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 10, initial_items: [] },
  });

  await ledger.execute({
    operation_id: 'p1', actor_id: 'a1', capability: 'trade.propose', expected_versions: {},
    input: { proposal_id: 'pr1', proposer_avatar_id: 'a1', counterparty_avatar_id: 'a2', offered_currency: 1, offered_items: [], requested_currency: 0, requested_items: [] },
  });

  const rej = await ledger.execute({
    operation_id: 'rej1', actor_id: 'a2', capability: 'trade.reject', expected_versions: {},
    input: { proposal_id: 'pr1', rejector_avatar_id: 'a2' },
  });
  assert.equal(rej.status, 'applied');
  assert.equal(ledger.getProposal('pr1').status, 'rejected');

  await ledger.execute({
    operation_id: 'p2', actor_id: 'a1', capability: 'trade.propose', expected_versions: {},
    input: { proposal_id: 'pr2', proposer_avatar_id: 'a1', counterparty_avatar_id: 'a2', offered_currency: 1, offered_items: [], requested_currency: 0, requested_items: [] },
  });

  const can = await ledger.execute({
    operation_id: 'can1', actor_id: 'a1', capability: 'trade.cancel', expected_versions: {},
    input: { proposal_id: 'pr2', canceller_avatar_id: 'a1' },
  });
  assert.equal(can.status, 'applied');
  assert.equal(ledger.getProposal('pr2').status, 'cancelled');
});

test('rollback de transacciones (gift/direct y accept)', async () => {
  const ledger = createTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 50, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'r2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 10, initial_items: [] },
  });

  await ledger.execute({
    operation_id: 'g1', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 15, items: [] },
  });

  assert.equal(ledger.getAvatar('a1').balance, 35);
  assert.equal(ledger.getAvatar('a2').balance, 25);

  const rollRes = await ledger.execute({
    operation_id: 'rb1', actor_id: 'a1', capability: 'trade.rollback', expected_versions: {},
    input: { target_operation_id: 'g1' },
  });

  assert.equal(rollRes.status, 'applied');
  assert.equal(ledger.getAvatar('a1').balance, 50);
  assert.equal(ledger.getAvatar('a2').balance, 10);
});

test('idempotencia y conflicto de fingerprint en operation_id', async () => {
  const ledger = createOfficeTradeLedger();

  const req = {
    operation_id: 'idem1',
    actor_id: 'a1',
    capability: 'avatar.register',
    expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] },
  };

  const res1 = await ledger.execute(req);
  assert.equal(res1.status, 'applied');

  const res2 = await ledger.execute(req);
  assert.equal(res2.status, 'applied');
  assert.deepEqual(res1, res2);

  const conflictReq = {
    ...req,
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 999, initial_items: [] },
  };

  await assert.rejects(
    async () => ledger.execute(conflictReq),
    err => err.code === 'IDEMPOTENCY_CONFLICT'
  );
});

test('validaciones negativas: saldo insuficiente, objetos ausentes, ceros/negativos', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 10, initial_items: [{ id: 'coin', quantity: 1 }] },
  });
  await ledger.execute({
    operation_id: 'r2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 0, initial_items: [] },
  });

  const resOverdraft = await ledger.execute({
    operation_id: 'g_over', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 100, items: [] },
  });
  assert.equal(resOverdraft.status, 'rejected');
  assert.equal(resOverdraft.code, 'INSUFFICIENT_FUNDS');

  const resMissingItem = await ledger.execute({
    operation_id: 'g_no_item', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 0, items: [{ id: 'dragon', quantity: 1 }] },
  });
  assert.equal(resMissingItem.status, 'rejected');
  assert.equal(resMissingItem.code, 'INSUFFICIENT_ITEMS');

  const resNeg = await ledger.execute({
    operation_id: 'g_neg', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: -5, items: [] },
  });
  assert.equal(resNeg.status, 'rejected');
  assert.equal(resNeg.code, 'INVALID_AMOUNT');
});

test('seguridad: rechazo de objetos privados, credenciales y términos de privilegio', async () => {
  const ledger = createOfficeTradeLedger();

  const privRes = await ledger.execute({
    operation_id: 'reg_priv', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: {
      avatar_id: 'a1', owner_id: 'a1', initial_balance: 10,
      initial_items: [{ id: 'secret-map', is_private: true, quantity: 1 }],
    },
  });
  assert.equal(privRes.status, 'rejected');
  assert.equal(privRes.code, 'FORBIDDEN_ITEM');

  const credRes = await ledger.execute({
    operation_id: 'reg_cred', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: {
      avatar_id: 'a2', owner_id: 'a2', initial_balance: 10,
      initial_items: [{ id: 'admin_token_key', quantity: 1 }],
    },
  });
  assert.equal(credRes.status, 'rejected');
  assert.equal(credRes.code, 'FORBIDDEN_ITEM');
});

test('seguridad: intento de suplantación o acceso no autorizado', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 50, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'r2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 50, initial_items: [] },
  });

  const unauthRes = await ledger.execute({
    operation_id: 'steal1', actor_id: 'intruder', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 10, items: [] },
  });
  assert.equal(unauthRes.status, 'rejected');
  assert.equal(unauthRes.code, 'FORBIDDEN');
});

test('transacciones simultáneas y serialización concurrente', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'r2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 0, initial_items: [] },
  });

  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      ledger.execute({
        operation_id: `concurrent_${i}`,
        actor_id: 'a1',
        capability: 'gift.send',
        expected_versions: {},
        input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 10, items: [] },
      })
    );
  }

  const results = await Promise.all(promises);
  assert.equal(results.filter(r => r.status === 'applied').length, 10);
  assert.equal(ledger.getAvatar('a1').balance, 0);
  assert.equal(ledger.getAvatar('a2').balance, 100);
});

test('conciliación (reconcile) tras respuesta incierta', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'r1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 50, initial_items: [] },
  });

  const reconRes = await ledger.reconcile('r1');
  assert.equal(reconRes.status, 'applied');

  await assert.rejects(
    async () => ledger.reconcile('non_existent_op'),
    err => err.code === 'NOT_FOUND'
  );
});

test('defect: atomicidad en trade.accept ante fondos insuficientes de la contraparte', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'reg1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'reg2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 10, initial_items: [] },
  });

  await ledger.execute({
    operation_id: 'prop_op', actor_id: 'a1', capability: 'trade.propose', expected_versions: {},
    input: {
      proposal_id: 'p_bad',
      proposer_avatar_id: 'a1',
      counterparty_avatar_id: 'a2',
      offered_currency: 20,
      offered_items: [],
      requested_currency: 50, // a2 only has 10!
      requested_items: [],
    },
  });

  assert.equal(ledger.getAvatar('a1').balance, 100);

  const acceptRes = await ledger.execute({
    operation_id: 'accept_op', actor_id: 'a2', capability: 'trade.accept', expected_versions: {},
    input: {
      proposal_id: 'p_bad',
      acceptor_avatar_id: 'a2',
    },
  });

  assert.equal(acceptRes.status, 'rejected');
  assert.equal(acceptRes.code, 'INSUFFICIENT_FUNDS');

  // El saldo de a1 NO debe mutarse parcialmente
  assert.equal(ledger.getAvatar('a1').balance, 100);
  assert.equal(ledger.getAvatar('a2').balance, 10);
});

test('defect: rechazo de rollback sin autorizacion por tercero ajeno', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'reg1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'reg2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 100, initial_items: [] },
  });

  await ledger.execute({
    operation_id: 'g1', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 30, items: [] },
  });

  assert.equal(ledger.getAvatar('a1').balance, 70);
  assert.equal(ledger.getAvatar('a2').balance, 130);

  const unauthRb = await ledger.execute({
    operation_id: 'rb_unauth', actor_id: 'unauthorized_actor', capability: 'trade.rollback', expected_versions: {},
    input: { target_operation_id: 'g1' },
  });

  assert.equal(unauthRb.status, 'rejected');
  assert.equal(unauthRb.code, 'FORBIDDEN');

  // Saldos intactos
  assert.equal(ledger.getAvatar('a1').balance, 70);
  assert.equal(ledger.getAvatar('a2').balance, 130);
});

test('defect: rechazo de doble rollback (transicion irreversible y prevencion de dinero ficticio)', async () => {
  const ledger = createOfficeTradeLedger();

  await ledger.execute({
    operation_id: 'reg1', actor_id: 'a1', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a1', owner_id: 'a1', initial_balance: 100, initial_items: [] },
  });
  await ledger.execute({
    operation_id: 'reg2', actor_id: 'a2', capability: 'avatar.register', expected_versions: {},
    input: { avatar_id: 'a2', owner_id: 'a2', initial_balance: 100, initial_items: [] },
  });

  await ledger.execute({
    operation_id: 'g1', actor_id: 'a1', capability: 'gift.send', expected_versions: {},
    input: { from_avatar_id: 'a1', to_avatar_id: 'a2', currency: 30, items: [] },
  });

  assert.equal(ledger.getAvatar('a1').balance, 70);
  assert.equal(ledger.getAvatar('a2').balance, 130);

  const rb1Req = {
    operation_id: 'rb1', actor_id: 'a1', capability: 'trade.rollback', expected_versions: {},
    input: { target_operation_id: 'g1' },
  };

  const rb1 = await ledger.execute(rb1Req);
  assert.equal(rb1.status, 'applied');
  assert.equal(ledger.getAvatar('a1').balance, 100);
  assert.equal(ledger.getAvatar('a2').balance, 100);

  // Idempotencia: re-enviar la misma peticion rb1 devuelve el resultado en cache sin alterar dinero
  const rb1Retry = await ledger.execute(rb1Req);
  assert.equal(rb1Retry.status, 'applied');
  assert.equal(ledger.getAvatar('a1').balance, 100);
  assert.equal(ledger.getAvatar('a2').balance, 100);

  // Intentar un segundo rollback con operation_id distinto rb2 debe rechazarse
  const rb2 = await ledger.execute({
    operation_id: 'rb2', actor_id: 'a1', capability: 'trade.rollback', expected_versions: {},
    input: { target_operation_id: 'g1' },
  });

  assert.equal(rb2.status, 'rejected');
  assert.equal(rb2.code, 'INVALID_ROLLBACK');

  // Los saldos no se alteran de nuevo para crear dinero ficticio
  assert.equal(ledger.getAvatar('a1').balance, 100);
  assert.equal(ledger.getAvatar('a2').balance, 100);
});
