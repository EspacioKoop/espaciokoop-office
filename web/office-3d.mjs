import * as THREE from '/vendor/three.module.min.js';

// Escena propia: solo representa datos autorizados del último snapshot.
export function mountOffice3D(container, agency, actions = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x233640);
  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const geometries = []; const materials = [];
  function box(x, y, z, w, h, d, color) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    geometries.push(geometry); materials.push(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  }
  scene.add(new THREE.HemisphereLight(0xe5f6ff, 0x536b61, 2));
  const sun = new THREE.DirectionalLight(0xffedcf, 2); sun.position.set(5, 12, 8); scene.add(sun);
  box(0, -0.25, 0, 14, 0.5, 9, 0x927a62);
  box(0, 1.1, -4.5, 14, 2.2, 0.25, 0x728b83);
  box(-7, 1.1, 0, 0.25, 2.2, 9, 0x728b83);
  box(-2.3, 0.02, 0, 0.12, 0.04, 8.8, 0xe0cda8);
  box(2.3, 0.02, 0, 0.12, 0.04, 8.8, 0xe0cda8);
  // Tres áreas amuebladas; sus formas y colores no indican actividad.
  for (const x of [-4.6, 0, 4.6]) {
    box(x, 0.55, -0.6, 2.5, 0.15, 1.25, 0xcaa779);
    for (const dx of [-1, 1]) for (const dz of [-0.4, 0.4]) box(x + dx, 0.26, -0.6 + dz, 0.12, 0.52, 0.12, 0x4f5350);
    box(x, 0.8, -0.9, 0.95, 0.55, 0.08, 0x344e5b);
    box(x, 0.35, 1, 0.8, 0.2, 0.8, 0x799c91);
    box(x, 0.75, 1.35, 0.8, 0.8, 0.12, 0x799c91);
  }
  for (const x of [-5.8, 5.8]) {
    box(x, 0.3, 3, 0.5, 0.6, 0.5, 0xb87e59);
    box(x, 0.9, 3, 0.8, 0.8, 0.8, 0x70a17a);
  }
  box(0, 1, -4.25, 2.5, 1.65, 0.2, 0x4d6a61);
  const targets = []; const people = [];
  const sections = agency?.sections || [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(sections.length)));
  const rows = Math.max(1, Math.ceil(sections.length / columns));
  function position(index) { return { x: -5.5 + (index % columns + 0.5) * 11 / columns, z: -3.4 + (Math.floor(index / columns) + 0.5) * 6.8 / rows }; }
  sections.forEach((section, index) => {
    const p = position(index);
    const target = box(p.x, 0.06, p.z, Math.min(10 / columns, 2), 0.06, Math.min(6 / rows, 1.5), 0x629d85);
    target.userData.sectionId = section.id; targets.push(target);
  });
  const agents = agency?.agents.filter(a => a.in_office) || [];
  agents.forEach((agent, index) => {
    const sectionIndex = sections.findIndex(s => s.id === agent.section_id);
    const p = sectionIndex < 0 ? { x: -5.5 + (index % 12), z: 3.7 } : position(sectionIndex);
    const offset = agents.slice(0, index).filter(a => a.section_id === agent.section_id).length;
    const person = box(p.x + (offset % 3 - 1) * 0.35, 0.5, p.z + Math.floor(offset / 3) * 0.3, 0.24, 0.8, 0.24, agent.status === 'online' ? 0xb2e0c7 : 0x87949c);
    person.userData.agentId = agent.id; people.push(person);
  });
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let dragged = null;
  function hit(event, objects) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(objects)[0]?.object;
  }
  function down(event) { dragged = hit(event, people)?.userData.agentId || null; }
  function up(event) {
    if (!dragged) return;
    const section = hit(event, targets)?.userData.sectionId;
    const person = hit(event, people)?.userData.agentId;
    if (section && person !== dragged) actions.assign?.(dragged, section);
    else actions.select?.(dragged);
    dragged = null;
  }
  renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up);
  let angle = Math.PI / 4;
  function draw() {
    if (!container.isConnected) return;
    const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;
    camera.left = -6 * aspect; camera.right = 6 * aspect; camera.top = 6; camera.bottom = -6;
    camera.position.set(16 * Math.sin(angle), 14, 16 * Math.cos(angle));
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); renderer.render(scene, camera);
  }
  container.replaceChildren(renderer.domElement);
  const observer = new ResizeObserver(draw); observer.observe(container); draw();
  return {
    rotate(direction) { angle += direction * Math.PI / 4; draw(); },
    dispose() { renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); observer.disconnect(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); renderer.dispose(); renderer.domElement.remove(); }
  };
}
