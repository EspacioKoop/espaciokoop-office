# Declaración del lado de Eloy — ELOY-01, ELOY-02, ELOY-03 y ELOY-05

**Estado:** declaración documental de cuatro filas de [`onboarding.md`](onboarding.md) — ELOY-01, ELOY-02, ELOY-03 y ELOY-05. No autoriza conectar agentes, abrir accesos ni gastar. **No cierra la preparación:** ELOY-04 y ELOY-06 están en «Pendiente de acuerdo» y no dependen de mí, y las seis filas de Varo siguen sin declarar.

**Alcance de lo que se declara aquí:** identidades, roles e **interfaces**; los límites del entorno; qué es compartible y qué queda excluido; y presupuesto, concurrencia y parada. No incluye perfiles, prompts, configuración interna, rutas, inventario de máquina ni credenciales, conforme a la columna «Comprobación saneada» de cada fila.

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
- **Coste:** asumido por Eloy dentro de su entorno. La política de presupuesto de mi lado queda declarada en ELOY-05; cualquier presupuesto conjunto, incluido COM-01, sigue pendiente de acuerdo bilateral.
- **Parada:** existe y es local. La política de responsable, procedimiento y aviso queda declarada en ELOY-05; lo que no existe todavía es un corte automático por gasto.

## Lo que esta declaración NO hace

No selecciona qué agentes participan en la primera prueba (ELOY-06) ni abre ningún acceso (ELOY-04). ELOY-03 y ELOY-05 quedan **declarados documentalmente**, no verificados operativamente: la prueba negativa de exclusión/revocación sigue pendiente de ejecución y cualquier presupuesto o acuerdo común —incluido COM-01— sigue pendiente. Tampoco compromete a Varo a nada: es la mitad de una checklist, no un acuerdo bilateral.

## ELOY-03 — Alcance compartible, exclusiones y retención

### Repositorios autorizados

Autorizo **tres repositorios de la organización EspacioKoop**, uno a uno y por decisión explícita, no por pertenecer a la organización:

| Repositorio | Por qué entra |
|---|---|
| `EspacioKoop/espaciokooplagunak` | Es donde ocurre el trabajo real de mi lado y de donde saldrá cualquier entrega que la oficina pueda representar. |
| `EspacioKoop/espaciokoop-office` | El propio repositorio común. Su trabajo ya es bilateral y visible por definición. |
| `EspacioKoop/espaciokooplagunakRemake` | Autorizado como **segundo proyecto**, no por tener contenido que compartir. Ver abajo. |

**Todo lo demás queda fuera**, y no por omisión: mis repositorios personales, los ajenos a la organización y cualquier repositorio futuro **no** entran por el hecho de existir. Añadir uno es una decisión nueva y una modificación de este documento.

### Por qué tres y no uno

Un solo repositorio bastaría para demostrar la cadena de la alternativa B. Autorizo tres porque **un solo proyecto no puede demostrar el aislamiento entre proyectos**, que es el requisito 9 de [`product-spec.md`](product-spec.md) y la parte que no se puede añadir después: con un único repo, un adaptador que ignore la separación por proyecto se comporta exactamente igual que uno que la respete, y no hay forma de notar la diferencia hasta que ya hay un segundo proyecto dentro.

El precio lo asumo y lo declaro: son más superficies que revisar antes de la primera entrega.

### Qué se comparte

**Solo metadato de tarea y de entrega:**

- identificador y título de la tarea o del PR;
- estado dentro de la cadena `requested → accepted → delivered → reviewed`;
- autor y revisor, tal y como GitHub ya los expone;
- enlace permanente y SHA;
- resultado de CI: verde, rojo o ausente.

### Qué NO se comparte, ni siquiera anonimizado

Diffs, cuerpos de PR, comentarios, revisiones, informes de agente, transcripciones, razonamiento interno, memorias, contenido de ficheros, ramas no publicadas y cualquier repositorio no listado arriba. **El contenido del trabajo no entra en la oficina.** La cadena se demuestra con estados y enlaces; quien tenga acceso al repositorio verá el contenido allí, que es donde ya está.

Anonimizar no es una salvedad: lo no autorizado no se recoge, conforme al requisito 9.

### Exclusión y su prueba negativa

`espaciokooplagunakRemake` es **privado**, y esa es la razón de que sirva a la vez de segundo proyecto y de caso de prueba: la separación por proyecto y la visibilidad del repositorio son cosas distintas, y una prueba honesta necesita un elemento que esté autorizado como proyecto y **no** deba filtrar nada por otra vía.

Prueba negativa exigida antes de dar la fila por verificada: **un PR marcado como excluido no aparece en la oficina** —ni en un feed, ni en un recuento, ni en un resumen, ni en una caché, ni agregado con otros—, y **retirar la autorización de un repositorio retira también lo ya representado**, no solo lo nuevo. Una prueba que solo compruebe que deja de llegar material nuevo no vale: el modo de fallo real es lo que ya se copió.

### Retención

Lo que se represente en la oficina es **derivado y reconstruible** desde GitHub, así que no necesita retención propia. Regla que pido que se respete en el diseño: la oficina **representa**, no almacena. Una revocación tiene que poder ser total, y solo lo es si no hay una segunda copia que sobreviva a ella.

## ELOY-05 — Presupuesto, concurrencia, parada y responsable

Declaro la política que **corresponde a lo que hoy existe**, no la que sería mejor. Lo segundo sería declarar una capacidad no construida.

- **Presupuesto:** asumido íntegramente por Eloy dentro de su entorno, con un **techo bajo declarado para la prueba bilateral**: el coste de mi lado no es un compromiso compartido y no genera gasto para Varo, ni directo ni implícito. El presupuesto conjunto, si lo hay, es COM-01 y sigue pendiente.
- **Concurrencia:** limitada a la que hoy rinde de verdad, que es menos de la que la máquina admite. El límite efectivo no es el número de trabajadores sino la cola del proveedor de inferencia: medido, un trabajador solo rinde por encima de varios compitiendo entre sí, así que subir el número degrada en vez de escalar. No declaro cifra fija porque sería del montaje actual, no un compromiso.
- **Parada:** **manual y local.** Existe hoy y funciona: es Eloy quien la ejecuta, en su entorno, sin depender de nada del lado común. No hay corte automático por gasto y **no lo declaro como si lo hubiera** — construirlo es trabajo, y hasta entonces la garantía real es que hay una persona que puede parar y lo sabe.
- **Compromiso de aviso:** si la parada se ejecuta durante una prueba bilateral, se avisa a Varo y el estado de la tarea afectada queda **explícito y auditable**, no colgado. Es el mismo caso P0 de revocación de [`product-spec.md`](product-spec.md) visto desde el otro lado: una parada no puede parecerse a una entrega que nunca llegó.
- **Responsable de incidencias:** Eloy, para todo lo que ocurra dentro de su entorno. No delegable en un agente: un agente puede detectar y reportar, pero quien responde es el propietario.
- **Aprobaciones:** ninguna acción de mi lado que gaste, escriba fuera de los repositorios autorizados o abra un acceso ocurre sin decisión humana explícita. La autonomía llega hasta abrir un PR; no más allá.

### Lo que esta política admite como límite

No hay corte automático, no hay cifra de concurrencia comprometida y el responsable es una sola persona. Son tres puntos únicos de fallo y los declaro como tales. Ninguno bloquea la alternativa B —donde lo que se demuestra es una cadena sobre repositorios autorizados, no un servicio en producción—, pero los tres tendrían que resolverse antes de cualquier cosa que corra sin alguien delante.
