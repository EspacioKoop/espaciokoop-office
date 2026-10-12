import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicy } from '../src/fixtures.mjs';
import { createOfficeCalendar, computeNextRecurrenceTimestamp, normalizeTimezone } from '../src/office-events.mjs';

describe('Office Events Adversarial Test Suite (#70)', () => {
  const baseTime = 1773000000000; // Fixed synthetic base timestamp

  describe('1. Regresiones DST y Recurrencias en Europe/Madrid', () => {
    test('recurrencia diaria en Europe/Madrid durante cambio de hora en marzo (spring forward)', () => {
      // 28 de marzo de 2026, 10:00 CET (UTC+1) => 09:00:00Z
      const marchStart = Date.parse('2026-03-28T10:00:00+01:00');
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => marchStart });

      const primary = calendar.scheduleEvent({
        idempotencyKey: 'dst-march-daily',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Sincro DST Marzo',
        startTimestamp: marchStart,
        endTimestamp: marchStart + 3600000,
        timezone: 'Europe/Madrid',
        recurrence: { frequency: 'daily', interval: 1, count: 4 }
      });

      assert.equal(primary.eventId, primary.parentEventId || primary.eventId);
      const events = calendar.listEvents({ roomId: 'sala-1', includeExpired: true });
      assert.equal(events.length, 4);

      // Día 0 (Marzo 28): 10:00 CET -> 09:00:00Z
      assert.equal(new Date(events[0].startTimestamp).toISOString(), '2026-03-28T09:00:00.000Z');
      // Día 1 (Marzo 29, cambio DST): 10:00 CEST -> 08:00:00Z
      assert.equal(new Date(events[1].startTimestamp).toISOString(), '2026-03-29T08:00:00.000Z');
      // Día 2 (Marzo 30): 10:00 CEST -> 08:00:00Z
      assert.equal(new Date(events[2].startTimestamp).toISOString(), '2026-03-30T08:00:00.000Z');
      // Día 3 (Marzo 31): 10:00 CEST -> 08:00:00Z
      assert.equal(new Date(events[3].startTimestamp).toISOString(), '2026-03-31T08:00:00.000Z');

      // Verificar que la hora local percibida es 10:00 en todos los casos
      const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      for (const ev of events) {
        assert.equal(fmt.format(new Date(ev.startTimestamp)), '10:00');
      }
    });

    test('recurrencia semanal en Europe/Madrid durante cambio de hora en octubre (fall back)', () => {
      // 24 de octubre de 2026, 10:00 CEST (UTC+2) => 08:00:00Z
      const octStart = Date.parse('2026-10-24T10:00:00+02:00');
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => octStart });

      calendar.scheduleEvent({
        idempotencyKey: 'dst-oct-weekly',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Semanal DST Octubre',
        startTimestamp: octStart,
        endTimestamp: octStart + 3600000,
        timezone: 'Europe/Madrid',
        recurrence: { frequency: 'weekly', interval: 1, count: 3 }
      });

      const events = calendar.listEvents({ roomId: 'sala-1', includeExpired: true });
      assert.equal(events.length, 3);

      // Semana 0 (Oct 24, CEST UTC+2): 08:00:00Z
      assert.equal(new Date(events[0].startTimestamp).toISOString(), '2026-10-24T08:00:00.000Z');
      // Semana 1 (Oct 31, CET UTC+1 tras cambio el 25/10): 09:00:00Z
      assert.equal(new Date(events[1].startTimestamp).toISOString(), '2026-10-31T09:00:00.000Z');
      // Semana 2 (Nov 7, CET UTC+1): 09:00:00Z
      assert.equal(new Date(events[2].startTimestamp).toISOString(), '2026-11-07T09:00:00.000Z');

      const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      for (const ev of events) {
        assert.equal(fmt.format(new Date(ev.startTimestamp)), '10:00');
      }
    });

    test('comportamiento explícito y determinista para hora inexistente (02:30 en marzo spring forward)', () => {
      // 28 de marzo de 2026, 02:30 CET (UTC+1) => 01:30:00Z
      const skippedStart = Date.parse('2026-03-28T02:30:00+01:00');
      const tsNext = computeNextRecurrenceTimestamp(skippedStart, 'daily', 1, 1, 'Europe/Madrid');

      // El 29 de marzo a las 02:30 local no existe (pasa de 02:00 a 03:00).
      // El motor evalúa Date.UTC(2026, 2, 29, 2, 30, 0) y resuelve a 2026-03-29T01:30:00.000Z (03:30 local UTC+2).
      assert.equal(new Date(tsNext).toISOString(), '2026-03-29T01:30:00.000Z');
      const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      assert.equal(fmt.format(new Date(tsNext)), '03:30');
    });

    test('comportamiento explícito y determinista para hora ambigua (02:30 en octubre fall back)', () => {
      // 24 de octubre de 2026, 02:30 CEST (UTC+2) => 00:30:00Z
      const ambigStart = Date.parse('2026-10-24T02:30:00+02:00');
      const tsNext = computeNextRecurrenceTimestamp(ambigStart, 'daily', 1, 1, 'Europe/Madrid');

      // El 25 de octubre a las 02:30 local ocurre dos veces.
      // El motor resuelve deterministamente a 2026-10-25T01:30:00.000Z (02:30 local UTC+1).
      assert.equal(new Date(tsNext).toISOString(), '2026-10-25T01:30:00.000Z');
      const fmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      assert.equal(fmt.format(new Date(tsNext)), '02:30');
    });
  });

  describe('2. Recurrencia Mensual (31 enero a febrero y periodos bisiestos)', () => {
    test('recurrencia mensual desde 31 de enero en año no bisiesto (2026): coherencia y ausencia de duplicados', () => {
      // 31 de enero de 2026, 10:00 UTC
      const jan31Ts = Date.parse('2026-01-31T10:00:00Z');
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => jan31Ts });

      calendar.scheduleEvent({
        idempotencyKey: 'jan31-monthly-2026',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Mensual Fin de Mes',
        startTimestamp: jan31Ts,
        endTimestamp: jan31Ts + 3600000,
        timezone: 'UTC',
        recurrence: { frequency: 'monthly', interval: 1, count: 4 }
      });

      const events = calendar.listEvents({ roomId: 'sala-1', includeExpired: true });
      assert.equal(events.length, 4);

      // Verificar identificadores únicos sin duplicados de eventId
      const eventIds = new Set(events.map(e => e.eventId));
      assert.equal(eventIds.size, 4);

      // Semántica documentada de JS Date con meses más cortos (ej. Feb 31 -> Marzo 3, Abril 31 -> Mayo 1):
      // Paso 0: 2026-01-31T10:00:00.000Z
      assert.equal(new Date(events[0].startTimestamp).toISOString(), '2026-01-31T10:00:00.000Z');
      // Paso 1 (Enero + 1 mes = Feb 31 -> Marzo 3 en 2026 no bisiesto):
      assert.equal(new Date(events[1].startTimestamp).toISOString(), '2026-03-03T10:00:00.000Z');
      // Paso 2 (Enero + 2 meses = Marzo 31):
      assert.equal(new Date(events[2].startTimestamp).toISOString(), '2026-03-31T10:00:00.000Z');
      // Paso 3 (Enero + 3 meses = Abril 31 -> Mayo 1):
      assert.equal(new Date(events[3].startTimestamp).toISOString(), '2026-05-01T10:00:00.000Z');
    });

    test('recurrencia mensual desde 31 de enero en año bisiesto (2028): coherencia y semántica bisiesta', () => {
      // 31 de enero de 2028, 10:00 UTC (2028 es año bisiesto con 29 días en febrero)
      const jan31Ts2028 = Date.parse('2028-01-31T10:00:00Z');
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => jan31Ts2028 });

      calendar.scheduleEvent({
        idempotencyKey: 'jan31-monthly-2028',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Mensual Bisiesto 2028',
        startTimestamp: jan31Ts2028,
        endTimestamp: jan31Ts2028 + 3600000,
        timezone: 'UTC',
        recurrence: { frequency: 'monthly', interval: 1, count: 2 }
      });

      const events = calendar.listEvents({ roomId: 'sala-1', includeExpired: true });
      assert.equal(events.length, 2);

      // Paso 0: 2028-01-31T10:00:00.000Z
      assert.equal(new Date(events[0].startTimestamp).toISOString(), '2028-01-31T10:00:00.000Z');
      // Paso 1 (Enero + 1 mes = Feb 31 -> Marzo 2 en bisiesto 2028):
      assert.equal(new Date(events[1].startTimestamp).toISOString(), '2028-03-02T10:00:00.000Z');
    });
  });

  describe('3. Validación y Rechazo de Parámetros Inválidos y Date Overflow', () => {
    test('rechazo de frecuencias de recurrencia no permitidas', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const invalidFreqs = ['yearly', 'hourly', 'minutely', '', null, 123, {}];
      for (const frequency of invalidFreqs) {
        assert.throws(() => {
          calendar.scheduleEvent({
            idempotencyKey: `freq-${String(frequency)}`,
            ownerId: 'aurora',
            roomId: 'sala-1',
            title: 'Frecuencia Inválida',
            startTimestamp: baseTime + 1000,
            endTimestamp: baseTime + 2000,
            recurrence: { frequency, interval: 1, count: 2 }
          });
        }, err => err.code === 'EVENT_INVALID');
      }
    });

    test('rechazo de intervalos de recurrencia inválidos (<=0, >31, no enteros, no numéricos)', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const invalidIntervals = [0, -1, -10, 32, 100, 1.5, '1', NaN, Infinity, null];
      for (const interval of invalidIntervals) {
        assert.throws(() => {
          calendar.scheduleEvent({
            idempotencyKey: `inter-${String(interval)}`,
            ownerId: 'aurora',
            roomId: 'sala-1',
            title: 'Intervalo Inválido',
            startTimestamp: baseTime + 1000,
            endTimestamp: baseTime + 2000,
            recurrence: { frequency: 'daily', interval, count: 2 }
          });
        }, err => err.code === 'EVENT_INVALID');
      }
    });

    test('rechazo de conteos de recurrencia inválidos y excesivos', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime, maxRecurrenceCount: 10 });

      // Count <= 0 o no entero
      const invalidCounts = [0, -1, 2.5, '5', NaN, Infinity];
      for (const count of invalidCounts) {
        assert.throws(() => {
          calendar.scheduleEvent({
            idempotencyKey: `cnt-${String(count)}`,
            ownerId: 'aurora',
            roomId: 'sala-1',
            title: 'Conteo Inválido',
            startTimestamp: baseTime + 1000,
            endTimestamp: baseTime + 2000,
            recurrence: { frequency: 'daily', interval: 1, count }
          });
        }, err => err.code === 'EVENT_INVALID' || err.code === 'EVENT_LIMIT');
      }

      // Count > maxRecurrenceCount
      assert.throws(() => {
        calendar.scheduleEvent({
          idempotencyKey: 'cnt-excess',
          ownerId: 'aurora',
          roomId: 'sala-1',
          title: 'Exceso Conteo',
          startTimestamp: baseTime + 1000,
          endTimestamp: baseTime + 2000,
          recurrence: { frequency: 'daily', interval: 1, count: 11 }
        });
      }, err => err.code === 'EVENT_LIMIT');
    });

    test('normalización y rechazo de zonas horarias malformadas', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      // Cadena inválida lanza error de zona horaria
      assert.throws(() => {
        calendar.scheduleEvent({
          idempotencyKey: 'tz-invalid-str',
          ownerId: 'aurora',
          roomId: 'sala-1',
          title: 'TZ Inválida',
          startTimestamp: baseTime + 1000,
          endTimestamp: baseTime + 2000,
          timezone: 'Not/A_Real_Timezone_123'
        });
      }, err => err.message.includes('Zona horaria no válida'));

      // Tipos no string o vacíos normalizan a UTC por contrato
      const evDefault = calendar.scheduleEvent({
        idempotencyKey: 'tz-fallback-utc',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'TZ Fallback',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 2000,
        timezone: null
      });
      assert.equal(evDefault.timezone, 'UTC');
    });

    test('rechazo de timestamps inválidos, end <= start y untilTimestamp previo', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      // startTimestamp <= 0, no entero o NaN
      assert.throws(() => {
        calendar.scheduleEvent({
          idempotencyKey: 'ts-bad-start', ownerId: 'aurora', roomId: 'sala-1', title: 'Start malo',
          startTimestamp: -100, endTimestamp: 1000
        });
      }, err => err.code === 'EVENT_INVALID');

      // endTimestamp <= startTimestamp
      assert.throws(() => {
        calendar.scheduleEvent({
          idempotencyKey: 'ts-end-before-start', ownerId: 'aurora', roomId: 'sala-1', title: 'End antes de start',
          startTimestamp: 1000, endTimestamp: 1000
        });
      }, err => err.code === 'EVENT_INVALID');

      // untilTimestamp previo a startTimestamp
      assert.throws(() => {
        calendar.scheduleEvent({
          idempotencyKey: 'ts-until-before-start', ownerId: 'aurora', roomId: 'sala-1', title: 'Until previo',
          startTimestamp: 1000, endTimestamp: 2000,
          recurrence: { frequency: 'daily', interval: 1, count: 5, untilTimestamp: 500 }
        });
      }, err => err.code === 'EVENT_INVALID');
    });

    test('rechazo de configuración de calendario fuera de límites', () => {
      assert.throws(() => createOfficeCalendar({ policy: demoPolicy, maxRecurrenceCount: 0 }), err => err.code === 'EVENT_CONFIG');
      assert.throws(() => createOfficeCalendar({ policy: demoPolicy, maxRecurrenceCount: 400 }), err => err.code === 'EVENT_CONFIG');
      assert.throws(() => createOfficeCalendar({ policy: demoPolicy, maxEventsPerRoom: 5 }), err => err.code === 'EVENT_CONFIG');
      assert.throws(() => createOfficeCalendar({ policy: demoPolicy, maxEventsPerRoom: 20000 }), err => err.code === 'EVENT_CONFIG');
    });
  });

  describe('4. Idempotencia, Conflictos, Aislamiento y Revocación', () => {
    test('idempotencia estricta en programación y conflicto 409 con distinto payload', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const payloadA = {
        idempotencyKey: 'idemp-strict-1',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Reunión Original',
        description: 'Descripción A',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      };

      const eventA = calendar.scheduleEvent(payloadA);

      // Reintento idéntico retorna el mismo evento
      const retry = calendar.scheduleEvent(payloadA);
      assert.deepEqual(retry, eventA);

      // Clave idéntica con distinto título -> 409 EVENT_CONFLICT
      assert.throws(() => {
        calendar.scheduleEvent({ ...payloadA, title: 'Título Distinto' });
      }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);

      // Clave idéntica con distinta sala -> 409 EVENT_CONFLICT
      assert.throws(() => {
        calendar.scheduleEvent({ ...payloadA, roomId: 'sala-2' });
      }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);

      // Clave idéntica con distinta recurrencia -> 409 EVENT_CONFLICT
      assert.throws(() => {
        calendar.scheduleEvent({ ...payloadA, recurrence: { frequency: 'daily', interval: 1, count: 2 } });
      }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);
    });

    test('intento de programación idempotente tras cancelación del evento original lanza conflicto 409', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const payload = {
        idempotencyKey: 'idemp-cancel-conflict',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Evento para cancelar',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      };

      const event = calendar.scheduleEvent(payload);
      calendar.cancelEvent({ eventId: event.eventId, ownerId: 'aurora', reason: 'Cancelado' });

      // Reintento idempotente tras cancelación
      assert.throws(() => {
        calendar.scheduleEvent(payload);
      }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);
    });

    test('idempotencia en reprogramación y detección de conflicto 409', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const event = calendar.scheduleEvent({
        idempotencyKey: 'idemp-resched-test',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Reprogramable',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });

      const reschedParams = {
        eventId: event.eventId,
        ownerId: 'aurora',
        startTimestamp: baseTime + 2000,
        endTimestamp: baseTime + 6000,
        idempotencyKey: 'resched-key-abc',
      };

      const resched1 = calendar.rescheduleEvent(reschedParams);
      assert.equal(resched1.startTimestamp, baseTime + 2000);

      // Reintento idéntico retorna el evento reprogramado
      const reschedRetry = calendar.rescheduleEvent(reschedParams);
      assert.deepEqual(reschedRetry, resched1);

      // Misma clave con distinto endTimestamp -> 409 EVENT_CONFLICT
      assert.throws(() => {
        calendar.rescheduleEvent({ ...reschedParams, endTimestamp: baseTime + 7000 });
      }, err => err.code === 'EVENT_CONFLICT' && err.status === 409);
    });

    test('aislamiento de permisos por propietario/miembro', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      const event = calendar.scheduleEvent({
        idempotencyKey: 'idemp-isolation-adv',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Privado Aurora',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });

      // Marea no puede reprogramar el evento de Aurora
      assert.throws(() => {
        calendar.rescheduleEvent({
          eventId: event.eventId,
          ownerId: 'marea',
          startTimestamp: baseTime + 2000,
          endTimestamp: baseTime + 6000,
        });
      }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

      // Marea no puede cancelar el evento de Aurora
      assert.throws(() => {
        calendar.cancelEvent({
          eventId: event.eventId,
          ownerId: 'marea',
          reason: 'Intento no autorizado'
        });
      }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

      // Usuario no presente en policy no puede operar
      assert.throws(() => {
        calendar.registerVoluntaryPresence({
          avatarId: 'intruso-avatar',
          avatarLabel: 'Intruso',
          ownerId: 'intruso',
          roomId: 'sala-1'
        });
      }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);
    });

    test('revocación de propietario y sala oculta eventos y presencias en listEvents y getAccessibleView', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      calendar.scheduleEvent({
        idempotencyKey: 'evt-aurora-1',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Evento Aurora',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });

      calendar.scheduleEvent({
        idempotencyKey: 'evt-marea-1',
        ownerId: 'marea',
        roomId: 'sala-1',
        title: 'Evento Marea',
        startTimestamp: baseTime + 1000,
        endTimestamp: baseTime + 5000,
      });

      calendar.registerVoluntaryPresence({
        avatarId: 'aurora-bot',
        avatarLabel: 'Aurora Bot',
        ownerId: 'aurora',
        roomId: 'sala-1',
      });

      calendar.registerVoluntaryPresence({
        avatarId: 'marea-bot',
        avatarLabel: 'Marea Bot',
        ownerId: 'marea',
        roomId: 'sala-1',
      });

      assert.equal(calendar.listEvents({ roomId: 'sala-1' }).length, 2);
      assert.equal(calendar.getAccessibleView({ memberId: 'marea', roomId: 'sala-1' }).voluntaryPresence.length, 2);

      // Revocar propietario aurora
      calendar.revokeOwner('aurora');

      const eventsAfterRevokeOwner = calendar.listEvents({ roomId: 'sala-1' });
      assert.equal(eventsAfterRevokeOwner.length, 1);
      assert.equal(eventsAfterRevokeOwner[0].ownerId, 'marea');

      const viewAfterRevokeOwner = calendar.getAccessibleView({ memberId: 'marea', roomId: 'sala-1' });
      assert.equal(viewAfterRevokeOwner.voluntaryPresence.length, 1);
      assert.equal(viewAfterRevokeOwner.voluntaryPresence[0].ownerId, 'marea');

      // Revocar sala-1 -> consultar sala-1 expresamente lanza 403 EVENT_FORBIDDEN
      calendar.revokeRoom('sala-1');
      assert.throws(() => {
        calendar.listEvents({ roomId: 'sala-1' });
      }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

      assert.throws(() => {
        calendar.getAccessibleView({ memberId: 'marea', roomId: 'sala-1' });
      }, err => err.code === 'EVENT_FORBIDDEN' && err.status === 403);

      // Consulta global sin roomId omite la sala revocada
      const globalEvents = calendar.listEvents();
      assert.equal(globalEvents.filter(e => e.roomId === 'sala-1').length, 0);
    });
  });

  describe('5. Timestamps Deterministas y Orden Estable sin Side Effects', () => {
    test('uso exclusivo de la función clock now() para createdAt y updatedAt sin Date.now real', () => {
      let syntheticClock = 2000000000000;
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => syntheticClock });

      const event = calendar.scheduleEvent({
        idempotencyKey: 'time-test-1',
        ownerId: 'aurora',
        roomId: 'sala-1',
        title: 'Clock Test',
        startTimestamp: syntheticClock + 1000,
        endTimestamp: syntheticClock + 5000,
      });

      assert.equal(event.createdAt, 2000000000000);
      assert.equal(event.updatedAt, 2000000000000);

      // Avanzar el reloj sintético sin superar endTimestamp (5000 ms)
      syntheticClock = 2000000002000;
      const rescheduled = calendar.rescheduleEvent({
        eventId: event.eventId,
        ownerId: 'aurora',
        startTimestamp: syntheticClock + 2000,
        endTimestamp: syntheticClock + 6000,
      });

      assert.equal(rescheduled.updatedAt, 2000000002000);
    });

    test('ordenación determinista secundaria por eventId ASC ante mismo startTimestamp', () => {
      const calendar = createOfficeCalendar({ policy: demoPolicy, now: () => baseTime });

      // Crear varios eventos en el mismo startTimestamp
      for (let i = 5; i >= 1; i--) {
        calendar.scheduleEvent({
          idempotencyKey: `same-start-${i}`,
          ownerId: 'aurora',
          roomId: 'sala-orden',
          title: `Evento ${i}`,
          startTimestamp: baseTime + 10000,
          endTimestamp: baseTime + 20000,
        });
      }

      const list = calendar.listEvents({ roomId: 'sala-orden' });
      assert.equal(list.length, 5);

      // Comprobar que están ordenados primero por startTimestamp (todos iguales) y luego por eventId ascendente
      for (let i = 0; i < list.length - 1; i++) {
        assert.ok(list[i].eventId < list[i + 1].eventId, `eventId ${list[i].eventId} debe ser menor que ${list[i + 1].eventId}`);
      }
    });
  });
});
