import * as THREE from 'three';
import '../transit-data.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f8f5ed');
// Orthographic projection keeps parallel chart planes the same apparent size,
// which is essential for a mathematically exact front overlap.
const camera = new THREE.OrthographicCamera(-300, 300, 300, -300, 1, 3000);
camera.position.set(0, 0, 820);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.035;
controls.rotateSpeed = 0.65;
controls.target.set(0, 0, 0);
controls.minDistance = 330;
controls.maxDistance = 1450;
controls.minZoom = 0.45;
controls.maxZoom = 3;
controls.update();
function lockOrbitElevation() {
  const offset = camera.position.clone().sub(controls.target);
  const elevation = Math.acos(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1));
  controls.minPolarAngle = elevation;
  controls.maxPolarAngle = elevation;
}
lockOrbitElevation();

const chartRoot = new THREE.Group();
scene.add(chartRoot);
const planeGroups = {};
const summaryLabels = {};
let relationshipGroup = null;
const transitGroups = {};
const familyGroups = {};
let familyChildren = [];
let transitSnapshot = null;
const transitToggle = document.querySelector('#showTransits');
try {
  transitToggle.checked = localStorage.getItem('castalia-hd-show-transits') !== 'false';
} catch {
  transitToggle.checked = true;
}
let sourceDocument = null;
let loader = null;
const gateDescriptions = new Map();
const channelDescriptions = new Map();
let rebuildTimer = null;
let exactFrontAlignment = true;
let frontPerson = 'daniel';
const flowAnimations = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const colors = { daniel: new THREE.Color('#087fa5'), camille: new THREE.Color('#cf4f79') };
const childPalette = ['#488f73', '#b67a37', '#7864a6', '#518a9d'].map(color => new THREE.Color(color));
function chartColor(person) {
  if (colors[person]) return colors[person];
  const childIndex = Math.max(0, familyChildren.findIndex(child => child.id === person));
  return childPalette[childIndex % childPalette.length];
}
function gatesFor(person) {
  if (person === 'daniel') return parseGateList('#danielGates');
  if (person === 'camille') return parseGateList('#camilleGates');
  return new Set(familyChildren.find(child => child.id === person)?.gates || []);
}
function summarizeChart(gates, activations) {
  const template = sourceDocument?.querySelector('.person--daniel');
  if (!template) return null;
  const gateCenters = new Map([...template.querySelectorAll('.gate[data-gate][data-center]')]
    .map(gate => [+gate.dataset.gate, gate.dataset.center]));
  const adjacent = new Map();
  const definedCenters = new Set();
  const connect = (a, b) => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a).add(b); adjacent.get(b).add(a);
    definedCenters.add(a); definedCenters.add(b);
  };
  for (const channel of template.querySelectorAll('.channel-group[data-from][data-to]')) {
    const from = +channel.dataset.from, to = +channel.dataset.to;
    if (!gates.has(from) || !gates.has(to)) continue;
    const fromCenter = gateCenters.get(from), toCenter = gateCenters.get(to);
    if (fromCenter && toCenter) connect(fromCenter, toCenter);
  }
  const centersConnected = (a, b) => {
    const pending = [a], visited = new Set();
    while (pending.length) {
      const center = pending.pop();
      if (center === b) return true;
      if (visited.has(center)) continue;
      visited.add(center);
      pending.push(...(adjacent.get(center) || []));
    }
    return false;
  };
  const motorToThroat = ['root', 'sacral', 'ego', 'solar'].some(center => definedCenters.has(center) && centersConnected(center, 'throat'));
  let type = 'Reflector';
  if (definedCenters.size) {
    if (definedCenters.has('sacral')) type = motorToThroat ? 'Manifesting Generator' : 'Generator';
    else type = motorToThroat ? 'Manifestor' : 'Projector';
  }
  let authority = 'Mental';
  if (definedCenters.has('solar')) authority = 'Emotional';
  else if (definedCenters.has('sacral')) authority = 'Sacral';
  else if (definedCenters.has('spleen')) authority = 'Splenic';
  else if (definedCenters.has('ego')) authority = 'Ego';
  else if (definedCenters.has('g') && centersConnected('g', 'throat')) authority = 'Self-Projected';
  else if (type === 'Reflector') authority = 'Lunar';
  const personalitySun = activations.find(item => item.type === 'personality' && item.planet === 'sun');
  const designSun = activations.find(item => item.type === 'design' && item.planet === 'sun');
  const profile = personalitySun && designSun ? `${personalitySun.line}/${designSun.line}` : '';
  return { type, authority, profile, label: `${profile ? `${profile} · ` : ''}${authority} ${type}` };
}
function makeSummaryLabel(person, gates, activations, color, x, y, z, scale = 1) {
  const summary = summarizeChart(gates, activations);
  if (!summary) return null;
  const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  const canvas = document.createElement('canvas');
  canvas.width = 520; canvas.height = 108;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,253,247,.96)';
  ctx.beginPath(); ctx.roundRect(3, 3, 514, 102, 18); ctx.fill();
  ctx.strokeStyle = color.getStyle(); ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#746e61'; ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(owner, 22, 36, 476);
  ctx.fillStyle = '#292820';
  let summaryFontSize = 32;
  ctx.font = `700 ${summaryFontSize}px system-ui, sans-serif`;
  while (ctx.measureText(summary.label).width > 476 && summaryFontSize > 21) {
    summaryFontSize--;
    ctx.font = `700 ${summaryFontSize}px system-ui, sans-serif`;
  }
  ctx.fillText(summary.label, 22, 76, 476);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  label.scale.set(150 * scale, 31 * scale, 1);
  label.position.set(x, y, z);
  label.renderOrder = 20;
  label.userData.summary = summary;
  return label;
}
const pale = new THREE.Color('#fffcf5');
const gray = new THREE.Color('#96928a');
const relationshipChannelReadings = {
  '47-64': { name: 'Abstraction', description: 'Past images and experiences may feel confusing at first, then settle into a story or meaning with time.' },
  '24-61': { name: 'Awareness', description: 'A private pull toward life’s mysteries can circle through the mind until an insight arrives; it may not yield a tidy answer on demand.' },
  '4-63': { name: 'Logic', description: 'Doubt and questioning can become hypotheses or practical answers that are tested against evidence.' },
  '23-43': { name: 'Structuring', description: 'An unusual insight can be put into plain words; timing and willingness to hear it affect how it lands.' },
  '17-62': { name: 'Acceptance', description: 'Patterns and opinions can be organized into specific details and explained clearly.' },
  '11-56': { name: 'Curiosity', description: 'Ideas become stimulation and stories: experiences can be shared for interest and perspective, rather than as fixed facts.' },
  '1-8': { name: 'Inspiration', description: 'Distinctive self-expression can contribute something original and encourage others through example.' },
  '7-31': { name: 'Alpha', description: 'Direction for a group can find a voice when others recognize and invite that leadership.' },
  '13-33': { name: 'The Prodigal', description: 'Listening and remembering experiences can be followed by privacy, reflection, and sharing the story at the right time.' },
  '10-20': { name: 'Awakening', description: 'Self-directed behavior is expressed in the present moment; the theme is living what feels true, here and now.' },
  '21-45': { name: 'Money', description: 'Managing resources and gathering material support meet questions of stewardship, ownership, and who speaks for the group.' },
  '12-22': { name: 'Openness', description: 'Emotional mood shapes expression and social openness; the voice may be available at some moments and quiet at others.' },
  '35-36': { name: 'Transitoriness', description: 'Desire for change meets emotional experience: new experiences can bring growth, uncertainty, and lessons learned by living through them.' },
  '16-48': { name: 'Wavelength', description: 'Depth becomes skill through practice, and practiced skill finds a way to be expressed.' },
  '20-57': { name: 'Brainwave', description: 'Intuitive awareness can be voiced in the moment as a spontaneous sense of what is happening now.' },
  '20-34': { name: 'Charisma', description: 'Sacral energy can move directly into action in the present when there is a genuine response and energy to act.' },
  '10-34': { name: 'Exploration', description: 'Personal power is expressed through behavior that follows one’s own nature; action becomes a way of discovering the self.' },
  '2-14': { name: 'The Beat', description: 'Resources and life-force can support a sense of direction, helping energy move toward work that feels aligned.' },
  '5-15': { name: 'Rhythm', description: 'Fixed rhythms meet the full range of human pace and extremes; coordination works best when each person’s natural timing is respected.' },
  '29-46': { name: 'Discovery', description: 'Commitment opens the way to embodied experience; discernment about what to say yes to matters.' },
  '10-57': { name: 'Perfected Form', description: 'Present-moment intuition can guide behavior toward what feels correct and supportive of wellbeing.' },
  '25-51': { name: 'Initiation', description: 'Openness to experience meets shock or challenge; surprising moments can awaken courage and shift perspective.' },
  '37-40': { name: 'Community', description: 'Care, loyalty, and shared agreements meet willpower and contribution; clear reciprocity and time to rest matter.' },
  '26-44': { name: 'Surrender', description: 'Recognition of patterns from the past can combine with persuasive transmission to support the group’s material needs.' },
  '3-60': { name: 'Mutation', description: 'New beginnings emerge in pulses within real limits; progress may come in irregular bursts rather than a steady line.' },
  '9-52': { name: 'Concentration', description: 'Stillness and focused attention can hold energy on details long enough for sustained work.' },
  '42-53': { name: 'Maturation', description: 'Beginnings and growth form cycles: development includes staying with a process through its stages and completion.' },
  '34-57': { name: 'Power', description: 'Instinctive awareness can guide powerful, immediate action; listening to the body’s present signal is central.' },
  '27-50': { name: 'Preservation', description: 'Care and nourishment meet values and responsibility, highlighting how a group sustains its members.' },
  '6-59': { name: 'Intimacy', description: 'Breaking barriers can create closeness, while emotional friction helps define trust, boundaries, and intimacy.' },
  '18-58': { name: 'Judgment', description: 'Vitality and a sense of what could improve meet correction; useful feedback depends on timing and receptivity.' },
  '28-38': { name: 'Struggle', description: 'Resistance is energized by the search for purpose; effort feels worthwhile when it serves something meaningful.' },
  '32-54': { name: 'Transformation', description: 'Ambition meets instinct for what can endure, bringing attention to which efforts have potential to grow.' },
  '30-41': { name: 'Recognition', description: 'Imagination and desire can concentrate into the urge to begin an emotional experience and discover what it brings.' },
  '39-55': { name: 'Emoting', description: 'Provocation can stir emotional spirit and mood; this individual current moves in waves and cannot be forced.' },
  '19-49': { name: 'Synthesis', description: 'Sensitivity to needs meets principles and emotional boundaries, bringing questions of belonging, support, and change.' }
};
const centerDescriptions = {
  head: ['Head', 'Inspiration, questions, and mental pressure.'],
  ajna: ['Ajna', 'Conceptualizing, interpreting, and organizing ideas.'],
  throat: ['Throat', 'Communication and expression into action.'],
  g: ['G', 'Identity, direction, and the experience of love.'],
  ego: ['Heart / Ego', 'Willpower, promises, and material resources.'],
  spleen: ['Spleen', 'Instinct, intuition, and wellbeing in the present.'],
  solar: ['Solar Plexus', 'Emotional experience and emotional awareness.'],
  sacral: ['Sacral', 'Life-force, response, work, and sustainable energy.'],
  root: ['Root', 'Pressure, drive, and the energy to get moving.']
};

function setStatus(message) { status.textContent = message; }
function ancestorWith(node, selector) { return node?.closest?.(selector) || null; }
function gateGroup(node) { return ancestorWith(node, '.gate'); }
function channelGroup(node) { return ancestorWith(node, '.channel-group'); }
function centerGroup(node) { return ancestorWith(node, '.center'); }
function personFor(node) { return ancestorWith(node, '.person--daniel') ? 'daniel' : 'camille'; }
function addShapeMesh(target, shape, material, z, hover = null) {
  // Keep curved SVG boundaries smooth enough to meet the sampled outline.
  const geometry = new THREE.ShapeGeometry(shape, 32);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.userData.svgPart = true;
  if (hover) Object.assign(mesh.userData, hover);
  target.add(mesh);
  return mesh;
}
function tubeFromPoints(points, radius, material, z) {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, p.y, z)), false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(12, points.length * 2), radius, 5, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.svgPart = true;
  return mesh;
}
function dashedTubesFromPoints(points, radius, material, z, dashLength = 7, gapLength = 4) {
  if (points.length < 2) return [];
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = lengths[lengths.length - 1];
  const pointAt = distance => {
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index++;
    const span = lengths[index] - lengths[index - 1] || 1;
    const t = (distance - lengths[index - 1]) / span;
    return {
      x: THREE.MathUtils.lerp(points[index - 1].x, points[index].x, t),
      y: THREE.MathUtils.lerp(points[index - 1].y, points[index].y, t)
    };
  };
  const meshes = [];
  for (let start = 0; start < total; start += dashLength + gapLength) {
    const end = Math.min(start + dashLength, total);
    const segment = [pointAt(start)];
    for (let distance = start + 1.5; distance < end; distance += 1.5) segment.push(pointAt(distance));
    segment.push(pointAt(end));
    const curve = new THREE.CatmullRomCurve3(segment.map(point => new THREE.Vector3(point.x, point.y, z)), false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(4, segment.length * 2), radius, 5, false), material);
    mesh.userData.svgPart = true;
    meshes.push(mesh);
  }
  return meshes;
}
function dashedTubesFromCurve(curve, radius, material, dashLength = 7, gapLength = 4) {
  const total = curve.getLength();
  if (!Number.isFinite(total) || total <= 0) return [];
  const meshes = [];
  for (let start = 0; start < total; start += dashLength + gapLength) {
    const end = Math.min(start + dashLength, total);
    const divisions = Math.max(2, Math.ceil((end - start) / 1.5));
    const points = [];
    for (let index = 0; index <= divisions; index++) {
      const distance = start + (end - start) * index / divisions;
      points.push(curve.getPointAt(distance / total));
    }
    const segment = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(segment, Math.max(4, divisions * 2), radius, 6, false), material);
    mesh.userData.svgPart = true;
    meshes.push(mesh);
  }
  return meshes;
}
function addFlowMotion(target, curve, color, hover = null, reverse = false) {
  if (reduceMotion || !curve) return;
  const bead = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 12, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false })
  );
  const coreColor = new THREE.Color(color).lerp(new THREE.Color('#fffdf2'), 0.72);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 12, 10),
    new THREE.MeshBasicMaterial({ color: coreColor, toneMapped: false })
  );
  glow.renderOrder = 5;
  core.renderOrder = 6;
  bead.add(glow, core);
  if (hover) {
    Object.assign(bead.userData, hover);
    Object.assign(glow.userData, hover);
    Object.assign(core.userData, hover);
  }
  target.add(bead);
  flowAnimations.push({ bead, curve, reverse, phase: (flowAnimations.length * 0.381966) % 1, duration: 2.6 });
}
function outlineFromSubPath(target, subPath, material, z, hover = null) {
  // Sample the SVG curves directly. Passing these samples through a second
  // Catmull-Rom spline pulls the stroke away from the actual fill edge.
  const points = subPath.getPoints(32);
  if (points.length < 2) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point.x, point.y, 0)));
  const outline = new THREE.Line(geometry, material);
  outline.position.z = z;
  outline.userData.svgPart = true;
  if (hover) Object.assign(outline.userData, hover);
  target.add(outline);
  return outline;
}
function offsetPathPoints(points, amount) {
  return points.map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x - dy / length * amount, y: point.y + dx / length * amount };
  });
}
function hoverInfo(key, title, detail) { return { hoverKey: key, hoverTip: { title, detail } }; }
const planetSymbols = {
  sun: '☉', earth: '⊕', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
  jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇',
  north_node: '☊', south_node: '☋'
};
function addPlanetIndicators(target, points, channel, gatePoints, activationsByGate, channelId, person) {
  if (points.length < 2) return;
  const from = +channel.dataset.from, to = +channel.dataset.to;
  const fromPoint = gatePoints.get(from);
  const startsAtFrom = fromPoint && Math.hypot(points[0].x - fromPoint.x, points[0].y - fromPoint.y) <= Math.hypot(points[points.length - 1].x - fromPoint.x, points[points.length - 1].y - fromPoint.y);
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(point.x, point.y, 6.1)), false, 'centripetal');
  for (const [gate, baseT] of [[startsAtFrom === false ? to : from, 0.12], [startsAtFrom === false ? from : to, 0.88]]) {
    const activations = activationsByGate.get(gate) || [];
    activations.forEach((activation, index) => {
      const typeColor = activation.type === 'design' ? '#cf2943' : '#24231f';
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fffdf7';
      ctx.beginPath(); ctx.roundRect(2, 3, 60, 34, 8); ctx.fill();
      ctx.strokeStyle = typeColor; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = typeColor;
      ctx.font = 'bold 25px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(planetSymbols[activation.planet] || activation.planet.slice(0, 2), 32, 21);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      marker.scale.set(8.4, 5.25, 1);
      const spread = (index - (activations.length - 1) / 2) * 0.08;
      const point = curve.getPointAt(THREE.MathUtils.clamp(baseT + spread, 0.04, 0.96));
      const tangent = curve.getTangentAt(THREE.MathUtils.clamp(baseT + spread, 0.04, 0.96));
      const sideOffset = index % 2 === 0 ? -2.5 : 2.5;
      const chartOffset = person === 'daniel' ? -2.5 : person === 'camille' ? 2.5 : 0;
      marker.position.set(point.x + chartOffset - tangent.y * sideOffset, point.y + tangent.x * sideOffset, point.z);
      marker.renderOrder = 10;
      const label = activation.planet.replace('_', ' ');
      const typeLabel = activation.type === 'design' ? 'Design · red' : 'Personality · black';
      const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
      Object.assign(marker.userData, hoverInfo(
        `natal:${person}:${activation.type}:${activation.planet}:${gate}`,
        `${owner} · ${typeLabel} · ${label} · Gate ${gate}`,
        `${owner}: ${label} activates Gate ${gate} in the ${activation.type} chart. Shown on channel ${channelId.replace('-', '–')}.`
      ));
      target.add(marker);
    });
  }
}
function describePathFeature(node, person) {
  const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2');
  const gate = gateGroup(node);
  const channel = channelGroup(node);
  const center = centerGroup(node);
  if (gate) {
    const number = +gate.dataset.gate;
    const centerName = centerDescriptions[gate.dataset.center]?.[0] || (gate.dataset.center || 'body').replace(/-/g, ' ');
    const active = gate.dataset.state === 'closed';
    const key = `${person}:gate:${number}`;
    const meaning = gateDescriptions.get(number);
    return hoverInfo(key, `Gate ${number}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || 'A gate is one activation point in a channel.'} ${owner} · ${centerName} center · ${active ? 'active' : 'open'}.`);
  }
  if (channel) {
    const channelId = `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`;
    const label = channelId.replace('-', '–');
    const circuit = channel.dataset.circuit || 'bodygraph';
    const complete = channel.dataset.defined === 'true';
    const key = `${person}:channel:${label}`;
    const meaning = channelDescriptions.get(channelId);
    return hoverInfo(key, `Channel ${label}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || `${owner} · ${circuit} circuit.`} ${owner} · ${circuit} circuit · ${complete ? 'complete' : 'open'}.`);
  }
  if (center) {
    const centerId = center.dataset.center || 'body';
    const [label, meaning] = centerDescriptions[centerId] || [centerId.replace(/\b\w/g, letter => letter.toUpperCase()), 'A Human Design energy center.'];
    const defined = center.dataset.defined === 'true';
    const key = `${person}:center:${label}`;
    const doc = center.ownerDocument || sourceDocument;
    let summary = '';
    if (defined && doc) {
      const activeGates = gatesFor(person);
      const centerGates = [...doc.querySelectorAll(`.gate[data-center="${centerId}"]`)].map(gate => +gate.dataset.gate).filter(Number.isFinite);
      const activeCenterGates = centerGates.filter(gate => activeGates.has(gate));
      const definedChannels = [...doc.querySelectorAll('.channel-group[data-from][data-to]')]
        .filter(channel => channel.getAttribute('data-defined') === 'true' && (activeCenterGates.includes(+channel.dataset.from) || activeCenterGates.includes(+channel.dataset.to)))
        .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}–${Math.max(+channel.dataset.from, +channel.dataset.to)}`);
      const parts = [];
      if (activeCenterGates.length) parts.push(`gates ${activeCenterGates.join(', ')}`);
      if (definedChannels.length) parts.push(`channels ${definedChannels.join(', ')}`);
      if (parts.length) summary = ` Defined as: ${parts.join(' and ')}.`;
    }
    return hoverInfo(key, `${label} center`, `${meaning} ${owner} · ${defined ? 'defined' : 'undefined'}.${summary}`);
  }
  return null;
}
function lineMaterial(color, opacity=1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false });
}
function makePlaneGroup(paths, person, sharedChannels, relationshipChannels, options = {}) {
  const group = new THREE.Group();
  const owner = options.name || window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  group.name = `${owner} · ${person === 'daniel' ? 'blue' : person === 'camille' ? 'pink' : 'child'} SVG plane`;
  const color = options.color || chartColor(person);
  const planetaryActivations = options.activations || window.hdNatalPlanetaryActivations?.[person] || familyChildren.find(child => child.id === person)?.activations || [];
  const activationsByGate = new Map();
  for (const activation of planetaryActivations) {
    if (!activationsByGate.has(activation.gate)) activationsByGate.set(activation.gate, []);
    activationsByGate.get(activation.gate).push(activation);
  }
  const gatePoints = getGatePoints(paths);
  for (const path of paths) {
    const node = path.userData.node;
    if (!node) continue;
    const channel = channelGroup(node);
    const gate = gateGroup(node);
    const center = centerGroup(node);
    const cls = node.getAttribute('class') || '';
    const active = channel?.getAttribute('data-defined') === 'true';
    const gateActive = gate?.getAttribute('data-state') === 'closed';
    const centerActive = center?.getAttribute('data-defined') === 'true';
    const isChannel = cls.includes('channel') && !cls.includes('highlight') && !cls.includes('hit') && !cls.includes('flow');
    const isGateMarker = cls.includes('gate-marker');
    const isCenterShape = cls.includes('center-shape');
    const channelId = channel ? `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}` : null;
    const hover = describePathFeature(node, person);
    if (hover && channelId && relationshipChannels.has(channelId)) hover.hoverKey = `relationship:channel:${channelId}`;

    if (path.subPaths?.length && isChannel) {
      // Keep each person's channels tinted by their chart color, including
      // open channels; lower opacity keeps the active paths in focus.
      const roadColor = color;
      // In exact front view, separate shared tracks by a few pixels so both
      // contributors remain visibly blue and pink instead of blending purple.
      const opacity = active ? (exactFrontAlignment ? 0.46 : 0.78) : 0.17;
      const sharedOffset = exactFrontAlignment && active && sharedChannels.has(channelId) ? (person === 'daniel' ? -2.2 : 2.2) : 0;
      // Each SVG rail becomes a two-lane carriageway; the divider and dashed lane marks make the road legible in depth.
      const roadMat = lineMaterial(roadColor, opacity);
      const laneMat = lineMaterial(pale, active ? (exactFrontAlignment ? 0.22 : 0.7) : 0.13);
      for (const subPath of path.subPaths) {
        const rawPoints = subPath.getPoints(16);
        const points = sharedOffset ? offsetPathPoints(rawPoints, sharedOffset) : rawPoints;
        const road = tubeFromPoints(points, active ? 1.75 : 0.62, roadMat, 2.4);
        if (road) { if (hover) Object.assign(road.userData, hover); group.add(road); }
        if (active && points.length > 2) {
          const from = gatePoints.get(+channel.dataset.from);
          const startsAtFrom = from && Math.hypot(rawPoints[0].x - from.x, rawPoints[0].y - from.y) <= Math.hypot(rawPoints[rawPoints.length - 1].x - from.x, rawPoints[rawPoints.length - 1].y - from.y);
          let flowPoints = [...points];
          if (startsAtFrom === false) flowPoints.reverse();
          const isReturnLane = cls.split(/\s+/).includes('paired-rail');
          if (isReturnLane) flowPoints.reverse();
          const flowCurve = new THREE.CatmullRomCurve3(flowPoints.map(point => new THREE.Vector3(point.x, point.y, 4.3)), false, 'centripetal');
          addFlowMotion(group, flowCurve, isReturnLane ? '#a6edf7' : '#ffc247', hover);
        }
        if (active && points.length > 5) {
          const divider = tubeFromPoints(points, 0.22, laneMat, 2.6);
          if (divider) { if (hover) Object.assign(divider.userData, hover); group.add(divider); }
          const dashCount = Math.max(5, Math.min(15, Math.floor(points.length / 2)));
          for (let i = 0; i < dashCount; i += 2) {
            const a = Math.floor(i / dashCount * (points.length - 1));
            const b = Math.min(points.length - 1, a + Math.max(2, Math.floor(points.length / dashCount)));
            const dash = tubeFromPoints(points.slice(a, b + 1), 0.17, laneMat, 2.7);
            if (dash) { if (hover) Object.assign(dash.userData, hover); group.add(dash); }
          }
        }
      }
      if (!cls.split(/\s+/).includes('paired-rail') && path.subPaths[0]) {
        addPlanetIndicators(group, path.subPaths[0].getPoints(48), channel, gatePoints, activationsByGate, channelId, person);
      }
      continue;
    }

    if (path.subPaths?.length && (isGateMarker || isCenterShape)) {
      const fillColor = isGateMarker ? (gateActive ? color : pale) : (centerActive ? color : pale);
      const fillMat = new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: isCenterShape ? (centerActive ? (exactFrontAlignment ? 0.3 : 0.42) : 0.48) : (exactFrontAlignment ? 0.64 : 0.94), side: THREE.DoubleSide, depthWrite: false });
      const outlineActive = isCenterShape ? centerActive : gateActive;
      const outlineMat = lineMaterial(color, exactFrontAlignment ? (outlineActive ? 0.92 : 0.56) : (outlineActive ? 1 : 0.76));
      for (const shape of path.toShapes(true)) addShapeMesh(group, shape, fillMat, isCenterShape ? 1.2 : 3.1, hover);
      for (const subPath of path.subPaths) {
        outlineFromSubPath(group, subPath, outlineMat, isCenterShape ? 1.5 : 3.3, hover);
      }
      if (isGateMarker && hover && path.subPaths?.length) {
        const points = path.subPaths[0].getPoints(20);
        if (points.length) {
          const centerPoint = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
          const hit = new THREE.Mesh(new THREE.SphereGeometry(3.8, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
          hit.position.set(centerPoint.x, centerPoint.y, 3.2);
          Object.assign(hit.userData, hover);
          group.add(hit);
        }
      }
      continue;
    }

    // Keep all remaining chart outlines and symbols faintly present as the original SVG's structural guide.
    if (path.subPaths?.length && !cls.includes('channel')) {
      const guideMat = lineMaterial(color, 0.16);
      for (const subPath of path.subPaths) {
        const guide = tubeFromPoints(subPath.getPoints(10), 0.38, guideMat, 0.7);
        if (guide) group.add(guide);
      }
    }
  }
  // SVG coordinates use a downward-positive Y axis. Flip the finished plane so the chart reads upright in 3D.
  group.scale.y = -1;
  group.position.set(-194.4, 194.4, 0);
  if (options.scale) {
    group.scale.set(options.scale, -options.scale, options.scale);
    group.position.set(-194.4 * options.scale + (options.offsetX || 0), 194.4 * options.scale, 0);
  }
  return group;
}
function parseGateList(selector) {
  return new Set((document.querySelector(selector).value.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 64));
}
function extractLayer(doc, person, gates) {
  const svg = doc.documentElement.cloneNode(true);
  const keep = svg.querySelector(person === 'daniel' ? '.person--daniel' : '.person--camille');
  // In exact-front mode, remove each layer's presentation offset so both charts share identical XY coordinates.
  if (keep && exactFrontAlignment) keep.setAttribute('transform', 'scale(1.08 1)');
  svg.querySelectorAll('.canvas').forEach(el => el.remove());
  svg.querySelectorAll('.person--daniel, .person--camille').forEach(el => { if (el !== keep) el.remove(); });
  keep.querySelectorAll('.gate').forEach(g => g.setAttribute('data-state', gates.has(+g.dataset.gate) ? 'closed' : 'open'));
  keep.querySelectorAll('.channel-group').forEach(ch => ch.setAttribute('data-defined', String(gates.has(+ch.dataset.from) && gates.has(+ch.dataset.to))));
  keep.querySelectorAll('.center').forEach(center => {
    const id = center.dataset.center;
    const active = [...keep.querySelectorAll(`.gate[data-center="${id}"]`)].some(g => gates.has(+g.dataset.gate));
    center.setAttribute('data-defined', String(active));
  });
  svg.querySelectorAll('script,#gate-state-legend,#flow-control,#flow-direction-legend,#svg-tooltip').forEach(el => el.remove());
  svg.setAttribute('viewBox', '0 0 360 360');
  return new XMLSerializer().serializeToString(svg);
}
function releaseGroup(group) {
  if (!group) return;
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { m.map?.dispose(); m.dispose(); });
  });
  chartRoot.remove(group);
}
function getGatePoints(paths) {
  const result = new Map();
  for (const path of paths) {
    const node = path.userData.node;
    if (!node?.getAttribute('class')?.includes('gate-marker')) continue;
    const gate = gateGroup(node);
    if (!gate || !path.subPaths?.length) continue;
    const points = path.subPaths[0].getPoints(20);
    if (!points.length) continue;
    const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
    result.set(+gate.dataset.gate, center);
  }
  return result;
}
function relationshipLinkSpecs(a, b, danielGates, camilleGates, transitGates) {
  const danielActive = new Set([...danielGates, ...transitGates]);
  const camilleActive = new Set([...camilleGates, ...transitGates]);
  // Natal channels remain represented by each chart. Transits may add a
  // temporary cross-chart bridge, but a channel supplied only by the shared
  // transit sky is not a relationship-specific contribution.
  if ((danielGates.has(a) && danielGates.has(b)) || (camilleGates.has(a) && camilleGates.has(b))) return [];
  const links = [];
  if (danielActive.has(a) && camilleActive.has(b) && (danielGates.has(a) || camilleGates.has(b))) {
    links.push({ fromPerson: 'daniel', fromGate: a, toPerson: 'camille', toGate: b });
  }
  if (camilleActive.has(a) && danielActive.has(b) && (camilleGates.has(a) || danielGates.has(b))) {
    links.push({ fromPerson: 'camille', fromGate: a, toPerson: 'daniel', toGate: b });
  }
  return links;
}
function snapshotPlanetNames(snapshot, gate) {
  const planets = snapshot?.gatePlanets?.[gate] || [];
  return planets.length ? ` (${planets.join(', ')})` : '';
}
function makeRelationshipGroup(danielData, camilleData, danielGates, camilleGates, separation, transitSnapshot) {
  const group = new THREE.Group();
  group.name = 'Relationship-completed channels · middle plane';
  const gatePointsD = getGatePoints(danielData.paths);
  const gatePointsC = getGatePoints(camilleData.paths);
  const half = Number(separation) / 2;
  const danielZ = frontPerson === 'daniel' ? half : -half;
  const camilleZ = -danielZ;
  // Gate markers are drawn at local z=3.3 in each plane. Preserve that same
  // local depth for bridge endpoints on both charts, regardless of which
  // plane is closer to the camera.
  const gateMarkerZ = 3.3;
  const gold = lineMaterial(new THREE.Color('#eab64b'), 0.98);
  const blue = lineMaterial(colors.daniel, 0.9);
  const pink = lineMaterial(colors.camille, 0.9);
  const transitPurple = lineMaterial(new THREE.Color('#7c3aed'), 0.95);
  const transitGates = new Set(transitSnapshot?.gates || []);
  const natalGates = { daniel: danielGates, camille: camilleGates };
  const gatePoints = { daniel: gatePointsD, camille: gatePointsC };
  const planeZ = { daniel: danielZ, camille: camilleZ };
  const personColors = { daniel: blue, camille: pink };
  const personNames = {
    daniel: window.hdChartNames?.daniel || 'Person 1',
    camille: window.hdChartNames?.camille || 'Person 2'
  };
  const gateMarkerMaterial = (person, gate) => natalGates[person].has(gate) ? personColors[person] : transitPurple;
  const gateSourceDescription = (person, gate) => {
    const sources = [];
    if (natalGates[person].has(gate)) sources.push('natal');
    if (transitGates.has(gate)) sources.push(`transit${snapshotPlanetNames(transitSnapshot, gate)}`);
    return `Gate ${gate}: ${personNames[person]} (${sources.join(' + ')})`;
  };
  let bridgeCount = 0;
  for (const path of danielData.paths) {
    const node = path.userData.node;
    const cls = node?.getAttribute('class') || '';
    if (!cls.split(/\s+/).includes('channel')) continue;
    const channel = channelGroup(node);
    if (!channel || !path.subPaths?.length) continue;
    const a = +channel.dataset.from, b = +channel.dataset.to;
    const specs = relationshipLinkSpecs(a, b, danielGates, camilleGates, transitGates);
    if (!specs.length) continue;
    bridgeCount++;
    const channelId = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const reading = relationshipChannelReadings[channelId] || channelDescriptions.get(channelId);
    const title = `Relationship channel ${a}–${b}${reading?.name ? ` · ${reading.name}` : ''}`;
    const links = [];
    for (const spec of specs) {
      const from = gatePoints[spec.fromPerson].get(spec.fromGate);
      const to = gatePoints[spec.toPerson].get(spec.toGate);
      links.push({
        ...spec,
        from,
        to,
        fromZ: planeZ[spec.fromPerson] + gateMarkerZ,
        toZ: planeZ[spec.toPerson] + gateMarkerZ,
        fromMaterial: gateMarkerMaterial(spec.fromPerson, spec.fromGate),
        toMaterial: gateMarkerMaterial(spec.toPerson, spec.toGate)
      });
    }
    const contributors = links.map(link => `${gateSourceDescription(link.fromPerson, link.fromGate)} ↔ ${gateSourceDescription(link.toPerson, link.toGate)}`);
    const detail = [
      reading?.description || 'These two gates join the connected centers in the Human Design BodyGraph.',
      `Cross-chart bridge · ${contributors.join(' · ')}. Natal and current transit activations are shown separately; a channel completed only by the shared transit sky is not counted as a relationship bridge.`
    ].join(' ');
    const tip = hoverInfo(`relationship:channel:${channelId}`, title, detail);
    const sourceStart = gatePointsD.get(a);
    const sourceEnd = gatePointsD.get(b);
    for (const link of links) {
      if (!link.from || !link.to || !sourceStart || !sourceEnd) continue;
      // Reuse the SVG channel spline itself. Endpoint offsets map its ends to
      // each person's open gate while preserving the exact front-view curve.
      let route = path.subPaths[0].getPoints(64);
      const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
      const startsAtA = distance(route[0], sourceStart) <= distance(route[route.length - 1], sourceStart);
      const shouldReverse = link.fromGate === a ? !startsAtA : startsAtA;
      if (shouldReverse) route = route.reverse();
      const first = route[0], last = route[route.length - 1];
      const startDx = link.from.x - first.x, startDy = link.from.y - first.y;
      const endDx = link.to.x - last.x, endDy = link.to.y - last.y;
      const points = route.map((point, index) => {
        const t = index / (route.length - 1);
        return new THREE.Vector3(
          point.x + startDx * (1 - t) + endDx * t,
          point.y + startDy * (1 - t) + endDy * t,
          link.fromZ + (link.toZ - link.fromZ) * t
        );
      });
      const spline = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const transitContributed = !natalGates[link.fromPerson].has(link.fromGate) || !natalGates[link.toPerson].has(link.toGate);
      const bridges = transitContributed
        ? dashedTubesFromCurve(spline, 1.25, gold)
        : [new THREE.Mesh(new THREE.TubeGeometry(spline, 96, 1.25, 6, false), gold)];
      for (const bridge of bridges) {
        Object.assign(bridge.userData, tip);
        group.add(bridge);
      }
      addFlowMotion(group, spline, '#fff0b0', tip);
      addFlowMotion(group, spline, '#39aabd', tip, true);
      for (const [point, z, material] of [[link.from, link.fromZ, link.fromMaterial], [link.to, link.toZ, link.toMaterial]]) {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), material);
        bead.position.set(point.x, point.y, z);
        Object.assign(bead.userData, tip);
        group.add(bead);
      }
    }
  }
  group.scale.y = -1;
  group.position.set(-194.4, 194.4, 0);
  group.userData.bridgeCount = bridgeCount;
  return group;
}
function makeTransitGroup(data, snapshot, natalGates, person) {
  const group = new THREE.Group();
  const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2');
  group.name = `Current Human Design transit overlay · ${owner}`;
  const transitGates = new Set(snapshot.gates);
  const activeGates = new Set([...natalGates, ...transitGates]);
  const gatePoints = getGatePoints(data.paths);
  const transitColor = new THREE.Color('#7c3aed');
  const color = chartColor(person);
  const roadMaterial = lineMaterial(color, 0.96);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: transitColor, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  for (const path of data.paths) {
    const node = path.userData.node;
    if (!node) continue;
    const cls = node.getAttribute('class') || '';
    const channel = channelGroup(node);
    if (!channel || !cls.split(/\s+/).includes('channel') || cls.includes('paired-rail')) continue;
    const from = +channel.dataset.from, to = +channel.dataset.to;
    if (!activeGates.has(from) || !activeGates.has(to) || (!transitGates.has(from) && !transitGates.has(to)) || !path.subPaths?.length) continue;
    const channelId = `${Math.min(from, to)}-${Math.max(from, to)}`;
    const reading = relationshipChannelReadings[channelId] || channelDescriptions.get(channelId);
    const gateSource = gate => {
      const parts = [];
      if (transitGates.has(gate)) parts.push(`transit: ${snapshot.gatePlanets[gate]?.join(', ') || 'planetary activation'}`);
      if (natalGates.has(gate)) parts.push(`${owner}'s natal chart`);
      return `Gate ${gate} (${parts.join(' + ')})`;
    };
    const hover = hoverInfo(
      `transit:channel:${channelId}`,
      `Transit channel ${from}–${to}${reading?.name ? ` · ${reading.name}` : ''}`,
      `${reading?.description || 'The channel between these gates is temporarily activated.'} This channel is completed in ${owner}'s chart by ${gateSource(from)} and ${gateSource(to)}. Temporary transit overlay · ${snapshot.source}.`
    );
    const points = path.subPaths[0].getPoints(48);
    for (const dash of dashedTubesFromPoints(points, 1.35, roadMaterial, 2.85)) {
      Object.assign(dash.userData, hover);
      group.add(dash);
    }
    const flowCurve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(point.x, point.y, 3.55)), false, 'centripetal');
    addFlowMotion(group, flowCurve, color.getStyle(), hover);
  }
  for (const gate of transitGates) {
    const point = gatePoints.get(gate);
    if (!point) continue;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 4.2, 32), ringMaterial);
    ring.position.set(point.x, point.y, 5.4);
    Object.assign(ring.userData, hoverInfo(
      `transit:gate:${gate}`,
      `Transit gate ${gate}`,
      `Current planetary activations: ${(snapshot.gatePlanets[gate] || []).join(', ') || 'transit'}. This is a temporary sky activation, separate from either natal chart. ${snapshot.source}.`
    ));
    group.add(ring);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8), new THREE.MeshBasicMaterial({ color: transitColor, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    core.position.copy(ring.position);
    Object.assign(core.userData, ring.userData);
    group.add(core);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(4.6, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    hit.position.copy(ring.position);
    Object.assign(hit.userData, ring.userData);
    group.add(hit);
  }
  group.scale.y = -1;
  group.position.set(-194.4, 194.4, 0);
  return group;
}
function rebuildRelationship() {
  selectedKey = null;
  clearHover();
  if (!sourceDocument || !loader) return;
  flowAnimations.length = 0;
  const danielGates = parseGateList('#danielGates');
  const camilleGates = parseGateList('#camilleGates');
  const sharedChannels = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')]
    .filter(channel => danielGates.has(+channel.dataset.from) && danielGates.has(+channel.dataset.to) && camilleGates.has(+channel.dataset.from) && camilleGates.has(+channel.dataset.to))
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const transitGates = new Set(transitSnapshot?.gates || []);
  const relationshipChannels = new Set([...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')]
    .filter(channel => relationshipLinkSpecs(+channel.dataset.from, +channel.dataset.to, danielGates, camilleGates, transitGates).length > 0)
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const layers = {};
  for (const person of ['daniel', 'camille']) {
    const data = loader.parse(extractLayer(sourceDocument, person, person === 'daniel' ? danielGates : camilleGates));
    layers[person] = data;
    releaseGroup(planeGroups[person]);
    const group = makePlaneGroup(data.paths, person, sharedChannels, relationshipChannels);
    planeGroups[person] = group;
    chartRoot.add(group);
  }
  for (const [person, group] of Object.entries(familyGroups)) {
    releaseGroup(group);
    delete familyGroups[person];
  }
  for (const [person, label] of Object.entries(summaryLabels)) {
    releaseGroup(label);
    delete summaryLabels[person];
  }
  const separation = Number(document.querySelector('#separation').value);
  const half = separation / 2;
  planeGroups.daniel.position.z = frontPerson === 'daniel' ? half : -half;
  planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  for (const person of ['daniel', 'camille']) {
    const gates = person === 'daniel' ? danielGates : camilleGates;
    const activations = window.hdNatalPlanetaryActivations?.[person] || [];
    const x = person === 'daniel' ? -82 : 82;
    const label = makeSummaryLabel(person, gates, activations, colors[person], x, 207, planeGroups[person].position.z + 7);
    if (label) {
      label.visible = document.querySelector(person === 'daniel' ? '#showDaniel' : '#showCamille').checked;
      summaryLabels[person] = label;
      chartRoot.add(label);
    }
  }
  document.querySelector('#separationValue').value = String(separation);
  releaseGroup(relationshipGroup);
  relationshipGroup = makeRelationshipGroup(layers.daniel, layers.camille, danielGates, camilleGates, separation, transitSnapshot);
  chartRoot.add(relationshipGroup);
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  for (const [person, group] of Object.entries(transitGroups)) {
    releaseGroup(group);
    delete transitGroups[person];
  }
  if (transitSnapshot) {
    for (const person of ['daniel', 'camille']) {
      const natalGates = parseGateList(person === 'daniel' ? '#danielGates' : '#camilleGates');
      const activations = new Set([...natalGates, ...transitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, person, activations));
      const group = makeTransitGroup(transitData, transitSnapshot, natalGates, person);
      group.position.z = planeGroups[person].position.z;
      transitGroups[person] = group;
      chartRoot.add(group);
      group.visible = transitToggle.checked;
    }
  }
  familyChildren.forEach((child, index) => {
    const offsetX = 102 + index * 66;
    const childData = loader.parse(extractLayer(sourceDocument, 'daniel', new Set(child.gates)));
    const color = childPalette[index % childPalette.length];
    const childGroup = makePlaneGroup(childData.paths, child.id, new Set(), new Set(), {
      color, name: child.name, scale: 0.48, offsetX
    });
    childGroup.position.z = 0;
    familyGroups[child.id] = childGroup;
    chartRoot.add(childGroup);
    const childLabel = makeSummaryLabel(child.id, new Set(child.gates), child.activations || [], color, offsetX, 110, 7, 0.68);
    if (childLabel) { summaryLabels[child.id] = childLabel; chartRoot.add(childLabel); }
    if (transitSnapshot) {
      const activations = new Set([...child.gates, ...transitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, 'daniel', activations));
      const transitGroup = makeTransitGroup(transitData, transitSnapshot, new Set(child.gates), child.id);
      transitGroup.scale.set(0.48, -0.48, 0.48);
      transitGroup.position.set(-194.4 * 0.48 + offsetX, 194.4 * 0.48, 0);
      transitGroup.position.z = 0;
      transitGroups[child.id] = transitGroup;
      chartRoot.add(transitGroup);
      transitGroup.visible = transitToggle.checked;
    }
  });
  planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} shown.`);
}

window.addEventListener('castalia-family-children-updated', event => {
  familyChildren = Array.isArray(event.detail) ? event.detail : [];
  familyChildren.forEach((child, index) => { window.hdChartNames[child.id] = child.name || `Child ${index + 1}`; });
  if (sourceDocument && loader) { rebuildRelationship(); resize(); }
});

async function refreshTransits() {
  const status = document.querySelector('#transitStatus');
  try {
    transitSnapshot = await window.CastaliaHumanDesignTransit.currentSnapshot();
    const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transitSnapshot.epoch * 1000));
    status.textContent = `As of ${time} · ${transitSnapshot.source}; Sun through Saturn + Earth. Applied to both charts; channel overlays combine natal and transit gates.`;
    if (sourceDocument && loader) rebuildRelationship();
  } catch (error) {
    status.textContent = `Current transits unavailable: ${error.message}`;
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  const aspect = rect.width / rect.height;
  const outerChildOffset = 102 + Math.max(0, familyChildren.length - 1) * 66;
  const halfWidth = Math.max(300 * aspect, outerChildOffset + 55, 165);
  const halfHeight = Math.max(300, halfWidth / aspect);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
function setSeparation(value) {
  const half = Number(value) / 2;
  if (planeGroups.daniel) planeGroups.daniel.position.z = frontPerson === 'daniel' ? half : -half;
  if (planeGroups.camille) planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  document.querySelector('#separationValue').value = String(value);
  if (sourceDocument) rebuildRelationship();
}
function orient(mode) {
  exactFrontAlignment = mode !== 'edge';
  if (sourceDocument) rebuildRelationship();
  // Clear the prior angle lock so preset views and Reset can choose their angle.
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.reset();
  if (mode === 'edge') camera.position.set(800, -20, 0.01);
  else camera.position.set(0, 0, 820);
  controls.target.set(0, 0, 0);
  lockOrbitElevation();
  controls.update();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tip = document.querySelector('#sceneTip');
let hoveredKey = null;
let selectedKey = null;
let highlightedKey = null;
let highlighted = [];
let touchStart = null;
let lastTouchSelectionAt = -Infinity;
function clearHighlight() {
  for (const { mesh, material, highlightedMaterial } of highlighted) {
    mesh.material = material;
    if (Array.isArray(highlightedMaterial)) highlightedMaterial.forEach(item => item.dispose?.());
    else highlightedMaterial.dispose?.();
  }
  highlighted = [];
  highlightedKey = null;
}
function applyHighlight(key) {
  if (key === highlightedKey) return;
  clearHighlight();
  if (!key) return;
  highlightedKey = key;
  chartRoot.traverse(object => {
    if (!object.material || object.userData.hoverKey !== key) return;
    const original = object.material;
    const highlightedMaterials = (Array.isArray(original) ? original : [original]).map(material => {
      const copy = material.clone();
      if (copy.color) copy.color.lerp(new THREE.Color('#ffd166'), 0.62);
      if ('opacity' in copy && copy.transparent) copy.opacity = Math.min(1, copy.opacity + 0.28);
      return copy;
    });
    object.material = Array.isArray(original) ? highlightedMaterials : highlightedMaterials[0];
    highlighted.push({ mesh: object, material: original, highlightedMaterial: object.material });
  });
}
function clearHover() {
  hoveredKey = null;
  tip.hidden = true;
  canvas.style.cursor = 'grab';
  applyHighlight(selectedKey);
}
function setHover(info, key) {
  if (key !== hoveredKey) {
    hoveredKey = key;
    if (!selectedKey) applyHighlight(key);
  }
  tip.innerHTML = `<strong></strong><span></span>`;
  tip.querySelector('strong').textContent = info.title;
  tip.querySelector('span').textContent = info.detail;
  tip.hidden = false;
  canvas.style.cursor = 'help';
}
function selectFeature(info, key, clientX, clientY) {
  selectedKey = selectedKey === key ? null : key;
  hoveredKey = selectedKey;
  applyHighlight(selectedKey);
  if (selectedKey) {
    tip.innerHTML = `<strong></strong><span></span>`;
    tip.querySelector('strong').textContent = info.title;
    tip.querySelector('span').textContent = info.detail;
    tip.hidden = false;
    canvas.style.cursor = 'help';
    positionTip(clientX, clientY);
  } else {
    clearHover();
  }
}
function featureAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(chartRoot, true).find(intersection => intersection.object.userData.hoverTip);
}
function positionTip(clientX, clientY) {
  tip.style.left = `${Math.max(12, Math.min(clientX + 14, window.innerWidth - tip.offsetWidth - 12))}px`;
  tip.style.top = `${Math.max(12, Math.min(clientY + 14, window.innerHeight - tip.offsetHeight - 12))}px`;
}
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const hit = featureAt(event.clientX, event.clientY);
  if (!hit) { if (!selectedKey) clearHover(); return; }
  setHover(hit.object.userData.hoverTip, hit.object.userData.hoverKey);
  positionTip(event.clientX, event.clientY);
});
canvas.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') clearHover(); });
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch' || !touchStart) return;
  const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
  touchStart = null;
  if (moved > 10) return;
  const hit = featureAt(event.clientX, event.clientY);
  if (!hit) { selectedKey = null; clearHover(); return; }
  lastTouchSelectionAt = performance.now();
  selectFeature(hit.object.userData.hoverTip, hit.object.userData.hoverKey, event.clientX, event.clientY);
});
canvas.addEventListener('click', event => {
  if (event.detail === 0 || performance.now() - lastTouchSelectionAt < 500) return;
  const hit = featureAt(event.clientX, event.clientY);
  if (hit) selectFeature(hit.object.userData.hoverTip, hit.object.userData.hoverKey, event.clientX, event.clientY);
  else { selectedKey = null; clearHover(); }
});

function loadFeatureDescriptions(svgDocument) {
  for (const gate of svgDocument.querySelectorAll('.gate[data-gate]')) {
    const tooltip = gate.dataset.tooltip || '';
    const separator = tooltip.indexOf(':');
    const name = separator >= 0 ? tooltip.slice(0, separator).trim() : '';
    const description = gate.dataset.reading || (separator >= 0 ? tooltip.slice(separator + 1).trim() : 'A gate is one activation point in a channel.');
    gateDescriptions.set(+gate.dataset.gate, { name, description });
  }
  for (const channel of svgDocument.querySelectorAll('.channel-group[data-from][data-to]')) {
    const id = `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`;
    const tooltip = channel.dataset.tooltip || '';
    const nameMatch = tooltip.match(/Channel of ([^:]+):/i);
    const reading = channel.dataset.reading || '';
    const name = nameMatch?.[1]?.trim() || reading.split(':', 1)[0].trim() || relationshipChannelReadings[id]?.name || '';
    const description = reading.includes(':') ? reading.slice(reading.indexOf(':') + 1).trim() : tooltip.replace(/^Channel of [^:]+:\s*/i, '').split(/\s+With others:/i)[0].trim();
    channelDescriptions.set(id, { name, description });
  }
}

async function init() {
  try {
    const response = await fetch('../relationship.svg');
    if (!response.ok) throw new Error(`relationship.svg returned ${response.status}`);
    sourceDocument = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (sourceDocument.querySelector('parsererror')) throw new Error('relationship.svg could not be parsed');
    try {
      const descriptionsResponse = await fetch('../bodygraph.svg');
      if (descriptionsResponse.ok) {
        const descriptionsDocument = new DOMParser().parseFromString(await descriptionsResponse.text(), 'image/svg+xml');
        if (!descriptionsDocument.querySelector('parsererror')) loadFeatureDescriptions(descriptionsDocument);
      }
    } catch (error) {
      console.warn('Could not load optional gate/channel descriptions:', error);
    }
    loader = new SVGLoader();
    for (const [person, selector] of [['daniel', '.person--daniel'], ['camille', '.person--camille']]) {
      const active = [...sourceDocument.querySelectorAll(`${selector} .gate[data-state="closed"]`)].map(g => +g.dataset.gate);
      document.querySelector(person === 'daniel' ? '#danielGates' : '#camilleGates').value = active.join(', ');
    }
    rebuildRelationship();
    resize();
    void refreshTransits();
    window.setInterval(() => void refreshTransits(), 15 * 60 * 1000);
  } catch (error) {
    setStatus(`Unable to load BodyGraph geometry: ${error.message}`);
    console.error(error);
  }
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
document.querySelector('#separation').addEventListener('input', e => setSeparation(e.target.value));
for (const selector of ['#danielGates', '#camilleGates']) document.querySelector(selector).addEventListener('input', () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuildRelationship, 220); });
document.querySelector('#showBridges').addEventListener('change', e => { if (relationshipGroup) relationshipGroup.visible = e.target.checked; });
document.querySelector('#showDaniel').addEventListener('change', e => {
  if (planeGroups.daniel) planeGroups.daniel.visible = e.target.checked;
  if (summaryLabels.daniel) summaryLabels.daniel.visible = e.target.checked;
});
document.querySelector('#showCamille').addEventListener('change', e => {
  if (planeGroups.camille) planeGroups.camille.visible = e.target.checked;
  if (summaryLabels.camille) summaryLabels.camille.visible = e.target.checked;
});
transitToggle.addEventListener('change', e => {
  for (const group of Object.values(transitGroups)) group.visible = e.target.checked;
  try { localStorage.setItem('castalia-hd-show-transits', String(e.target.checked)); }
  catch (error) { console.warn('Could not save transit visibility:', error); }
});
document.querySelector('#front').addEventListener('click', () => orient('front'));
document.querySelector('#edge').addEventListener('click', () => orient('edge'));
document.querySelector('#reset').addEventListener('click', () => orient('reset'));
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, button, select')) return;
  if (event.key === '1' || event.code === 'Numpad1' || event.key === '2' || event.code === 'Numpad2') {
    frontPerson = event.key === '1' || event.code === 'Numpad1' ? 'daniel' : 'camille';
    rebuildRelationship();
    event.preventDefault();
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const step = (event.shiftKey ? 0.28 : 0.1) * (event.key === 'ArrowLeft' ? 1 : -1);
  const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
  camera.position.copy(controls.target).add(offset);
  controls.update();
});
window.addEventListener('resize', resize);
function animate() {
  controls.update();
  const elapsed = performance.now() / 1000;
  for (const flow of flowAnimations) {
    const progress = (elapsed / flow.duration + flow.phase) % 1;
    flow.bead.position.copy(flow.curve.getPointAt(flow.reverse ? 1 - progress : progress));
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
init();
animate();
