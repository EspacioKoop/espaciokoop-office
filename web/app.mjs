const $ = id => document.getElementById(id);
const labels = { requested: 'Solicitada', accepted: 'Aceptada', delivered: 'Entregada', reviewed: 'Revisada', blocked: 'Bloqueada', unavailable: 'No verificable' };
const chain = ['requested', 'accepted', 'delivered', 'reviewed'];
let info; let snapshot = null; let view = 'office'; let events; let refreshTimer; let expiryTimer; let refreshing = false; let epoch = 0;
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
  epoch++; snapshot = null; clearTimeout(refreshTimer); clearTimeout(expiryTimer);
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
  const root = $('office-view'); root.replaceChildren();
  const heading = node('div', undefined, 'section-head'); const intro = node('div');
  intro.append(node('span', 'EL LUGAR DONDE LAS IDEAS SE ENCUENTRAN', 'eyebrow'), node('h2', 'Tu campus, con contexto.'), node('p', 'Proyectos compartidos. Responsabilidades claras. Evidencias a un clic.'));
  heading.append(intro); root.append(heading);
  const campus = node('div', undefined, 'campus'); const scene = node('section', undefined, 'scene-card');
  const sceneMeta = node('div', undefined, 'scene-meta'); sceneMeta.append(node('h3', 'El espacio común'), node('span', 'Vista ambiental · sin telemetría'));
  const image = node('img'); image.src = '/office.svg'; image.alt = 'Ilustración original de la oficina: talleres, mesa compartida, biblioteca y plantas. No muestra agentes reales.';
  scene.append(sceneMeta, image, node('div', 'La escena es una representación ambiental. La actividad real se consulta en los proyectos, no se deduce de los personajes.', 'scene-caption'));
  const teams = node('section', undefined, 'card team-panel'); teams.append(node('h3', 'Equipos incorporados'));
  snapshot.members.forEach((member, index) => {
    const card = node('div', undefined, 'team-card'); const avatar = node('div', member.label.split(' ').at(-1).slice(0, 1), `avatar ${index % 2 ? 'alt' : ''}`); avatar.setAttribute('aria-hidden', 'true');
    const text = node('div'); text.append(node('strong', member.label), node('small', member.githubLogin), node('small', 'Cuenta compartida'), node('small', 'Presencia no disponible'));
    card.append(avatar, text); teams.append(card);
  });
  teams.append(node('p', snapshot.mode === 'demo' ? 'Equipos ficticios de evaluación. Ningún nombre representa una identidad real.' : 'No se infiere identidad individual, conexión o disponibilidad a partir de una cuenta de GitHub.', 'hint'));
  campus.append(scene, teams); root.append(campus);
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
function renderBoard() {
  const root = $('board'); root.replaceChildren(); if (!snapshot) return;
  const query = $('search').value.toLocaleLowerCase('es');
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
  $('detail').showModal();
}
function watchSession() {
  if (events) events.close();
  events = new EventSource('/api/events');
  events.addEventListener('revoke', () => clearView('La política o el acceso ha cambiado. La vista se ha retirado.'));
  events.onerror = () => clearView('Se ha perdido la señal de sesión. La vista se ha retirado; vuelve a entrar.');
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true; const started = epoch;
  try {
    const data = await api('/api/snapshot');
    if (started !== epoch || document.hidden) return;
    snapshot = data;
    $('account-name').textContent = data.members.find(m => m.id === data.memberId)?.label ?? 'Equipo autorizado';
    $('refresh').hidden = false; $('logout').hidden = false;
    $('updated').textContent = `Verificado a las ${new Date(data.generatedAt).toLocaleTimeString('es-ES')}`;
    renderOffice(); renderBoard(); show(view);
    tell(data.mode === 'demo' ? 'MODO DE EVALUACIÓN · Datos sintéticos. No hay agentes reales conectados ni llamadas a modelos.' : 'SOLO LECTURA · Selección explícita de metadatos; las operaciones se realizan en GitHub.');
    clearTimeout(expiryTimer); clearTimeout(refreshTimer);
    expiryTimer = setTimeout(() => clearView('La vista ha caducado sin una comprobación nueva. Datos retirados.'), Math.max(0, data.expiresAt - Date.now()));
    refreshTimer = setTimeout(refresh, 9000);
    if (!events) watchSession();
  } catch (error) { clearView(error.code === 'AUTH' ? '' : error.message); }
  finally { refreshing = false; }
}
async function login(key) {
  try { await api('/api/session', { key }); $('access-key').value = ''; await refresh(); }
  catch (error) { clearView(error.message); }
}
for (const name of ['office', 'work', 'about']) $(`nav-${name}`).addEventListener('click', () => show(name));
for (const button of document.querySelectorAll('[data-login]')) button.addEventListener('click', () => login(button.dataset.login));
$('key-login').addEventListener('submit', event => { event.preventDefault(); login($('access-key').value); });
$('logout').addEventListener('click', async () => { try { await api('/api/logout', {}); } finally { clearView('Sesión cerrada.'); } });
$('refresh').addEventListener('click', refresh); $('search').addEventListener('input', renderBoard);
$('close-detail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => $('detail-content').replaceChildren());
document.addEventListener('visibilitychange', () => { if (document.hidden) clearView(); else refresh(); });
window.addEventListener('pagehide', () => clearView()); window.addEventListener('pageshow', () => { if (info) refresh(); });
window.addEventListener('offline', () => clearView('Sin conexión. Se han retirado los datos.'));
try {
  info = await api('/api/info'); $('mode').textContent = info.mode === 'demo' ? 'Evaluación local' : 'GitHub · lectura';
  $('demo-login').hidden = info.mode !== 'demo'; $('key-login').hidden = info.mode !== 'live';
  await refresh();
} catch { clearView('No se puede acceder al servicio local de Office.'); }
