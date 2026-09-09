# Declaración del lado de Eloy — ELOY-01 y ELOY-02

**Estado:** declaración documental de dos filas de [`onboarding.md`](onboarding.md). No autoriza conectar agentes, abrir accesos ni gastar, y no cierra la preparación: las filas ELOY-03 a ELOY-06 siguen pendientes y son decisiones, no redacción.

**Alcance de lo que se declara aquí:** identidades, roles e **interfaces**, y los límites del entorno. No incluye perfiles, prompts, configuración interna, rutas, inventario de máquina ni credenciales, conforme a la columna «Comprobación saneada» de las dos filas.

## ELOY-01 — Agentes, roles e interfaces

El punto que más condiciona el diseño común, y por eso va primero: **mis agentes no exponen una interfaz de agente. Exponen un repositorio y una cola.**

No hay un servicio al que se le hable por un adaptador de inferencia, ni un runtime que instancie un trabajador y le pase mensajes. Un encargo es una tarjeta; el trabajo se hace sobre un checkout; y la salida verificable es **un pull request contra un repositorio autorizado, con su CI**. Todo lo demás —qué modelo, qué proveedor, qué máquina— es sustituible sin que cambie nada de lo que ve la otra parte.

Esto encaja con la alternativa B casi por construcción: `delivered` es un PR y `reviewed` es una revisión, las dos cosas ya existen, son enlazables y ninguna se puede fingir con una animación. Encaja mal, en cambio, con cualquier base que espere crear un agente propio y conversar con él: lo que hace falta de mi lado no es un `InferenceAdapter`, es un **conector de identidad y cola**.

### Categorías

| Categoría | Qué es | Interfaz observable desde fuera | Identidad |
|---|---|---|---|
| **Agentes especializados versionados** | Definiciones versionadas en el propio repositorio de trabajo, con alcance y herramientas declaradas en su fichero. Hoy tres en Lagunak: auditoría de entregas, diseño de juego, QA. | Ninguna hacia fuera. Corren dentro de una sesión y su salida es un informe que consume la sesión, no un artefacto entregable. | No tienen identidad propia frente a GitHub. |
| **Sesión interactiva** | La sesión que conduce el trabajo y decide qué se entrega. | Commits y PRs, con coautoría declarada en el mensaje de commit. | La cuenta de Eloy. Es él quien responde de lo que se abre. |
| **Trabajadores de cola (enjambre)** | Ejecutores que toman una tarjeta de un kanban y entregan un PR. Es la integración que Varo ya nombró como Hermes en `onboarding.md`. | **Un PR y su CI.** Nada más: ni conversación, ni estado intermedio consultable, ni presencia. | Hoy, también la cuenta de Eloy. Ver el límite de abajo. |

### Límite conocido, y es el que más importa

**Hoy los tres comparten una única identidad frente a GitHub.** Desde fuera no se puede distinguir un PR abierto por una sesión conducida por Eloy de uno entregado por un trabajador de cola. Es una limitación real y no un detalle: el requisito 1 de [`product-spec.md`](product-spec.md) pide identidad estable por propietario, equipo y agente, y esa separación **no existe todavía de mi lado**.

Lo digo aquí en vez de esperar a que lo descubra la primera prueba. Separarla es trabajo, y a quién le toca depende de la decisión 1 (modelo de autoridad), así que lo dejo declarado como pendiente y no lo prometo dentro de la primera entrega.

### Lo que ya está resuelto y es reutilizable

Que la salida sea un PR no la hace buena. **Una entrega de cola se tría antes de gastar una revisión humana en ella**: se cuentan elementos antes y después (tests, claves, declaraciones), se comprueba que todo parsea y se detectan andamiajes y reversiones disfrazadas. El motivo es empírico, no teórico: una entrega puede llegar con toda su batería en verde y estar borrando trabajo previo, y el CI sale verde precisamente porque también se lleva por delante las pruebas que lo detectarían.

Ese triaje es lo que aporto al recorrido común. La consecuencia para el diseño bilateral es directa: **`reviewed` tiene que ser un estado con criterio, no un acuse de recibo**, o la cadena de la alternativa B se cierra sobre entregas que no valen.

## ELOY-02 — Entorno y límites

Declaración de capacidades y límites, sin inventario de máquina ni rutas.

- **Ejecución:** máquina propia bajo control de Eloy, no un servicio expuesto. No hay endpoint que la otra parte pueda invocar, y no propongo abrir uno para la primera vertical.
- **Sentido de la conexión:** de mi lado **hacia** GitHub. Lo que Varo ve, lo ve en el repositorio, no en mi entorno. Esto no es una restricción provisional: es lo que hace que la oficina pueda representar el trabajo sin tener acceso a donde se hace.
- **Inferencia:** varios proveedores tras un enrutador propio, con rotación y sustitución. Deliberadamente **fuera del contrato**: qué modelo atiende un encargo no debe ser observable desde el lado de Varo ni condicionar el adaptador.
- **Concurrencia:** varios trabajadores en paralelo. El límite efectivo no es el número, sino la cola del proveedor: medido, un trabajador que corre solo rinde muy por encima de lo que rinde compitiendo consigo mismo. Cualquier cifra que declare hoy sería del montaje actual y no un compromiso.
- **Fiabilidad, medida:** en la última tanda evaluada, **la mayoría de las entregas de cola fueron rechazadas en triaje** — más de tres de cada cinco, frente a una de cada cinco antes de endurecer el criterio de aceptación. La cifra es una medición propia sobre mi kanban, **no reproducible desde fuera**, y la doy como límite honesto, no como métrica de producto. Lo que se deduce de ella es lo único que pido que se traslade al diseño: **el volumen de una cola no es su rendimiento**, y ningún premio, reputación ni progresión puede derivar de entregas contadas antes de revisarlas.
- **Coste:** asumido por Eloy dentro de su entorno. Nada de lo declarado aquí implica gasto compartido; el presupuesto conjunto es ELOY-05 y COM-01, y sigue pendiente.
- **Parada:** existe y es local. Formalizarla como responsable, procedimiento y aviso a la otra parte es ELOY-05, no esta fila.

## Lo que esta declaración NO hace

No selecciona qué agentes participan en la primera prueba (eso es ELOY-06), no declara qué proyectos ni campos son compartibles (ELOY-03), no fija presupuesto ni política de parada (ELOY-05) y no abre ningún acceso (ELOY-04). Tampoco compromete a Varo a nada: es la mitad de una checklist, no un acuerdo.
