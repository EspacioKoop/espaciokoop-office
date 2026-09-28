# Registro de procedencia de terceros

Este registro cubre los componentes externos estudiados o reutilizados por EspacioKoop Office. Su objetivo es que una licencia permisiva no se confunda con procedencia comprobada ni con una autorización implícita para incorporar runtime, assets o dependencias.

**Estado actual:** no hay código ni assets de los upstream listados abajo copiados en `src/`, `web/` o `packages/`. El runtime del proyecto sigue sin dependencias externas en `package.json`.

## Regla de entrada

Antes de incorporar cualquier fichero de terceros, esta tabla debe registrar:

- upstream y URL canónica;
- revisión exacta inspeccionada;
- ruta original y ruta local;
- licencia aplicable al fichero/componente y la fuente que la acredita;
- avisos/NOTICE que haya que conservar;
- modificaciones realizadas;
- motivo de uso y frontera funcional;
- estrategia de actualización/revisión;
- responsable y evidencia de aprobación.

Una dependencia transitiva, un asset incluido dentro de otro repositorio o una mención en README no heredan automáticamente la licencia del `LICENSE` raíz.

## Agent Office

| Campo | Registro |
|---|---|
| Upstream | `harishkotra/agent-office` |
| Revisión inspeccionada | `b00de4e8615c02605be7b90694dccda55d5d8168` |
| Fuente principal | https://github.com/harishkotra/agent-office/tree/b00de4e8615c02605be7b90694dccda55d5d8168 |
| Licencia raíz observada | MIT; verificar de nuevo el fichero aplicable antes de copiar un componente concreto |
| Decisión vigente | #11, opción **(a)**: no adoptar su runtime ejecutor |
| Componentes copiados/adaptados | **Ninguno** |
| Lista positiva actual | Vacía |
| Uso permitido hoy | Investigación de patrones de presentación/UX; cualquier reutilización futura requiere registro por fichero |
| Frontera excluida | `packages/server`, `ToolExecutor`, handlers de ejecución/administración, memoria/runtime y cualquier ruta que ejecute herramientas |
| Evidencia técnica | #1 y #11; inspección fijada al SHA anterior |
| Actualización | No seguir `main` automáticamente. Revisar manualmente SHA, licencia, dependencias y frontera antes de cada adopción |

La documentación estudiada de Agent Office describe aislamiento de herramientas, mientras el `ToolExecutor` inspeccionado usa `child_process.exec`. Por eso la documentación upstream no se toma como evidencia suficiente del comportamiento de ejecución. El proyecto de EspacioKoop mantiene esa frontera además con cero dependencias de runtime y una comprobación que rechaza `child_process`, `eval` y `new Function` dentro de `src/`.

## AI Town

| Campo | Registro |
|---|---|
| Upstream | `a16z-infra/ai-town` |
| Revisión inspeccionada | `8e05997f2409275669c8344b84a51692e83f3f33` |
| Fuente principal | https://github.com/a16z-infra/ai-town/tree/8e05997f2409275669c8344b84a51692e83f3f33 |
| Licencia raíz observada | MIT; assets y dependencias se verifican individualmente antes de reutilizar |
| Componentes copiados/adaptados | **Ninguno** |
| Lista positiva actual | Vacía |
| Uso permitido hoy | Referencia de arquitectura: separación mundo/motor/UI, inputs autoritativos y patrones de memoria |
| Evidencia técnica | Estudio en #1 y catálogo de `docs/research/` |
| Actualización | Revisión manual por SHA; no importar imágenes, tilesets, dependencias ni código por referencia indirecta |

## Comprobación del estado actual

A fecha de este registro:

- `package.json` no declara dependencias de runtime;
- `tools/check.mjs` rechaza primitivas de ejecución no permitidas dentro de `src/`;
- no existe una lista positiva con ficheros de Agent Office o AI Town porque **no se ha adoptado ninguno**;
- estudiar una interfaz o patrón no cambia ese estado.

Si en el futuro se copia el primer fichero, esta afirmación deja de ser válida y el mismo PR debe actualizar este registro con la entrada concreta. No se aceptará una atribución genérica del repositorio completo como sustituto de la procedencia por componente.
