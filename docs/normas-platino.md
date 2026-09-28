# Ficha de adopción de Normas Platino

Adaptación local de [EspacioKoop/normas_platino](https://github.com/EspacioKoop/normas_platino/tree/75c76d9ad6fedc10542cf8f74cc32e6071e415fc). No sustituye [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md) ni la [guía de cooperación](cooperation.md): las completa. Si una regla local es más estricta, prevalece la local.

## Identidad y autoridad

| Campo | Valor del proyecto |
| --- | --- |
| Repositorio | `EspacioKoop/espaciokoop-office` (público) |
| Instrucciones locales | [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md), [cooperación](cooperation.md) |
| Normas adoptadas | `EspacioKoop/normas_platino@75c76d9ad6fedc10542cf8f74cc32e6071e415fc`: [cooperación](https://github.com/EspacioKoop/normas_platino/blob/75c76d9ad6fedc10542cf8f74cc32e6071e415fc/docs/COOPERACION_AUTONOMA.md), [fuente de verdad](https://github.com/EspacioKoop/normas_platino/blob/75c76d9ad6fedc10542cf8f74cc32e6071e415fc/docs/FUENTE_DE_VERDAD.md), [planificación y entregas](https://github.com/EspacioKoop/normas_platino/blob/75c76d9ad6fedc10542cf8f74cc32e6071e415fc/docs/PLANIFICACION_Y_ENTREGAS.md), [pro consumidor](https://github.com/EspacioKoop/normas_platino/blob/75c76d9ad6fedc10542cf8f74cc32e6071e415fc/docs/PRO_CONSUMIDOR.md) |
| Revisión de adopción | 28-09-2026. Preparada por ARQUÍMEDES, coordinador del equipo de Varo, en la PR que cierra #19 |
| Plan maestro | [#17](https://github.com/EspacioKoop/espaciokoop-office/issues/17) |
| Registro único de reservas | [#18](https://github.com/EspacioKoop/espaciokoop-office/issues/18) |
| Caducidad de reservas | 24 h sin actividad verificable; relectura completa y `RELEASE reason=inactivity_expired`. Las reservas del otro propietario nunca se liberan por esta vía sin avisarle en el registro. |
| Aviso de adopción | [#1, comentario 5868459811](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5868459811). Las reservas heredadas de #13 están inventariadas en #18. |
| Checkpoints | En el issue canónico de cada tarea; el estado global, en [ESTADO.md](../ESTADO.md) |
| Roadmap | [docs/roadmap.md](roadmap.md). Las fases siguen pendientes de acuerdo en #1. |
| Rama base y ramas | `main`; `agent/N-slug` por reserva. Sin force-push, reescritura compartida ni push directo a `main`. |
| Propiedad | Varo y Eloy son copropietarios y administradores. Cada uno autoriza sus agentes, equipos y recursos. Las PR, ramas y agentes de un propietario solo los modifica el otro con su OK registrado en GitHub. |
| Autoridad de merge | **Varo** ([decisión en #1](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5868570693)). Cada autorización se registra en la propia PR, sobre su SHA; sin ella nadie fusiona. Esto no permite modificar PR, ramas o agentes de Eloy sin su OK, y los cambios del contrato compartido se siguen revisando desde ambos lados ([CONTRIBUTING.md](../CONTRIBUTING.md)). |
| Autoridad de publicación | No hay releases ni despliegues autorizados. Requieren acuerdo de ambos propietarios. |
| Prioridad y aceptación | Plan #17 para el orden. Cada issue fija su aceptación; #1 decide el producto. |
| Archivos compartidos | `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ESTADO.md`, `docs/product-spec.md`, `docs/onboarding.md`, `package.json` raíz y `.github/`. Se declaran en el CLAIM y tienen un único escritor. |
| Fronteras de datos | Repositorio público: sin credenciales, datos personales, direcciones, nombres de máquinas o servicios privados ni inventarios de equipos. Solo fixtures sintéticos o metadatos autorizados por su propietario (ver la declaración de Eloy en la [PR #12](https://github.com/EspacioKoop/espaciokoop-office/pull/12), pendiente de integrar). |
| Límites de autonomía | Sin despliegues, dominios, puertos abiertos, gasto, crons ni bots nuevos sin autorización expresa. Sin conectar agentes reales hasta acordar alojamiento y acceso. |

## Pruebas

Comandos canónicos, desde la raíz:

```sh
node --test packages/office-space/test/*.test.mjs
node packages/office-space/examples/shared-space.mjs
git diff --check
```

Cuando se integre el núcleo de la PR #14, también `npm run check` y `npm test`.

- **Workflow exigido:** `Office Space tests` (Node 22 y 24) para `packages/office-space/`. El núcleo todavía no tiene CI: su ausencia se declara, no se da por verde.
- **Entorno:** Node.js 22 o posterior, sin dependencias de npm. Solo fixtures sintéticos.
- **Interfaz:** recorrido en navegador real con capturas del SHA candidato. Un smoke automatizado no equivale a una prueba humana.

Estados que se distinguen siempre: **local**, **integrado**, **desplegado** y **probado por personas**.

## Projects

No se usan. El registro #18 es la única fuente de titularidad.

## Trampas conocidas

| Archivo o contrato | Invariante y fallo conocido | Regresión y referencia |
| --- | --- | --- |
| `packages/office-space/` | Dos sesiones publicaron implementaciones distintas del mismo paquete (#15 y #16) porque ninguna releyó las reservas antes de publicar. Una sola implementación por sistema; releer #18 antes de cada push. | Consolidación en #20 |
| Evidencia citada en issues | En #13 se anunciaron módulos con pruebas (Life, Remote) que nunca llegaron a GitHub. Un comentario no es evidencia: solo cuenta lo publicado con SHA. | Inventario en #18 |
| `packages/office-space/src/store.mjs` | Un solo servidor Linux con disco local, no NFS ni réplicas; máximo de 8192 comandos confirmados por proyecto sin purga de recibos. No persistir posiciones a alta frecuencia. | `docs/office-space.md` |
| Interfaz de la PR #14 | La vista se retira cuando la pestaña está oculta. En pruebas automatizadas, traer la pestaña al frente antes de entrar, o la sesión se crea sin que se vea nada. | [Revisión de #14](https://github.com/EspacioKoop/espaciokoop-office/pull/14#issuecomment-5868508809) |
| Servidor de la PR #14 | Solo acepta `Host` de loopback, a propósito. Exponerlo cambiando el bind o poniéndolo detrás de un proxy no lo convierte en servicio común: eso es #21. | Pruebas de Host en `test/server.test.mjs` |

## Actualización

Al empezar a trabajar, comparar `normas_platino` con el SHA adoptado y proponer la adaptación por PR. Leer esta ficha no concede permisos.
