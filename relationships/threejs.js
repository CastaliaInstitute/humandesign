import * as THREE from 'three';
import '../transit-data.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const canvas = document.querySelector('#scene');
const rotationReadout = document.createElement('output');
rotationReadout.id = 'rotationReadout';
rotationReadout.setAttribute('aria-label', 'Current view rotation angle');
rotationReadout.textContent = 'Rotation 0°';
document.body.append(rotationReadout);
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f8f5ed');
const chartViewHeight = 360;
const parentChartScale = 0.62;
// Orthographic projection keeps parallel chart planes the same apparent size,
// which is essential for a mathematically exact front overlap.
const camera = new THREE.OrthographicCamera(-300, 300, 300, -300, 1, 3000);
const familyViewCenterY = chartViewHeight * parentChartScale / 2;
camera.position.set(0, familyViewCenterY, 820);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.035;
controls.rotateSpeed = 0.65;
controls.target.set(0, familyViewCenterY, 0);
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
// Rotate the whole family layout around its shared center. Keeping the camera
// fixed preserves the exact-overlap front view as the starting orientation.
let familyAzimuth = 0;
function rotateFamily(step) {
  familyAzimuth += step;
  chartRoot.rotation.y = familyAzimuth;
  refreshFrontFamilyReading();
}
const planeGroups = {};
let relationshipGroup = null;
const transitGroups = {};
const familyGroups = {};
let familyChildren = [];
let transitSnapshot = null;
let transitDurationEstimates = [];
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
let readingFrontPerson = null;
const flowAnimations = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let autoRotate = !reduceMotion;
const autoRotateSpeed = 0.035; // radians per second; one slow turn takes about three minutes
const colors = { daniel: new THREE.Color('#087fa5'), camille: new THREE.Color('#cf4f79') };
const childPalette = ['#488f73', '#b67a37', '#7864a6', '#518a9d'].map(color => new THREE.Color(color));
const familyLayout = { parentScale: parentChartScale, childScale: parentChartScale, parentRadius: 0 };
function childPlaneRadius() {
  return Number(document.querySelector('#separation').value) / 2;
}
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
  const definedChannels = [];
  const connect = (a, b) => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a).add(b); adjacent.get(b).add(a);
    definedCenters.add(a); definedCenters.add(b);
  };
  for (const channel of template.querySelectorAll('.channel-group[data-from][data-to]')) {
    const from = +channel.dataset.from, to = +channel.dataset.to;
    if (!gates.has(from) || !gates.has(to)) continue;
    definedChannels.push(`${Math.min(from, to)}-${Math.max(from, to)}`);
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
  const strategies = {
    Manifestor: 'inform before initiating',
    Generator: 'wait to respond',
    'Manifesting Generator': 'respond, then inform before acting',
    Projector: 'wait for recognition and invitation',
    Reflector: 'take time through a lunar cycle for major decisions'
  };
  const personalitySun = activations.find(item => item.type === 'personality' && item.planet === 'sun');
  const designSun = activations.find(item => item.type === 'design' && item.planet === 'sun');
  const profile = personalitySun && designSun ? `${personalitySun.line}/${designSun.line}` : '';
  return {
    type, authority, strategy: strategies[type], profile, definedCenters: [...definedCenters], definedChannels,
    label: `${profile ? `${profile} · ` : ''}${authority} ${type}`
  };
}
function transitGateWindow(gate) {
  const entries = transitDurationEstimates.filter(item => item.gate === gate);
  if (!entries.length) return 'end estimate unavailable';
  if (entries.some(item => item.unavailable)) return 'end estimate unavailable';
  if (entries.some(item => item.beyondWindow)) return 'still active beyond the eight-month estimate window';
  if (entries.some(item => !item.exitsAt)) return 'end estimate unavailable';
  const lastExit = Math.max(...entries.map(item => new Date(item.exitsAt).getTime()));
  const date = new Date(lastExit);
  const formatted = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  return `expected through about ${formatted}`;
}
function transitPlanetNames(gate) {
  return transitSnapshot?.gatePlanets?.[gate]?.join(', ') || 'current transit';
}
function personCurrentlyInFront() {
  chartRoot.updateMatrixWorld(true);
  const towardViewer = camera.getWorldDirection(new THREE.Vector3()).negate();
  const target = controls.target;
  const candidates = [];
  for (const person of ['daniel', 'camille']) {
    const group = planeGroups[person];
    if (!group?.visible) continue;
    candidates.push({ person, point: group.localToWorld(new THREE.Vector3(194.4, chartViewHeight / 2, 0)) });
  }
  for (const child of familyChildren) {
    const group = familyGroups[child.id];
    if (!group?.visible) continue;
    const chart = group.children.find(item => item.name.includes('SVG plane'));
    if (chart) candidates.push({ person: child.id, point: chart.localToWorld(new THREE.Vector3(194.4, chartViewHeight / 2, 0)) });
  }
  if (!candidates.length) return frontPerson;
  const scores = candidates.map(candidate => ({ ...candidate, depth: candidate.point.sub(target).dot(towardViewer) }));
  const highest = Math.max(...scores.map(candidate => candidate.depth));
  // Keep the current reading through near-ties so it does not flicker while
  // the family turns between two equally distant charts.
  const current = scores.find(candidate => candidate.person === readingFrontPerson);
  if (current && current.depth >= highest - 2) return current.person;
  return scores.find(candidate => candidate.depth === highest)?.person || frontPerson;
}
function refreshFrontFamilyReading() {
  if (personCurrentlyInFront() !== readingFrontPerson) frontFamilyReading();
}
function frontFamilyReading() {
  const root = document.querySelector('#familyReadingBody');
  if (!root || !sourceDocument) return;
  const readingPerson = personCurrentlyInFront();
  readingFrontPerson = readingPerson;
  root.replaceChildren();
  const peers = ['daniel', 'camille', ...familyChildren.map(child => child.id)].filter(person => person !== readingPerson);
  const gates = new Map([[readingPerson, gatesFor(readingPerson)]]);
  for (const peer of peers) gates.set(peer, gatesFor(peer));
  const activations = person => window.hdNatalPlanetaryActivations?.[person] || familyChildren.find(child => child.id === person)?.activations || [];
  const personName = person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  const frontName = personName(readingPerson);
  const summary = summarizeChart(gates.get(readingPerson), activations(readingPerson));
  const heading = document.querySelector('#familyReadingTitle');
  if (heading) heading.textContent = `Family chart descriptions · ${frontName} in front`;
  if (!summary) return;

  const profiles = [
    'daniel', 'camille', ...familyChildren.map(child => child.id)
  ].map(person => {
    const chart = summarizeChart(gates.get(person) || gatesFor(person), activations(person));
    return chart ? `${personName(person)}: ${chart.label}; strategy: ${chart.strategy}` : '';
  }).filter(Boolean);
  const profileLine = document.createElement('p');
  profileLine.textContent = profiles.join(' · ');
  root.append(profileLine);

  const centerNames = summary.definedCenters.map(center => centerDescriptions[center]?.[0] || center);
  const intro = document.createElement('p');
  intro.textContent = `In front: ${frontName} · ${summary.label}. Human Design strategy: ${summary.strategy}. Defined centers: ${centerNames.join(', ') || 'none'}; defined channels: ${summary.definedChannels.length}.`;
  root.append(intro);

  const natalFrontGates = gates.get(readingPerson);
  const transitGates = new Set(transitSnapshot?.gates || []);
  const transitOnlyGates = [...transitGates].filter(gate => !natalFrontGates.has(gate));
  const transitChannels = [];
  const channels = [...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')].map(channel => {
    const from = +channel.dataset.from, to = +channel.dataset.to;
    const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
    return { id, from, to, label: id.replace('-', '–'), reading: relationshipChannelReadings[id] || channelDescriptions.get(id) };
  });
  if (transitToggle.checked && transitSnapshot) {
    const combined = new Set([...natalFrontGates, ...transitGates]);
    const combinedSummary = summarizeChart(combined, activations(readingPerson));
    const temporaryCenters = (combinedSummary?.definedCenters || []).filter(center => !summary.definedCenters.includes(center));
    for (const channel of channels) {
      if (!combined.has(channel.from) || !combined.has(channel.to) || summary.definedChannels.includes(channel.id)) continue;
      const temporaryGates = [channel.from, channel.to].filter(gate => transitGates.has(gate) && !natalFrontGates.has(gate));
      if (!temporaryGates.length) continue;
      transitChannels.push({ ...channel, temporaryGates });
    }
    const transitSection = document.createElement('p');
    const asOf = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transitSnapshot.epoch * 1000));
    if (!transitOnlyGates.length && !transitChannels.length) {
      transitSection.textContent = `Transit snapshot as of ${asOf}: no new gates or channels are added to ${frontName}'s natal chart.`;
    } else {
      const gateDetails = transitOnlyGates.map(gate => `Gate ${gate} (${transitPlanetNames(gate)}) ${transitGateWindow(gate)}`);
      const channelDetails = transitChannels.map(channel => {
        const names = channel.reading?.name ? ` · ${channel.reading.name}` : '';
        const bounds = channel.temporaryGates.map(gate => `Gate ${gate} ${transitGateWindow(gate)}`).join('; ');
        return `Channel ${channel.label}${names} is temporarily complete (${bounds})`;
      });
      const centers = temporaryCenters.length ? ` The composite temporarily defines ${temporaryCenters.map(center => centerDescriptions[center]?.[0] || center).join(', ')}.` : '';
      transitSection.textContent = `Transit deltas for ${frontName} as of ${asOf}: ${[...gateDetails, ...channelDetails].join('. ')}.${centers}`;
    }
    root.append(transitSection);
  }

  for (const peer of peers) {
    const frontGates = gates.get(readingPerson), peerGates = gates.get(peer);
    const peerSummary = summarizeChart(peerGates, activations(peer));
    const sharedGates = [...frontGates].filter(gate => peerGates.has(gate)).sort((a, b) => a - b);
    const sharedChannels = channels.filter(channel => frontGates.has(channel.from) && frontGates.has(channel.to) && peerGates.has(channel.from) && peerGates.has(channel.to));
    const complementary = channels.filter(channel => {
      const frontHasFrom = frontGates.has(channel.from), frontHasTo = frontGates.has(channel.to);
      const peerHasFrom = peerGates.has(channel.from), peerHasTo = peerGates.has(channel.to);
      return (frontHasFrom && !frontHasTo && !peerHasFrom && peerHasTo) ||
        (frontHasTo && !frontHasFrom && peerHasFrom && !peerHasTo);
    });
    const frontCompletePeerGate = channels.filter(channel => frontGates.has(channel.from) && frontGates.has(channel.to) && (peerGates.has(channel.from) !== peerGates.has(channel.to)));
    const peerCompleteFrontGate = channels.filter(channel => peerGates.has(channel.from) && peerGates.has(channel.to) && (frontGates.has(channel.from) !== frontGates.has(channel.to)));
    const item = document.createElement('p');
    const facts = [`${sharedGates.length} shared gate${sharedGates.length === 1 ? '' : 's'}${sharedGates.length ? ` (${sharedGates.join(', ')})` : ''}`];
    if (complementary.length) facts.push(`together complete ${complementary.map(channel => `${channel.label}${channel.reading?.name ? ` ${channel.reading.name}` : ''}`).join(', ')}`);
    if (sharedChannels.length) facts.push(`both charts define ${sharedChannels.map(channel => channel.label).join(', ')}`);
    if (frontCompletePeerGate.length) facts.push(`${personName(peer)} has the other gate of ${frontCompletePeerGate.map(channel => channel.label).join(', ')}, already defined in ${frontName}'s chart`);
    if (peerCompleteFrontGate.length) facts.push(`${frontName} has a gate in ${personName(peer)}'s complete ${peerCompleteFrontGate.map(channel => channel.label).join(', ')}`);
    const peerDefines = new Set(peerSummary?.definedCenters || []);
    const frontDefines = new Set(summary.definedCenters);
    const peerToFront = [...peerDefines].filter(center => !frontDefines.has(center));
    const frontToPeer = [...frontDefines].filter(center => !peerDefines.has(center));
    const centerName = center => centerDescriptions[center]?.[0] || center;
    if (peerToFront.length) facts.push(`conditioning lens: ${personName(peer)} has defined ${peerToFront.map(centerName).join(', ')} center${peerToFront.length === 1 ? '' : 's'} where ${frontName}'s are not defined`);
    if (frontToPeer.length) facts.push(`${frontName} has defined ${frontToPeer.map(centerName).join(', ')} center${frontToPeer.length === 1 ? '' : 's'} where ${personName(peer)}'s are not defined`);
    if (transitToggle.checked && transitSnapshot) {
      const peerActive = new Set([...peerGates, ...transitGates]);
      const temporaryConnections = channels.flatMap(channel => {
        if (frontGates.has(channel.from) && frontGates.has(channel.to) || peerGates.has(channel.from) && peerGates.has(channel.to)) return [];
        const links = [];
        if (frontGates.has(channel.from) && peerActive.has(channel.to) || transitGates.has(channel.from) && peerActive.has(channel.to)) links.push({ frontGate: channel.from, peerGate: channel.to });
        if (frontGates.has(channel.to) && peerActive.has(channel.from) || transitGates.has(channel.to) && peerActive.has(channel.from)) links.push({ frontGate: channel.to, peerGate: channel.from });
        return links.filter(link => {
          const temporaryGates = [
            ...(!frontGates.has(link.frontGate) && transitGates.has(link.frontGate) ? [link.frontGate] : []),
            ...(!peerGates.has(link.peerGate) && transitGates.has(link.peerGate) ? [link.peerGate] : [])
          ];
          const hasNatalContribution = frontGates.has(link.frontGate) || peerGates.has(link.peerGate);
          if (!temporaryGates.length || !hasNatalContribution) return false;
          link.temporaryGates = temporaryGates;
          return true;
        }).map(link => ({ channel, link }));
      });
      if (temporaryConnections.length) {
        const connectionText = temporaryConnections.map(({ channel, link }) => {
          const gatesText = link.temporaryGates.map(gate => `Gate ${gate} (${transitPlanetNames(gate)}) ${transitGateWindow(gate)}`).join('; ');
          return `${channel.label}${channel.reading?.name ? ` ${channel.reading.name}` : ''} is temporarily completed across the charts through ${gatesText}`;
        });
        facts.push(`current transit connection: ${connectionText.join('; ')}`);
      }
    }
    item.textContent = `With ${personName(peer)}: ${facts.join('; ')}.`;
    root.append(item);
  }
  const note = document.createElement('small');
  note.textContent = 'A Human Design parenting lens: use strategy and center contrasts as questions for reflection, not fixed claims about a person. Transit end windows are ephemeris estimates and may change; this is not a compatibility verdict.';
  root.append(note);
}
controls.addEventListener('change', refreshFrontFamilyReading);
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
function activationDescription(activations = []) {
  if (!activations.length) return '';
  return ['personality', 'design'].map(type => {
    const planets = [...new Set(activations.filter(item => item.type === type).map(item => item.planet.replaceAll('_', ' ')))];
    if (!planets.length) return '';
    const label = type === 'personality' ? 'Personality (black)' : 'Design (red)';
    return `${label}: ${planets.join(', ')}`;
  }).filter(Boolean).join('; ');
}
function describePathFeature(node, person, activationsByGate) {
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
    const activation = activationDescription(activationsByGate.get(number));
    const activationNote = activation ? ` Planetary activations: ${activation}.` : '';
    return hoverInfo(key, `Gate ${number}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || 'A gate is one activation point in a channel.'} ${owner} · ${centerName} center · ${active ? 'active' : 'open'}.${activationNote}`);
  }
  if (channel) {
    const channelId = `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`;
    const label = channelId.replace('-', '–');
    const circuit = channel.dataset.circuit || 'bodygraph';
    const complete = channel.dataset.defined === 'true';
    const key = `${person}:channel:${label}`;
    const meaning = channelDescriptions.get(channelId);
    const fromActivations = activationDescription(activationsByGate.get(+channel.dataset.from));
    const toActivations = activationDescription(activationsByGate.get(+channel.dataset.to));
    const gateActivations = [
      fromActivations && `Gate ${channel.dataset.from}: ${fromActivations}`,
      toActivations && `Gate ${channel.dataset.to}: ${toActivations}`
    ].filter(Boolean);
    const activationNote = gateActivations.length ? ` Planetary activations · ${gateActivations.join(' · ')}.` : '';
    return hoverInfo(key, `Channel ${label}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || `${owner} · ${circuit} circuit.`} ${owner} · ${circuit} circuit · ${complete ? 'complete' : 'open'}.${activationNote}`);
  }
  if (center) {
    const centerId = center.dataset.center || 'body';
    const [label, meaning] = centerDescriptions[centerId] || [centerId.replace(/\b\w/g, letter => letter.toUpperCase()), 'A Human Design energy center.'];
    const key = `${person}:center:${label}`;
    const doc = center.ownerDocument || sourceDocument;
    const activeCenterGates = doc
      ? [...doc.querySelectorAll(`.gate[data-center="${centerId}"][data-state="closed"]`)]
        .map(gate => +gate.dataset.gate).filter(Number.isFinite)
      : [];
    const gateCenters = new Map(doc
      ? [...doc.querySelectorAll('.gate[data-gate][data-center]')].map(gate => [+gate.dataset.gate, gate.dataset.center])
      : []);
    const definedChannels = doc
      ? [...doc.querySelectorAll('.channel-group[data-from][data-to]')].filter(channel => {
        if (channel.dataset.defined !== 'true') return false;
        return gateCenters.get(+channel.dataset.from) === centerId || gateCenters.get(+channel.dataset.to) === centerId;
      })
      : [];
    const defined = definedChannels.length > 0;
    const gateThemes = activeCenterGates.map(number => {
      const gateMeaning = gateDescriptions.get(number);
      return `Gate ${number}${gateMeaning?.name ? ` · ${gateMeaning.name}` : ''}: ${gateMeaning?.description || 'an activated gate theme in this center'}`;
    });
    const channelThemes = definedChannels.map(channel => {
      const from = +channel.dataset.from, to = +channel.dataset.to;
      const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
      const channelMeaning = channelDescriptions.get(id);
      return `Channel ${id.replace('-', '–')}${channelMeaning?.name ? ` · ${channelMeaning.name}` : ''}${channelMeaning?.description ? `: ${channelMeaning.description}` : ''}`;
    });
    const activationText = gateThemes.length
      ? `Active gate themes: ${gateThemes.join('; ')}.`
      : 'No natal or transit gates are active in this center.';
    const definitionText = defined
      ? `Defined through ${channelThemes.join('; ')}.`
      : 'Undefined: an activated gate can color this center, but a complete channel is needed to define it.';
    return hoverInfo(key, `${label} center`, `${meaning} ${owner} · ${defined ? 'defined' : 'undefined'}. ${definitionText} ${activationText}`);
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
    const hover = describePathFeature(node, person, activationsByGate);
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
      const gateActivations = gate ? (activationsByGate.get(+gate.dataset.gate) || []) : [];
      const gateFillColor = gateActivations.some(item => item.type === 'design')
        ? '#cf2943'
        : gateActivations.some(item => item.type === 'personality') ? '#24231f' : color;
      const fillColor = isGateMarker ? (gateActive ? gateFillColor : pale) : (centerActive ? color : pale);
      const fillOpacity = isCenterShape
        ? (centerActive ? (exactFrontAlignment ? 0.3 : 0.42) : 0.48)
        : gateActive ? (exactFrontAlignment ? 0.35 : 0.55) : 0;
      const fillMat = new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide, depthWrite: false });
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
  group.position.set(-194.4, chartViewHeight, 0);
  if (options.scale) {
    group.scale.set(options.scale, -options.scale, options.scale);
    group.position.set(-194.4 * options.scale + (options.offsetX || 0), chartViewHeight * options.scale + (options.offsetY || 0), 0);
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
function chartPointInFamily(point, person, localDepth = 0) {
  const childIndex = familyChildren.findIndex(child => child.id === person);
  const isChild = childIndex >= 0;
  const scale = isChild ? familyLayout.childScale : familyLayout.parentScale;
  let centerX = 0, centerY = 0, centerZ = 0, childRotation = 0;
  if (isChild) {
    const side = childIndex % 2 === 0 ? 1 : -1;
    const childOrdinal = Math.floor(childIndex / 2);
    const sideCount = side > 0 ? Math.ceil(familyChildren.length / 2) : Math.floor(familyChildren.length / 2);
    const offset = sideCount > 1 ? (childOrdinal / (sideCount - 1) - 0.5) * (Math.PI / 3) : 0;
    const childAngle = side > 0 ? offset : Math.PI - offset;
    centerX = childPlaneRadius() * Math.cos(childAngle);
    centerZ = childPlaneRadius() * Math.sin(childAngle);
    childRotation = Math.atan2(-centerX, -centerZ);
  } else {
    centerY = person === 'daniel' ? familyLayout.parentRadius : -familyLayout.parentRadius;
  }
  const localX = point.x * scale - 194.4 * scale;
  const localY = -point.y * scale + chartViewHeight * scale + centerY;
  const localZ = localDepth * scale;
  if (isChild) {
    return new THREE.Vector3(
      centerX + Math.cos(childRotation) * localX + Math.sin(childRotation) * localZ,
      localY,
      centerZ - Math.sin(childRotation) * localX + Math.cos(childRotation) * localZ
    );
  }
  return new THREE.Vector3(
    localX + centerX,
    localY,
    (planeGroups[person]?.position.z || 0) + localZ
  );
}
function relationshipLinkSpecs(a, b, personA, personB, natalGates, transitGates) {
  const gatesA = natalGates[personA] || new Set();
  const gatesB = natalGates[personB] || new Set();
  const activeA = new Set([...gatesA, ...transitGates]);
  const activeB = new Set([...gatesB, ...transitGates]);
  // A bridge represents something completed across these two charts. Skip a
  // channel either chart already has natally, and do not count sky-only links.
  if ((gatesA.has(a) && gatesA.has(b)) || (gatesB.has(a) && gatesB.has(b))) return [];
  const links = [];
  if (activeA.has(a) && activeB.has(b) && (gatesA.has(a) || gatesB.has(b))) {
    links.push({ fromPerson: personA, fromGate: a, toPerson: personB, toGate: b });
  }
  if (activeB.has(a) && activeA.has(b) && (gatesB.has(a) || gatesA.has(b))) {
    links.push({ fromPerson: personB, fromGate: a, toPerson: personA, toGate: b });
  }
  return links;
}
function snapshotPlanetNames(snapshot, gate) {
  const planets = snapshot?.gatePlanets?.[gate] || [];
  return planets.length ? ` (${planets.join(', ')})` : '';
}
function makeRelationshipGroup(chartData, natalGates, transitSnapshot) {
  const group = new THREE.Group();
  group.name = 'Relationship-completed channels · all family charts';
  const gateMarkerZ = 3.3;
  const gold = lineMaterial(new THREE.Color('#eab64b'), 0.98);
  const personMaterials = new Map();
  const materialFor = person => {
    if (!personMaterials.has(person)) personMaterials.set(person, lineMaterial(chartColor(person), 0.9));
    return personMaterials.get(person);
  };
  const transitPurple = lineMaterial(new THREE.Color('#7c3aed'), 0.95);
  const transitGates = new Set(transitSnapshot?.gates || []);
  const people = Object.keys(chartData);
  const gatePoints = Object.fromEntries(people.map(person => [person, getGatePoints(chartData[person].paths)]));
  const personNames = Object.fromEntries(people.map(person => [person, window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child')]));
  const gateMarkerMaterial = (person, gate) => natalGates[person]?.has(gate) ? materialFor(person) : transitPurple;
  const gateSourceDescription = (person, gate) => {
    const sources = [];
    if (natalGates[person]?.has(gate)) sources.push('natal');
    if (transitGates.has(gate)) sources.push(`transit${snapshotPlanetNames(transitSnapshot, gate)}`);
    return `Gate ${gate}: ${personNames[person]} (${sources.join(' + ')})`;
  };
  let bridgeCount = 0;
  chartRoot.updateMatrixWorld(true);
  const templatePaths = chartData.daniel?.paths || chartData[people[0]]?.paths || [];
  for (let firstIndex = 0; firstIndex < people.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < people.length; secondIndex++) {
      const personA = people[firstIndex], personB = people[secondIndex];
      for (const path of templatePaths) {
        const node = path.userData.node;
        const cls = node?.getAttribute('class') || '';
        if (!cls.split(/\s+/).includes('channel')) continue;
        const channel = channelGroup(node);
        if (!channel || !path.subPaths?.length) continue;
        const a = +channel.dataset.from, b = +channel.dataset.to;
        const specs = relationshipLinkSpecs(a, b, personA, personB, natalGates, transitGates);
        if (!specs.length) continue;
        bridgeCount++;
        const channelId = `${Math.min(a, b)}-${Math.max(a, b)}`;
        const reading = relationshipChannelReadings[channelId] || channelDescriptions.get(channelId);
        const title = `${personNames[personA]} ↔ ${personNames[personB]} · channel ${a}–${b}${reading?.name ? ` · ${reading.name}` : ''}`;
        const links = specs.map(spec => {
          const from = gatePoints[spec.fromPerson]?.get(spec.fromGate);
          const to = gatePoints[spec.toPerson]?.get(spec.toGate);
          return {
            ...spec,
            from: from && chartPointInFamily(from, spec.fromPerson, gateMarkerZ),
            to: to && chartPointInFamily(to, spec.toPerson, gateMarkerZ),
            fromMaterial: gateMarkerMaterial(spec.fromPerson, spec.fromGate),
            toMaterial: gateMarkerMaterial(spec.toPerson, spec.toGate)
          };
        });
        const contributors = links.map(link => `${gateSourceDescription(link.fromPerson, link.fromGate)} ↔ ${gateSourceDescription(link.toPerson, link.toGate)}`);
        const detail = [
          reading?.description || 'These two gates join the connected centers in the Human Design BodyGraph.',
          `Family bridge between ${personNames[personA]} and ${personNames[personB]} · ${contributors.join(' · ')}. Dashed bridges include at least one transit gate; a channel completed only by the shared transit sky is not counted.`
        ].join(' ');
        const tip = hoverInfo(`relationship:channel:${channelId}`, title, detail);
        const sourceStart = gatePoints[personA]?.get(a);
        const sourceEnd = gatePoints[personA]?.get(b);
        for (const link of links) {
          if (!link.from || !link.to || !sourceStart || !sourceEnd) continue;
          // Keep the original SVG channel spline and ease its endpoints onto
          // the actual gates in each participant's plane.
          let route = path.subPaths[0].getPoints(64);
          const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
          const startsAtA = distance(route[0], sourceStart) <= distance(route[route.length - 1], sourceStart);
          const shouldReverse = link.fromGate === a ? !startsAtA : startsAtA;
          if (shouldReverse) route = route.reverse();
          const first = chartPointInFamily(route[0], personA);
          const last = chartPointInFamily(route[route.length - 1], personA);
          const startDelta = link.from.clone().sub(first);
          const endDelta = link.to.clone().sub(last);
          const points = route.map((point, index) => {
            const t = index / (route.length - 1);
            const familyPoint = chartPointInFamily(point, personA);
            return familyPoint.addScaledVector(startDelta, 1 - t).addScaledVector(endDelta, t);
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
          for (const [point, material] of [[link.from, link.fromMaterial], [link.to, link.toMaterial]]) {
            const bead = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), material);
            bead.position.copy(point);
            Object.assign(bead.userData, tip);
            group.add(bead);
          }
        }
      }
    }
  }
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
  const natalGates = { daniel: danielGates, camille: camilleGates };
  familyChildren.forEach(child => { natalGates[child.id] = new Set(child.gates || []); });
  const people = Object.keys(natalGates);
  const activeTransitSnapshot = transitToggle.checked ? transitSnapshot : null;
  const sharedChannels = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')]
    .filter(channel => danielGates.has(+channel.dataset.from) && danielGates.has(+channel.dataset.to) && camilleGates.has(+channel.dataset.from) && camilleGates.has(+channel.dataset.to))
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const transitGates = new Set(activeTransitSnapshot?.gates || []);
  const relationshipChannels = new Set();
  const channelElements = [...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      for (const channel of channelElements) {
        const a = +channel.dataset.from, b = +channel.dataset.to;
        if (relationshipLinkSpecs(a, b, people[i], people[j], natalGates, transitGates).length) {
          relationshipChannels.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
        }
      }
    }
  }
  const chartData = {};
  for (const person of ['daniel', 'camille']) {
    const data = loader.parse(extractLayer(sourceDocument, person, natalGates[person]));
    chartData[person] = data;
    releaseGroup(planeGroups[person]);
    const centerY = person === 'daniel' ? familyLayout.parentRadius : -familyLayout.parentRadius;
    const group = makePlaneGroup(data.paths, person, sharedChannels, relationshipChannels, {
      scale: familyLayout.parentScale, offsetY: centerY
    });
    planeGroups[person] = group;
    chartRoot.add(group);
  }
  for (const [person, group] of Object.entries(familyGroups)) {
    releaseGroup(group);
    delete familyGroups[person];
  }
  const separation = Number(document.querySelector('#separation').value);
  const half = separation / 2;
  planeGroups.daniel.position.z = frontPerson === 'daniel' ? half : -half;
  planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  document.querySelector('#separationValue').value = String(separation);
  for (const [person, group] of Object.entries(transitGroups)) {
    releaseGroup(group);
    delete transitGroups[person];
  }
  if (activeTransitSnapshot) {
    for (const person of ['daniel', 'camille']) {
      const natalGates = parseGateList(person === 'daniel' ? '#danielGates' : '#camilleGates');
      const activations = new Set([...natalGates, ...activeTransitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, person, activations));
      const group = makeTransitGroup(transitData, activeTransitSnapshot, natalGates, person);
      const centerY = person === 'daniel' ? familyLayout.parentRadius : -familyLayout.parentRadius;
      group.scale.set(familyLayout.parentScale, -familyLayout.parentScale, familyLayout.parentScale);
      group.position.set(-194.4 * familyLayout.parentScale, chartViewHeight * familyLayout.parentScale + centerY, 0);
      group.position.z = planeGroups[person].position.z;
      transitGroups[person] = group;
      chartRoot.add(group);
      group.visible = transitToggle.checked;
    }
  }
  familyChildren.forEach((child, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const childOrdinal = Math.floor(index / 2);
    const sideCount = side > 0 ? Math.ceil(familyChildren.length / 2) : Math.floor(familyChildren.length / 2);
    const spread = sideCount > 1 ? (childOrdinal / (sideCount - 1) - 0.5) * (Math.PI / 3) : 0;
    const angle = side > 0 ? spread : Math.PI - spread;
    const distance = childPlaneRadius();
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;
    const offsetY = 0;
    const childPosition = new THREE.Group();
    const childScale = familyLayout.childScale;
    childPosition.position.set(offsetX, offsetY, offsetZ);
    childPosition.rotation.y = Math.atan2(-offsetX, -offsetZ);
    const childGates = natalGates[child.id];
    const childData = loader.parse(extractLayer(sourceDocument, 'daniel', childGates));
    chartData[child.id] = childData;
    const color = childPalette[index % childPalette.length];
    const childGroup = makePlaneGroup(childData.paths, child.id, new Set(), relationshipChannels, {
      color, name: child.name, scale: childScale
    });
    childGroup.position.set(-194.4 * childScale, chartViewHeight * childScale, 0);
    childPosition.visible = true;
    childPosition.add(childGroup);
    familyGroups[child.id] = childPosition;
    chartRoot.add(childPosition);
    if (activeTransitSnapshot) {
      const activations = new Set([...childGates, ...activeTransitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, 'daniel', activations));
      const transitGroup = makeTransitGroup(transitData, activeTransitSnapshot, childGates, child.id);
      transitGroup.scale.set(childScale, -childScale, childScale);
      transitGroup.position.set(-194.4 * childScale, chartViewHeight * childScale, 0);
      transitGroups[child.id] = transitGroup;
      childPosition.add(transitGroup);
      transitGroup.visible = transitToggle.checked;
    }
  });
  releaseGroup(relationshipGroup);
  relationshipGroup = makeRelationshipGroup(chartData, natalGates, activeTransitSnapshot);
  chartRoot.add(relationshipGroup);
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  frontFamilyReading();
  setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel bridge${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} shown across the family.`);
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
    try {
      transitDurationEstimates = await window.CastaliaHumanDesignTransit.estimateDurations(transitSnapshot, 240);
    } catch (error) {
      transitDurationEstimates = [];
      console.warn('Transit duration estimates are unavailable:', error);
    }
    const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transitSnapshot.epoch * 1000));
    status.textContent = `As of ${time} · ${transitSnapshot.source}; Sun through Saturn + Earth. Applied per bodygraph; dashed family bridges include transit contributions.`;
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
  const furthestChild = childPlaneRadius();
  const halfWidth = Math.max(furthestChild + 194.4 * familyLayout.childScale + 35, 194.4 * familyLayout.parentScale + 35, 165);
  const halfHeight = Math.max(chartViewHeight * familyLayout.parentScale / 2 + 35, chartViewHeight * familyLayout.childScale / 2 + 35, halfWidth / aspect);
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
  if (sourceDocument) {
    rebuildRelationship();
    resize();
  }
}
function orient(mode) {
  exactFrontAlignment = mode !== 'edge';
  if (sourceDocument) rebuildRelationship();
  // Clear the prior angle lock so preset views and Reset can choose their angle.
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.reset();
  if (mode === 'edge') camera.position.set(800, familyViewCenterY, 0.01);
  else camera.position.set(0, familyViewCenterY, 820);
  controls.target.set(0, familyViewCenterY, 0);
  lockOrbitElevation();
  controls.update();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tip = document.querySelector('#sceneTip');
function pauseAutoRotate() {
  autoRotate = false;
}
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
  pauseAutoRotate();
  if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('wheel', pauseAutoRotate, { passive: true });
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
    if (Array.isArray(window.hdRelationshipChildren)) familyChildren = window.hdRelationshipChildren;
    familyChildren.forEach((child, index) => { window.hdChartNames[child.id] = child.name || `Child ${index + 1}`; });
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
  refreshFrontFamilyReading();
});
document.querySelector('#showCamille').addEventListener('change', e => {
  if (planeGroups.camille) planeGroups.camille.visible = e.target.checked;
  refreshFrontFamilyReading();
});
transitToggle.addEventListener('change', e => {
  if (sourceDocument && loader) rebuildRelationship();
  else {
    for (const group of Object.values(transitGroups)) group.visible = e.target.checked;
    frontFamilyReading();
  }
  try { localStorage.setItem('castalia-hd-show-transits', String(e.target.checked)); }
  catch (error) { console.warn('Could not save transit visibility:', error); }
});
document.querySelector('#front').addEventListener('click', () => orient('front'));
document.querySelector('#edge').addEventListener('click', () => orient('edge'));
document.querySelector('#reset').addEventListener('click', () => orient('reset'));
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, button, select')) return;
  if (event.key === '1' || event.code === 'Numpad1' || event.key === '2' || event.code === 'Numpad2') {
    pauseAutoRotate();
    frontPerson = event.key === '1' || event.code === 'Numpad1' ? 'daniel' : 'camille';
    rebuildRelationship();
    event.preventDefault();
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  pauseAutoRotate();
  event.preventDefault();
  const step = (event.shiftKey ? 0.28 : 0.1) * (event.key === 'ArrowLeft' ? 1 : -1);
  rotateFamily(step);
});
window.addEventListener('resize', resize);
let previousFrameTime = performance.now();
function animate() {
  const now = performance.now();
  const delta = Math.min((now - previousFrameTime) / 1000, 0.05);
  previousFrameTime = now;
  if (autoRotate) {
    familyAzimuth += autoRotateSpeed * delta;
    chartRoot.rotation.y = familyAzimuth;
    refreshFrontFamilyReading();
  }
  controls.update();
  const cameraOffset = camera.position.clone().sub(controls.target);
  const cameraAzimuth = Math.atan2(cameraOffset.x, cameraOffset.z);
  const angle = THREE.MathUtils.euclideanModulo(familyAzimuth - cameraAzimuth + Math.PI, Math.PI * 2) - Math.PI;
  rotationReadout.textContent = `Rotation ${Math.round(THREE.MathUtils.radToDeg(angle))}°`;
  const elapsed = now / 1000;
  for (const flow of flowAnimations) {
    const progress = (elapsed / flow.duration + flow.phase) % 1;
    flow.bead.position.copy(flow.curve.getPointAt(flow.reverse ? 1 - progress : progress));
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
init();
animate();
