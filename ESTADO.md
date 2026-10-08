# Estado actual de EspacioKoop Office

Corte validado: 9 de octubre de 2026. Referencias canónicas: plan #17,
reservas #18, decisiones en #1 y código integrado en main.

## Integración acreditada

| Superficie | PR integrada | Límite |
|---|---|---|
| Núcleo y visualización de tareas GitHub | #14 | No escribe tareas |
| Espacios, sesiones y servicio HTTP común | #23 y #25 | Sin prueba entre redes |
| Gestión, serialización y revocación de agentes | #34 | No ejecuta agentes |
| Cola HTTP con permisos por equipo | #36 | No crea ni acepta tareas |
| Vista de cola y evidencias | #38 | Datos sintéticos o proyección |
| Presencia autenticada, caducable y revocable | #41 | Estar visible no demuestra trabajo |
| Procedencia documentada de terceros | #30 | Ningún upstream adoptado |

La integración completa de las PR #34, #36, #38 y #41 pasó 179 pruebas
locales y comprobación de 23 módulos; la PR #41 pasó después CI remoto.
No trasladar esas cifras sin repetir la prueba sobre una revisión nueva.

## Gates abiertos para Office 1.0

1. Dos propietarios y dos equipos desde redes distintas, con identidad
   separada, permisos concretos y revocación efectiva de acceso.
2. Flujo GitHub de solicitud, aceptación, entrega y revisión con SHA
   actual y CI válido; la proyección no sustituye operaciones reales.
3. Prueba de seguridad de sesión, caducidad, aislamiento y caída de red.
4. Alojamiento y alcance autorizados por ambos propietarios. No publicar
   el servidor local solo modificando OFFICE_BIND o añadiendo un proxy.
5. Objetivos de VISION.md: gamificación, conocimiento compartido,
   avatares, RPG e historia siguen pendientes, no descartados.

Las PRs fusionadas no acreditan despliegue, agentes reales conectados ni
aceptación de producto. Continuar con #17 y #18 sin cerrar las épicas.
