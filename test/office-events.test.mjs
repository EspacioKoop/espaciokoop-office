import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicy } from '../src/fixtures.mjs';
import { createOfficeCalendar, computeNextRecurrenceTimestamp, normalizeTimezone } from '../src/office-events.mjs';

describe('Office Events pure engine', () => {
  const baseTime = 1773000000000; // Fixed synthetic timestamp

  test('normalización y validación de zonas horarias', () => {
    assert.equal(normalizeTimezone('UTC'), 'UTC');
    assert.equal(normalizeTimezone('Europe/Madrid'), 'Europe/Madrid');
    assert.equal(normalizeTimezone('America/New_York'), 'America/New_York');
    assert.throws(() => normalizeTimezone('Invalid/Timezone_Name_123'), /Zona horaria no válida/);
  });

  test('programación nominal y consulta de eventos', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });
    const event = calendar.scheduleEvent({
      idempotencyKey: 'idemp-1',
      ownerId: 'aurora',
      roomId: 'sala-principal',
      title: 'Reunión de Sincronización',
      description: 'Discutir arquitectura del corte',
      startTimestamp: baseTime + 10000,
      endTimestamp: baseTime + 50000,
      timezone: 'Europe/Madrid',
    });

    assert.equal(event.title, 'Reunión de Sincronización');
    assert.equal(event.ownerId, 'aurora');
    assert.equal(event.roomId, 'sala-principal');
    assert.equal(event.status, 'scheduled');
    assert.equal(event.timezone, 'Europe/Madrid');

    const fetched = calendar.getEvent(event.eventId, { memberId: 'aurora' });
    assert.deepEqual(fetched, event);
  });

  test('prevención de duplicados e idempotencia estricta', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    const event1 = calendar.scheduleEvent({
      idempotencyKey: 'idemp-dup',
      ownerId: 'aurora',
      roomId: 'sala-1',
      title: 'Evento Único',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    // Reintento idéntico devuelve exactamente el mismo evento
    const event2 = calendar.scheduleEvent({
      idempotencyKey: 'idemp-dup',
      ownerId: 'aurora',
      roomId: 'sala-1',
      title: 'Evento Único',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    assert.equal(event1.eventId, event2.eventId);

    // Misma idempotencyKey con payload distinto lanza conflicto (409)
    assert.throws(() => {
      calendar.scheduleEvent({
        idempotencyKey: 'idemp-dup',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Evento Distinto Título',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });
    }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);
  });

  test('reprogramación y cancelación de eventos', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    const event = calendar.scheduleEvent({
      idempotencyKey: 'idemp-resched',
      ownerId: 'aurora',
      roomId: 'sala-1',
      title: 'Ajuste de Hora',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    const rescheduled = calendar.rescheduleEvent({
      eventId: event.eventId,
      ownerId: 'aurora',
      startTimestamp: baseTime + 2000,
      endTimestamp: baseTime + 6000,
      idempotencyKey: 'resched-key-1'
    });

    assert.equal(rescheduled.startTimestamp, baseTime + 2000);
    assert.equal(rescheduled.endTimestamp, baseTime + 6000);

    // Cancelar evento
    const cancelled = calendar.cancelEvent({
      eventId: event.eventId,
      ownerId: 'aurora',
      reason: 'Conflicto de agenda'
    });

    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelReason, 'Conflicto de agenda');

    // No se puede reprogramar un evento ya cancelado
    assert.throws(() => {
      calendar.rescheduleEvent({
        eventId: event.eventId,
        ownerId: 'aurora',
        startTimestamp: baseTime + 3000,
        endTimestamp: baseTime + 7000,
      });
    }, err => err.code === 'EVENT_EXPIRED' && err.status === 409);
  });

  test('caducidad automática por timestamp relativo', () => {
    let currentTime = baseTime;
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => currentTime });

    const event = calendar.scheduleEvent({
      idempotencyKey: 'idemp-expire',
      ownerId: 'marea',
      roomId: 'sala-1',
      title: 'Reunión Breve',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    assert.equal(calendar.getEvent(event.eventId).status, 'scheduled');

    // Avanzar el tiempo más allá de endTimestamp
    currentTime = baseTime + 6000;
    assert.equal(calendar.getEvent(event.eventId).status, 'expired');
  });

  test('recurrencia determinista y límites de recurrencia', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime, maxRecurrenceCount: 10 });

    const firstOcc = calendar.scheduleEvent({
      idempotencyKey: 'idemp-recur',
      ownerId: 'aurora',
      roomId: 'sala-reunion',
      title: 'Diaria de equipo',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
      recurrence: {
        frequency: 'daily',
        interval: 1,
        count: 5,
      }
    });

    assert.equal(firstOcc.stepIndex, 0);

    const allEvents = calendar.listEvents({ roomId: 'sala-reunion' });
    assert.equal(allEvents.length, 5);
    assert.equal(allEvents[0].eventId, firstOcc.eventId);
    assert.equal(allEvents[1].parentEventId, firstOcc.eventId);
    assert.equal(allEvents[1].stepIndex, 1);
    assert.equal(allEvents[1].startTimestamp, baseTime + 1000 + (24 * 60 * 60 * 1000));

    // Exceder el límite configurado de recurrencia
    assert.throws(() => {
      calendar.scheduleEvent({
        idempotencyKey: 'idemp-recur-excess',
        ownerId: 'aurora',
        roomId: 'sala-reunion',
        title: 'Exceso',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
        recurrence: {
          frequency: 'daily',
          interval: 1,
          count: 15,
        }
      });
    }, err => err.code === 'EVENT_LIMIT');
  });

  test('transiciones DST en recálculo de recurrencias', () => {
    // 29 de marzo de 2026: cambio a horario de verano en Madrid (02:00 -> 03:00)
    const baseDstTs = Date.parse('2026-03-28T10:00:00Z'); // 11:00 hora local Madrid (UTC+1)
    const nextTs = computeNextRecurrenceTimestamp(baseDstTs, 'daily', 1, 1, 'Europe/Madrid');
    const nextDateStr = new Date(nextTs).toISOString();

    // El día 29 de marzo a las 11:00 hora local Madrid (UTC+2) corresponde a 09:00:00Z
    assert.equal(nextDateStr, '2026-03-29T09:00:00.000Z');
  });

  test('aislamiento por owner/sala y permisos de acceso', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    const event = calendar.scheduleEvent({
      idempotencyKey: 'idemp-isolation',
      ownerId: 'aurora',
      roomId: 'sala-aurora',
      title: 'Privado de Aurora',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    // Marea intenta cancelar el evento de Aurora -> denegado (403)
    assert.throws(() => {
      calendar.cancelEvent({
        eventId: event.eventId,
        ownerId: 'marea',
        reason: 'Intento de borrado no autorizado'
      });
    }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

    // Usuario no registrado en policy -> denegado (403)
    assert.throws(() => {
      calendar.scheduleEvent({
        idempotencyKey: 'idemp-unauth',
        ownerId: 'intruso',
        roomId: 'sala-aurora',
        title: 'Intruso',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });
    }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);
  });

  test('presencia voluntaria declarativa sin ejecución real', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    const presence = calendar.registerVoluntaryPresence({
      avatarId: 'aurora-bot',
      avatarLabel: 'Avatar Aurora',
      ownerId: 'aurora',
      roomId: 'sala-1',
    });

    assert.equal(presence.avatarId, 'aurora-bot');
    assert.equal(presence.isRealPresence, false); // Expresamente sin presencia real de agente
    assert.equal(presence.status, 'registered');

    const view = calendar.getAccessibleView({ memberId: 'marea', roomId: 'sala-1' });
    assert.equal(view.isRealPresence, false);
    assert.equal(view.voluntaryPresence.length, 1);
    assert.equal(view.voluntaryPresence[0].avatarId, 'aurora-bot');

    // Cancelar presencia voluntaria
    const cancelled = calendar.cancelVoluntaryPresence({
      avatarId: 'aurora-bot',
      ownerId: 'aurora',
      roomId: 'sala-1',
    });
    assert.equal(cancelled.status, 'cancelled');

    const viewAfter = calendar.getAccessibleView({ memberId: 'marea', roomId: 'sala-1' });
    assert.equal(viewAfter.voluntaryPresence.length, 0);
  });

  test('revocación de miembros y salas', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    const event = calendar.scheduleEvent({
      idempotencyKey: 'idemp-revoke',
      ownerId: 'aurora',
      roomId: 'sala-1',
      title: 'Evento para revocar',
      startTimestamp: baseTime + 1000,
      endTimestamp: baseTime + 5000,
    });

    // Revocar owner aurora
    calendar.revokeOwner('aurora');

    assert.throws(() => {
      calendar.getEvent(event.eventId);
    }, err => err.code === 'EVENT_NOT_FOUND' && err.status === 404);

    assert.throws(() => {
      calendar.scheduleEvent({
        idempotencyKey: 'idemp-new',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Nuevo Intento',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });
    }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

    // Revocar sala-2
    calendar.revokeRoom('sala-2');
    assert.throws(() => {
      calendar.scheduleEvent({
        idempotencyKey: 'idemp-room-rev',
        ownerId: 'marea',
        roomId: 'sala-2',
        title: 'Sala Revocada',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });
    }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);
  });

  test('vista accesible con orden estable', () => {
    const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

    calendar.scheduleEvent({
      idempotencyKey: 'evt-b',
      ownerId: 'aurora',
      roomId: 'sala-orden',
      title: 'Evento B',
      startTimestamp: baseTime + 20000,
      endTimestamp: baseTime + 30000,
    });

    calendar.scheduleEvent({
      idempotencyKey: 'evt-a',
      ownerId: 'aurora',
      roomId: 'sala-orden',
      title: 'Evento A',
      startTimestamp: baseTime + 10000,
      endTimestamp: baseTime + 15000,
    });

    calendar.registerVoluntaryPresence({
      avatarId: 'marea-avatar',
      avatarLabel: 'Marea',
      ownerId: 'marea',
      roomId: 'sala-orden',
    });

    calendar.registerVoluntaryPresence({
      avatarId: 'aurora-avatar',
      avatarLabel: 'Aurora',
      ownerId: 'aurora',
      roomId: 'sala-orden',
    });

    const view = calendar.getAccessibleView({
      memberId: 'aurora',
      roomId: 'sala-orden',
      atTimestamp: baseTime + 5000,
    });

    // Próximos eventos ordenados cronológicamente
    assert.equal(view.upcomingEvents.length, 2);
    assert.equal(view.upcomingEvents[0].title, 'Evento A');
    assert.equal(view.upcomingEvents[1].title, 'Evento B');

    // Presencias ordenadas alfabéticamente por avatarId
    assert.equal(view.voluntaryPresence.length, 2);
    assert.equal(view.voluntaryPresence[0].avatarId, 'aurora-avatar');
    assert.equal(view.voluntaryPresence[1].avatarId, 'marea-avatar');
  });
});
