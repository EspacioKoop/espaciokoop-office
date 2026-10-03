# EspacioKoop Office

**Una oficina colaborativa remota para Varo, Eloy y sus agentes, con GitHub como fuente de tareas.**

El objetivo es compartir oficina **desde redes distintas**, no limitar el producto a una misma casa o LAN. Estado de `main`: **núcleo, interfaz y servicio común integrados, `1.0.0-rc.1`**, todavía **sin despliegue bilateral ni agentes reales conectados**. No es una versión estable ni el producto completo aceptado. El modo de loopback sigue siendo un entorno de evaluación; la integración remota de #25 no equivale por sí sola a una oficina compartida ya operativa.

<p align="center">
  <img src="assets/screenshots/office-preview.webp" alt="Captura real del candidato Office en Chromium: oficina, equipos de ejemplo, métricas y proyectos seleccionados." width="600" />
</p>

*Captura real de la interfaz con datos inventados. La sala es una ilustración ambiental original; no acredita presencia ni actividad de agentes. El entorno de comprobación necesitó un puente HTTP local: [resultados y límites de la validación](docs/validation-1.0.md).*

## Evaluar el núcleo y la interfaz

Node.js **22.16 o posterior**. Sin dependencias de runtime que instalar.

```sh
git fetch origin
git switch main
git pull --ff-only
npm start
```

Abre `http://127.0.0.1:4173`. En este candidato el servidor escucha solo en loopback. Entra como **Aurora** y sigue el recorrido guiado con **Marea**: solicitud, aceptación, entrega y revisión. Son equipos y resultados sintéticos; no hay credenciales, agentes, llamadas a modelos ni conexiones exteriores en este modo. Cerrar el proceso reinicia el ejemplo.

```sh
npm run check
npm test
```

**No publiques este servidor local cambiando únicamente su dirección de escucha o añadiendo un proxy.** Sus supuestos de sesión, origen y autorización son locales; la composición con el servicio remoto requiere sus propias pruebas. El puerto 4173 no es una entrega de colaboración entre ambos equipos.

## Qué existe en este candidato

| Superficie | Comportamiento implementado |
|---|---|
| Oficina | Vista ambiental, equipos, áreas por proyecto y resumen de las tareas visibles. |
| Tablero | Cuatro fases, búsqueda y detalle de evidencias con controles de teclado. |
| Cadena de trabajo | Autoasignación bilateral, PR seleccionado, aprobación independiente del SHA actual y CI válido. No confunde cerrar un issue con terminar el trabajo. |
| GitHub | Conector GraphQL de solo lectura, con repositorios, objetos y campos seleccionados explícitamente. No pide cuerpos, diffs, comentarios o archivos. |
| Privacidad | Acceso por equipo/proyecto, claves locales con hash, sesiones revocables y vistas efímeras. Sin base de datos de tareas ni telemetría. |
| Evaluación | Dos equipos ficticios, aislamiento de un segundo proyecto y recorrido de las cuatro fases. |

**En modo conectado, las acciones reales se realizan en GitHub.** Office no ejecuta herramientas, no asigna agentes y no escribe revisiones por su cuenta. Una cuenta compartida se identifica como tal; no se inventa una identidad individual o un estado de presencia.

La asociación entre issue y PR se declara en la política local. La proyección no es un certificador autónomo de entregas y todavía no se ha contrastado con una integración bilateral real.

## Comprobaciones ejecutadas

**62/62 pruebas automatizadas**, cero fallos y diez módulos comprobados sin errores de sintaxis. **Ocho recorridos de interfaz** en Chromium con datos sintéticos, incluyendo búsqueda, teclado, actualización del detalle, aislamiento y tamaño móvil. No se observaron errores JavaScript ni peticiones exteriores en esos recorridos.

La navegación HTTP nativa de Chromium estaba bloqueada en el entorno de prueba. La comprobación visual utilizó el servidor Node real mediante un puente de loopback, no una integración nativa de navegador. **Cookies, origen, CSP y SSE nativos del navegador siguen pendientes de validación conjunta**; el servidor sí tiene pruebas HTTP separadas. No se afirma auditoría de seguridad.

**Actualización del 28-09-2026:** la [revisión independiente](https://github.com/EspacioKoop/espaciokoop-office/pull/14#issuecomment-5868508809) repitió las pruebas y recorrió la demo en Chromium **con transporte nativo**: módulos bajo la CSP del servidor, cookie `HttpOnly` invisible desde JavaScript, `POST` del mismo origen, canal SSE de revocación y ciclo completo entre los dos equipos ficticios, sin errores JavaScript. El núcleo tiene CI propia (`Office core tests`, Node 22 y 24). Siguen sin probarse el modo conectado contra GitHub real, el móvil y los lectores de pantalla.

[Informe completo](docs/validation-1.0.md) · [Informe del navegador](assets/screenshots/browser-report.json) · [Blobs exactos comprobados](docs/tested-blobs.json)

## Integración remota y trabajo paralelo

En [#13](https://github.com/EspacioKoop/espaciokoop-office/issues/13) hay carriles separados para el transporte remoto, conocimiento/progresión y espacios editables. El módulo de espacios (`packages/office-space`) está integrado en `main` desde [#15](https://github.com/EspacioKoop/espaciokoop-office/pull/15) y [#23](https://github.com/EspacioKoop/espaciokoop-office/pull/23); la alternativa [#16](https://github.com/EspacioKoop/espaciokoop-office/pull/16) se cerró absorbida por #23. Sus pruebas no validan este núcleo ni una integración conjunta.

Desde [#25](https://github.com/EspacioKoop/espaciokoop-office/pull/25), `main` **ya compone el núcleo con el servicio común y la API tipada de espacios**: configuración de origen/Host/bind, TLS o túnel privado, contexto autenticado del backend, persistencia e invalidación SSE. La integración conserva la separación entre posición guardada y presencia real; editar mobiliario no asigna trabajo.

Lo que **sigue pendiente** es operar ese servicio en un entorno privado acordado, incorporar presencia caducable e identidad por agente y demostrar el recorrido bilateral con agentes reales. El núcleo continúa leyendo el estado de tareas desde GitHub: Office no debe inventar una segunda fuente de verdad ni devolver éxito a creación/aceptación/entrega/revisión solo por proyectar una tarea o avanzar fixtures. No activar conocimiento con datos de Eloy fuera de su selección autorizada.

## Qué falta para una 1.0 estable

Faltan despliegue privado y acceso conjunto del servicio ya integrado, alcance operativo final acordado por ambos propietarios, presencia e identidad real por agente, incorporación y prueba de los agentes reales, validación de permisos/API y un ciclo bilateral real con fallo, revocación y recuperación.

También siguen sin integrar en esta aplicación la gestión de agentes, coedición multijugador, avatares controlables, sistemas RPG e inventario, aprendizaje validado, premios, estasis, leyendas y periódico. **No se han eliminado esos objetivos ni dado por entregados mediante una ilustración o una demo.**

La visión anterior se conserva **íntegra y sin modificaciones** en [VISION.md](VISION.md), usando el mismo blob del README previo. Sus referencias de estado son históricas: el estado del candidato es el de esta portada y del [informe de aceptación](docs/acceptance-1.0.md). Las decisiones humanas y las propuestas siguen separadas en [la especificación](docs/product-spec.md) y [el debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1).

## Documentación y cooperación

[Estado](ESTADO.md) · [Plan #17](https://github.com/EspacioKoop/espaciokoop-office/issues/17) · [Reservas #18](https://github.com/EspacioKoop/espaciokoop-office/issues/18) · [Normas Platino](docs/normas-platino.md) · [Debate #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1)

[Preferencias de Varo](docs/product-preferences-varo.md) · [Arquitectura](docs/architecture.md) · [Interoperabilidad](docs/interoperability.md) · [Preparación de los equipos](docs/onboarding.md) · [Roadmap](docs/roadmap.md) · [Gestión de agentes](docs/agent-management.md) · [Cooperación](docs/cooperation.md)

[Guía de evaluación y política local](RUNNING.md) · [Alcance y puertas de aceptación](docs/acceptance-1.0.md) · [Normas de agentes](AGENTS.md) · [Contribuir](CONTRIBUTING.md) · [Seguridad](SECURITY.md) · [Investigación de referencias](docs/research/README.md)

Trabajo del núcleo en [#14](https://github.com/EspacioKoop/espaciokoop-office/pull/14); prioridades en #17 y reservas en #18 (historial previo en #13). Se preservan los documentos de las PR #10/#12 y los archivos de los otros carriles. Sin cambios en infraestructura de los propietarios, concesión de permisos a otro equipo, despliegues ni etiqueta estable.

Código y SVG ambiental originales de esta contribución; no se incorpora el ejecutor de Agent Office ni otros runtimes estudiados. La licencia global del proyecto no se decide unilateralmente en este cambio.
