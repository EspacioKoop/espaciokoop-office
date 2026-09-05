# Preparación de Varo, Eloy y el espacio común

**Estado:** checklist de definición, no orden de instalar, conectar agentes, abrir accesos ni gastar. Los responsables indicados son roles propuestos; cada propietario debe aceptar los trabajos y recursos bajo su control. Los datos operativos se verifican en su entorno autorizado y solo se comparte evidencia saneada.

## Estados

- **Pendiente de declaración:** falta información del propietario correspondiente.
- **Pendiente de acuerdo:** existe una propuesta, pero Varo y Eloy no la han aprobado.
- **Listo documentalmente:** el requisito está definido; no implica implementación ni prueba real.
- **Verificado:** existe evidencia reproducible dentro del alcance autorizado.

La columna **Bloquea** distingue la primera prueba bilateral de una fase posterior. Ningún pendiente de fase posterior debe bloquear por defecto trabajo independiente ya autorizado.

## Checklist de Varo

| ID | Qué se necesita y para qué | Prepara | Verifica | Estado | Comprobación saneada | Bloquea |
|---|---|---|---|---|---|---|
| VARO-01 | Agentes seleccionados, responsables, roles, runtime y versiones, para saber qué identidad y adaptador participan. | Varo o agente autorizado por Varo | Varo; compatibilidad bilateral por ambos propietarios | Pendiente de declaración | Lista compartible de identidades, roles, versiones e interfaces; sin perfiles, prompts ni configuración interna. | Primera entrega |
| VARO-02 | Entorno de ejecución autorizado y recursos disponibles, para fijar límites reales de la prueba. | Varo o agente autorizado por Varo | Varo | Pendiente de declaración | Resultado resumido de una inspección autorizada: capacidades y límites, sin inventario de máquina, rutas ni datos privados. | Primera entrega |
| VARO-03 | Proyectos, campos, artefactos y capacidades que se pueden compartir, con exclusiones y retención. | Varo | Varo | Pendiente de declaración | Matriz de alcance con ejemplos sintéticos y prueba negativa de un elemento excluido; sin copiar contenido real. | Primera entrega |
| VARO-04 | Conectividad privada, acceso mínimo al repositorio, autenticación y revocación, para conectar el adaptador sin exponer el entorno. | Varo o responsable técnico aceptado por Varo | Varo; prueba de extremo a extremo por ambos propietarios | Pendiente de acuerdo | Prueba de acceso y revocación con identidad de ensayo; solo resultado, versión y fecha, nunca tokens o configuración sensible. | Primera entrega |
| VARO-05 | Presupuesto, concurrencia, aprobaciones, parada y responsable de incidencias, para acotar autonomía y consumo. | Varo | Varo | Pendiente de declaración | Política versionada y casos sintéticos de admisión, denegación y parada. | Primera entrega |
| VARO-06 | Un agente y una tarea no sensible con criterio de aceptación, para la primera prueba bilateral. | Varo | Varo y Eloy sobre el recorrido común | Pendiente de acuerdo | Issue o ficha compartida con entrada sintética, resultado esperado, evidencia y límites. | Primera entrega |

Hermes es una integración solicitada por Varo, pero el adaptador, las versiones soportadas y el aislamiento siguen pendientes de acuerdo y validación. Un perfil Hermes separa estado; no constituye por sí solo una sandbox.

## Checklist de Eloy

| ID | Qué se necesita y para qué | Prepara | Verifica | Estado | Comprobación saneada | Bloquea |
|---|---|---|---|---|---|---|
| ELOY-01 | Agentes seleccionados, responsables, roles, herramientas y versiones, para definir su identidad y adaptador sin imponer Hermes. | Eloy o agente autorizado por Eloy | Eloy; compatibilidad bilateral por ambos propietarios | Pendiente de declaración | Lista compartible de identidades, roles, versiones e interfaces; sin perfiles, prompts ni configuración interna. | Primera entrega |
| ELOY-02 | Entorno de ejecución autorizado y recursos disponibles, para fijar límites reales de la prueba. | Eloy o agente autorizado por Eloy | Eloy | Pendiente de declaración | Declaración o inspección autorizada resumida; sin inventario interno, rutas ni datos privados. | Primera entrega |
| ELOY-03 | Proyectos, campos, artefactos y capacidades compartibles, con exclusiones y retención. | Eloy | Eloy | Pendiente de declaración | Matriz de alcance con ejemplos sintéticos y prueba negativa de un elemento excluido; sin copiar contenido real. | Primera entrega |
| ELOY-04 | Conectividad privada, acceso mínimo al repositorio, autenticación y revocación, para conectar su adaptador sin exponer el entorno. | Eloy o responsable técnico aceptado por Eloy | Eloy; prueba de extremo a extremo por ambos propietarios | Pendiente de acuerdo | Prueba de acceso y revocación con identidad de ensayo; solo resultado, versión y fecha, nunca credenciales. | Primera entrega |
| ELOY-05 | Presupuesto, concurrencia, aprobaciones, parada y responsable de incidencias, para acotar autonomía y consumo. | Eloy | Eloy | Pendiente de declaración | Política versionada y casos sintéticos de admisión, denegación y parada. | Primera entrega |
| ELOY-06 | Un agente y una tarea no sensible con criterio de aceptación, para la primera prueba bilateral. | Eloy | Varo y Eloy sobre el recorrido común | Pendiente de acuerdo | Issue o ficha compartida con entrada sintética, resultado esperado, evidencia y límites. | Primera entrega |

El proyecto no presupone qué herramientas usa Eloy ni le asigna agentes, infraestructura o trabajo. Su participación y la de sus agentes requieren aceptación expresa dentro de su propio alcance.

## Checklist común

| ID | Qué se necesita y para qué | Prepara | Verifica | Estado | Comprobación saneada | Bloquea |
|---|---|---|---|---|---|---|
| COM-01 | Alojamiento, mantenimiento, acceso privado desde ambos lados, costes y presupuesto, para operar sin exposición ni gasto implícito. | Responsables aceptados por Varo y Eloy | Varo y Eloy | Pendiente de acuerdo | Diagrama compartible, matriz de responsabilidad y prueba de acceso/revocación; sin direcciones privadas ni secretos. | Primera entrega |
| COM-02 | Stack, protocolo, identidad de equipos, responsabilidad de adaptadores y matriz de compatibilidad objetivo. | Responsables técnicos aceptados por ambos | Varo y Eloy | Pendiente de acuerdo | Registro de decisión y pruebas de contrato con fixtures sintéticos por cada versión declarada. | Primera entrega |
| COM-03 | Reglas de conocimiento, revisión, recompensas, coordinación, protección de datos y recuperación. | Responsables de producto y seguridad aceptados por ambos | Varo y Eloy | Pendiente de acuerdo | Casos positivos y negativos de procedencia, revocación, duplicado, conflicto y recuperación con datos sintéticos. | Primera entrega para autoridad y datos; progresión avanzada en fase posterior |
| COM-04 | Dependencias, licencias y cuentas: distinguir imprescindible, opcional y alternativa sin coste. | Responsable documental aceptado por ambos | Varo y Eloy | Pendiente de acuerdo | Inventario por componente con versión, licencia, fuente y justificación; sin crear cuentas ni instalar durante la definición. | Primera entrega solo para componentes elegidos |
| COM-05 | Reparto entre preparación automática y acciones humanas, para no trasladar trabajo técnico ejecutable ni fingir aceptación. | Responsables aceptados por ambos | Varo y Eloy | Pendiente de acuerdo | Plan donde cada paso identifica ejecutor, revisor, autorización, evidencia y parada. | Primera entrega |
| COM-06 | Recorrido bilateral de validación: actividad real, intercambio, aprendizaje, premio, aislamiento y recuperación. | Responsables de prueba aceptados por ambos | Varo y Eloy | Pendiente de acuerdo | Plan con tests sintéticos, integración real, despliegue y aceptación humana separados; una demo visual no acredita trabajo. | Primera entrega |
| COM-07 | Acceso y administración compartida del repositorio, para que cualquiera de los propietarios pueda relevar al otro. | Propietarios de EspacioKoop | Varo y Eloy | Listo documentalmente; permisos efectivos por revalidar antes del arranque | Lectura de permisos de la organización y prueba no destructiva de colaboración, sin publicar credenciales. | Primera entrega |

## Criterio de salida de la preparación

La preparación no se considera cerrada hasta que cada fila que bloquee la primera entrega tenga responsable aceptado, estado verificable y evidencia saneada enlazada; los desacuerdos y datos aún no autorizados permanecen explícitamente pendientes. Completar esta checklist no autoriza por sí solo implementación, despliegue, conexión de agentes ni gasto.
