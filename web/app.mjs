const $ = id => document.getElementById(id);
const labels = { requested: 'Solicitada', accepted: 'Aceptada', delivered: 'Entregada', reviewed: 'Revisada', blocked: 'Bloqueada', unavailable: 'No verificable' };
const chain = ['requested', 'accepted', 'delivered', 'reviewed'];
let detailId = null;
let info; let snapshot = null; let teamQueue = null; let presence = null; let view = 'office'; let events; let refreshTimer; let expiryTimer; let refreshing = false; let epoch = 0;
let disposeScene = () => {};
let prefer3D = false;
let selectedAgent = null;
let agency = null; let agencyEpoch = 0; let agencyTimer; let agencyMessage = ''; let agencyLoading = false; let agencyMutating = false;
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
  selectedAgent = null; agencyEpoch++; agency = null; agencyMessage = ''; agencyLoading = false; agencyMutating = false; clearTimeout(agencyTimer);
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
  disposeScene(); disposeScene = () => {};
  const root = $('office-view'); root.replaceChildren();
  const heading = node('div', undefined, 'section-head'); const intro = node('div');
  intro.append(node('span', 'EL LUGAR DONDE LAS IDEAS SE ENCUENTRAN', 'eyebrow'), node('h2', 'Tu campus, con contexto.'), node('p', 'Proyectos compartidos. Responsabilidades claras. Evidencias a un clic.'));
  heading.append(intro);
  const help = agencyButton('Ayuda', () => show('about'));
  const feedback = node('a', 'Opinar'); feedback.href = 'https://github.com/EspacioKoop/espaciokoop-office/issues/1'; feedback.target = '_blank'; feedback.rel = 'noopener noreferrer';
  heading.append(help, feedback); root.append(heading);
  root.append(renderAgency());
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
    card.append(avatar, info);
    if (own) {
      const membership = agencyButton(agent.in_office ? 'Retirar' : 'Incorporar', () => agencyAction(`/api/agency/agents/${encodeURIComponent(agent.id)}/membership`, { in_office: !agent.in_office, expected_version: agent.version })); membership.disabled = agencyMutating; card.append(membership);
      const section = agencySelect(agency.sections.map(s => [s.id, s.name]), `Sección para ${agent.name}`); section.disabled = !eligible;
      const assign = agencyButton('Asignar', () => { if (section.value) assignAgent(agent.id, section.value); else { agencyMessage = 'Elige una sección.'; renderOffice(); } }); assign.disabled = !eligible;
      card.append(section, assign);
    }
    panel.append(card);
  }
  panel.append(node('p', 'Crear y conectar agentes y asignar tareas aún no está disponible en esta fase.', 'hint'));
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
try {
  info = await api('/api/info'); $('mode').textContent = info.mode === 'demo' ? 'Evaluación local' : 'GitHub · lectura';
  $('demo-login').hidden = info.mode !== 'demo'; $('key-login').hidden = info.mode !== 'live';
  await refresh();
} catch { clearView('No se puede acceder al servicio local de Office.'); }
