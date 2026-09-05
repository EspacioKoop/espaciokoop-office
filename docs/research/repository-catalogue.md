# Catálogo comparado de repositorios

**22 repositorios únicos**: 6 de oficina y mundo visual; 8 de coordinación y trabajo real; 8 de conocimiento, progresión e historia.

**Estado: candidatos de estudio, no stack elegido.** Búsqueda de tres agentes, contrastada y consolidada por ARQUÍMEDES. Ningún upstream se ha instalado/ejecutado en esta investigación y no hay integración bilateral probada.

[Método, reglas y debate](README.md) · [Inventario con revisiones/fuentes](repository-catalogue.json) · [Preferencias de Varo](../product-preferences-varo.md)

## Lectura ejecutiva

- **Oficina y visitas:** Pixel Agents, SkyOffice y Agent Office son los primeros candidatos a comparar. AI Town aporta mundo persistente e inputs; no basta con copiar su apariencia.
- **Trabajo bilateral:** A2A merece contrastarse con el contrato de Office para capacidades, tareas y artefactos sin exigir un runtime común. No incorpora automáticamente autoridad, revisión ni cola de trabajo.
- **Control propio y visitas compartidas:** OpenFGA aporta un modelo de relaciones a evaluar, no una elección de infraestructura ni una auditoría interna. Ver, visitar, solicitar y gestionar son capacidades diferentes.
- **Aprendizaje, RPG e historia:** Voyager para habilidades; eventsourcing para historial; SkillTree para progresión; LegendsBrowser2 para navegar las crónicas. Graphiti y Neighborly aportan patrones, con costes/condiciones explícitos.
- **No superponer todos los motores.** Elegir por componente entre conservar una base, extraer piezas o implementar un patrón propio. La decisión depende del encaje y el coste, no de la popularidad.

P1 = estudiar primero; P2 = alternativa/subsistema condicionado; P3 = referencia con restricciones. No son prioridades de implementación acordadas.

## Matriz de selección

| Prioridad | Repositorio | Tipo | Uso propuesto |
|---|---|---|---|
| P1 | [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) | Simulación social con mundo persistente | Adaptar separación motor/agente/UI y tratamiento de inputs; comparar coste de conservar Convex. |
| P1 | [harishkotra/agent-office](https://github.com/harishkotra/agent-office) | Aplicación de oficina de agentes | Adaptar UI/escena/tablero y sustituir o reforzar ejecución privilegiada. |
| P1 | [kevinshen56714/SkyOffice](https://github.com/kevinshen56714/SkyOffice) | Oficina multijugador para personas | Adaptar salas, presencia y puestos; conservar solo comunicaciones necesarias. |
| P1 | [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) | Oficina visual conectada a eventos | Reutilizar/adaptar editor, áreas y representación de eventos. |
| P2 | [phaserjs/phaser](https://github.com/phaserjs/phaser) | Motor 2D, no aplicación de oficina | Reutilizar motor si la base elegida encaja; no sumar otro renderer. |
| P3 | [workadventure/workadventure](https://github.com/workadventure/workadventure) | Mundo/oficina virtual multijugador | Estudiar UX espacial; reutilización condicionada a licencia y coste. |
| P1 | [a2aproject/A2A](https://github.com/a2aproject/A2A) | Especificación de interoperabilidad | Adaptar o adoptar contrato versionado, mapeándolo al contrato propuesto de Office. |
| P1 | [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) | Aplicación de composición y ejecución de flujos | Adaptar interfaz y representación de entregables; estudiar separadamente versión clásica. |
| P2 | [camel-ai/camel](https://github.com/camel-ai/camel) | Framework de sociedades y equipos de agentes | Adaptar conversaciones acotadas o encapsular un equipo detrás de adaptador. |
| P2 | [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | Framework de Crews y Flows | Adaptar contratos de tarea, flujo y delegación; comparar antes de adoptar coordinador Python. |
| P2 | [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) | Framework de empresa de software | Adaptar roles, SOP y entregables como procedimientos de proyecto. |
| P2 | [OpenBMB/AgentVerse](https://github.com/OpenBMB/AgentVerse) | Framework de investigación multiagente | Adaptar coordinación y evaluación, comparando con otras alternativas antes de adoptar el runtime. |
| P2 | [temporalio/temporal](https://github.com/temporalio/temporal) | Servidor de ejecución durable | Estudiar patrones de recuperación; adoptar solo si el coste de infraestructura se justifica. |
| P3 | [microsoft/autogen](https://github.com/microsoft/autogen) | Framework y Studio de composición multiagente | Estudiar mensajes, patrones de equipo y UX; preservar integraciones existentes, no elegirlo por defecto para un backend nuevo. |
| P1 | [MineDojo/Voyager](https://github.com/MineDojo/Voyager) | Agente de Minecraft con biblioteca de habilidades | Adaptar biblioteca/recuperación de habilidades; no exigir Minecraft para nuestra oficina. |
| P1 | [openfga/openfga](https://github.com/openfga/openfga) | Servicio especializado de autorización por relaciones | Comparar adopción frente a reglas propias acotadas; no confundir con login. |
| P1 | [pyeventsourcing/eventsourcing](https://github.com/pyeventsourcing/eventsourcing) | Biblioteca Python de event sourcing | Reutilizar si encaja Python; en otro stack estudiar el patrón sin cambiar el backend por esta librería. |
| P1 | [robertjanetzko/LegendsBrowser2](https://github.com/robertjanetzko/LegendsBrowser2) | Navegador del historial de Dwarf Fortress | Adaptar navegación/UX; valorar extracción frente al acoplamiento XML de DF. |
| P2 | [getzep/graphiti](https://github.com/getzep/graphiti) | Framework de grafos temporales de contexto | Adaptar procedencia/relaciones o adoptar como proyección reconstruible, no autoridad única. |
| P2 | [NationalSecurityAgency/skills-service](https://github.com/NationalSecurityAgency/skills-service) | SkillTree: producto de formación gamificada | Comparar subsistema de progresión con implementar mecanismos menores en Office. |
| P3 | [altera-al/project-sid](https://github.com/altera-al/project-sid) | Repositorio de informe, no motor desplegable | Estudiar arquitectura y experimentos; no presupuestar reutilización de un motor no publicado. |
| P3 | [ShiJbey/neighborly](https://github.com/ShiJbey/neighborly) | Framework de simulación social e historia emergente | Estudiar patrones narrativos/ECS, no convertirlo en dependencia central sin asumir mantenimiento. |

## Oficina y mundo visual

### a16z-infra/ai-town

**P1 · Simulación social con mundo persistente** · [Revisión inspeccionada](https://github.com/a16z-infra/ai-town/tree/8e05997f2409275669c8344b84a51692e83f3f33)

- **Qué aprovechar:** ARCHITECTURE separa aiTown, engine, agent y representación; inputs humanos/agentes y trabajo LLM asíncrono. Referencia valiosa de mundo social persistente.
- **Tratamiento propuesto:** Adaptar separación motor/agente/UI y tratamiento de inputs; comparar coste de conservar Convex.
- **Límites:** No es un gestor de repos/tareas verificadas. Acoplamiento Convex y permisos de assets externos pendientes. Memoria/socialización no prueba aprendizaje validado.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** Inspección estática de arquitectura y código.
- **Comprobación futura:** Comparar conservar la base completa frente a extraer motor/inputs, sin duplicar coordinadores ni fuentes de estado.
- **Procedencia:** Referencia de Varo; agente visual y estudio previo de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/a16z-infra/ai-town/blob/8e05997f2409275669c8344b84a51692e83f3f33/README.md) · [Fuente 2](https://github.com/a16z-infra/ai-town/blob/8e05997f2409275669c8344b84a51692e83f3f33/ARCHITECTURE.md) · [Fuente 3](https://github.com/a16z-infra/ai-town/blob/8e05997f2409275669c8344b84a51692e83f3f33/convex/agent/memory.ts) · [Licencia 1](https://github.com/a16z-infra/ai-town/blob/8e05997f2409275669c8344b84a51692e83f3f33/LICENSE)

### harishkotra/agent-office

**P1 · Aplicación de oficina de agentes** · [Revisión inspeccionada](https://github.com/harishkotra/agent-office/tree/b00de4e8615c02605be7b90694dccda55d5d8168)

- **Qué aprovechar:** TaskBoard, Inspector, SystemLog, LayoutEditor, Phaser/React y Colyseus. Buen donante de oficina, paneles y edición.
- **Tratamiento propuesto:** Adaptar UI/escena/tablero y sustituir o reforzar ejecución privilegiada.
- **Límites:** Drag de mobiliario no acredita asignación real al arrastrar agentes. APIs Ollama/OpenAI-compatible son inferencia, no integración bilateral. ToolExecutor usa child_process.exec con timeout, sin aislamiento acreditado en ese archivo; writeNote registra un mensaje pero responde como si hubiera guardado una nota. Árbol Pixel Agents y assets requieren procedencia propia.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** Inspección estática de código y README.
- **Comprobación futura:** Medir acoplamiento de UI y OfficeRoom; reemplazar ejecutor antes de cualquier herramienta real.
- **Procedencia:** Referencia de Varo; agente visual y estudio previo de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/harishkotra/agent-office/blob/b00de4e8615c02605be7b90694dccda55d5d8168/README.md) · [Fuente 2](https://github.com/harishkotra/agent-office/blob/b00de4e8615c02605be7b90694dccda55d5d8168/packages/server/src/tools/ToolExecutor.ts) · [Fuente 3](https://github.com/harishkotra/agent-office/blob/b00de4e8615c02605be7b90694dccda55d5d8168/packages/ui/src/components/TaskBoard.tsx) · [Licencia 1](https://github.com/harishkotra/agent-office/blob/b00de4e8615c02605be7b90694dccda55d5d8168/LICENSE)

### kevinshen56714/SkyOffice

**P1 · Oficina multijugador para personas** · [Revisión inspeccionada](https://github.com/kevinshen56714/SkyOffice/tree/3f66b8bffad889ee9fc2340f9bcad28146299f47)

- **Qué aprovechar:** Phaser 3, Colyseus, React/Redux y PeerJS; salas, bocadillos, proximidad, puestos y pizarras. Candidato para visitar espacios del otro equipo y encontrarse en la oficina.
- **Tratamiento propuesto:** Adaptar salas, presencia y puestos; conservar solo comunicaciones necesarias.
- **Límites:** No aporta despacho de agentes ni pruebas de entregas. Videoconferencia/pantalla compartida aumentan infraestructura y exposición. Assets de LimeZu deben revisarse aparte.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README; licencia contrastada por ARQUÍMEDES.
- **Comprobación futura:** Comparar reutilizar salas/sincronización con la base de Agent Office, sin añadir videollamadas por inercia.
- **Procedencia:** Agente de investigación visual.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/kevinshen56714/SkyOffice/blob/3f66b8bffad889ee9fc2340f9bcad28146299f47/readme.md) · [Licencia 1](https://github.com/kevinshen56714/SkyOffice/blob/3f66b8bffad889ee9fc2340f9bcad28146299f47/LICENSE)

### pixel-agents-hq/pixel-agents

**P1 · Oficina visual conectada a eventos** · [Revisión inspeccionada](https://github.com/pixel-agents-hq/pixel-agents/tree/3537e140c2094761beae748592aeb92ece8edfdd)

- **Qué aprovechar:** Oficina Canvas 2D, pathfinding, estados de personajes y áreas vinculadas a carpetas; README describe AgentEvent, AgentRuntime, HookProvider y CLI independiente del editor.
- **Tratamiento propuesto:** Reutilizar/adaptar editor, áreas y representación de eventos.
- **Límites:** Claude Code es la referencia; otros proveedores figuran en roadmap. No demuestra control bilateral ni Kanban operativo. El proveedor lee transcripciones y el README advierte de tokens de instalación en URL/logs: no trasladar esa recogida de datos a Office. Assets externos requieren licencia individual.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README/arquitectura declarada; licencia contrastada por ARQUÍMEDES.
- **Comprobación futura:** Extraer una escena alimentada solo por eventos saneados; demostrar que no necesita transcripciones ni lanzar agentes para representar su actividad.
- **Procedencia:** Agente de investigación visual.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/README.md) · [Licencia 1](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/LICENSE)

### phaserjs/phaser

**P2 · Motor 2D, no aplicación de oficina** · [Revisión inspeccionada](https://github.com/phaserjs/phaser/tree/02d8931b626d9764c133cbb3fbf99966c03c757c)

- **Qué aprovechar:** Escenas, cámaras, tilemaps, animación e input; encaja con las bases Phaser de SkyOffice y Agent Office.
- **Tratamiento propuesto:** Reutilizar motor si la base elegida encaja; no sumar otro renderer.
- **Límites:** El README actual describe Phaser 4 y cambios incompatibles con 3. No actualizar automáticamente las aplicaciones candidatas. MIT del motor no licencia logos/personajes ni assets de terceros.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y licencia.
- **Comprobación futura:** Fijar versión compatible con la escena seleccionada y comprobar rendimiento/accesibilidad; no decidir por novedad.
- **Procedencia:** Agente de investigación visual.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/phaserjs/phaser/blob/02d8931b626d9764c133cbb3fbf99966c03c757c/README.md) · [Licencia 1](https://github.com/phaserjs/phaser/blob/02d8931b626d9764c133cbb3fbf99966c03c757c/LICENSE.md)

### workadventure/workadventure

**P3 · Mundo/oficina virtual multijugador** · [Revisión inspeccionada](https://github.com/workadventure/workadventure/tree/906b27552b56f4962c51e1d148e75c0f8a579438)

- **Qué aprovechar:** Mundos personalizables, presencia y colaboración humana; documentación de Admin API para habitaciones y privilegios.
- **Tratamiento propuesto:** Estudiar UX espacial; reutilización condicionada a licencia y coste.
- **Límites:** ARQUÍMEDES resolvió la duda inicial del investigador: back/LICENSE.txt y play/LICENSE.txt especifican AGPL v3 con Commons Clause y avisos de licencias múltiples. No tratarlo como AGPL estándar ni como componente sin restricciones de comercialización. Assets y otros paquetes pendientes.
- **Licencia:** AGPL v3 + Commons Clause en back/play; licencias múltiples y opción comercial. Evaluar por componente y uso, no autorización genérica.
- **Evidencia:** README, documentación y archivos de licencia.
- **Comprobación futura:** Determinar si necesitamos esa plataforma completa; revisar condiciones del componente exacto antes de copiar.
- **Procedencia:** Agente visual; licencia comprobada adicionalmente por ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/workadventure/workadventure/blob/906b27552b56f4962c51e1d148e75c0f8a579438/README.md) · [Fuente 2](https://github.com/workadventure/workadventure/blob/906b27552b56f4962c51e1d148e75c0f8a579438/docs/others/self-hosting/adminAPI.md) · [Licencia 1](https://github.com/workadventure/workadventure/blob/906b27552b56f4962c51e1d148e75c0f8a579438/back/LICENSE.txt) · [Licencia 2](https://github.com/workadventure/workadventure/blob/906b27552b56f4962c51e1d148e75c0f8a579438/play/LICENSE.txt)

## Coordinación y trabajo real

### a2aproject/A2A

**P1 · Especificación de interoperabilidad** · [Revisión inspeccionada](https://github.com/a2aproject/A2A/tree/98853be376c88df25e1704771cd3ea9ef8823a96)

- **Qué aprovechar:** AgentCard, Task, Message, Artifact y eventos; contratos para descubrir capacidades, pedir trabajo, consultar progreso y recibir artefactos entre runtimes distintos.
- **Tratamiento propuesto:** Adaptar o adoptar contrato versionado, mapeándolo al contrato propuesto de Office.
- **Límites:** No es Kanban, scheduler ni autorización instalada. Cancelación/idempotencia necesitan semántica comprobada del servidor. Fijar versión de especificación/SDK; no asumir que cualquier cliente implementa la misma versión.
- **Licencia:** Apache-2.0 identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y especificación documental.
- **Comprobación futura:** Mapear petición, aceptación, entrega y revisión de Office; conservar revisión de evidencia tras completed del agente. Probar rechazo y revocación a mitad de tarea.
- **Procedencia:** Agente de investigación de coordinación.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/a2aproject/A2A/blob/98853be376c88df25e1704771cd3ea9ef8823a96/README.md) · [Fuente 2](https://a2a-protocol.org/latest/specification/) · [Licencia 1](https://github.com/a2aproject/A2A/blob/98853be376c88df25e1704771cd3ea9ef8823a96/LICENSE)

### OpenBMB/ChatDev

**P1 · Aplicación de composición y ejecución de flujos** · [Revisión inspeccionada](https://github.com/OpenBMB/ChatDev/tree/4fb2db0ea90375ce1059f44fe03ffbd191a7a169)

- **Qué aprovechar:** Main corresponde a ChatDev 2.0 DevAll: frontend Vue, plantillas/esquemas y ejecutores de grafos. DAGExecutor recorre capas y delega ejecución paralela; README documenta lienzo y observabilidad.
- **Tratamiento propuesto:** Adaptar interfaz y representación de entregables; estudiar separadamente versión clásica.
- **Límites:** La oficina clásica está en chatdev1.0; no confundirla con main. Arrastrar nodos no asigna agentes remotos automáticamente. Refrescar/reconectar frontend no prueba recuperación de caída del servidor. Assets legacy pendientes de licencia.
- **Licencia:** Apache-2.0 identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y ejecutor DAG inspeccionado.
- **Comprobación futura:** Comparar grafo visual y puestos de oficina como dos vistas de la misma asignación; validar qué parte del motor conviene conservar.
- **Procedencia:** Referencia de Varo; agente de coordinación y lectura selectiva de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/OpenBMB/ChatDev/blob/4fb2db0ea90375ce1059f44fe03ffbd191a7a169/README.md) · [Fuente 2](https://github.com/OpenBMB/ChatDev/blob/4fb2db0ea90375ce1059f44fe03ffbd191a7a169/workflow/executor/dag_executor.py) · [Fuente 3](https://github.com/OpenBMB/ChatDev/blob/4fb2db0ea90375ce1059f44fe03ffbd191a7a169/workflow/graph.py) · [Fuente 4](https://github.com/OpenBMB/ChatDev/tree/chatdev1.0) · [Licencia 1](https://github.com/OpenBMB/ChatDev/blob/4fb2db0ea90375ce1059f44fe03ffbd191a7a169/LICENSE)

### camel-ai/camel

**P2 · Framework de sociedades y equipos de agentes** · [Revisión inspeccionada](https://github.com/camel-ai/camel/tree/d198715162d219219e92f8fe24579420b4286744)

- **Qué aprovechar:** RolePlaying y Workforce aportan roles y coordinación. El ejemplo de role-playing limita turnos y finaliza por estados de terminación o marcador CAMEL_TASK_DONE.
- **Tratamiento propuesto:** Adaptar conversaciones acotadas o encapsular un equipo detrás de adaptador.
- **Límites:** El marcador no demuestra objetivo cumplido. Workers nativos emplean ChatAgent; no hay integración bilateral probada. Reflexión/acuerdo mutuos pueden reforzar errores. Resume documentado no acredita por sí solo persistencia resistente a caída.
- **Licencia:** Apache-2.0 identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y ejemplo de ejecución leído, no ejecutado.
- **Comprobación futura:** Evaluar una colaboración con límite de rondas y prueba externa de resultado, comparándola con ejecución directa.
- **Procedencia:** Referencia de Varo; agente de coordinación y lectura selectiva de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/camel-ai/camel/blob/d198715162d219219e92f8fe24579420b4286744/README.md) · [Fuente 2](https://github.com/camel-ai/camel/blob/d198715162d219219e92f8fe24579420b4286744/examples/ai_society/role_playing.py) · [Fuente 3](https://github.com/camel-ai/camel/blob/d198715162d219219e92f8fe24579420b4286744/camel/societies/role_playing.py) · [Licencia 1](https://github.com/camel-ai/camel/blob/d198715162d219219e92f8fe24579420b4286744/LICENSE)

### crewAIInc/crewAI

**P2 · Framework de Crews y Flows** · [Revisión inspeccionada](https://github.com/crewAIInc/crewAI/tree/143e902178a07d0f13f9db2308f983aaacaaf0f8)

- **Qué aprovechar:** Tareas con expected_output/context, salidas estructuradas, Flows y memoria con ámbitos. Código de Crew conecta memoria/delegación; documentación adicional describe clientes/servidores A2A.
- **Tratamiento propuesto:** Adaptar contratos de tarea, flujo y delegación; comparar antes de adoptar coordinador Python.
- **Límites:** Formato validado no equivale a calidad. No confundir AMP comercial con núcleo MIT. Memoria compartida/ámbitos no prueban aislamiento entre propietarios. Compatibilidad A2A concreta pendiente; conectores documentados no prueban integración con nuestros agentes.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** Código selectivo/README; conector A2A localizado documentalmente, no probado.
- **Comprobación futura:** Comparar tareas/delegación con contrato propio y comprobar versiones A2A, revocación y coste sin migrar ambos equipos.
- **Procedencia:** Referencia de Varo; agente de coordinación y lectura selectiva de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/crewAIInc/crewAI/blob/143e902178a07d0f13f9db2308f983aaacaaf0f8/README.md) · [Fuente 2](https://github.com/crewAIInc/crewAI/blob/143e902178a07d0f13f9db2308f983aaacaaf0f8/lib/crewai/src/crewai/crew.py) · [Fuente 3](https://github.com/crewAIInc/crewAI/blob/143e902178a07d0f13f9db2308f983aaacaaf0f8/lib/crewai/src/crewai/flow/flow.py) · [Fuente 4](https://github.com/crewAIInc/crewAI/blob/143e902178a07d0f13f9db2308f983aaacaaf0f8/lib/crewai/src/crewai/memory/unified_memory.py) · [Fuente 5](https://docs.crewai.com/v1.15.17/en/learn/a2a-agent-delegation) · [Licencia 1](https://github.com/crewAIInc/crewAI/blob/143e902178a07d0f13f9db2308f983aaacaaf0f8/LICENSE)

### FoundationAgents/MetaGPT

**P2 · Framework de empresa de software** · [Revisión inspeccionada](https://github.com/FoundationAgents/MetaGPT/tree/11cdf466d042aece04fc6cfd13b28e1a70341b1f)

- **Qué aprovechar:** Producto, arquitectura e ingeniería con documentos/acciones concretos. Team implementa rondas, comprobación de presupuesto y serialización; útil para fases con entregable y responsable.
- **Tratamiento propuesto:** Adaptar roles, SOP y entregables como procedimientos de proyecto.
- **Límites:** geekan/MetaGPT redirige aquí. Team usa use_mgx=True; Architect advierte que su configuración de SOP fijo solo actúa con use_fixed_sop=True. No presentar diagramas clásicos como comportamiento por defecto actual. Sus roles no integran automáticamente agentes externos.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** Inspección estática de código y README.
- **Comprobación futura:** Elegir un procedimiento reutilizable de producto/diseño/revisión y contrastar su recorrido efectivo antes de extraer código.
- **Procedencia:** Referencia de Varo; agente de coordinación y código contrastado por ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/README.md) · [Fuente 2](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/metagpt/team.py) · [Fuente 3](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/metagpt/roles/architect.py) · [Licencia 1](https://github.com/FoundationAgents/MetaGPT/blob/11cdf466d042aece04fc6cfd13b28e1a70341b1f/LICENSE)

### OpenBMB/AgentVerse

**P2 · Framework de investigación multiagente** · [Revisión inspeccionada](https://github.com/OpenBMB/AgentVerse/tree/f90c4bd9680fdd3bcff8c52c9170911a59b23478)

- **Qué aprovechar:** Separación entre selección de especialistas, decisión, ejecución y evaluación; útil para reuniones con objetivo, turnos y resultado.
- **Tratamiento propuesto:** Adaptar coordinación y evaluación, comparando con otras alternativas antes de adoptar el runtime.
- **Límites:** El evaluador LLM y sus umbrales no sustituyen pruebas de artefactos. El ejemplo de prisioneros es el dilema del prisionero, no una prisión simulada completa. Dependencias y aislamiento entre propietarios pendientes de validar.
- **Licencia:** Apache-2.0 en LICENSE raíz; conservar avisos aplicables si se adapta código.
- **Evidencia:** Inspección estática de código y README.
- **Comprobación futura:** Comparar una reunión acotada con asignación directa: resultado verificable, coste y ausencia de bucles.
- **Procedencia:** Referencia de Varo; estudio previo de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/OpenBMB/AgentVerse/blob/f90c4bd9680fdd3bcff8c52c9170911a59b23478/README.md) · [Fuente 2](https://github.com/OpenBMB/AgentVerse/blob/f90c4bd9680fdd3bcff8c52c9170911a59b23478/agentverse/environments/tasksolving_env/basic.py) · [Licencia 1](https://github.com/OpenBMB/AgentVerse/blob/f90c4bd9680fdd3bcff8c52c9170911a59b23478/LICENSE)

### temporalio/temporal

**P2 · Servidor de ejecución durable** · [Revisión inspeccionada](https://github.com/temporalio/temporal/tree/bf4dd764b3b5c5d22695b3058d24a6308976b838)

- **Qué aprovechar:** Workflows, activities, workers, colas y políticas de reintentos/timeouts; posible coordinación de adaptadores externos sin migrar sus agentes.
- **Tratamiento propuesto:** Estudiar patrones de recuperación; adoptar solo si el coste de infraestructura se justifica.
- **Límites:** Añade servidor y SDKs. Reintentar actividades puede repetir efectos: la aplicación debe deduplicar. Recuperar workflow no restaura automáticamente la sesión del agente ni acredita una entrega.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README; documentación complementaria consultada por índice, no ejecución.
- **Comprobación futura:** Comparar con una cola/estado transaccional menor; simular interrupción antes/después de entregar sin duplicar trabajo.
- **Procedencia:** Agente de investigación de coordinación.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/temporalio/temporal/blob/bf4dd764b3b5c5d22695b3058d24a6308976b838/README.md) · [Fuente 2](https://docs.temporal.io/activity-definition) · [Fuente 3](https://docs.temporal.io/activity-execution) · [Licencia 1](https://github.com/temporalio/temporal/blob/bf4dd764b3b5c5d22695b3058d24a6308976b838/LICENSE)

### microsoft/autogen

**P3 · Framework y Studio de composición multiagente** · [Revisión inspeccionada](https://github.com/microsoft/autogen/tree/027ecf0a379bcc1d09956d46d12d44a3ad9cee14)

- **Qué aprovechar:** Core, AgentChat y Studio separan ejecución, coordinación e interfaz; útiles como referencias de componentes y terminación.
- **Tratamiento propuesto:** Estudiar mensajes, patrones de equipo y UX; preservar integraciones existentes, no elegirlo por defecto para un backend nuevo.
- **Límites:** README declara maintenance mode y recomienda Microsoft Agent Framework. Studio advierte que no es production-ready: autenticación/seguridad no vienen resueltas. No evaluar aquí al sucesor como si se hubiera inspeccionado.
- **Licencia:** Código MIT en LICENSE-CODE; documentación/contenido CC BY 4.0 en LICENSE. La etiqueta API sola resulta engañosa.
- **Evidencia:** README/licencias y código selectivo.
- **Comprobación futura:** Comparar solo piezas concretas y coste de mantenimiento; una adopción nueva requiere revisar también el sucesor, fuera de esta selección.
- **Procedencia:** Referencia de Varo; agente de coordinación y README contrastado por ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/README.md) · [Fuente 2](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-studio/autogenstudio/teammanager/teammanager.py) · [Licencia 1](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/LICENSE-CODE) · [Licencia 2](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/LICENSE)

## Conocimiento, progresión e historia

### MineDojo/Voyager

**P1 · Agente de Minecraft con biblioteca de habilidades** · [Revisión inspeccionada](https://github.com/MineDojo/Voyager/tree/55e45a880755d0c8c66ca7fb5fe7962ac8974f89)

- **Qué aprovechar:** Conserva código y descripciones de habilidades, las recupera semánticamente y añade nuevas al considerar superada una tarea.
- **Tratamiento propuesto:** Adaptar biblioteca/recuperación de habilidades; no exigir Minecraft para nuestra oficina.
- **Límites:** No es una plataforma multiagente bilateral por sí sola. La crítica automática también usa un LLM. Código recibido como habilidad necesita pruebas, permisos, procedencia y revocación antes de ejecutarse; no es entrenamiento de pesos.
- **Licencia:** MIT en LICENSE raíz; revisar dependencias aparte.
- **Evidencia:** Inspección estática de código y README.
- **Comprobación futura:** Validar una habilidad y demostrar su reutilización en una segunda tarea autorizada sin compartir memorias privadas.
- **Procedencia:** Referencia de Varo; estudio previo de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/README.md) · [Fuente 2](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/voyager/agents/skill.py) · [Fuente 3](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/voyager/agents/critic.py) · [Fuente 4](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/voyager/voyager.py) · [Licencia 1](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/LICENSE)

### openfga/openfga

**P1 · Servicio especializado de autorización por relaciones** · [Revisión inspeccionada](https://github.com/openfga/openfga/tree/450b68c5458e0749481d4cb51adc90cef5f95af6)

- **Qué aprovechar:** Modelos y comprobaciones de relaciones: propietario, visitante, miembro, solicitante. Encaja con controlar agentes propios y visitar/solicitar acciones a los demás sin heredar su autoridad.
- **Tratamiento propuesto:** Comparar adopción frente a reglas propias acotadas; no confundir con login.
- **Límites:** No autentica por sí solo ni demuestra purga de cachés/leyendas. Añade servicio y modelo a mantener; la aplicación debe comprobar permisos antes de recuperar datos.
- **Licencia:** Apache-2.0 identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y licencia; no auditoría del servicio.
- **Comprobación futura:** Modelar ver, visitar, solicitar y gestionar por separado; probar revocación durante tarea y búsqueda sin filtraciones.
- **Procedencia:** Agente de investigación de conocimiento; encaje con visitas propuesto por ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/openfga/openfga/blob/450b68c5458e0749481d4cb51adc90cef5f95af6/README.md) · [Licencia 1](https://github.com/openfga/openfga/blob/450b68c5458e0749481d4cb51adc90cef5f95af6/LICENSE)

### pyeventsourcing/eventsourcing

**P1 · Biblioteca Python de event sourcing** · [Revisión inspeccionada](https://github.com/pyeventsourcing/eventsourcing/tree/575d42c10a821828639b90178ed56703abe9c9f1)

- **Qué aprovechar:** Aggregate y event, historial de cambios y proyecciones: base candidata de cronologías, entregas, correcciones y premios derivados.
- **Tratamiento propuesto:** Reutilizar si encaja Python; en otro stack estudiar el patrón sin cambiar el backend por esta librería.
- **Límites:** Registrar un evento no demuestra que sea verdadero. Eventos compensatorios no borran contenido sensible. Diseñar retención, corrección y eliminación en las vistas derivadas.
- **Licencia:** BSD-3-Clause identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y licencia.
- **Comprobación futura:** Repetir una entrega sin duplicar premio; invalidar evidencia y reconstruir la cronología corregida.
- **Procedencia:** Agente de investigación de conocimiento.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/pyeventsourcing/eventsourcing/blob/575d42c10a821828639b90178ed56703abe9c9f1/README.md) · [Licencia 1](https://github.com/pyeventsourcing/eventsourcing/blob/575d42c10a821828639b90178ed56703abe9c9f1/LICENSE)

### robertjanetzko/LegendsBrowser2

**P1 · Navegador del historial de Dwarf Fortress** · [Revisión inspeccionada](https://github.com/robertjanetzko/LegendsBrowser2/tree/72838130d775a9b2efae05e61e7aa6972445c719)

- **Qué aprovechar:** Páginas de objetos conectadas a objetos relacionados, panoramas y estadísticas. Inspiración concreta para agente → evento → proyecto → artefacto.
- **Tratamiento propuesto:** Adaptar navegación/UX; valorar extracción frente al acoplamiento XML de DF.
- **Límites:** Es una aplicación Go para exports XML de Dwarf Fortress, no el motor del juego. Funciones dependen de DFHack/esquema; adaptación a Office no implementada. MIT del navegador no licencia assets o contenido de DF.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y licencia.
- **Comprobación futura:** Prototipar navegación con eventos de prueba de Office; mantener ficción marcada y enlaces a hechos autorizados.
- **Procedencia:** Agente de investigación de conocimiento.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/robertjanetzko/LegendsBrowser2/blob/72838130d775a9b2efae05e61e7aa6972445c719/README.md) · [Licencia 1](https://github.com/robertjanetzko/LegendsBrowser2/blob/72838130d775a9b2efae05e61e7aa6972445c719/LICENSE.md)

### getzep/graphiti

**P2 · Framework de grafos temporales de contexto** · [Revisión inspeccionada](https://github.com/getzep/graphiti/tree/547422865cca9fb5a82915c074d899428c145ff4)

- **Qué aprovechar:** README describe hechos cambiantes, procedencia hacia fuentes y consultas históricas. Candidato para relacionar agentes, habilidades, proyectos y artefactos.
- **Tratamiento propuesto:** Adaptar procedencia/relaciones o adoptar como proyección reconstruible, no autoridad única.
- **Límites:** Procedencia no prueba verdad ni consentimiento. Coste de grafo/modelos y permisos/borrado de derivados pendientes. No importar memorias privadas. README marca Kuzu como deprecado; revisar backend exacto si se adopta.
- **Licencia:** Apache-2.0 en la revisión comprobada; no asumir MIT a partir de referencias antiguas.
- **Evidencia:** README y licencia.
- **Comprobación futura:** Grafo formado solo por hechos aprobados, recuperación autorizada y reconstrucción tras revocación.
- **Procedencia:** Agente de investigación de conocimiento.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/getzep/graphiti/blob/547422865cca9fb5a82915c074d899428c145ff4/README.md) · [Licencia 1](https://github.com/getzep/graphiti/blob/547422865cca9fb5a82915c074d899428c145ff4/LICENSE)

### NationalSecurityAgency/skills-service

**P2 · SkillTree: producto de formación gamificada** · [Revisión inspeccionada](https://github.com/NationalSecurityAgency/skills-service/tree/deb07e10935cecc946246e2f8bc05a3b45758468)

- **Qué aprovechar:** Servicio, dashboard, visualizaciones y clientes de integración para perfiles y logros de formación.
- **Tratamiento propuesto:** Comparar subsistema de progresión con implementar mecanismos menores en Office.
- **Límites:** No es una pequeña biblioteca ni demuestra que agentes aprendan. No acredita antifraude/idempotencia para nuestro caso; puntos solo desde evidencias aceptadas. No trasladar autoscore al agente.
- **Licencia:** Apache-2.0 identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README y licencia.
- **Comprobación futura:** Evaluar integración mínima de un logro único y reversible, distinguiendo formación registrada de habilidad demostrada.
- **Procedencia:** Agente de investigación de conocimiento; LICENSE completada por ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/NationalSecurityAgency/skills-service/blob/deb07e10935cecc946246e2f8bc05a3b45758468/README.md) · [Licencia 1](https://github.com/NationalSecurityAgency/skills-service/blob/deb07e10935cecc946246e2f8bc05a3b45758468/LICENSE.txt)

### altera-al/project-sid

**P3 · Repositorio de informe, no motor desplegable** · [Revisión inspeccionada](https://github.com/altera-al/project-sid/tree/757ea101c476a012085e5645393dc501ffed5ea4)

- **Qué aprovechar:** PIANO plantea coherencia entre comunicación y ejecución, especialización y coordinación colectiva.
- **Tratamiento propuesto:** Estudiar arquitectura y experimentos; no presupuestar reutilización de un motor no publicado.
- **Límites:** El árbol inspeccionado contiene documentación, PDF e imagen, no el motor PIANO. Resultados reportados por los autores, no reproducidos aquí. No trasladar sus cifras de agentes a nuestra capacidad operativa.
- **Licencia:** Sin LICENSE raíz en la revisión inspeccionada. La licencia CC BY 4.0 del artículo no licencia un motor no publicado.
- **Evidencia:** Inspección de árbol/README y lectura del artículo.
- **Comprobación futura:** Convertir coherencia entre compromisos y acciones en pruebas de estados de tareas, sin replicar una civilización completa.
- **Procedencia:** Referencia de Varo; estudio previo de ARQUÍMEDES.
- **Estado del repositorio:** no archivado en la consulta; esto no acredita mantenimiento o soporte.

[Fuente 1](https://github.com/altera-al/project-sid/blob/757ea101c476a012085e5645393dc501ffed5ea4/README.md) · [Fuente 2](https://arxiv.org/html/2411.00114v1)

### ShiJbey/neighborly

**P3 · Framework de simulación social e historia emergente** · [Revisión inspeccionada](https://github.com/ShiJbey/neighborly/tree/1303cee0b8c404b1e3cf439e5c1a4b74d5e4ffe3)

- **Qué aprovechar:** Rasgos, relaciones, ocupaciones y acontecimientos vitales; historial exportable. Referencia de biografías y acontecimientos conectados, inspirada en Dwarf Fortress.
- **Tratamiento propuesto:** Estudiar patrones narrativos/ECS, no convertirlo en dependencia central sin asumir mantenimiento.
- **Límites:** Repositorio archivado; README declara fin de mantenimiento/soporte desde abril de 2026. Datos de simulación no deben convertirse en reputación técnica de agentes/personas reales. Assets y material narrativo ajeno requieren revisión.
- **Licencia:** MIT identificada en el archivo de licencia; dependencias y assets requieren revisión separada.
- **Evidencia:** README, estado API y licencia.
- **Comprobación futura:** Separar un patrón narrativo útil de la simulación completa y alimentar crónicas solo con eventos autorizados.
- **Procedencia:** Agente de investigación de conocimiento.
- **Estado del repositorio:** archivado en la consulta.

[Fuente 1](https://github.com/ShiJbey/neighborly/blob/1303cee0b8c404b1e3cf439e5c1a4b74d5e4ffe3/README.md) · [Licencia 1](https://github.com/ShiJbey/neighborly/blob/1303cee0b8c404b1e3cf439e5c1a4b74d5e4ffe3/LICENSE)

## Referencias de diseño que no cuentan como repositorios

- [Dwarf Fortress: Legends](https://dwarffortresswiki.org/Legends): personajes, entidades, lugares, acontecimientos y artefactos conectados. Inspiración para historia navegable; no disponibilidad del motor ni sus assets.
- Game Dev Tycoon: preferencia de Varo por pixel art isométrico y oficina legible. The Office: humor cotidiano con diálogos/personajes propios. Los Sims: interacción contextual, visitas y solicitudes; no control unilateral sobre agentes ajenos.

## Qué falta decidir/probar

- Selección de base visual y versión; contraste de extracción frente a reutilización completa, con licencias y costes.
- Contrato/versión de adaptadores, alojamiento privado y políticas de ambos propietarios. Tener el repo no concede acceso operativo.
- Correspondencia entre gesto de asignación, reserva de tarea, aceptación, entrega y revisión; reintentos y desconexión sin efectos duplicados.
- Memoria/habilidades con procedencia y revocación; premios y fabricación/intercambio consistentes. Historia narrativa separada de la evidencia.
- Licencias de cada asset y componente que se copie, con fuente, SHA, avisos/NOTICE, modificaciones y estrategia de actualización.

## Aportaciones de ambos equipos

Eloy está [invitado a estudiar, valorar y ampliar las referencias](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5548410886). Sus agentes ya han aportado al debate. Las preferencias de Varo sobre primera entrega y RPG están documentadas por separado; no se han convertido propuestas de reducción de alcance en acuerdos.

Este catálogo contiene únicamente referencias públicas y análisis saneado. No incluye inventarios internos de agentes, configuración, credenciales, decisiones de equipo o auditorías privadas de ningún propietario.
