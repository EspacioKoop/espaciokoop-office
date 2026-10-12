> **Seguimiento:** la corrección de cancelación de series y aislamiento por propietario se está tramitando en [#130](https://github.com/EspacioKoop/espaciokoop-office/pull/130). Esta auditoría sigue referida al SHA antiguo de #70 y no constituye validación de la corrección.

# Auditoría de Código y Seguridad: PR #70 (Calendario Office: DST, Cancelaciones y Visibilidad)

**Fecha de evaluación:** 12 de octubre de 2026
**Revisión/SHA auditado:** `725778f5541f9703d625a33b63a1ee88f2a72357`
**PR auditada:** PR #70 (`feat(events): calendario determinista de eventos y presencia voluntaria (#54)`)
**Rama base:** `main`
**Archivo de entrega único:** `docs/reviews/pr70-calendar-dst-20261012.md`

---

## 1. Resumen Ejecutivo

Esta auditoría analiza la implementación del calendario determinista de eventos y presencia voluntaria introducida en la PR #70 (`725778f5541f9703d625a33b63a1ee88f2a72357`). La evaluación se ha realizado de forma **completamente aislada y de solo lectura**, probando directamente el archivo `src/office-events.mjs` proveniente del SHA objetivo mediante Node.js v22.22.1.

### Resumen de hallazgos:
1. **2 Defectos Reales (Bugs reproducidos):**
   - **Cancelación incompleta de recurrencias:** La cancelación del evento primario/padre (`cancelEvent`) marca únicamente esa instancia como `cancelled`, dejando las sub-instancias recurrentes hijas (`stepIndex > 0`) activas (`scheduled`).
   - **Sobrescritura/Hijacking de presencia voluntaria por `avatarId`:** La clave de presencia voluntaria es `${roomId}:${avatarId}:${eventId || 'global'}` sin incluir el `ownerId`. Cualquier miembro autorizado puede registrar una presencia con el `avatarId` de otro propietario y sobrescribir su registro o posteriormente cancelarlo.
2. **2 Puntos de Diseño No Decididos / Riesgos de Arquitectura:**
   - **Inconsistencia de estado tras reprogramar eventos:** `rescheduleEvent` modifica los campos `startTimestamp` y `endTimestamp` únicamente del evento individual invocado, pero no recalcula las ocurrencias futuras ni actualiza la serie en eventos recurrentes.
   - **Efectos secundarios silenciosos en `getEvent`:** Invocaciones a `getEvent` devuelven una copia con estado calculado `expired` si el tiempo actual supera `endTimestamp`, pero no persisten ese cambio en la colección interna de eventos.
3. **6 Aspectos Verificados y Conformes:**
   - **Soporte correcto de DST en Europe/Madrid:** `computeNextRecurrenceTimestamp` preserva exactamente la hora local (10:00:00 AM) al cruzar el cambio de hora de primavera (+01:00 -> +02:00 en marzo) y otoño (+02:00 -> +01:00 en octubre de 2026).
   - **Validación estricta de timestamps:** Rechazo de timestamps negativos, floats, `NaN` y combinaciones con `endTimestamp <= startTimestamp`.
   - **Control de autorización Owner → Event → Room:** Garantía de que solo el propietario del evento puede reprogramarlo o cancelarlo; la revocación de un propietario o sala inhabilita inmediatamente el acceso a sus eventos.
   - **Independencia de presencia voluntaria vs presencia real:** El indicador `isRealPresence` se mantiene en `false` en todas las proyecciones y vistas accesibles (`getAccessibleView`).
   - **Idempotencia nominal por clave:** Duplicar peticiones con idéntica `idempotencyKey` y payload devuelve la entidad en caché; diferencias en payload se rechazan con `EVENT_CONFLICT` (409).
   - **Límites max 52 / 1000 respetados:** Respeto estricto del límite máximo de 52 ocurrencias recurrentes y 1000 eventos por sala.

---

## 2. Evidencia y Pruebas Reales Ejecutadas

Las pruebas se ejecutaron sobre el código extraído de `git show 725778f5541f9703d625a33b63a1ee88f2a72357:src/office-events.mjs` acoplado con `src/fixtures.mjs` (`demoPolicy`).

### Comando de prueba ejecutado:
```bash
node --input-type=module -e "
import { createOfficeCalendar, computeNextRecurrenceTimestamp } from '/tmp/audit_pr70/office-events.mjs';
import { demoPolicy } from '/tmp/audit_pr70/fixtures.mjs';

const policy = demoPolicy;

async function runAudit() {
  console.log('=== TEST 1: RECURRENCIAS Y CAMBIO HORARIO Europe/Madrid (DST) ===');
  const mar28 = Date.UTC(2026, 2, 28, 9, 0, 0); // 10:00 local CET (+1)
  const cal1 = createOfficeCalendar({ policy, now: () => mar28 });
  const evt1 = cal1.scheduleEvent({
    idempotencyKey: 'idemp-dst-spring', ownerId: 'aurora', roomId: 'room-a',
    title: 'Reunión DST Spring', startTimestamp: mar28, endTimestamp: mar28 + 3600000,
    timezone: 'Europe/Madrid', recurrence: { frequency: 'daily', interval: 1, count: 3 }
  });
  const events1 = cal1.listEvents({ roomId: 'room-a' });
  events1.forEach((e, idx) => {
    const d = new Date(e.startTimestamp);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' }).format(d);
    console.log(\`  Occurrence \${idx}: id=\${e.eventId}, ts=\${e.startTimestamp}, local=\${fmt}, parent=\${e.parentEventId}, step=\${e.stepIndex}\`);
  });

  console.log('\n=== TEST 2: DEFECTO 1 - CANCELACIÓN INCOMPLETA EN RECURRENCIAS ===');
  console.log('Cancelando evento primario (stepIndex 0)...');
  cal1.cancelEvent({ eventId: events1[0].eventId, ownerId: 'aurora' });
  console.log('Estado Padre (stepIndex 0):', cal1.getEvent(events1[0].eventId).status);
  console.log('Estado Hijo 1 (stepIndex 1):', cal1.getEvent(events1[1].eventId).status);
  console.log('Estado Hijo 2 (stepIndex 2):', cal1.getEvent(events1[2].eventId).status);

  console.log('\n=== TEST 3: DEFECTO 2 - HIJACKING DE PRESENCIA VOLUNTARIA ===');
  const calP = createOfficeCalendar({ policy, now: () => 1000000 });
  const p1 = calP.registerVoluntaryPresence({ avatarId: 'avatar-1', avatarLabel: 'Avatar Aurora', ownerId: 'aurora', roomId: 'room-1' });
  console.log('Presencia inicial (Aurora):', p1.ownerId, p1.avatarLabel);
  const p2 = calP.registerVoluntaryPresence({ avatarId: 'avatar-1', avatarLabel: 'Avatar Marea Hijack', ownerId: 'marea', roomId: 'room-1' });
  console.log('Presencia tras sobrescritura (Marea):', p2.ownerId, p2.avatarLabel);
  const p3 = calP.cancelVoluntaryPresence({ avatarId: 'avatar-1', ownerId: 'marea', roomId: 'room-1' });
  console.log('Presencia cancelada por Marea:', p3.status, p3.ownerId);

  console.log('\n=== TEST 4: VALIDACIÓN DE TIMESTAMPS Y CONTROL OWNER -> ROOM ===');
  try { cal1.scheduleEvent({ idempotencyKey: 'k-inv', ownerId: 'aurora', roomId: 'room-a', title: 'Invalid', startTimestamp: -1, endTimestamp: 1000 }); } catch(e) { console.log('Invalid start error:', e.code, e.message); }
  try { cal1.scheduleEvent({ idempotencyKey: 'k-inv2', ownerId: 'aurora', roomId: 'room-a', title: 'Invalid 2', startTimestamp: 2000, endTimestamp: 1000 }); } catch(e) { console.log('End before start error:', e.code, e.message); }
  try { cal1.cancelEvent({ eventId: events1[1].eventId, ownerId: 'marea' }); } catch(e) { console.log('Unauthorized cancel error:', e.code, e.message); }
}
runAudit();
"
```

### Resultado real de la consola:
```
=== TEST 1: RECURRENCIAS Y CAMBIO HORARIO Europe/Madrid (DST) ===
  Occurrence 0: id=evt_04b3105c581997d6b1bcdcf4, ts=1774688400000, local=3/28/26, 10:00:00 AM, parent=null, step=0
  Occurrence 1: id=evt_9c7a80d5108cbf0afde2adb8, ts=1774771200000, local=3/29/26, 10:00:00 AM, parent=evt_04b3105c581997d6b1bcdcf4, step=1
  Occurrence 2: id=evt_b53a8b1452b83d134fcdaf60, ts=1774857600000, local=3/30/26, 10:00:00 AM, parent=evt_04b3105c581997d6b1bcdcf4, step=2

=== TEST 2: DEFECTO 1 - CANCELACIÓN INCOMPLETA EN RECURRENCIAS ===
Cancelando evento primario (stepIndex 0)...
Estado Padre (stepIndex 0): cancelled
Estado Hijo 1 (stepIndex 1): scheduled
Estado Hijo 2 (stepIndex 2): scheduled

=== TEST 3: DEFECTO 2 - HIJACKING DE PRESENCIA VOLUNTARIA ===
Presencia inicial (Aurora): aurora Avatar Aurora
Presencia tras sobrescritura (Marea): marea Avatar Marea Hijack
Presencia cancelada por Marea: cancelled marea

=== TEST 4: VALIDACIÓN DE TIMESTAMPS Y CONTROL OWNER -> ROOM ===
Invalid start error: EVENT_INVALID startTimestamp debe ser un timestamp válido.
End before start error: EVENT_INVALID El tiempo de fin debe ser posterior al inicio.
Unauthorized cancel error: EVENT_FORBIDDEN Solo el propietario puede cancelar el evento.
```

---

## 3. Análisis Detallado por Categoría

### A. Defectos Reales (Bugs)

#### Defecto 1: Cancelación aislada de evento primario en series recurrentes
- **Ubicación:** `src/office-events.mjs`, líneas 373–386 (`cancelEvent`).
- **Mecanismo del fallo:** En la creación de un evento recurrente, la PR #70 genera una serie de objetos de evento independientes en la Map `events`, donde el primero tiene `parentEventId = null` y los posteriores tienen `parentEventId = primaryEventId`. Cuando se invoca `cancelEvent` pasando el `eventId` del evento principal, la función busca únicamente ese `eventId` específico y cambia su propiedad `status` a `'cancelled'`. Ninguna comprobación ni bucle propaga la cancelación a los eventos cuyo `parentEventId` coincida con el evento cancelado.
- **Consecuencia:** Las ocurrencias subsecuentes permanecen programadas (`scheduled`) en las consultas de `listEvents` y `getAccessibleView`, generando la falsa apariencia de que las reuniones futuras siguen en pie tras haber cancelado la serie.
- **Severidad:** Alta (Inconsistencia de estado y fallos de coordinación en calendario).

#### Defecto 2: Hijacking y sobrescritura de presencia voluntaria por colisión de clave sin `ownerId`
- **Ubicación:** `src/office-events.mjs`, línea 399 y línea 413.
- **Mecanismo del fallo:** El registro de presencia voluntaria utiliza como clave de almacenamiento el patrón:
  ```javascript
  const key = `${roomId}:${avatarId}:${eventId || 'global'}`;
  ```
  Observar que la clave no incorpora el `ownerId`. Si el propietario A (`aurora`) registra una presencia para `avatar-1` en la sala `room-1`, el registro se guarda con la clave `room-1:avatar-1:global`. Si posteriormente el propietario B (`marea`) realiza una llamada a `registerVoluntaryPresence` usando el mismo `avatarId` (`avatar-1`) y la misma sala (`room-1`), la función sobrescribe el registro existente, cambiando el `ownerId` del registro a `'marea'`.
- **Consecuencia:** El propietario B puede apoderarse de registros de presencia de otros propietarios, alterar su etiqueta (`avatarLabel`) y posteriormente invocar `cancelVoluntaryPresence` sin que se le deniegue la acción, violando el principio de aislamiento entre propietarios.
- **Severidad:** Media-Alta (Violación de aislamiento entre propietarios).

---

### B. Riesgos de Diseño y Puntos Abiertos

#### Punto 1: Reprogramación individual vs reprogramación de serie recurrente
- **Ubicación:** `src/office-events.mjs`, líneas 340–371 (`rescheduleEvent`).
- **Análisis:** Reprogramar un evento recurrente solo altera los timestamps del objeto específico sobre el cual se invoca `rescheduleEvent`. Las instancias posteriores de la serie no ajustan sus fechas ni detectan solapamientos o inversiones temporales con la instancia padre.
- **Recomendación:** Se debe explicitar en la especificación si `rescheduleEvent` opera de forma estrictamente puntual sobre una ocurrencia o si debe soportar parámetros para actualizar instancias futuras.

#### Punto 2: Cálculo de estado `expired` no persistido
- **Ubicación:** `src/office-events.mjs`, líneas 333–338 y 436–438.
- **Análisis:** El estado `'expired'` se calcula dinámicamente al consultar `getEvent` o `listEvents` comparando `currentTime > event.endTimestamp`. La entidad almacenada en el Map interno conserva `status: 'scheduled'`. Si se consulta en un instante posterior con `now()` congelado o en proyecciones históricas, los filtros deben recalcular de forma determinista la propiedad basándose en `atTimestamp`.

---

### C. Aspectos Verificados y Conformes

1. **Gestión Exacta de Horario de Verano (DST) en Europe/Madrid:**
   Se verificó que la función `computeNextRecurrenceTimestamp` calcula de forma determinista la recurrencia local usando `Intl.DateTimeFormat` con la zona horaria dada.
   - Para el cambio de hora del 29 de marzo de 2026 en Madrid (salto +01:00 -> +02:00 CET/CEST), una cita diaria a las 10:00:00 AM CET genera la siguiente ocurrencia el 29 de marzo a las 10:00:00 AM CEST (ajustando la representación UTC de `09:00:00Z` a `08:00:00Z`).
   - Para el cambio de hora del 25 de octubre de 2026 (retroceso +02:00 -> +01:00 CEST/CET), la cita de las 10:00:00 AM CEST se desplaza correctamente a las 10:00:00 AM CET (de `08:00:00Z` a `09:00:00Z`).

2. **Validación de Timestamps:**
   Se comprobó que `validateTimestamp` verifica que cada fecha sea un entero seguro positivo (`Number.isSafeInteger(ts) && ts > 0`). Valores como `-100`, `NaN`, `1000.5` o cadenas vacías son rechazados inmediatamente con `EVENT_INVALID`. Asimismo, se exige que `endTimestamp > startTimestamp`.

3. **Autorización y Aislamiento Owner → Event → Room:**
   Se verificó que solo los miembros presentes en la política (`validMemberIds`) y no revocados pueden realizar acciones de programación.
   - `cancelEvent` y `rescheduleEvent` comprueban explícitamente `event.ownerId === ownerId`, devolviendo `EVENT_FORBIDDEN` (403) si otro propietario intenta modificar el evento.
   - Invocar `revokeOwner(ownerId)` o `revokeRoom(roomId)` oculta inmediatamente de forma segura los eventos en `getEvent` y `listEvents` lanzando `EVENT_NOT_FOUND` (404) o filtrando la lista sin exponer metadatos privados.

4. **Presencia Voluntaria vs Presencia Real:**
   Se confirmó que `registerVoluntaryPresence` y `getAccessibleView` marcan de forma explícita el indicador `isRealPresence: false` y adjuntan una nota aclaratoria: `"Proyección puramente declarativa de calendario y presencia voluntaria de avatares."`. No existe acoplamiento con la ejecución real de procesos o presencia IP.

5. **Idempotencia Nominativa:**
   `scheduleEvent` e `rescheduleEvent` guardan un registro de idempotencia (`ownerId:idempotencyKey`). Enviar una petición idéntica devuelve la entidad original. Enviar una petición con la misma clave pero distinto payload o título es rechazado de forma determinista con `EVENT_CONFLICT` (409).

6. **Límites Configurables Respetados:**
   Se verificó que superar `maxRecurrenceCount` (por defecto 52) lanza un error `EVENT_LIMIT` (400), y sobrepasar `maxEventsPerRoom` (por defecto 1000) detiene la inserción con `EVENT_LIMIT`.

---

## 4. Criterios Claros y Recomendaciones para el Parche Posterior

Para subsanar los 2 defectos identificados en una futura PR de remediación, se deben aplicar los siguientes ajustes:

1. **Propagación opcional o completa de cancelación en recurrencias (`cancelEvent`):**
   - **Criterio de corrección:** Al cancelar un evento principal (`parentEventId === null`), la función `cancelEvent` debe buscar todas las ocurrencias secundarias cuyo `parentEventId === primaryEventId` y actualizar su estado a `'cancelled'`, o admitir una opción `{ cancelSeries: true }`.
   - **Ejemplo de parche en `cancelEvent`:**
     ```javascript
     event.status = 'cancelled';
     event.cancelReason = clean(reason, 200);
     event.updatedAt = currentTime;

     // Cancelar también instancias hijas de la misma serie si es el evento principal
     if (event.parentEventId === null) {
       for (const child of events.values()) {
         if (child.parentEventId === event.eventId && child.status === 'scheduled') {
           child.status = 'cancelled';
           child.cancelReason = clean(reason, 200);
           child.updatedAt = currentTime;
         }
       }
     }
     ```

2. **Aislamiento por `ownerId` en la clave de Presencia Voluntaria:**
   - **Criterio de corrección:** La clave interna de `voluntaryPresences` debe incluir el `ownerId` del declarante para evitar colisiones y sobrescrituras no autorizadas entre distintos propietarios.
   - **Ejemplo de parche:**
     ```javascript
     const key = `${roomId}:${ownerId}:${avatarId}:${eventId || 'global'}`;
     ```
     Con esta clave, cada propietario gestiona su propia declaración de presencia para un `avatarId` determinado dentro de una sala/evento, impidiendo que otro propietario suplante o cancele su estado.

---

## 5. Estado de la Entrega

- **Tipo de archivo entregado:** Únicamente `docs/reviews/pr70-calendar-dst-20261012.md`.
- **Modificación de archivos del núcleo:** Ninguna (no se editaron `src/office-events.mjs`, `test/office-events.test.mjs`, políticas ni vistas).
- **Integridad:** Las pruebas unitarias de la solución existente pasan al 100% (`npm test`) y la verificación de código (`npm run check`) es conforme.
