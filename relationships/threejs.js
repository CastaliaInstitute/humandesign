import * as THREE from 'three';
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
let relationshipGroup = null;
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
    return hoverInfo(key, `${label} center`, `${meaning} ${owner} · ${defined ? 'defined' : 'undefined'}.`);
  }
  return null;
}
function lineMaterial(color, opacity=1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false });
}
function makePlaneGroup(paths, person, sharedChannels, relationshipChannels) {
  const group = new THREE.Group();
  group.name = `${window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2')} · ${person === 'daniel' ? 'blue' : 'pink'} SVG plane`;
  const color = colors[person];
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
      const guideMat = lineMaterial(person === 'daniel' ? color : colors.camille, 0.16);
      for (const subPath of path.subPaths) {
        const guide = tubeFromPoints(subPath.getPoints(10), 0.38, guideMat, 0.7);
        if (guide) group.add(guide);
      }
    }
  }
  // SVG coordinates use a downward-positive Y axis. Flip the finished plane so the chart reads upright in 3D.
  group.scale.y = -1;
  group.position.set(-194.4, 194.4, 0);
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
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
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
function makeRelationshipGroup(danielData, camilleData, danielGates, camilleGates, separation) {
  const group = new THREE.Group();
  group.name = 'Relationship-completed channels · middle plane';
  const gatePointsD = getGatePoints(danielData.paths);
  const gatePointsC = getGatePoints(camilleData.paths);
  const half = Number(separation) / 2;
  const danielZ = frontPerson === 'daniel' ? half : -half;
  const camilleZ = -danielZ;
  const gold = lineMaterial(new THREE.Color('#eab64b'), 0.98);
  const blue = lineMaterial(colors.daniel, 0.9);
  const pink = lineMaterial(colors.camille, 0.9);
  let bridgeCount = 0;
  for (const path of danielData.paths) {
    const node = path.userData.node;
    const cls = node?.getAttribute('class') || '';
    if (!cls.split(/\s+/).includes('channel')) continue;
    const channel = channelGroup(node);
    if (!channel || !path.subPaths?.length) continue;
    const a = +channel.dataset.from, b = +channel.dataset.to;
    const dA = danielGates.has(a), dB = danielGates.has(b);
    const cA = camilleGates.has(a), cB = camilleGates.has(b);
    const hasCrossPair = (dA && cB) || (dB && cA);
    const alreadyComplete = (dA && dB) || (cA && cB);
    if (!hasCrossPair || alreadyComplete) continue;
    bridgeCount++;
    const channelId = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const reading = relationshipChannelReadings[channelId] || channelDescriptions.get(channelId);
    const contributors = [a, b].map(gate => {
      const people = [];
      if (danielGates.has(gate)) people.push(window.hdChartNames?.daniel || 'Person 1');
      if (camilleGates.has(gate)) people.push(window.hdChartNames?.camille || 'Person 2');
      return `Gate ${gate}: ${people.join(' + ')}`;
    });
    const detail = [
      reading?.description || 'These two gates join the connected centers in the Human Design BodyGraph.',
      `Cross-chart bridge · ${contributors.join(' · ')}. The two charts supply one gate each; this describes a shared composite connection, not a prediction about the relationship.`
    ].join(' ');
    const title = `Relationship channel ${a}–${b}${reading?.name ? ` · ${reading.name}` : ''}`;
    const tip = hoverInfo(`relationship:channel:${channelId}`, title, detail);
    const links = [];
    if (dA && cB) links.push({ from: gatePointsC.get(a), fromGate: a, fromZ: camilleZ + Math.sign(camilleZ) * 3.3, fromMaterial: pink, to: gatePointsD.get(b), toGate: b, toZ: danielZ + Math.sign(danielZ) * 3.3, toMaterial: blue });
    if (cA && dB) links.push({ from: gatePointsD.get(a), fromGate: a, fromZ: danielZ + Math.sign(danielZ) * 3.3, fromMaterial: blue, to: gatePointsC.get(b), toGate: b, toZ: camilleZ + Math.sign(camilleZ) * 3.3, toMaterial: pink });
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
      const bridge = new THREE.Mesh(new THREE.TubeGeometry(spline, 96, 1.25, 6, false), gold);
      Object.assign(bridge.userData, tip);
      group.add(bridge);
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
function rebuildRelationship() {
  if (!sourceDocument || !loader) return;
  clearHover();
  flowAnimations.length = 0;
  const danielGates = parseGateList('#danielGates');
  const camilleGates = parseGateList('#camilleGates');
  const sharedChannels = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')]
    .filter(channel => danielGates.has(+channel.dataset.from) && danielGates.has(+channel.dataset.to) && camilleGates.has(+channel.dataset.from) && camilleGates.has(+channel.dataset.to))
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const relationshipChannels = new Set([...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')]
    .filter(channel => {
      const a = +channel.dataset.from, b = +channel.dataset.to;
      const crossPair = (danielGates.has(a) && camilleGates.has(b)) || (danielGates.has(b) && camilleGates.has(a));
      const alreadyComplete = (danielGates.has(a) && danielGates.has(b)) || (camilleGates.has(a) && camilleGates.has(b));
      return crossPair && !alreadyComplete;
    })
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
  const separation = Number(document.querySelector('#separation').value);
  const half = separation / 2;
  planeGroups.daniel.position.z = frontPerson === 'daniel' ? half : -half;
  planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  document.querySelector('#separationValue').value = String(separation);
  releaseGroup(relationshipGroup);
  relationshipGroup = makeRelationshipGroup(layers.daniel, layers.camille, danielGates, camilleGates, separation);
  chartRoot.add(relationshipGroup);
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} shown.`);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  const halfHeight = 300;
  const halfWidth = halfHeight * rect.width / rect.height;
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
let highlighted = [];
function clearHover() {
  for (const { mesh, material, highlightedMaterial } of highlighted) {
    mesh.material = material;
    if (Array.isArray(highlightedMaterial)) highlightedMaterial.forEach(item => item.dispose?.());
    else highlightedMaterial.dispose?.();
  }
  highlighted = [];
  hoveredKey = null;
  tip.hidden = true;
  canvas.style.cursor = 'grab';
}
function setHover(info, key) {
  if (key !== hoveredKey) {
    clearHover();
    hoveredKey = key;
    chartRoot.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.hoverKey !== key) return;
      const original = mesh.material;
      const brightened = (Array.isArray(original) ? original : [original]).map(material => {
        const copy = material.clone();
        if (copy.color) copy.color.lerp(new THREE.Color('#fff4cf'), 0.34);
        return copy;
      });
      mesh.material = Array.isArray(original) ? brightened : brightened[0];
      highlighted.push({ mesh, material: original, highlightedMaterial: mesh.material });
    });
  }
  tip.innerHTML = `<strong></strong><span></span>`;
  tip.querySelector('strong').textContent = info.title;
  tip.querySelector('span').textContent = info.detail;
  tip.hidden = false;
  canvas.style.cursor = 'help';
}
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(chartRoot, true).find(intersection => intersection.object.userData.hoverTip);
  if (!hit) { clearHover(); return; }
  setHover(hit.object.userData.hoverTip, hit.object.userData.hoverKey);
  tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 12)}px`;
  tip.style.top = `${Math.min(event.clientY + 14, window.innerHeight - tip.offsetHeight - 12)}px`;
});
canvas.addEventListener('pointerleave', clearHover);

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
document.querySelector('#showDaniel').addEventListener('change', e => { if (planeGroups.daniel) planeGroups.daniel.visible = e.target.checked; });
document.querySelector('#showCamille').addEventListener('change', e => { if (planeGroups.camille) planeGroups.camille.visible = e.target.checked; });
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
