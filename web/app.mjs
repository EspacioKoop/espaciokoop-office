const $ = id => document.getElementById(id);
const labels = { requested: 'Solicitada', accepted: 'Aceptada', delivered: 'Entregada', reviewed: 'Revisada', blocked: 'Bloqueada', unavailable: 'No verificable' };
const chain = ['requested', 'accepted', 'delivered', 'reviewed'];
let detailId = null;
let info; let snapshot = null; let teamQueue = null; let presence = null; let view = 'office'; let events; let refreshTimer; let expiryTimer; let refreshing = false; let epoch = 0;
let disposeScene = () => {};
let prefer3D = false;
let selectedAgent = null;
let agency = null; let agencyEpoch = 0; let agencyTimer; let agencyMessage = ''; let agencyLoading = false; let agencyMutating = false;
let jobDraft = { title: '', instruction: '', agentId: '' }; let jobIntent = null; let jobSending = false; let jobDetail = null; let jobDetailMessage = '';
let pairingOpen = false; let pairingRuntime = 'hermes'; let pairingToken = null; let pairingIntent = null; let pairingBusy = false; let pairingMessage = '';
const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
function tell(message = '') { $('notice').textContent = message; }
function pill(stage) { return node('span', labels[stage] ?? 'No verificable', `pill ${stage}`); }
async function api(path, data) {
  const options = { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(11000) };
  if (data !== undefined) Object.assign(options, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.message ?? 'Operación no disponible.'); error.code = result.error; throw error; }
  return result;
}
function clearView(message = '') {
  disposeScene(); disposeScene = () => {};
  prefer3D = false;
  selectedAgent = null; agencyEpoch++; agency = null; agencyMessage = ''; agencyLoading = false; agencyMutating = false; clearTimeout(agencyTimer); agencyTimer = null;
  jobDraft = { title: '', instruction: '', agentId: '' }; jobIntent = null; jobSending = false; jobDetail = null; jobDetailMessage = '';
  pairingOpen = false; pairingToken = null; pairingIntent = null; pairingBusy = false; pairingMessage = '';
  epoch++; snapshot = null; teamQueue = null; presence = null; clearTimeout(refreshTimer); clearTimeout(expiryTimer);
  if (events) { events.close(); events = null; }
  $('office-view').replaceChildren(); $('board').replaceChildren(); $('detail-content').replaceChildren();
  $('detail').close(); $('search').value = ''; $('updated').textContent = 'Sin datos';
  $('account-name').textContent = 'Sin sesión'; $('refresh').hidden = true; $('logout').hidden = true;
  show(view); tell(message);
}
function show(next) {
  view = next;
  for (const name of ['office', 'work', 'about']) {
    $(`${name}-view`).hidden = name !== view || (!snapshot && name !== 'about');
    $(`nav-${name}`).removeAttribute('aria-current');
  }
  $(`nav-${view}`).setAttribute('aria-current', 'page');
  $('page-title').textContent = { office: 'La oficina', work: 'Trabajo y evidencias', about: 'Estado del proyecto' }[view];
  $('login').hidden = Boolean(snapshot) || view === 'about';
}
function taskButton(task) {
  const button = node('button', undefined, 'task-button');
  const text = node('span'); text.append(node('span', `#${task.number}`, 'number'), node('span', task.title, 'task-title'));
  button.append(text, pill(task.stage)); button.addEventListener('click', () => detail(task));
  return button;
}
function renderOffice() {
  const active = document.activeElement;
  const focusedDraft = active?.dataset?.jobField;
  const selection = focusedDraft && active.tagName !== 'SELECT' ? [active.selectionStart, active.selectionEnd] : null;
  disposeScene(); disposeScene = () => {};
  const root = $('office-view'); root.replaceChildren();
  const heading = node('div', undefined, 'section-head'); const intro = node('div');
  intro.append(node('span', 'EL LUGAR DONDE LAS IDEAS SE ENCUENTRAN', 'eyebrow'), node('h2', 'Tu campus, con contexto.'), node('p', 'Proyectos compartidos. Responsabilidades claras. Evidencias a un clic.'));
  heading.append(intro);
  const help = agencyButton('Ayuda', () => show('about'));
  const feedback = node('a', 'Opinar'); feedback.href = 'https://github.com/EspacioKoop/espaciokoop-office/issues/1'; feedback.target = '_blank'; feedback.rel = 'noopener noreferrer';
  heading.append(help, feedback); root.append(heading);
  root.append(renderAgency());
  if (focusedDraft) {
    const replacement = root.querySelector(`[data-job-field="${focusedDraft}"]`);
    replacement?.focus();
    if (replacement && selection) replacement.setSelectionRange(...selection);
  }
  const campus = node('div', undefined, 'campus'); const scene = node('section', undefined, 'scene-card');
  const sceneMeta = node('div', undefined, 'scene-meta'); sceneMeta.append(node('h3', 'El espacio común'), node('span', 'Secciones y agentes de la agencia'));
  const image = node('img'); image.src = '/office.svg'; image.alt = 'Ilustración original de la oficina: talleres, mesa compartida, biblioteca y plantas. No muestra agentes reales.';
  const stage = node('div', undefined, 'scene-stage'); stage.append(image);
  const controls = node('div', undefined, 'scene-controls');
  const toggle = node('button', 'Ver oficina en 3D'); controls.append(toggle);
  toggle.addEventListener('click', async () => {
    if (stage.dataset.mode === '3d') {
      disposeScene(); disposeScene = () => {}; stage.replaceChildren(image);
      prefer3D = false; stage.dataset.mode = '2d'; controls.replaceChildren(toggle); toggle.textContent = 'Ver oficina en 3D'; return;
    }
    toggle.disabled = true;
    try {
      const { mountOffice3D } = await import('/office-3d.mjs');
      if (!stage.isConnected) return;
      const mounted = mountOffice3D(stage, agency, { select: id => { selectedAgent = id; renderOffice(); }, assign: (id, section) => assignAgent(id, section) });
      disposeScene = mounted.dispose; prefer3D = true; stage.dataset.mode = '3d';
      toggle.textContent = 'Volver a la vista 2D';
      const left = node('button', 'Girar a la izquierda');
      const right = node('button', 'Girar a la derecha');
      left.addEventListener('click', () => mounted.rotate(-1));
      right.addEventListener('click', () => mounted.rotate(1));
      controls.append(left, right);
    } catch {
      stage.replaceChildren(image); tell('No se puede mostrar la vista 3D en este navegador. La vista 2D sigue disponible.');
    } finally { toggle.disabled = false; }
  });
  if (prefer3D) toggle.click();
  scene.append(sceneMeta, stage, controls, node('div', 'Selecciona o arrastra un agente a una sección. El panel permite realizar las mismas acciones sin 3D.', 'scene-caption'));
  const teams = node('section', undefined, 'card team-panel'); teams.append(node('h3', 'Equipos incorporados'));
  snapshot.members.forEach((member, index) => {
    const card = node('div', undefined, 'team-card'); const avatar = node('div', member.label.split(' ').at(-1).slice(0, 1), `avatar ${index % 2 ? 'alt' : ''}`); avatar.setAttribute('aria-hidden', 'true');
    const text = node('div'); text.append(node('strong', member.label), node('small', member.githubLogin), node('small', 'Cuenta compartida'), node('small', 'Presencia no disponible'));
    card.append(avatar, text); teams.append(card);
  });
  teams.append(node('p', snapshot.mode === 'demo' ? 'Equipos ficticios de evaluación. Ningún nombre representa una identidad real.' : 'No se infiere identidad individual, conexión o disponibilidad a partir de una cuenta de GitHub.', 'hint'));
  campus.append(scene, teams); root.append(campus);
  if (presence) {
    const presencePanel = node('section', undefined, 'card presence-panel');
    presencePanel.append(node('span', 'PRESENCIA AUTENTICADA', 'eyebrow'), node('h3', 'Agentes declarados'));
    const presenceList = node('div', undefined, 'presence-list');
    for (const agent of presence.agents) {
      const row = node('div', undefined, `presence-agent ${agent.status}`);
      row.append(node('strong', agent.label), node('span', { online: 'online', stale: 'stale', offline: 'offline' }[agent.status] ?? 'offline', 'presence-status'));
      presenceList.append(row);
    }
    presencePanel.append(presenceList, node('p', 'Estado efímero servido por /api/presence. No asigna tareas, no emite heartbeats desde el navegador y no expone claves.', 'hint'));
    root.append(presencePanel);
  }
  const tasks = snapshot.projects.flatMap(p => p.tasks); const stats = node('section', undefined, 'stats'); stats.setAttribute('aria-label', 'Resumen de tareas visibles');
  const values = [['PROYECTOS', snapshot.projects.length, 'Solo los autorizados'], ['SOLICITUDES', tasks.filter(t => t.stage === 'requested').length, 'Pendientes de aceptación'], ['EN COLABORACIÓN', tasks.filter(t => ['accepted', 'delivered'].includes(t.stage)).length, 'Aceptadas o entregadas'], ['REVISADAS', tasks.filter(t => t.stage === 'reviewed').length, 'SHA aprobado + CI válido']];
  for (const [label, number, hint] of values) { const stat = node('div', undefined, 'card stat'); stat.append(node('span', label), node('strong', number), node('small', hint)); stats.append(stat); }
  root.append(stats);
  const projectHeading = node('div', undefined, 'section-head'); projectHeading.append(node('h3', 'Áreas de proyecto'), node('span', 'El tablero representa; GitHub conserva.', 'eyebrow')); root.append(projectHeading);
  const projects = node('div', undefined, 'project-grid');
  snapshot.projects.forEach((project, index) => {
    const card = node('section', undefined, 'card project-card');
    card.append(node('span', `ÁREA ${String(index + 1).padStart(2, '0')}`, 'project-number'), node('h3', project.label), node('p', project.repo));
    const list = node('div', undefined, 'task-list'); for (const task of project.tasks) list.append(taskButton(task));
    if (!project.tasks.length) list.append(node('p', 'No hay tareas seleccionadas en la política local.', 'empty'));
    card.append(list); projects.append(card);
  });
  if (!snapshot.projects.length) projects.append(node('p', 'No tienes proyectos autorizados. No se ha consultado ningún repositorio.', 'card'));
  root.append(projects);
  if (snapshot.demo) {
    const demoPanel = node('section', undefined, 'flow-panel'); const copy = node('div');
    copy.append(node('h3', 'Recorrido guiado · datos inventados'), node('p', ['Marea puede aceptar la solicitud #11.', 'Marea puede registrar la entrega sintética.', 'Aurora puede revisar la entrega sintética.', 'Cadena sintética completa: esto no acredita una integración real.'][snapshot.demo.step]));
    demoPanel.append(copy);
    if (snapshot.demo.step < 3) {
      const required = snapshot.demo.step < 2 ? 'marea' : 'aurora';
      const button = node('button', snapshot.memberId === required ? ['Aceptar ejemplo', 'Entregar ejemplo', 'Revisar ejemplo'][snapshot.demo.step] : `Cambiar a ${required === 'marea' ? 'Marea' : 'Aurora'}`, 'primary');
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          if (snapshot.memberId !== required) { await api('/api/logout', {}); clearView(); await login(`demo-${required}`); }
          else { const version = snapshot.demo.version; await api('/api/demo/advance', { version }); await refresh(); }
        } catch (error) { tell(error.message); button.disabled = false; }
      });
      demoPanel.append(button);
    }
    root.append(demoPanel);
  }
}
function queueTask(task) {
  return { ...task, number: task.issue, pullRequest: task.pull_request };
}
function visibleTasks() {
  return [...(teamQueue?.queue ?? []).map(queueTask), ...snapshot.projects.flatMap(p => p.tasks)];
}
function renderBoard() {
  const root = $('board'); root.replaceChildren(); if (!snapshot) return;
  const query = $('search').value.toLocaleLowerCase('es');
  const queue = node('section', undefined, 'board-project');
  const teamLabel = snapshot.members.find(member => member.id === snapshot.memberId)?.label ?? 'Equipo autorizado';
  queue.append(node('h3', `Cola de ${teamLabel}`), node('p', 'Tareas dirigidas a tu equipo. La fase y las evidencias se consultan en GitHub.', 'hint'));
  const selected = (teamQueue?.queue ?? []).filter(task => (`${task.title} #${task.issue}`).toLocaleLowerCase('es').includes(query));
  const list = node('div', undefined, 'task-list');
  for (const task of selected) list.append(taskButton(queueTask(task)));
  if (!selected.length) list.append(node('p', teamQueue?.queue.length ? 'No hay tareas de tu cola que coincidan con la búsqueda.' : 'Tu equipo no tiene tareas dirigidas a esta cola.', 'empty'));
  queue.append(list); root.append(queue);
  root.append(node('h2', 'Proyectos autorizados'));
  for (const project of snapshot.projects) {
    const section = node('section', undefined, 'board-project'); section.append(node('h3', project.label));
    const columns = node('div', undefined, 'columns');
    for (const stage of chain) {
      const column = node('div', undefined, 'column');
      const tasks = project.tasks.filter(t => (t.stage === stage || (stage === 'requested' && ['blocked', 'unavailable'].includes(t.stage))) && (`${t.title} #${t.number}`).toLocaleLowerCase('es').includes(query));
      column.append(node('h4', `${labels[stage]} · ${tasks.length}`));
      for (const task of tasks) column.append(taskButton(task));
      if (!tasks.length) column.append(node('p', 'Sin tareas en esta fase', 'empty'));
      columns.append(column);
    }
    section.append(columns); root.append(section);
  }
}
function detail(task) {
  detailId = task.id;
  const root = $('detail-content'); root.replaceChildren();
  root.append(pill(task.stage)); const title = node('h2', task.title, 'dialog-title'); title.id = 'detail-title'; root.append(title);
  root.append(node('p', `${task.id} · ${snapshot.mode === 'demo' ? 'Evidencia sintética' : 'Metadatos consultados en GitHub'}`, 'hint'));
  const steps = node('div', undefined, 'chain');
  for (const [index, stage] of chain.entries()) {
    const step = node('div', undefined, `chain-step ${task.evidence.some(e => e.kind === stage) ? 'confirmed' : ''}`);
    step.append(node('strong', String(index + 1).padStart(2, '0')), node('span', labels[stage])); steps.append(step);
  }
  root.append(steps);
  const metadata = node('div', undefined, 'detail-metadata');
  for (const [label, value] of [['Solicitante', task.author ?? 'No disponible'], ['Responsable', task.assignee ?? 'Sin asignar'], ['CI del SHA actual', task.pullRequest?.ci ?? 'Sin entrega'], ['Revisión independiente', task.pullRequest?.reviewer ?? 'Pendiente'], ['SHA de entrega', task.pullRequest?.sha ?? 'Sin entrega'], ['Vínculo issue / PR', task.pullRequest ? 'Declarado por el propietario' : 'Sin entrega']]) {
    const item = node('div'); item.append(node('small', label), node('strong', value)); metadata.append(item);
  }
  root.append(metadata);
  for (const reason of task.reasons) root.append(node('p', reason, 'reason'));
  for (const evidence of task.evidence) {
    const row = node('div', undefined, 'evidence');
    if (snapshot.mode === 'demo') row.append(node('span', `${evidence.label} · ejemplo`));
    else { const link = node('a', evidence.label); link.href = evidence.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); }
    root.append(row);
  }
  root.append(node('p', 'Aceptar significa que el destinatario se ha autoasignado en GitHub. No acredita que un agente esté ejecutándose. Los nombres de cuenta no distinguen a un humano de sus agentes.', 'hint'));
  if (snapshot.mode !== 'demo') {
    const link = node('a', 'Abrir en GitHub para asignar, entregar o revisar ↗', 'native-action');
    link.href = task.pullRequest?.url ?? task.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; root.append(link);
    root.append(node('p', 'Las operaciones reales ocurren en GitHub bajo sus permisos. Office no ejecuta cambios ni asigna agentes.', 'hint'));
  }
  if (!$('detail').open) $('detail').showModal();
}
function watchSession() {
  if (events) events.close();
  events = new EventSource('/api/events');
  events.addEventListener('space', () => refresh());
  events.addEventListener('revoke', () => clearView('La política o el acceso ha cambiado. La vista se ha retirado.'));
  events.onerror = () => clearView('Se ha perdido la señal de sesión. La vista se ha retirado; vuelve a entrar.');
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true; const started = epoch;
  try {
    const data = await api('/api/snapshot');
    if (started !== epoch || document.hidden) return;
    // Secuencial: ambas rutas comparten una única lectura activa por sesión.
    const queue = await api('/api/queue');
    if (started !== epoch || document.hidden) return;
    const agents = info?.version && info.presenceConfigured !== false ? await api('/api/presence') : null;
    if (started !== epoch || document.hidden) return;
    const expiresAt = Math.min(data.expiresAt, queue.expiresAt, agents?.expiresAt ?? Infinity);
    if (data.memberId !== queue.memberId || !Array.isArray(queue.queue) || (agents && (!Array.isArray(agents.agents) || !agents.agents.length)) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('La vista ha cambiado o caducado. Vuelve a actualizar.');
    }
    snapshot = data; teamQueue = queue; presence = agents;
    $('account-name').textContent = data.members.find(m => m.id === data.memberId)?.label ?? 'Equipo autorizado';
    $('refresh').hidden = false; $('logout').hidden = false;
    $('updated').textContent = `Verificado a las ${new Date(data.generatedAt).toLocaleTimeString('es-ES')}`;
    renderOffice(); renderBoard(); show(view);
    if (!agency && !agencyLoading && !agencyTimer) loadAgency();
    if ($('detail').open) {
      const current = visibleTasks().find(t => t.id === detailId);
      if (current) detail(current); else $('detail').close();
    }
    tell(data.mode === 'demo' ? 'MODO DE EVALUACIÓN · Datos sintéticos. No hay agentes reales conectados ni llamadas a modelos.' : 'SOLO LECTURA · Selección explícita de metadatos; las operaciones se realizan en GitHub.');
    clearTimeout(expiryTimer); clearTimeout(refreshTimer);
    expiryTimer = setTimeout(() => clearView('La vista ha caducado sin una comprobación nueva. Datos retirados.'), Math.max(0, expiresAt - Date.now()));
    refreshTimer = setTimeout(refresh, 9000);
    if (!events) watchSession();
  } catch (error) { if (started === epoch) clearView(error.code === 'AUTH' ? '' : error.message); }
  finally { refreshing = false; }
}
// La agencia conserva únicamente la proyección autorizada por el servidor.
async function agencyRequest(path, payload) {
  const options = { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(11000) };
  if (payload) Object.assign(options, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const response = await fetch(path, options);
  let body = {}; try { body = await response.json(); } catch { /* respuesta sin JSON */ }
  if (!response.ok) {
    const error = new Error(body.error?.message || body.message || 'Servicio de agencia no disponible.');
    error.status = response.status; throw error;
  }
  return { body, status: response.status };
}
async function loadAgency() {
  if (!snapshot || document.hidden || agencyLoading) return;
  agencyLoading = true; clearTimeout(agencyTimer); agencyTimer = null;
  const started = agencyEpoch;
  try {
    const { body } = await agencyRequest('/api/agency');
    if (started !== agencyEpoch || !snapshot || document.hidden) return;
    if (body.version !== 1 || !Array.isArray(body.agents) || !Array.isArray(body.jobs) || !Array.isArray(body.sections)) throw new Error('Respuesta de agencia incompatible.');
    agency = { ...body, agents: body.agents.filter(a => a.owner_id === body.owner_id) };
    if (selectedAgent && !agency.agents.some(a => a.id === selectedAgent)) selectedAgent = null;
  } catch (error) {
    if (started !== agencyEpoch) return;
    if (error.status === 401) { clearView('La sesión ha caducado. Vuelve a entrar.'); return; }
    agency = null; selectedAgent = null;
    agencyMessage = error.status === 404 || error.status === 503 ? 'La agencia no está configurada. Contacta con la persona que integra Office.' : `Sin conexión con la agencia: ${error.message}`;
  } finally {
    if (started === agencyEpoch) {
      agencyLoading = false;
      if (snapshot && !document.hidden) { renderOffice(); agencyTimer = setTimeout(loadAgency, 15000); }
    }
  }
}
async function agencyAction(path, fields) {
  if (agencyMutating) return;
  agencyMutating = true; agencyEpoch++; agencyLoading = false; clearTimeout(agencyTimer); agencyTimer = null;
  const started = agencyEpoch;
  agencyMessage = 'Operación pendiente de confirmación…'; renderOffice();
  try {
    const result = await agencyRequest(path, { operation_id: crypto.randomUUID(), ...fields });
    if (started !== agencyEpoch) return;
    agencyMessage = result.status === 202 ? 'Solicitud recibida; se confirmará cuando aparezca en la agencia.' : 'Operación recibida; actualizando estado.';
    await loadAgency();
  } catch (error) {
    if (started !== agencyEpoch) return;
    if (error.status === 401) { clearView('La sesión ha caducado. Vuelve a entrar.'); return; }
    agencyMessage = error.status === 409 ? 'Conflicto: el estado ha cambiado. Se actualizará sin repetir la operación.' : error.status === 403 ? 'Operación denegada. No se ha confirmado ningún cambio.' : error.message;
    if (error.status === 409) await loadAgency(); else renderOffice();
  } finally { if (started === agencyEpoch) { agencyMutating = false; if (snapshot) renderOffice(); } }
}
const jobStates = { queued: 'En cola', running: 'En ejecución', succeeded: 'Finalizada', failed: 'Fallida', unknown: 'Estado desconocido' };
const jobLabel = job => ['succeeded', 'failed'].includes(job.status) && !job.result ? 'Resultado no confirmado' : jobStates[job.status] || 'Estado no reconocido';
async function submitJob() {
  if (jobSending || !agency || !snapshot) return;
  const agent = agency.agents.find(a => a.id === jobDraft.agentId);
  const title = jobDraft.title.trim(); const instruction = jobDraft.instruction.trim();
  if (!agent || agent.owner_id !== agency.owner_id || !agent.in_office || agent.status !== 'available') { agencyMessage = 'Elige un agente propio, incorporado y disponible.'; renderOffice(); return; }
  if (!title || title.length > 160 || !instruction || instruction.length > 4096) { agencyMessage = 'Completa un título de hasta 160 caracteres y una instrucción de hasta 4096.'; renderOffice(); return; }
  const fields = { title, instruction, agent_id: agent.id };
  if (!jobIntent || JSON.stringify(jobIntent.fields) !== JSON.stringify(fields)) jobIntent = { operation_id: crypto.randomUUID(), fields };
  const intent = jobIntent; const started = agencyEpoch;
  jobSending = true; agencyMessage = 'Enviando solicitud de trabajo…'; renderOffice();
  try {
    const result = await agencyRequest('/api/agency/jobs', { operation_id: intent.operation_id, ...fields });
    if (started !== agencyEpoch) return;
    if (!result.body.id) throw new Error('No se ha recibido un identificador de trabajo.');
    jobIntent = null; jobDraft = { title: '', instruction: '', agentId: '' };
    agencyMessage = result.body.duplicate ? 'Solicitud ya registrada. Consulta su estado en la cola.' : 'Trabajo registrado en la cola. Aún no consta un resultado.';
    await loadAgency();
  } catch (error) {
    if (started !== agencyEpoch) return;
    if (error.status === 401) { clearView('La sesión ha caducado. Vuelve a entrar.'); return; }
    if (error.status === 403) { jobIntent = null; agencyMessage = 'Trabajo denegado. Comprueba que el agente siga siendo propio, incorporado y disponible.'; }
    else if (error.status === 409) { jobIntent = null; agencyMessage = 'Conflicto: el estado del agente o de la solicitud ha cambiado. Revisa la cola antes de enviar otra vez.'; await loadAgency(); }
    else agencyMessage = 'No se ha podido confirmar el envío. Puedes reintentarlo con la misma solicitud.';
  } finally { if (started === agencyEpoch) { jobSending = false; if (snapshot) renderOffice(); } }
}
async function loadJobDetail(id) {
  const started = agencyEpoch; jobDetailMessage = 'Consultando detalle…'; jobDetail = null; renderOffice();
  try {
    const { body } = await agencyRequest(`/api/agency/jobs/${encodeURIComponent(id)}`);
    if (started !== agencyEpoch) return;
    jobDetail = body; jobDetailMessage = '';
  } catch (error) {
    if (started !== agencyEpoch) return;
    if (error.status === 401) { clearView('La sesión ha caducado. Vuelve a entrar.'); return; }
    jobDetailMessage = error.status === 403 ? 'No tienes acceso a ese trabajo.' : 'No se puede consultar el detalle del trabajo.';
  } finally { if (started === agencyEpoch && snapshot) renderOffice(); }
}
function renderJobs(panel) {
  const jobs = node('section', undefined, 'agency-jobs'); jobs.append(node('h4', 'Cola de trabajo'), agencyButton('Actualizar cola', loadAgency));
  const available = agency.agents.filter(a => a.owner_id === agency.owner_id && a.in_office && a.status === 'available');
  const form = node('form', undefined, 'agency-job-form');
  const titleLabel = node('label', 'Título de la tarea'); const title = node('input'); title.required = true; title.maxLength = 160; title.value = jobDraft.title; title.dataset.jobField = 'title';
  title.addEventListener('input', () => { jobDraft.title = title.value; jobIntent = null; }); titleLabel.append(title);
  const instructionLabel = node('label', 'Instrucciones para el agente'); const instruction = node('textarea'); instruction.required = true; instruction.maxLength = 4096; instruction.value = jobDraft.instruction; instruction.dataset.jobField = 'instruction';
  instruction.addEventListener('input', () => { jobDraft.instruction = instruction.value; jobIntent = null; }); instructionLabel.append(instruction);
  const agentLabel = node('label', 'Agente disponible'); const select = agencySelect(available.map(a => [a.id, a.name]), 'Elige un agente'); select.removeAttribute('aria-label'); select.required = true; select.value = available.some(a => a.id === jobDraft.agentId) ? jobDraft.agentId : '';
  select.dataset.jobField = 'agentId'; select.addEventListener('change', () => { jobDraft.agentId = select.value; jobIntent = null; }); agentLabel.append(select);
  const send = node('button', jobIntent ? 'Reintentar envío' : 'Enviar a la cola'); send.type = 'submit'; send.disabled = jobSending || !available.length;
  form.append(titleLabel, instructionLabel, agentLabel, send);
  form.addEventListener('submit', event => { event.preventDefault(); submitJob(); });
  jobs.append(form, node('p', 'Solo se envía al agente elegido. Estar en cola no significa que se haya ejecutado; el resultado aparece cuando lo comunica un conector autorizado.', 'hint'));
  if (!available.length) jobs.append(node('p', 'No hay agentes propios, incorporados y disponibles para recibir trabajo.', 'hint'));
  if (!agency.jobs.length) jobs.append(node('p', 'No hay trabajos registrados.', 'empty'));
  for (const job of agency.jobs) {
    const row = node('div', undefined, 'agency-job'); row.dataset.jobId = job.id;
    row.append(node('strong', job.title), node('span', jobLabel(job), `agency-job-status ${job.status}`));
    if (job.result) row.append(node('p', job.result.summary || 'Resultado comunicado sin resumen.'));
    else row.append(node('p', 'Sin resultado comunicado.', 'hint'));
    row.append(agencyButton('Ver detalle', () => loadJobDetail(job.id))); jobs.append(row);
  }
  if (jobDetailMessage) jobs.append(node('p', jobDetailMessage, 'hint'));
  if (jobDetail) {
    const detail = node('section', undefined, 'agency-job-detail'); detail.append(node('h5', 'Detalle del trabajo'), node('strong', jobDetail.title), node('p', jobLabel(jobDetail)));
    detail.append(node('p', jobDetail.result ? jobDetail.result.summary || 'Resultado comunicado sin resumen.' : 'Sin resultado comunicado.', 'hint'));
    detail.append(agencyButton('Cerrar detalle', () => { jobDetail = null; renderOffice(); })); jobs.append(detail);
  }
  panel.append(jobs);
}
async function registerConnector() {
  if (pairingBusy || !pairingOpen || !snapshot) return;
  if (!pairingIntent || pairingIntent.runtime !== pairingRuntime) pairingIntent = { operation_id: crypto.randomUUID(), runtime: pairingRuntime };
  const intent = pairingIntent; const started = agencyEpoch;
  pairingBusy = true; pairingMessage = 'Solicitando emparejamiento…'; renderOffice();
  try {
    const { body } = await agencyRequest('/api/agency/connectors', intent);
    if (started !== agencyEpoch) return;
    pairingIntent = null;
    pairingToken = typeof body.token === 'string' ? body.token : null;
    pairingMessage = pairingToken ? 'Token emitido una sola vez. Entrégalo manualmente al cliente autorizado del runtime; al cerrar este panel no podrás volver a verlo.' : 'El conector ya estaba registrado. El token anterior no se puede recuperar desde Office.';
    await loadAgency();
  } catch (error) {
    if (started !== agencyEpoch) return;
    if (error.status === 401) { clearView('La sesión ha caducado. Vuelve a entrar.'); return; }
    if (error.status === 403 || error.status === 409) pairingIntent = null;
    pairingMessage = error.status === 403 ? 'Emparejamiento denegado.' : error.status === 409 ? 'Conflicto de emparejamiento. Revisa el runtime elegido.' : 'No se ha confirmado el emparejamiento. Puedes reintentar la misma solicitud.';
  } finally { if (started === agencyEpoch) { pairingBusy = false; if (snapshot) renderOffice(); } }
}
function renderPairing(panel) {
  const open = agencyButton('Conectar runtime externo', () => { pairingOpen = !pairingOpen; if (!pairingOpen) { pairingToken = null; pairingMessage = ''; pairingIntent = null; } renderOffice(); });
  open.setAttribute('aria-expanded', String(pairingOpen)); panel.append(open);
  if (!pairingOpen) return;
  const box = node('section', undefined, 'agency-pairing'); box.append(node('h4', 'Emparejar un cliente autorizado'), node('p', 'Este paso registra un conector. El runtime externo se conecta con su propio cliente autorizado. El navegador no crea perfiles, instala claves ni inicia agentes.', 'hint'));
  const form = node('form'); const label = node('label', 'Runtime del cliente'); const select = node('select');
  for (const [value, name] of [['hermes', 'Hermes'], ['claude-code', 'Claude Code']]) { const option = node('option', name); option.value = value; select.append(option); }
  select.value = pairingRuntime; select.addEventListener('change', () => { pairingRuntime = select.value; pairingIntent = null; pairingToken = null; }); label.append(select);
  const send = node('button', pairingIntent ? 'Reintentar emparejamiento' : 'Emitir token de emparejamiento'); send.type = 'submit'; send.disabled = pairingBusy;
  form.append(label, send); form.addEventListener('submit', event => { event.preventDefault(); registerConnector(); }); box.append(form);
  if (pairingMessage) { const message = node('p', pairingMessage); message.setAttribute('role', 'status'); box.append(message); }
  if (pairingToken) { const tokenLabel = node('p', 'Token de emparejamiento'); const value = node('code', pairingToken); box.append(tokenLabel, value); }
  panel.append(box);
}
function agencyButton(label, handler) { const b = node('button', label); b.type = 'button'; b.addEventListener('click', handler); return b; }
function agencySelect(items, placeholder) {
  const select = node('select'); select.setAttribute('aria-label', placeholder);
  const empty = node('option', placeholder); empty.value = ''; select.append(empty);
  for (const [value, label] of items) { const option = node('option', label); option.value = value; select.append(option); }
  return select;
}
function assignAgent(id, sectionId) {
  const agent = agency?.agents.find(a => a.id === id);
  if (!agent || agent.owner_id !== agency.owner_id || !agent.in_office || agent.status !== 'available' || !agency.capabilities?.assign || !agency.sections.some(s => s.id === sectionId) || agencyMutating) return;
  agencyAction(`/api/agency/agents/${encodeURIComponent(id)}/assign`, { job_id: null, section_id: sectionId, expected_version: agent.version });
}
function renderAgency() {
  const panel = node('section', undefined, 'card agency-panel');
  panel.append(node('h3', 'Agencia y secciones'));
  const message = node('p', agencyMessage, 'hint'); message.setAttribute('role', 'status'); panel.append(message);
  if (!agency) { panel.append(node('p', agencyLoading ? 'Consultando la agencia…' : 'Agencia sin conexión o sin datos.', 'hint'), agencyButton('Reintentar', loadAgency)); return panel; }
  panel.append(node('p', `Última observación: ${agency.observed_at || 'no disponible'}`, 'hint'));
  renderJobs(panel);
  renderPairing(panel);
  const form = node('form'); form.className = 'agency-create';
  const name = node('input'); name.placeholder = 'Nombre de la sección'; name.setAttribute('aria-label', 'Nombre de la sección'); name.maxLength = 120; name.required = true;
  const create = node('button', 'Crear sección'); create.type = 'submit'; create.disabled = agencyMutating;
  form.append(name, create); form.addEventListener('submit', event => { event.preventDefault(); const value = name.value.trim(); if (value) agencyAction('/api/agency/sections', { name: value }); }); panel.append(form);
  const sections = node('div', undefined, 'agency-sections');
  if (!agency.sections.length) sections.append(node('p', 'No hay secciones.', 'empty'));
  for (const section of agency.sections) {
    const zone = node('section', undefined, 'agency-section'); zone.dataset.sectionId = section.id;
    zone.append(node('h4', section.name));
    const occupants = agency.agents.filter(a => a.in_office && a.section_id === section.id);
    zone.append(node('p', occupants.length ? occupants.map(a => a.name).join(', ') : 'Sin agentes asignados', 'hint'));
    zone.addEventListener('dragover', event => { event.preventDefault(); });
    zone.addEventListener('drop', event => { event.preventDefault(); assignAgent(event.dataTransfer.getData('text/plain'), section.id); });
    sections.append(zone);
  }
  panel.append(sections);
  if (!agency.agents.length) panel.append(node('p', 'Aún no hay agentes visibles.', 'empty'));
  for (const agent of agency.agents) {
    const own = agent.owner_id === agency.owner_id;
    const eligible = own && agent.in_office && agent.status === 'available' && agency.capabilities?.assign && !agencyMutating;
    const card = node('div', undefined, 'agency-agent'); card.dataset.agentId = agent.id;
    const avatar = agencyButton((agent.name || '?').slice(0, 1).toLocaleUpperCase('es'), () => { selectedAgent = agent.id; renderOffice(); });
    avatar.className = 'avatar agency-avatar'; avatar.setAttribute('aria-label', `Seleccionar ${agent.name}`); avatar.setAttribute('aria-pressed', String(selectedAgent === agent.id)); avatar.draggable = Boolean(eligible);
    avatar.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', agent.id));
    const info = node('div'); info.append(node('strong', agent.name), node('p', `${agent.status} · ${agent.in_office ? 'en la oficina' : 'fuera de la oficina'} · ${agency.sections.find(s => s.id === agent.section_id)?.name || 'sin sección'}${own ? '' : ' · solo lectura'}`, 'hint'));
    if (own && agent.status === 'offline') {
      const reasons = { auth_unavailable:'Falta autenticar el proveedor', runtime_unavailable:'Runtime no disponible', provider_unavailable:'Proveedor no disponible', executable_unavailable:'Ejecutable no disponible', probe_failed:'No se pudo comprobar la disponibilidad' };
      const reason = Object.hasOwn(reasons, agent.reason_code) ? reasons[agent.reason_code] : null;
      info.append(node('p', reason || 'Sin conexión o sin un diagnóstico vigente.', 'hint'));
      if (reason) {
        const help = node('details'); help.append(node('summary', 'Cómo resolverlo'));
        help.append(node('p', 'El titular debe preparar la autenticación del proveedor en su perfil Office y comprobar el runtime y su conexión. No envíes tokens por chat ni por la web.', 'hint'));
        info.append(help);
      }
    }
    card.append(avatar, info);
    if (own) {
      const membership = agencyButton(agent.in_office ? 'Retirar' : 'Incorporar', () => agencyAction(`/api/agency/agents/${encodeURIComponent(agent.id)}/membership`, { in_office: !agent.in_office, expected_version: agent.version })); membership.disabled = agencyMutating; card.append(membership);
      const section = agencySelect(agency.sections.map(s => [s.id, s.name]), `Sección para ${agent.name}`); section.disabled = !eligible;
      const assign = agencyButton('Asignar', () => { if (section.value) assignAgent(agent.id, section.value); else { agencyMessage = 'Elige una sección.'; renderOffice(); } }); assign.disabled = !eligible;
      card.append(section, assign);
    }
    panel.append(card);
  }
  panel.append(node('p', 'Los agentes los comunica un cliente de runtime autorizado. El navegador no crea perfiles ni instala claves.', 'hint'));
  return panel;
}
async function login(key) {
  try {
    await api('/api/session', { key }); $('access-key').value = '';
    // La vista no carga datos en una pestaña oculta; decirlo en vez de no mostrar nada.
    if (document.hidden) { tell('Sesión iniciada. Los datos se cargarán al volver a esta pestaña.'); return; }
    await refresh();
  }
  catch (error) { clearView(error.message); }
}
for (const name of ['office', 'work', 'about']) $(`nav-${name}`).addEventListener('click', () => show(name));
for (const button of document.querySelectorAll('[data-login]')) button.addEventListener('click', () => login(button.dataset.login));
$('key-login').addEventListener('submit', event => { event.preventDefault(); login($('access-key').value); });
$('logout').addEventListener('click', async () => { try { await api('/api/logout', {}); } finally { clearView('Sesión cerrada.'); } });
$('refresh').addEventListener('click', refresh); $('search').addEventListener('input', renderBoard);
$('close-detail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => { detailId = null; $('detail-content').replaceChildren(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) clearView(); else refresh(); });
window.addEventListener('pagehide', () => clearView()); window.addEventListener('pageshow', () => { if (info) refresh(); });
window.addEventListener('offline', () => clearView('Sin conexión. Se han retirado los datos.'));
const help = $('about-view');
help.replaceChildren(
  node('h2', 'Ayuda y estado real'),
  node('p', 'Esta oficina muestra los datos que devuelve el servidor para la sesión actual. En evaluación, los propietarios, agentes y resultados de prueba son sintéticos.'),
  node('h3', 'Cola de trabajo'),
  node('p', 'Puedes enviar una instrucción a un agente propio, incorporado y disponible. La cola conserva el encargo; «En cola» no significa que haya empezado. «En ejecución» requiere un claim vigente y el resultado solo aparece cuando un conector autorizado lo comunica. Si caduca el lease, se muestra «Estado desconocido» sin reejecución automática.'),
  node('h3', 'Conectar un runtime'),
  node('p', 'El panel de emparejamiento emite un token una sola vez. Debes entregarlo manualmente a un cliente externo autorizado de Hermes o Claude Code. El navegador no crea perfiles, no instala claves y no ejecuta herramientas.'),
  node('h3', 'Límites'),
  node('p', 'La escena representa estados recibidos; no acredita por sí sola trabajo. La vista de GitHub mantiene sus propios permisos y la agencia guarda sus trabajos en el servidor cuando está configurada. Este recorrido local no acredita despliegue, conexión bilateral real ni aceptación de producto.')
);
try {
  info = await api('/api/info'); $('mode').textContent = info.mode === 'demo' ? 'Evaluación local' : 'GitHub · lectura';
  $('demo-login').hidden = info.mode !== 'demo'; $('key-login').hidden = info.mode !== 'live';
  await refresh();
} catch { clearView('No se puede acceder al servicio local de Office.'); }
