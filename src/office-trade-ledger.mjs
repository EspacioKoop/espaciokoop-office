import { OfficeError, insist, digest } from './domain.mjs';

export const TRADE_PROTOCOL_VERSION = 1;
export const TRADE_CAPABILITIES = Object.freeze([
  'avatar.register',
  'gift.send',
  'trade.direct',
  'trade.propose',
  'trade.accept',
  'trade.reject',
  'trade.cancel',
  'trade.rollback',
]);

const capabilities = new Set(TRADE_CAPABILITIES);
const idPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const operationPattern = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;

const FORBIDDEN_WORDS = [
  'credential', 'secret', 'token', 'key', 'quota', 'privilege',
  'admin', 'bearer', 'password', 'auth', 'sudo', 'permission', 'role'
];

function checkLudicText(text, fieldName) {
  if (typeof text !== 'string') return;
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    insist(!lower.includes(word), 'FORBIDDEN_ITEM', `El campo ${fieldName} contiene términos no lúdicos o de privilegio (${word}).`);
  }
}

function validateItem(item) {
  insist(item && typeof item === 'object' && !Array.isArray(item), 'INVALID_ITEM', 'Objeto de objeto lúdico no válido.');
  const allowedKeys = ['id', 'label', 'kind', 'quantity', 'is_private', 'private', 'visibility'];
  const keys = Object.keys(item);
  insist(keys.every(k => allowedKeys.includes(k)), 'INVALID_ITEM', 'Propiedades no permitidas en objeto lúdico.');
  insist(typeof item.id === 'string' && idPattern.test(item.id), 'INVALID_ITEM', 'Identificador de objeto no válido.');
  checkLudicText(item.id, 'id');
  if (item.label !== undefined) {
    insist(typeof item.label === 'string' && item.label.length <= 120, 'INVALID_ITEM', 'Etiqueta de objeto no válida.');
    checkLudicText(item.label, 'label');
  }
  if (item.kind !== undefined) {
    insist(typeof item.kind === 'string' && item.kind.length <= 80, 'INVALID_ITEM', 'Tipo de objeto no válido.');
    checkLudicText(item.kind, 'kind');
  }
  insist(item.is_private !== true && item.private !== true && item.visibility !== 'private', 'FORBIDDEN_ITEM', 'No se permiten objetos privados.');
  insist(Number.isSafeInteger(item.quantity) && item.quantity > 0, 'INVALID_QUANTITY', 'La cantidad del objeto debe ser un entero positivo mayor que cero.');
}

function validateItemList(items) {
  if (!items) return [];
  insist(Array.isArray(items), 'INVALID_ITEM', 'La lista de objetos debe ser un array.');
  const seen = new Set();
  const result = [];
  for (const item of items) {
    validateItem(item);
    insist(!seen.has(item.id), 'DUPLICATE_ITEMS', `Objeto duplicado en la lista: ${item.id}`);
    seen.add(item.id);
    result.push({ id: item.id, label: item.label ?? item.id, kind: item.kind ?? 'ludic', quantity: item.quantity });
  }
  return result;
}

function exact(value, keys, code = 'PAYLOAD') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, 'Objeto de payload no válido.');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), code, 'Campos extra o no permitidos en el payload.');
}

function jsonObject(value) {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'PAYLOAD', 'La operación requiere un objeto de datos.');
  let text;
  try { text = JSON.stringify(value); } catch { throw new OfficeError('PAYLOAD', 'Datos de operación no válidos.'); }
  insist(text !== undefined && Buffer.byteLength(text) <= 16384, 'PAYLOAD', 'Datos de operación demasiado grandes.');
  return JSON.parse(text);
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

export function createOfficeTradeLedger(options = {}) {
  const avatars = new Map();
  const proposals = new Map();
  const records = new Map();
  let pending = Promise.resolve();

  function serialize(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  function getAvatarSnapshot(avatarId) {
    const avatar = avatars.get(avatarId);
    if (!avatar) return null;
    const itemsList = Array.from(avatar.items.values()).map(it => ({ ...it }));
    return {
      avatar_id: avatar.avatar_id,
      owner_id: avatar.owner_id,
      version: avatar.version,
      balance: avatar.balance,
      items: itemsList,
    };
  }

  function getProposalSnapshot(proposalId) {
    const prop = proposals.get(proposalId);
    if (!prop) return null;
    return structuredClone(prop);
  }

  function checkAvatarVersion(avatarId, expectedVersion) {
    const avatar = avatars.get(avatarId);
    insist(avatar, 'AVATAR_NOT_FOUND', `El avatar ${avatarId} no está registrado.`, 404);
    if (expectedVersion !== undefined && expectedVersion !== null) {
      insist(avatar.version === expectedVersion, 'VERSION_CONFLICT', `Conflicto de versión para avatar ${avatarId}: esperada ${expectedVersion}, actual ${avatar.version}.`, 409);
    }
    return avatar;
  }

  function checkActorAuthorization(actorId, avatarId) {
    const avatar = avatars.get(avatarId);
    insist(avatar, 'AVATAR_NOT_FOUND', `El avatar ${avatarId} no existe.`, 404);
    insist(actorId === avatar.avatar_id || actorId === avatar.owner_id, 'FORBIDDEN', `El actor ${actorId} no está autorizado para el avatar ${avatarId}.`, 403);
  }

  function isActorAuthorizedForAvatar(actorId, avatarId) {
    const avatar = avatars.get(avatarId);
    if (!avatar) return false;
    return actorId === avatar.avatar_id || actorId === avatar.owner_id;
  }

  function checkAssets(avatar, currency = 0, items = []) {
    if (currency > 0) {
      insist(avatar.balance >= currency, 'INSUFFICIENT_FUNDS', `Saldo insuficiente en avatar ${avatar.avatar_id}.`);
    }
    for (const item of items) {
      const existing = avatar.items.get(item.id);
      insist(existing && existing.quantity >= item.quantity, 'INSUFFICIENT_ITEMS', `El avatar ${avatar.avatar_id} no posee suficiente cantidad del objeto ${item.id}.`);
    }
  }

  function deductAssets(avatar, currency = 0, items = []) {
    checkAssets(avatar, currency, items);
    if (currency > 0) {
      avatar.balance -= currency;
    }
    for (const item of items) {
      const existing = avatar.items.get(item.id);
      existing.quantity -= item.quantity;
      if (existing.quantity === 0) {
        avatar.items.delete(item.id);
      }
    }
  }

  function addAssets(avatar, currency = 0, items = []) {
    if (currency > 0) {
      avatar.balance += currency;
    }
    for (const item of items) {
      const existing = avatar.items.get(item.id);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        avatar.items.set(item.id, { id: item.id, label: item.label, kind: item.kind, quantity: item.quantity });
      }
    }
  }

  async function execute(rawRequest) {
    insist(rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest), 'OPERATION', 'Petición no válida.');
    exact(rawRequest, ['operation_id', 'actor_id', 'capability', 'expected_versions', 'input'], 'OPERATION');
    insist(typeof rawRequest.operation_id === 'string' && operationPattern.test(rawRequest.operation_id), 'OPERATION', 'Identificador de operación no válido.');
    insist(typeof rawRequest.actor_id === 'string' && idPattern.test(rawRequest.actor_id), 'OPERATION', 'Identificador de actor no válido.');
    insist(typeof rawRequest.capability === 'string' && capabilities.has(rawRequest.capability), 'UNSUPPORTED_CAPABILITY', 'Capacidad no admitida.');

    const input = jsonObject(rawRequest.input);
    const normalized = { ...rawRequest, input };
    const requestFingerprint = fingerprint(normalized);

    return serialize(async () => {
      const existingRecord = records.get(rawRequest.operation_id);
      if (existingRecord) {
        insist(existingRecord.fingerprint === requestFingerprint, 'IDEMPOTENCY_CONFLICT', 'El identificador de operación ya corresponde a otra petición.', 409);
        return structuredClone(existingRecord.result);
      }

      insist(records.size < 2000, 'RATE_LIMIT', 'Demasiadas operaciones en memoria.', 429);

      const expectedVersions = rawRequest.expected_versions ?? {};
      const capability = rawRequest.capability;

      let result;
      const meta = {
        operation_id: rawRequest.operation_id,
        capability,
        actor_id: rawRequest.actor_id,
      };

      try {
        if (capability === 'avatar.register') {
          exact(input, ['avatar_id', 'owner_id', 'initial_balance', 'initial_items'], 'PAYLOAD');
          insist(typeof input.avatar_id === 'string' && idPattern.test(input.avatar_id), 'PAYLOAD', 'Identificador de avatar no válido.');
          insist(typeof input.owner_id === 'string' && idPattern.test(input.owner_id), 'PAYLOAD', 'Identificador de propietario no válido.');
          insist(avatars.get(input.avatar_id) === undefined, 'AVATAR_ALREADY_EXISTS', 'El avatar ya está registrado.', 409);

          const initialBalance = input.initial_balance ?? 0;
          insist(Number.isSafeInteger(initialBalance) && initialBalance >= 0, 'INVALID_AMOUNT', 'El saldo inicial debe ser un entero no negativo.');

          const initialItems = validateItemList(input.initial_items);

          const newAvatar = {
            avatar_id: input.avatar_id,
            owner_id: input.owner_id,
            version: 1,
            balance: initialBalance,
            items: new Map(initialItems.map(it => [it.id, { ...it }])),
          };
          avatars.set(input.avatar_id, newAvatar);

          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            effective_versions: { [input.avatar_id]: 1 },
            snapshot: getAvatarSnapshot(input.avatar_id),
          };

        } else if (capability === 'gift.send' || capability === 'trade.direct') {
          exact(input, ['from_avatar_id', 'to_avatar_id', 'currency', 'items'], 'PAYLOAD');
          insist(typeof input.from_avatar_id === 'string' && idPattern.test(input.from_avatar_id), 'PAYLOAD', 'Avatar de origen no válido.');
          insist(typeof input.to_avatar_id === 'string' && idPattern.test(input.to_avatar_id), 'PAYLOAD', 'Avatar de destino no válido.');
          insist(input.from_avatar_id !== input.to_avatar_id, 'INVALID_TRADE', 'El avatar de origen y destino deben ser distintos.');

          checkActorAuthorization(rawRequest.actor_id, input.from_avatar_id);

          const fromAvatar = checkAvatarVersion(input.from_avatar_id, expectedVersions[input.from_avatar_id]);
          const toAvatar = checkAvatarVersion(input.to_avatar_id, expectedVersions[input.to_avatar_id]);

          const currency = input.currency ?? 0;
          insist(Number.isSafeInteger(currency) && currency >= 0, 'INVALID_AMOUNT', 'La moneda debe ser un entero no negativo.');

          const items = validateItemList(input.items);
          insist(currency > 0 || items.length > 0, 'INVALID_TRADE', 'La transferencia debe incluir al menos moneda u objetos.');

          deductAssets(fromAvatar, currency, items);
          addAssets(toAvatar, currency, items);

          fromAvatar.version += 1;
          toAvatar.version += 1;

          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            effective_versions: {
              [fromAvatar.avatar_id]: fromAvatar.version,
              [toAvatar.avatar_id]: toAvatar.version,
            },
            transfer: {
              from: input.from_avatar_id,
              to: input.to_avatar_id,
              currency,
              items,
            },
          };

        } else if (capability === 'trade.propose') {
          exact(input, [
            'proposal_id', 'proposer_avatar_id', 'counterparty_avatar_id',
            'offered_currency', 'offered_items',
            'requested_currency', 'requested_items'
          ], 'PAYLOAD');

          insist(typeof input.proposal_id === 'string' && idPattern.test(input.proposal_id), 'PAYLOAD', 'ID de propuesta no válido.');
          insist(typeof input.proposer_avatar_id === 'string' && idPattern.test(input.proposer_avatar_id), 'PAYLOAD', 'Avatar proponente no válido.');
          insist(typeof input.counterparty_avatar_id === 'string' && idPattern.test(input.counterparty_avatar_id), 'PAYLOAD', 'Avatar contraparte no válido.');
          insist(input.proposer_avatar_id !== input.counterparty_avatar_id, 'INVALID_TRADE', 'El proponente y la contraparte deben ser distintos.');
          insist(!proposals.has(input.proposal_id), 'PROPOSAL_ALREADY_EXISTS', 'La propuesta ya existe.', 409);

          checkActorAuthorization(rawRequest.actor_id, input.proposer_avatar_id);

          const proposer = checkAvatarVersion(input.proposer_avatar_id, expectedVersions[input.proposer_avatar_id]);
          const counterparty = checkAvatarVersion(input.counterparty_avatar_id, expectedVersions[input.counterparty_avatar_id]);

          const offeredCurrency = input.offered_currency ?? 0;
          const requestedCurrency = input.requested_currency ?? 0;
          insist(Number.isSafeInteger(offeredCurrency) && offeredCurrency >= 0, 'INVALID_AMOUNT', 'La moneda ofrecida debe ser un entero no negativo.');
          insist(Number.isSafeInteger(requestedCurrency) && requestedCurrency >= 0, 'INVALID_AMOUNT', 'La moneda solicitada debe ser un entero no negativo.');

          const offeredItems = validateItemList(input.offered_items);
          const requestedItems = validateItemList(input.requested_items);

          insist(
            offeredCurrency > 0 || offeredItems.length > 0 || requestedCurrency > 0 || requestedItems.length > 0,
            'INVALID_TRADE', 'La propuesta debe ofrecer o solicitar al menos un bien.'
          );

          deductAssets(proposer, offeredCurrency, offeredItems);
          addAssets(proposer, offeredCurrency, offeredItems);

          const proposal = {
            proposal_id: input.proposal_id,
            proposer_avatar_id: input.proposer_avatar_id,
            counterparty_avatar_id: input.counterparty_avatar_id,
            offered_currency: offeredCurrency,
            offered_items: offeredItems,
            requested_currency: requestedCurrency,
            requested_items: requestedItems,
            status: 'pending',
            created_at_op: rawRequest.operation_id,
          };

          proposals.set(input.proposal_id, proposal);
          proposer.version += 1;

          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            proposal_id: input.proposal_id,
            effective_versions: {
              [proposer.avatar_id]: proposer.version,
              [counterparty.avatar_id]: counterparty.version,
            },
          };

        } else if (capability === 'trade.accept') {
          exact(input, ['proposal_id', 'acceptor_avatar_id'], 'PAYLOAD');
          insist(typeof input.proposal_id === 'string' && idPattern.test(input.proposal_id), 'PAYLOAD', 'ID de propuesta no válido.');
          insist(typeof input.acceptor_avatar_id === 'string' && idPattern.test(input.acceptor_avatar_id), 'PAYLOAD', 'Avatar aceptante no válido.');

          const proposal = proposals.get(input.proposal_id);
          insist(proposal, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.', 404);
          insist(proposal.status === 'pending', 'PROPOSAL_NOT_PENDING', 'La propuesta no está pendiente.', 409);
          insist(input.acceptor_avatar_id === proposal.counterparty_avatar_id, 'FORBIDDEN', 'Solo la contraparte puede aceptar la propuesta.', 403);

          checkActorAuthorization(rawRequest.actor_id, input.acceptor_avatar_id);

          const proposer = checkAvatarVersion(proposal.proposer_avatar_id, expectedVersions[proposal.proposer_avatar_id]);
          const counterparty = checkAvatarVersion(proposal.counterparty_avatar_id, expectedVersions[proposal.counterparty_avatar_id]);

          checkAssets(proposer, proposal.offered_currency, proposal.offered_items);
          checkAssets(counterparty, proposal.requested_currency, proposal.requested_items);

          deductAssets(proposer, proposal.offered_currency, proposal.offered_items);
          deductAssets(counterparty, proposal.requested_currency, proposal.requested_items);

          addAssets(counterparty, proposal.offered_currency, proposal.offered_items);
          addAssets(proposer, proposal.requested_currency, proposal.requested_items);

          proposal.status = 'accepted';
          proposal.accepted_at_op = rawRequest.operation_id;

          proposer.version += 1;
          counterparty.version += 1;

          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            proposal_id: input.proposal_id,
            effective_versions: {
              [proposer.avatar_id]: proposer.version,
              [counterparty.avatar_id]: counterparty.version,
            },
          };

        } else if (capability === 'trade.reject') {
          exact(input, ['proposal_id', 'rejector_avatar_id'], 'PAYLOAD');
          insist(typeof input.proposal_id === 'string' && idPattern.test(input.proposal_id), 'PAYLOAD', 'ID de propuesta no válido.');
          insist(typeof input.rejector_avatar_id === 'string' && idPattern.test(input.rejector_avatar_id), 'PAYLOAD', 'Avatar rechazante no válido.');

          const proposal = proposals.get(input.proposal_id);
          insist(proposal, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.', 404);
          insist(proposal.status === 'pending', 'PROPOSAL_NOT_PENDING', 'La propuesta no está pendiente.', 409);
          insist(input.rejector_avatar_id === proposal.counterparty_avatar_id, 'FORBIDDEN', 'Solo la contraparte puede rechazar la propuesta.', 403);

          checkActorAuthorization(rawRequest.actor_id, input.rejector_avatar_id);

          proposal.status = 'rejected';
          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            proposal_id: input.proposal_id,
          };

        } else if (capability === 'trade.cancel') {
          exact(input, ['proposal_id', 'canceller_avatar_id'], 'PAYLOAD');
          insist(typeof input.proposal_id === 'string' && idPattern.test(input.proposal_id), 'PAYLOAD', 'ID de propuesta no válido.');
          insist(typeof input.canceller_avatar_id === 'string' && idPattern.test(input.canceller_avatar_id), 'PAYLOAD', 'Avatar cancelante no válido.');

          const proposal = proposals.get(input.proposal_id);
          insist(proposal, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.', 404);
          insist(proposal.status === 'pending', 'PROPOSAL_NOT_PENDING', 'La propuesta no está pendiente.', 409);
          insist(input.canceller_avatar_id === proposal.proposer_avatar_id, 'FORBIDDEN', 'Solo el proponente puede cancelar la propuesta.', 403);

          checkActorAuthorization(rawRequest.actor_id, input.canceller_avatar_id);

          proposal.status = 'cancelled';
          result = {
            operation_id: rawRequest.operation_id,
            status: 'applied',
            capability,
            proposal_id: input.proposal_id,
          };

        } else if (capability === 'trade.rollback') {
          exact(input, ['target_operation_id'], 'PAYLOAD');
          insist(typeof input.target_operation_id === 'string' && operationPattern.test(input.target_operation_id), 'PAYLOAD', 'ID de operación objetivo no válido.');

          const targetRecord = records.get(input.target_operation_id);
          insist(targetRecord, 'OPERATION_NOT_FOUND', 'La operación objetivo no existe.', 404);
          insist(targetRecord.result.status === 'applied', 'INVALID_ROLLBACK', 'Solo se pueden revertir operaciones aplicadas con éxito.', 409);
          insist(!targetRecord.rolled_back, 'INVALID_ROLLBACK', 'La operación objetivo ya ha sido revertida.', 409);

          const targetOp = targetRecord.meta.request;
          const targetCap = targetOp.capability;

          if (targetCap === 'gift.send' || targetCap === 'trade.direct') {
            const transfer = targetRecord.result.transfer;
            const fromAvatar = avatars.get(transfer.from);
            const toAvatar = avatars.get(transfer.to);
            insist(fromAvatar && toAvatar, 'AVATAR_NOT_FOUND', 'Uno de los avatares ya no está disponible.');

            const isAuth = isActorAuthorizedForAvatar(rawRequest.actor_id, transfer.from) || isActorAuthorizedForAvatar(rawRequest.actor_id, transfer.to);
            insist(isAuth, 'FORBIDDEN', `El actor ${rawRequest.actor_id} no está autorizado para revertir la operación ${input.target_operation_id}.`, 403);

            checkAssets(toAvatar, transfer.currency, transfer.items);

            deductAssets(toAvatar, transfer.currency, transfer.items);
            addAssets(fromAvatar, transfer.currency, transfer.items);

            fromAvatar.version += 1;
            toAvatar.version += 1;
            targetRecord.rolled_back = true;

            result = {
              operation_id: rawRequest.operation_id,
              status: 'applied',
              capability,
              target_operation_id: input.target_operation_id,
              effective_versions: {
                [fromAvatar.avatar_id]: fromAvatar.version,
                [toAvatar.avatar_id]: toAvatar.version,
              },
            };
          } else if (targetCap === 'trade.accept') {
            const proposalId = targetRecord.result.proposal_id;
            const proposal = proposals.get(proposalId);
            insist(proposal && proposal.status === 'accepted', 'INVALID_ROLLBACK', 'La propuesta asociada no está aceptada.', 409);

            const proposer = avatars.get(proposal.proposer_avatar_id);
            const counterparty = avatars.get(proposal.counterparty_avatar_id);
            insist(proposer && counterparty, 'AVATAR_NOT_FOUND', 'Uno de los avatares ya no está disponible.');

            const isAuth = isActorAuthorizedForAvatar(rawRequest.actor_id, proposal.proposer_avatar_id) || isActorAuthorizedForAvatar(rawRequest.actor_id, proposal.counterparty_avatar_id);
            insist(isAuth, 'FORBIDDEN', `El actor ${rawRequest.actor_id} no está autorizado para revertir la operación ${input.target_operation_id}.`, 403);

            checkAssets(proposer, proposal.requested_currency, proposal.requested_items);
            checkAssets(counterparty, proposal.offered_currency, proposal.offered_items);

            deductAssets(proposer, proposal.requested_currency, proposal.requested_items);
            deductAssets(counterparty, proposal.offered_currency, proposal.offered_items);

            addAssets(proposer, proposal.offered_currency, proposal.offered_items);
            addAssets(counterparty, proposal.requested_currency, proposal.requested_items);

            proposal.status = 'rolled_back';
            proposer.version += 1;
            counterparty.version += 1;
            targetRecord.rolled_back = true;

            result = {
              operation_id: rawRequest.operation_id,
              status: 'applied',
              capability,
              target_operation_id: input.target_operation_id,
              effective_versions: {
                [proposer.avatar_id]: proposer.version,
                [counterparty.avatar_id]: counterparty.version,
              },
            };
          } else {
            throw new OfficeError('INVALID_ROLLBACK', `No se puede revertir una operación de tipo ${targetCap}.`, 409);
          }
        }

        meta.request = normalized;
        records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
        return structuredClone(result);

      } catch (err) {
        if (err instanceof OfficeError) {
          result = {
            operation_id: rawRequest.operation_id,
            status: 'rejected',
            capability,
            code: err.code,
            message: err.message,
          };
          meta.request = normalized;
          records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
          if (err.status >= 500) throw err;
          return structuredClone(result);
        }
        result = {
          operation_id: rawRequest.operation_id,
          status: 'unknown',
          capability,
          code: 'INTERNAL_ERROR',
        };
        meta.request = normalized;
        records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
        return structuredClone(result);
      }
    });
  }

  async function reconcile(operationId) {
    insist(typeof operationId === 'string' && operationPattern.test(operationId), 'OPERATION', 'Identificador de operación no válido.');
    const record = records.get(operationId);
    insist(record, 'NOT_FOUND', 'Operación no registrada.', 404);
    if (record.result.status !== 'unknown') {
      return structuredClone(record.result);
    }

    record.result.status = 'failed';
    record.result.code = 'NOT_APPLIED';
    return structuredClone(record.result);
  }

  return {
    getAvatar: avatarId => getAvatarSnapshot(avatarId),
    getProposal: proposalId => getProposalSnapshot(proposalId),
    execute,
    reconcile: operationId => serialize(() => reconcile(operationId)),
  };
}

export const createTradeLedger = createOfficeTradeLedger;
