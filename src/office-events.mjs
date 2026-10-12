import { insist, clean, validatePolicy, digest } from './domain.mjs';

const roomIdPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const eventIdPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const memberIdPattern = /^[a-z0-9-]{1,40}$/;
const allowedFrequencies = new Set(['daily', 'weekly', 'monthly']);

function validateTimestamp(ts, fieldName) {
  insist(Number.isSafeInteger(ts) && ts > 0, 'EVENT_INVALID', `${fieldName} debe ser un timestamp válido.`);
  return ts;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function payloadFingerprint(value) {
  return digest(JSON.stringify(canonical(value)));
}

/**
 * Normaliza y valida una zona horaria dada (IANA o formato offset +/-HH:MM/UTC).
 */
export function normalizeTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return 'UTC';
  const cleanTz = tz.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: cleanTz });
    return cleanTz;
  } catch {
    throw new Error(`Zona horaria no válida: ${cleanTz}`);
  }
}

/**
 * Calcula el siguiente timestamp respetando la zona horaria (incluyendo cambios de DST).
 */
export function computeNextRecurrenceTimestamp(baseTimestamp, frequency, interval, stepIndex, timeZone = 'UTC') {
  const normTz = normalizeTimezone(timeZone);
  const date = new Date(baseTimestamp);

  if (normTz === 'UTC') {
    const next = new Date(baseTimestamp);
    if (frequency === 'daily') {
      next.setUTCDate(next.getUTCDate() + interval * stepIndex);
    } else if (frequency === 'weekly') {
      next.setUTCDate(next.getUTCDate() + interval * stepIndex * 7);
    } else if (frequency === 'monthly') {
      next.setUTCMonth(next.getUTCMonth() + interval * stepIndex);
    }
    return next.getTime();
  }

  // Descomposición local usando Intl.DateTimeFormat para conservar la hora local entre transiciones de DST.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normTz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  let year = parseInt(parts.year, 10);
  let month = parseInt(parts.month, 10) - 1; // 0-based
  let day = parseInt(parts.day, 10);
  let hour = parseInt(parts.hour, 10) % 24;
  let minute = parseInt(parts.minute, 10);
  let second = parseInt(parts.second, 10);

  if (frequency === 'daily') {
    day += interval * stepIndex;
  } else if (frequency === 'weekly') {
    day += interval * stepIndex * 7;
  } else if (frequency === 'monthly') {
    month += interval * stepIndex;
  }

  // Construir timestamp local en la zona dada
  // Generamos una fecha aproximada en UTC y ajustamos
  let target = new Date(Date.UTC(year, month, day, hour, minute, second));
  // Ajustar por desfase de zona horaria
  const getOffsetMs = (d) => {
    const p = Object.fromEntries(formatter.formatToParts(d).map(item => [item.type, item.value]));
    const asUtc = Date.UTC(
      parseInt(p.year, 10),
      parseInt(p.month, 10) - 1,
      parseInt(p.day, 10),
      parseInt(p.hour, 10) % 24,
      parseInt(p.minute, 10),
      parseInt(p.second, 10)
    );
    return asUtc - d.getTime();
  };

  const offset = getOffsetMs(target);
  let resolvedTs = target.getTime() - offset;
  // Re-comprobar offset exacto para cambios DST
  const newOffset = getOffsetMs(new Date(resolvedTs));
  if (newOffset !== offset) {
    resolvedTs = target.getTime() - newOffset;
  }

  return resolvedTs;
}

export function createOfficeCalendar({ policy, now = Date.now, maxRecurrenceCount = 52, maxEventsPerRoom = 1000 } = {}) {
  const validatedPolicy = validatePolicy(policy);
  const validMemberIds = new Set(validatedPolicy.members.map(m => m.id));

  insist(
    Number.isSafeInteger(maxRecurrenceCount) && maxRecurrenceCount >= 1 && maxRecurrenceCount <= 366,
    'EVENT_CONFIG',
    'Límite de recurrencia no válido.'
  );
  insist(
    Number.isSafeInteger(maxEventsPerRoom) && maxEventsPerRoom >= 10 && maxEventsPerRoom <= 10000,
    'EVENT_CONFIG',
    'Límite de eventos por sala no válido.'
  );

  const events = new Map(); // eventId -> event
  const idempotencyRecords = new Map(); // `${ownerId}:${idempotencyKey}` -> { eventId, fingerprint }
  const voluntaryPresences = new Map(); // `${ownerId}:${roomId}:${avatarId}:${eventId || 'global'}` -> presence
  const revokedOwners = new Set();
  const revokedRooms = new Set();

  function checkMember(memberId) {
    insist(typeof memberId === 'string' && memberIdPattern.test(memberId), 'EVENT_FORBIDDEN', 'Identificador de miembro no válido.', 403);
    insist(validMemberIds.has(memberId) && !revokedOwners.has(memberId), 'EVENT_FORBIDDEN', 'Miembro no autorizado o revocado.', 403);
  }

  function checkRoom(roomId) {
    insist(typeof roomId === 'string' && roomIdPattern.test(roomId), 'EVENT_INVALID', 'Identificador de sala no válido.');
    insist(!revokedRooms.has(roomId), 'EVENT_FORBIDDEN', 'Sala revocada.', 403);
  }

  function scheduleEvent({
    idempotencyKey,
    ownerId,
    roomId,
    title,
    description = '',
    startTimestamp,
    endTimestamp,
    timezone = 'UTC',
    recurrence = null,
  }) {
    checkMember(ownerId);
    checkRoom(roomId);

    insist(typeof idempotencyKey === 'string' && idempotencyKey.length > 0 && idempotencyKey.length <= 80, 'EVENT_INVALID', 'Clave de idempotencia no válida.');
    const cleanTitle = clean(title, 120);
    insist(cleanTitle.length > 0, 'EVENT_INVALID', 'El título del evento es obligatorio.');
    const cleanDesc = clean(description, 500);

    const start = validateTimestamp(startTimestamp, 'startTimestamp');
    const end = validateTimestamp(endTimestamp, 'endTimestamp');
    insist(end > start, 'EVENT_INVALID', 'El tiempo de fin debe ser posterior al inicio.');

    let normTz;
    try {
      normTz = normalizeTimezone(timezone);
    } catch {
      throw new Error(`Zona horaria no válida: ${timezone}`);
    }

    const payload = {
      idempotencyKey, ownerId, roomId, title: cleanTitle, description: cleanDesc,
      startTimestamp: start, endTimestamp: end, timezone: normTz, recurrence
    };
    const fp = payloadFingerprint(payload);
    const idempId = `${ownerId}:${idempotencyKey}`;

    if (idempotencyRecords.has(idempId)) {
      const existing = idempotencyRecords.get(idempId);
      insist(existing.fingerprint === fp, 'EVENT_CONFLICT', 'Conflicto de idempotencia en la programación del evento.', 409);
      const mainEvent = events.get(existing.eventId);
      insist(mainEvent && mainEvent.status !== 'cancelled', 'EVENT_CONFLICT', 'El evento ya existía y fue cancelado.', 409);
      return structuredClone(mainEvent);
    }

    // Comprobar límite de eventos por sala
    const roomEventsCount = Array.from(events.values()).filter(e => e.roomId === roomId && e.status === 'scheduled').length;
    insist(roomEventsCount < maxEventsPerRoom, 'EVENT_LIMIT', 'Límite de eventos alcanzado para la sala.');

    // Validar recurrencia si existe
    let recurrences = [];
    if (recurrence !== null) {
      insist(typeof recurrence === 'object' && !Array.isArray(recurrence), 'EVENT_INVALID', 'Objeto de recurrencia no válido.');
      const { frequency, interval = 1, count = 1, untilTimestamp = null } = recurrence;
      insist(allowedFrequencies.has(frequency), 'EVENT_INVALID', 'Frecuencia de recurrencia no admitida.');
      insist(Number.isSafeInteger(interval) && interval >= 1 && interval <= 31, 'EVENT_INVALID', 'Intervalo de recurrencia no válido.');
      insist(Number.isSafeInteger(count) && count >= 1 && count <= maxRecurrenceCount, 'EVENT_LIMIT', `Límite de recurrencia excedido (máximo ${maxRecurrenceCount}).`);
      if (untilTimestamp !== null) {
        validateTimestamp(untilTimestamp, 'untilTimestamp');
        insist(untilTimestamp >= start, 'EVENT_INVALID', 'untilTimestamp no puede ser anterior al inicio.');
      }

      const duration = end - start;
      let generated = 0;

      for (let i = 0; i < count; i++) {
        const occStart = i === 0 ? start : computeNextRecurrenceTimestamp(start, frequency, interval, i, normTz);
        const occEnd = occStart + duration;

        if (untilTimestamp !== null && occStart > untilTimestamp) {
          break;
        }

        generated++;
        insist(generated <= maxRecurrenceCount, 'EVENT_LIMIT', `Límite de recurrencia superado (${maxRecurrenceCount}).`);

        recurrences.push({ startTimestamp: occStart, endTimestamp: occEnd, stepIndex: i });
      }
    } else {
      recurrences.push({ startTimestamp: start, endTimestamp: end, stepIndex: 0 });
    }

    const primaryEventId = `evt_${digest(`${ownerId}:${roomId}:${idempotencyKey}:0`).slice(0, 24)}`;

    const createdEvents = [];
    for (const occ of recurrences) {
      const eventId = occ.stepIndex === 0
        ? primaryEventId
        : `evt_${digest(`${ownerId}:${roomId}:${idempotencyKey}:${occ.stepIndex}`).slice(0, 24)}`;

      const eventRecord = {
        eventId,
        idempotencyKey,
        ownerId,
        roomId,
        title: cleanTitle,
        description: cleanDesc,
        startTimestamp: occ.startTimestamp,
        endTimestamp: occ.endTimestamp,
        timezone: normTz,
        status: 'scheduled',
        parentEventId: occ.stepIndex === 0 ? null : primaryEventId,
        stepIndex: occ.stepIndex,
        createdAt: now(),
        updatedAt: now(),
      };

      events.set(eventId, eventRecord);
      createdEvents.push(eventRecord);
    }

    idempotencyRecords.set(idempId, { eventId: primaryEventId, fingerprint: fp });

    return structuredClone(createdEvents[0]);
  }

  function getEvent(eventId, { memberId } = {}) {
    if (memberId !== undefined) {
      checkMember(memberId);
    }
    insist(typeof eventId === 'string' && eventIdPattern.test(eventId), 'EVENT_INVALID', 'Identificador de evento no válido.');
    const event = events.get(eventId);
    insist(event, 'EVENT_NOT_FOUND', 'Evento no encontrado.', 404);
    insist(!revokedOwners.has(event.ownerId) && !revokedRooms.has(event.roomId), 'EVENT_NOT_FOUND', 'Evento no encontrado.', 404);

    const currentTime = now();
    const effectiveStatus = (event.status === 'scheduled' && currentTime > event.endTimestamp) ? 'expired' : event.status;

    return structuredClone({
      ...event,
      status: effectiveStatus
    });
  }

  function rescheduleEvent({ eventId, ownerId, startTimestamp, endTimestamp, timezone, idempotencyKey = null }) {
    checkMember(ownerId);
    insist(typeof eventId === 'string' && eventIdPattern.test(eventId), 'EVENT_INVALID', 'Identificador de evento no válido.');

    const event = events.get(eventId);
    insist(event, 'EVENT_NOT_FOUND', 'Evento no encontrado.', 404);
    insist(event.ownerId === ownerId, 'EVENT_FORBIDDEN', 'Solo el propietario del evento puede reprogramarlo.', 403);
    insist(!revokedRooms.has(event.roomId), 'EVENT_FORBIDDEN', 'Sala revocada.', 403);

    const currentTime = now();
    insist(event.status === 'scheduled' && currentTime <= event.endTimestamp, 'EVENT_EXPIRED', 'No se puede reprogramar un evento cancelado o caducado.', 409);

    const start = validateTimestamp(startTimestamp, 'startTimestamp');
    const end = validateTimestamp(endTimestamp, 'endTimestamp');
    insist(end > start, 'EVENT_INVALID', 'El tiempo de fin debe ser posterior al inicio.');

    const normTz = timezone ? normalizeTimezone(timezone) : event.timezone;

    if (idempotencyKey) {
      const idempId = `${ownerId}:reschedule:${idempotencyKey}`;
      const payload = { eventId, ownerId, start, end, normTz };
      const fp = payloadFingerprint(payload);
      if (idempotencyRecords.has(idempId)) {
        const existing = idempotencyRecords.get(idempId);
        insist(existing.fingerprint === fp, 'EVENT_CONFLICT', 'Conflicto de idempotencia al reprogramar.', 409);
        return getEvent(eventId);
      }
      idempotencyRecords.set(idempId, { eventId, fingerprint: fp });
    }

    event.startTimestamp = start;
    event.endTimestamp = end;
    event.timezone = normTz;
    event.updatedAt = currentTime;

    return getEvent(eventId);
  }

  function cancelEvent({ eventId, ownerId, reason = '' }) {
    checkMember(ownerId);
    insist(typeof eventId === 'string' && eventIdPattern.test(eventId), 'EVENT_INVALID', 'Identificador de evento no válido.');

    const event = events.get(eventId);
    insist(event, 'EVENT_NOT_FOUND', 'Evento no encontrado.', 404);
    insist(event.ownerId === ownerId, 'EVENT_FORBIDDEN', 'Solo el propietario puede cancelar el evento.', 403);
    insist(!revokedRooms.has(event.roomId), 'EVENT_FORBIDDEN', 'Sala revocada.', 403);

    const currentTime = now();
    insist(event.status === 'scheduled', 'EVENT_EXPIRED', 'El evento ya está cancelado o procesado.', 409);

    const cleanReason = clean(reason, 200);

    event.status = 'cancelled';
    event.cancelReason = cleanReason;
    event.updatedAt = currentTime;

    // Si el evento objetivo es el padre de una serie (parentEventId === null y stepIndex === 0)
    if (event.parentEventId === null && event.stepIndex === 0) {
      for (const e of events.values()) {
        if (
          e.parentEventId === eventId &&
          e.ownerId === ownerId &&
          e.roomId === event.roomId &&
          e.status === 'scheduled'
        ) {
          e.status = 'cancelled';
          e.cancelReason = cleanReason;
          e.updatedAt = currentTime;
        }
      }
    }

    return getEvent(eventId);
  }

  function registerVoluntaryPresence({ avatarId, avatarLabel, ownerId, roomId, eventId = null }) {
    checkMember(ownerId);
    checkRoom(roomId);

    insist(typeof avatarId === 'string' && memberIdPattern.test(avatarId), 'EVENT_INVALID', 'Identificador de avatar no válido.');
    const cleanLabel = clean(avatarLabel, 80);
    insist(cleanLabel.length > 0, 'EVENT_INVALID', 'Nombre de avatar no válido.');

    if (eventId !== null) {
      insist(typeof eventId === 'string' && eventIdPattern.test(eventId), 'EVENT_INVALID', 'Identificador de evento no válido.');
      const event = events.get(eventId);
      insist(event && event.roomId === roomId && event.status === 'scheduled', 'EVENT_NOT_FOUND', 'Evento no válido para presencia.', 404);
    }

    const key = `${ownerId}:${roomId}:${avatarId}:${eventId || 'global'}`;
    const presenceRecord = {
      avatarId,
      avatarLabel: cleanLabel,
      ownerId,
      roomId,
      eventId,
      status: 'registered',
      registeredAt: now(),
      isRealPresence: false, // Explicit: voluntary declaration, NOT real presence
    };

    voluntaryPresences.set(key, presenceRecord);
    return structuredClone(presenceRecord);
  }

  function cancelVoluntaryPresence({ avatarId, ownerId, roomId, eventId = null }) {
    checkMember(ownerId);
    checkRoom(roomId);
    const key = `${ownerId}:${roomId}:${avatarId}:${eventId || 'global'}`;
    const presence = voluntaryPresences.get(key);
    insist(presence && presence.status === 'registered', 'EVENT_NOT_FOUND', 'Registro de presencia voluntaria no encontrado.', 404);
    insist(presence.ownerId === ownerId, 'EVENT_FORBIDDEN', 'Solo el propietario puede cancelar su presencia voluntaria.', 403);

    presence.status = 'cancelled';
    presence.updatedAt = now();
    return structuredClone(presence);
  }

  function listEvents({ memberId, roomId = null, fromTimestamp = null, toTimestamp = null, includeCancelled = false, includeExpired = false } = {}) {
    if (memberId !== undefined) {
      checkMember(memberId);
    }
    if (roomId !== null) {
      checkRoom(roomId);
    }

    const currentTime = now();
    const result = [];

    for (const event of events.values()) {
      if (revokedOwners.has(event.ownerId) || revokedRooms.has(event.roomId)) continue;
      if (roomId !== null && event.roomId !== roomId) continue;

      const effectiveStatus = (event.status === 'scheduled' && currentTime > event.endTimestamp) ? 'expired' : event.status;

      if (!includeCancelled && effectiveStatus === 'cancelled') continue;
      if (!includeExpired && effectiveStatus === 'expired') continue;

      if (fromTimestamp !== null && event.endTimestamp < fromTimestamp) continue;
      if (toTimestamp !== null && event.startTimestamp > toTimestamp) continue;

      result.push(structuredClone({ ...event, status: effectiveStatus }));
    }

    // Orden estable: primario por startTimestamp ascendente, secundario por eventId ascendente
    result.sort((a, b) => {
      if (a.startTimestamp !== b.startTimestamp) {
        return a.startTimestamp - b.startTimestamp;
      }
      return a.eventId.localeCompare(b.eventId);
    });

    return result;
  }

  function getAccessibleView({ memberId, roomId, atTimestamp = null }) {
    checkMember(memberId);
    checkRoom(roomId);

    const targetTime = atTimestamp !== null ? validateTimestamp(atTimestamp, 'atTimestamp') : now();

    const allRoomEvents = listEvents({ memberId, roomId, includeCancelled: false, includeExpired: true });

    const currentEvents = [];
    const upcomingEvents = [];

    for (const event of allRoomEvents) {
      if (event.status === 'cancelled') continue;

      if (targetTime >= event.startTimestamp && targetTime <= event.endTimestamp && event.status === 'scheduled') {
        currentEvents.push(event);
      } else if (event.startTimestamp > targetTime && event.status === 'scheduled') {
        upcomingEvents.push(event);
      }
    }

    // Filtrar presencia voluntaria activa para la sala
    const activePresences = [];
    for (const pres of voluntaryPresences.values()) {
      if (pres.roomId === roomId && pres.status === 'registered' && !revokedOwners.has(pres.ownerId)) {
        activePresences.push(structuredClone(pres));
      }
    }

    // Orden estable de presencias: por avatarId ascendente, luego eventId ascendente, luego ownerId ascendente
    activePresences.sort((a, b) => {
      if (a.avatarId !== b.avatarId) return a.avatarId.localeCompare(b.avatarId);
      const evA = a.eventId || '';
      const evB = b.eventId || '';
      if (evA !== evB) return evA.localeCompare(evB);
      return a.ownerId.localeCompare(b.ownerId);
    });

    return {
      roomId,
      projectedAt: targetTime,
      isRealPresence: false, // Vista accesible de proyección sin presencia real ni ejecución de agentes
      notice: 'Proyección puramente declarativa de calendario y presencia voluntaria de avatares.',
      currentEvents,
      upcomingEvents,
      voluntaryPresence: activePresences,
    };
  }

  function revokeOwner(ownerId) {
    insist(typeof ownerId === 'string' && memberIdPattern.test(ownerId), 'EVENT_INVALID', 'Identificador de propietario no válido.');
    revokedOwners.add(ownerId);
  }

  function revokeRoom(roomId) {
    insist(typeof roomId === 'string' && roomIdPattern.test(roomId), 'EVENT_INVALID', 'Identificador de sala no válido.');
    revokedRooms.add(roomId);
  }

  return {
    scheduleEvent,
    getEvent,
    rescheduleEvent,
    cancelEvent,
    registerVoluntaryPresence,
    cancelVoluntaryPresence,
    listEvents,
    getAccessibleView,
    revokeOwner,
    revokeRoom,
  };
}
