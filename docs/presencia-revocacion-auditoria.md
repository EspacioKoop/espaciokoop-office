# Lista de comprobación independiente de revocación de presencia (Office #39)

**Estado:** Auditoría estática e independiente sobre el contrato de presencia autenticada y revocable propuesto en la PR #44 y las decisiones de los issues #29 y #39. Este documento no modifica código ejecutable, interfaces web ni ficheros de configuración, no sustituye la validación humana y no ordena fusionar la PR #44.

---

**Comparación de referencias:** `main` contiene el backend de presencia y sirve de línea base; el panel visual, sus estilos y `test/presence-ui.test.mjs` forman parte de la **PR #44**, todavía abierta. No se da por aprobada ni desplegada.

## 1. Propósito y alcance acotado

El objetivo de esta auditoría es evaluar de forma aislada e independiente el mecanismo de presencia HTTP por agente, verificando la separación entre la autenticación, la caducidad (TTL), las garantías de revocación, la ocultación de agentes, la recuperación del sistema y la distinción entre backend presente en `main` y la UI visual añadida en la propuesta PR #44.

### Archivos de código y especificaciones auditados
- `src/presence.mjs`: Lógica del registro de presencia (`createPresenceRegistry`, `validateAgentDirectory`).
- `src/presence-bridge.mjs`: Puente de sincronización local, autenticación por hash timing-safe y control de tasa (`createPresenceBridge`).
- `src/server.mjs`: Endpoints HTTP (`POST /api/presence/heartbeat` y `GET /api/presence`).
- `src/domain.mjs`: Validaciones de dominio y política.
- `docs/presence-http.md`: Especificación técnica del contrato de presencia HTTP.
- `web/app.mjs`: el frontend de `main` es el punto de comparación. La PR #44 modifica este archivo para consumir `GET /api/presence` y representar un panel visual de presencia con estados de los agentes.
- `web/index.html`: Estructura HTML de la aplicación web.

---

## 2. Garantías comprobadas en tests existentes

A continuación se detallan las propiedades verificadas mediante pruebas automatizadas locales en el repositorio.

### A. Autenticación y credenciales de agente
- **Credencial independiente:** La clave del agente es propia y distinta de las cookies de sesión de equipo y del token de GitHub (`src/presence-bridge.mjs`).
- **Verificación timing-safe:** La autenticación utiliza `timingSafeEqual` sobre el hash SHA-256 de la clave (`src/presence-bridge.mjs`).
- **Validación de directorio:** Cada agente debe tener un `id` con prefijo del propietario (`ownerId/`...), un `label` y proyectos asignados en la política (`src/presence.mjs`).
- **Rechazo de suplantación:** Se rechaza la publicación mediante cookie de equipo o clave de otro propietario (`test/presence-api.test.mjs`).

### B. TTL y caducidad de presencia
- **Ventanas de estado:**
  - `online`: hasta 5 segundos (`onlineFor`).
  - `stale`: entre 5 y 15 segundos (`ttl`).
  - `offline`: transcurridos más de 15 segundos o en ausencia de heartbeats (`src/presence.mjs`).
- **Vencimiento de consulta:** Las respuestas de `GET /api/presence` incluyen `expiresAt` con un TTL estricto de 1 segundo (`src/presence-bridge.mjs`).
- **Secuencia creciente:** Se exige `sequence` estrictamente creciente. Intentes con secuencias repetidas o menores devuelven `409 PRESENCE_CONFLICT` sin renovar la presencia (`src/presence.mjs`, `test/presence.test.mjs`).

### C. Revocación e invalidez de publicaciones
- **Revocación de agente y proyecto:** `revokeAgent` y `revokeProject` invalidan inmediatamente los heartbeats activos y bloquean publicaciones posteriores (`src/presence.mjs`).
- **Protección durante transmisiones parciales:** Si la política, las credenciales o el directorio cambian mientras se recibe un cuerpo parcial en `POST /api/presence/heartbeat`, la publicación se descarta (`403 PRESENCE_REVOKED` o `503 PRESENCE_UNAVAILABLE`) y no se persiste ningún dato (`src/presence-bridge.mjs`, `test/presence-api.test.mjs`).

### D. Ocultación y aislamiento de agentes
- **Aislamiento por proyecto:** Un agente solo puede publicar presencia en los proyectos explícitamente asignados en su directorio (`src/presence.mjs`).
- **Aisleamiento de lectura:** Lectores sin acceso al proyecto reciben `403 PRESENCE_FORBIDDEN` (`test/presence.test.mjs`).
- **Ausencia de fuga de secretos:** La respuesta JSON de consulta de presencia expone solo `id`, `label`, `ownerId`, `status` y `seenAt`. No revela claves, `keyHash`, números de secuencia ni detalles de runtime local (`src/presence.mjs`, `test/presence-api.test.mjs`).

### E. Recuperación tras errores o configuración rota
- **Comportamiento sin persistencia de secuencia:** Reiniciar la aplicación o modificar la configuración crea un registro de presencia vacío e inicia otra época de secuencias (`src/presence-bridge.mjs`).
- **Configuración rota:** Si el fichero de agentes o la política son inválidos, el endpoint responde `503 PRESENCE_UNAVAILABLE` sin exponer rutas del disco ni trazas del sistema (`src/presence-bridge.mjs`, `test/presence-api.test.mjs`).
- **Liberación de reservas:** Los límites de tasa (máximo 4 publicaciones concurrentes, 60 por agente y 120 globales por minuto) se liberan correctamente incluso tras errores o peticiones malformadas (`src/presence-bridge.mjs`, `test/presence-api.test.mjs`).

### F. UI propuesta en PR #44: cambios visuales reales
- **Panel de presencia:** PR #44 añade en `web/app.mjs` un `section.presence-panel` que consume `GET /api/presence` y muestra agentes y estados `online/stale/offline`.
- **Estilos y pruebas:** modifica `web/style.css` para mostrar `presence-panel`, `presence-agent` y `presence-status`; añade `test/presence-ui.test.mjs` para el ciclo de actualización, caducidad y estados de error.
- **Diferencia de ramas:** esta PR de documentación no modifica código de UI, pero la PR #44 sí; no confundir el alcance de esta auditoría con el alcance de #44. La integración y presentación visual de #44 siguen pendientes de aprobación conjunta.
- **Límites:** las pruebas de frontend de la PR #44 no equivalen a validación de red real, despliegue ni aprobación de producto.

---

## 3. Comandos de ejecución reproducibles

La suite de la **rama PR #44**, en el commit `97c7abf`, se ejecutó en un clon aislado el 9 de octubre de 2026: `npm test` terminó con **188 tests superados, 0 fallidos**. Esta evidencia corresponde a esa rama; no demuestra despliegue en producción. Comandos reproducibles:

```bash
# Suite validada en la rama de PR #44 (188 tests el 9-10-2026)
npm test

# Pruebas específicas de la API y puente de presencia HTTP
node --test test/presence-api.test.mjs

# Pruebas de dominio y registro interno de presencia
node --test test/presence.test.mjs
```

---

## 4. Pruebas reales pendientes

Las siguientes validaciones no pueden realizarse mediante simulación local y quedan pendientes de ejecución en un entorno real:

1. **Interacción bilateral en red real:**
   - Envíos continuados de heartbeats desde un agente externo real mediante transporte seguro.
   - Evaluación de jitter, latencia de red y desincronización de relojes entre el cliente del agente y el servidor Office.
2. **Pruebas de carga y denegación de servicio:**
   - Saturación de la API de presencia mediante múltiples clientes concurrentes bajo un proxy o balanceador de carga.
3. **Rotación de claves en producción:**
   - Verificación del proceso operativo de sustitución de claves sin interrupción del servicio para otros agentes.

---

## 5. Decisiones que necesitan aprobación expresa de Varo y Eloy

Cualquier evolución o despliegue del sistema de presencia requiere la conformidad explícita de Varo y Eloy sobre los siguientes aspectos:

1. **Aprobación de la PR #44:** Decisión de integrar el código de presencia HTTP en la rama `main`.
2. **Aprobación de la representación visual propuesta en PR #44:** ya existe un panel de presencia con estados visibles; decidir conjuntamente si aceptarlo, modificarlo o posponerlo.
3. **Aprovisionamiento y gestión de credenciales:** Definición del canal privado y del procedimiento seguro para la distribución de claves de agente fuera del repositorio.
4. **Política de retención y auditoría:** Acuerdo sobre los plazos y la persistencia de registros de presencia o eventos de revocación en producción.

---

## 6. Verificación de integridad del cambio

Para verificar que este cambio cumple estrictamente con el mandato de tarea monofichero sin alteraciones laterales:

```bash
# 1. Comprobar que no hay errores de formato o espacio al final de línea
git diff --check

# 2. Comprobar que solo se ha modificado el archivo autorizado
git diff --name-only origin/main...HEAD
# Resultado esperado: docs/presencia-revocacion-auditoria.md
```
