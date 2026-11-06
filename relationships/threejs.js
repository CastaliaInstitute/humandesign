import * as THREE from 'three';
import '../transit-data.js?family-circle-108-20261019&lifetime-channel-history-v2-20261020';
import { generatePublicDemoReading } from './public-demo-readings.js?v=lifetime-timeline-20261020';
import { publicPairRecurrence, publicFamilyRecurrence } from './relationship-recurrence-data.js?v=family-opportunities-20261020';
import { relationshipChannelReadings } from './channel-guide.js?v=metheus-reading-20261020';
import { buildPenta } from './penta.js?v=family-penta-20261020';
import { interpretiveQuestions } from './interpretive-questions.js?v=family-inquiry-bank-20261022';
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
scene.background = new THREE.Color('#000000');
// The SVG's vertical spread can place the root center below its nominal
// 360-unit viewBox. Preserve that full geometry in the family texture/planes.
const chartFrameHeight = 430;
const chartSilhouetteWidth = 235;
const parentChartScale = 0.9;
// Shared physical dimensions for motes, channel interiors, and gate sockets.
const particleRadius = 0.66;
const channelClearWidth = particleRadius * 2 + 0.28;
const channelWallRadius = 0.22;
const channelWallOffset = channelClearWidth / 2 + channelWallRadius;

// Orthographic projection keeps parallel chart planes the same apparent size,
// which is essential for a mathematically exact front overlap.
const camera = new THREE.OrthographicCamera(-300, 300, 300, -300, 1, 3000);
const familyViewCenterY = chartFrameHeight * parentChartScale / 2;
camera.position.set(0, familyViewCenterY, 820);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.035;
controls.rotateSpeed = 0.65;
controls.enableZoom = true;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.target.set(0, familyViewCenterY, 0);
controls.minDistance = 330;
controls.maxDistance = 1450;
controls.minZoom = 0.45;
controls.maxZoom = 12;
// Allow vertical OrbitControls drags to tilt the family into a top or bottom
// view; a small pole margin avoids the singularity at a perfectly vertical view.
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;
controls.update();

const chartRoot = new THREE.Group();
scene.add(chartRoot);
const ambientParticles = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ color: '#8bd8ff', size: 1.25, transparent: true, opacity: 0.28, depthWrite: false, sizeAttenuation: true })
);
const ambientParticleCount = 420;
const ambientParticlePositions = new Float32Array(ambientParticleCount * 3);
const ambientParticleVelocities = new Float32Array(ambientParticleCount * 3);
for (let i = 0; i < ambientParticleCount; i++) {
  const radius = 280 + Math.random() * 650;
  const angle = Math.random() * Math.PI * 2;
  ambientParticlePositions[i * 3] = Math.cos(angle) * radius;
  ambientParticlePositions[i * 3 + 1] = Math.random() * 600 - 80;
  ambientParticlePositions[i * 3 + 2] = Math.sin(angle) * radius;
  ambientParticleVelocities[i * 3] = -Math.sin(angle) * (5 + Math.random() * 6) + (Math.random() - 0.5) * 2;
  ambientParticleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
  ambientParticleVelocities[i * 3 + 2] = Math.cos(angle) * (5 + Math.random() * 6) + (Math.random() - 0.5) * 2;
}
ambientParticles.geometry.setAttribute('position', new THREE.BufferAttribute(ambientParticlePositions, 3));
scene.add(ambientParticles);
// Rotate the family centers around their shared axis; chart planes counter-rotate
// so every BodyGraph stays facing the camera throughout the turn.
let familyAzimuth = THREE.MathUtils.degToRad(108);
chartRoot.rotation.y = familyAzimuth;
function rotateFamily(step) {
  engageRelationship();
  familyAzimuth += step;
  chartRoot.rotation.y = familyAzimuth;
  syncChartFacing();
  refreshFrontFamilyReading();
}
function engageRelationship() {
  if (relationshipInteractionEnabled) return;
  relationshipInteractionEnabled = true;
  if (sourceDocument && loader && natalParentsReady) rebuildRelationship();
}
const planeGroups = {};
// Double-clicking a chart temporarily removes its relationship connections.
const relationshipMutedCharts = new Set();
const chartInitials = new Map();
const personLayerSettings = new Map();
function layersFor(person) {
  if (!personLayerSettings.has(person)) personLayerSettings.set(person, { design: true, personality: true, transits: true, allChannels: true });
  return personLayerSettings.get(person);
}
let relationshipGroup = null;
let hangingFlexContainer = null;
let activeRelationshipPairKey = '';
let orbitDragging = false;
let lastRelationshipRefreshAt = 0;
let lastCameraFitAt = 0;
let lastFittedTopViewAmount = -1;
let currentChartData = null;
let currentGatePoints = {};
let currentNatalGates = null;
let currentTransitSnapshot = null;
const transitGroups = {};
const familyGroups = {};
let familyChildren = [];
const hangingFlexAnimations = [];
// Shareable presets: solo (default), partner, or all loaded family members.
const viewParams = new URLSearchParams(window.location.search);
const requestedView = viewParams.get('view') || 'solo';
const initialView = ['solo', 'partner', 'family'].includes(requestedView) ? requestedView : 'solo';
const requestedPerson = (viewParams.get('solo') || viewParams.get('person') || 'daniel').toLowerCase();
const initialPerson = ['daniel', 'camille'].includes(requestedPerson) ? requestedPerson : 'daniel';
const includedFamilyMembers = new Set(initialView === 'solo' ? [initialPerson] : ['daniel', 'camille']);
document.querySelector('#showDaniel').checked = includedFamilyMembers.has('daniel');
document.querySelector('#showCamille').checked = includedFamilyMembers.has('camille');
let relationshipInteractionEnabled = includedFamilyMembers.size > 1;
document.querySelector("#showBridges").checked = relationshipInteractionEnabled;
const lockedRelationshipPairs = new Set();
const lockedRelationshipLinks = new Set();
const relationshipPairKey = (a, b) => [a, b].sort().join(':');
let transitSnapshot = null;
let transitDurationEstimates = [];
let lifetimeTimelineActive = false;
const transitToggle = document.querySelector('#showTransits');
const designActivationToggle = document.querySelector('#showDesignActivations');
const personalityActivationToggle = document.querySelector('#showPersonalityActivations');
try {
  transitToggle.checked = localStorage.getItem('castalia-hd-show-transits') !== 'false';
} catch {
  transitToggle.checked = true;
}
let sourceDocument = null;
let featureDocument = null;
let loader = null;
async function loadBodygraphTemplate(url) {
  // bodygraph.svg lays out gate markers and channel splines in its inline SVG
  // script. Parsing the fetched XML directly skips that script, leaving the
  // heart gates at their old placeholder coordinates and breaking their
  // channels in the family planes. Load it once as a real SVG document, let
  // its own geometry pass run, then parse the resulting markup for Three.js.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = '';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:360px;height:360px;border:0;opacity:0;pointer-events:none';
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true });
    frame.addEventListener('error', () => reject(new Error('bodygraph.svg could not be rendered')), { once: true });
  });
  frame.src = url;
  document.body.append(frame);
  try {
    await loaded;
    // The SVG's synchronous layout script needs a rendered frame for screen
    // transforms used when routing channels along center walls.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const svg = frame.contentDocument?.documentElement;
    if (!svg || svg.localName !== 'svg') throw new Error('bodygraph.svg did not produce an SVG document');
    // Capture gate locations in chakra-local coordinates while the SVG
    // is mounted, including its vertical spacing and center transforms.
    svg.querySelectorAll('.gate[data-center]').forEach(gate => {
      const marker = gate.querySelector('.gate-marker');
      const shape = svg.querySelector('.center[data-center="' + gate.dataset.center + '"] .center-shape');
      const markerMatrix = marker?.getScreenCTM(), shapeMatrix = shape?.getScreenCTM();
      if (!markerMatrix || !shapeMatrix) return;
      const point = svg.createSVGPoint();
      point.x = Number(marker.getAttribute('cx'));
      point.y = Number(marker.getAttribute('cy'));
      const local = point.matrixTransform(markerMatrix).matrixTransform(shapeMatrix.inverse());
      gate.setAttribute('data-opening-x', String(local.x));
      gate.setAttribute('data-opening-y', String(local.y));
    });
    const parsed = new DOMParser().parseFromString(new XMLSerializer().serializeToString(svg), 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('bodygraph.svg layout could not be parsed');
    return parsed;
  } finally {
    frame.remove();
  }
}
function templatePerson(person = 'daniel') {
  return sourceDocument?.querySelector(person === 'daniel' ? '.person--daniel' : '.person--camille')
    || sourceDocument?.querySelector('#bodygraph-art')
    || sourceDocument?.documentElement;
}
function templateChannels(person = 'daniel') {
  return [...(templatePerson(person)?.querySelectorAll('.channel-group[data-from][data-to]') || [])];
}
let natalParentsReady = false;
const gateDescriptions = new Map();
const channelDescriptions = new Map();
let rebuildTimer = null;
let exactFrontAlignment = true;
let frontPerson = 'daniel';
let readingFrontPerson = null;
let readingMode = 'family';
let readingViewKey = '';
const generatedReadings = new Map();
const flowAnimations = [];
const systemChannelRoutes = [];
const centerParticleAnimations = [];
const sacralEmitters = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let channelFlowEnabled = true;
// Keep the solo chart still so the only visible structural motion is a
// hanging channel's open end. Family rotation remains available on demand.
let autoRotate = !reduceMotion && includedFamilyMembers.size > 1;
const autoRotateSpeed = 0.035; // radians per second; one slow turn takes about three minutes
const colors = {
  daniel: new THREE.Color('#1689d4'),
  camille: new THREE.Color('#dc5261'),
  finn: new THREE.Color('#87d9ff'),
  aleia: new THREE.Color('#ee91c3')
};
const childPalette = [colors.aleia, colors.finn];
const familyLayout = { parentScale: parentChartScale, childScale: parentChartScale, parentRadius: 220 };
function childPlaneRadius() {
  return Number(document.querySelector('#separation').value) / 2;
}
function chartColor(person) {
  if (colors[person]) return colors[person];
  const childIndex = Math.max(0, familyChildren.findIndex(child => child.id === person));
  const childName = familyChildren[childIndex]?.name?.toLowerCase() || '';
  if (childName.includes('finn')) return colors.finn;
  if (childName.includes('aleia')) return colors.aleia;
  return childPalette[childIndex % childPalette.length];
}
function addChartColorShadow(group, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return;
  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 128);
  const rgb = [color.r, color.g, color.b].map(value => Math.round(value * 255));
  gradient.addColorStop(0, `rgba(${rgb.join(',')},0.075)`);
  gradient.addColorStop(0.58, `rgba(${rgb.join(',')},0.045)`);
  gradient.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(440, 440),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
  );
  shadow.position.set(180, 180, -3);
  shadow.renderOrder = -1;
  shadow.userData.chartColorShadow = true;
  group.add(shadow);
}
function clearChartInitials() {
  for (const { sprite, controls: layerControls } of chartInitials.values()) {
    layerControls?.remove();
    scene.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
  }
  chartInitials.clear();
}
function addChartInitial(person, initial, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 76px system-ui, sans-serif';
  context.shadowColor = color.getStyle();
  context.shadowBlur = 18;
  context.fillStyle = color.getStyle();
  context.fillText(initial, 96, 54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  label.scale.set(42, 25, 1);
  label.name = `${initial} chart initial`;
  label.renderOrder = 20;
  scene.add(label);
  const layerControls = document.createElement('div');
  layerControls.className = 'bodygraph-layer-controls';
  layerControls.setAttribute('role', 'group');
  layerControls.setAttribute('aria-label', (window.hdChartNames?.[person] || person) + ' activation layers');
  for (const [key, title, tint] of [['allChannels', 'All channels', '#888888'], ['design', 'Design', '#ff5968'], ['personality', 'Personality', '#419dff'], ['transits', 'Transits', '#c0c7d2']]) {
    const item = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = layersFor(person)[key];
    input.style.accentColor = tint;
    input.addEventListener('change', () => {
      layersFor(person)[key] = input.checked;
      rebuildRelationship();
    });
    item.append(input, document.createTextNode(title));
    layerControls.append(item);
  }
  const ownerLabel = document.createElement('strong');
  ownerLabel.textContent = initial;
  ownerLabel.style.color = color.getStyle();
  layerControls.prepend(ownerLabel);
  document.querySelector('#footerLayerControls').append(layerControls);
  chartInitials.set(person, { sprite: label, controls: layerControls });
}
function syncChartInitials() {
  chartRoot.updateMatrixWorld(true);
  for (const [person, { sprite, controls: layerControls }] of chartInitials) {
    const point = chartPointInFamily({ x: 180, y: chartFrameHeight + 22 }, person);
    sprite.position.copy(chartRoot.localToWorld(point));
    sprite.visible = person === 'daniel' ? (planeGroups.daniel?.visible ?? true)
      : person === 'camille' ? (planeGroups.camille?.visible ?? true)
        : (familyGroups[person]?.visible ?? true);
    layerControls.hidden = !sprite.visible;
  }
}
function chartTextColor(person) {
  // Darken the chart swatch for readable text on the light reading panel.
  return chartColor(person).clone().lerp(new THREE.Color('#292820'), 0.36).getStyle();
}
function appendPersonColoredText(element, text, people, personName) {
  element.replaceChildren();
  const entries = people.map(person => ({ person, name: personName(person) }))
    .filter(entry => entry.name)
    .sort((a, b) => b.name.length - a.name.length);
  if (!entries.length) {
    element.textContent = text;
    return;
  }
  const byName = new Map(entries.map(entry => [entry.name.toLocaleLowerCase(), entry]));
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${entries.map(entry => escapeRegExp(entry.name)).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    element.append(document.createTextNode(text.slice(cursor, start)));
    const mention = document.createElement('span');
    mention.textContent = match[2];
    const entry = byName.get(match[2].toLocaleLowerCase());
    if (entry) {
      mention.style.color = chartTextColor(entry.person);
      mention.style.fontWeight = '650';
    }
    element.append(mention);
    cursor = end;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}
function appendInteractiveReadingText(element, text, people, personName) {
  element.replaceChildren();
  const channelIds = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')].map(channel => {
    const a = +channel.dataset.from, b = +channel.dataset.to;
    return `${Math.min(a, b)}-${Math.max(a, b)}`;
  }));
  const matches = [];
  const channelPattern = /\b(?:channel\s+)?(\d{1,2})\s*[–-]\s*(\d{1,2})(?:\s+channel)?\b/gi;
  for (const match of text.matchAll(channelPattern)) {
    const a = +match[1], b = +match[2];
    const id = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (channelIds.has(id)) matches.push({ start: match.index, end: match.index + match[0].length, kind: 'channel', id, label: match[0] });
  }
  const gatePattern = /\b(gates?)\s+(\d{1,2}(?:(?:\s*,\s*|\s+and\s+)\d{1,2})*)/gi;
  for (const match of text.matchAll(gatePattern)) {
    const numbersStart = match.index + match[0].lastIndexOf(match[2]);
    const numberPattern = /\d{1,2}/g;
    for (const number of match[2].matchAll(numberPattern)) {
      const gate = +number[0];
      if (gate < 1 || gate > 64) continue;
      matches.push({
        start: numbersStart + number.index,
        end: numbersStart + number.index + number[0].length,
        kind: 'gate', id: gate, label: number[0]
      });
    }
  }
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const centerAliases = Object.entries(centerDescriptions).flatMap(([id, [label]]) => [
    { id, label },
    ...(id === 'solar' ? [{ id, label: 'Solar Plexus' }] : []),
    ...(id === 'ego' ? [{ id, label: 'Ego' }, { id, label: 'Heart' }] : [])
  ]).sort((a, b) => b.label.length - a.label.length);
  for (const { id, label } of centerAliases) {
    const centerPattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'gi');
    for (const match of text.matchAll(centerPattern)) {
      matches.push({ start: match.index, end: match.index + match[0].length, kind: 'center', id, label: match[0] });
    }
  }
  const entries = people.map(person => ({ person, name: personName(person) }))
    .filter(entry => entry.name)
    .sort((a, b) => b.name.length - a.name.length);
  if (entries.length) {
    const namesPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${entries.map(entry => escapeRegExp(entry.name)).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
    for (const match of text.matchAll(namesPattern)) {
      const start = match.index + match[1].length;
      matches.push({ start, end: start + match[2].length, kind: 'person', label: match[2], person: entries.find(entry => entry.name.toLocaleLowerCase() === match[2].toLocaleLowerCase())?.person });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  const appendPlain = plainText => {
    if (!plainText) return;
    const fragment = document.createElement('span');
    appendPersonColoredText(fragment, plainText, people, personName);
    element.append(...fragment.childNodes);
  };
  for (const match of matches) {
    if (match.start < cursor) continue;
    appendPlain(text.slice(cursor, match.start));
    if (match.kind === 'person') {
      const mention = document.createElement('span');
      mention.textContent = match.label;
      mention.style.color = chartTextColor(match.person);
      mention.style.fontWeight = '650';
      element.append(mention);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reading-feature-link';
      button.dataset.readingFeature = `${match.kind}:${match.id}`;
      button.setAttribute('aria-pressed', String(selectedKey === `reading:${match.kind}:${match.id}`));
      button.setAttribute('aria-label', `Highlight ${match.kind} ${match.id} on the BodyGraph`);
      button.title = `Highlight ${match.kind} ${match.id} on the BodyGraph`;
      button.textContent = match.label;
      element.append(button);
    }
    cursor = match.end;
  }
  appendPlain(text.slice(cursor));
}
function renderAiReading(text, people, personName) {
  const root = document.querySelector('#familyReadingBody');
  if (!root) return;
  root.querySelector('.ai-reading')?.remove();
  const section = document.createElement('section');
  section.className = 'ai-reading';
  section.setAttribute('aria-label', 'AI-generated chart interpretation');
  const label = document.createElement('small');
  label.className = 'ai-reading-label';
  label.textContent = 'AI reading';
  section.append(label);
  for (const paragraph of String(text).split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)) {
    const item = document.createElement('p');
    appendInteractiveReadingText(item, paragraph, people, personName);
    section.append(item);
  }
  root.prepend(section);
}
function cameraAzimuth() {
  const offset = camera.position.clone().sub(controls.target);
  return Math.atan2(offset.x, offset.z);
}
function topViewAmount() {
  const elevation = camera.position.clone().sub(controls.target).normalize().y;
  const amount = THREE.MathUtils.clamp((elevation - 0.28) / (0.92 - 0.28), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
function orientPlaneToCamera(group, scale, flipX, parentYaw = 0, centerZ = 0, parentFrame = chartRoot, inward = new THREE.Vector3(0, 0, -1)) {
  if (!group) return;
  const facingYaw = cameraAzimuth() - familyAzimuth - parentYaw;
  const upright = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingYaw);
  const frameRotation = parentFrame.getWorldQuaternion(new THREE.Quaternion()).invert();
  const normal = camera.position.clone().sub(controls.target).normalize().applyQuaternion(frameRotation).normalize();
  let up = inward.clone().addScaledVector(normal, -inward.dot(normal));
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0).addScaledVector(normal, -normal.y);
  up.normalize();
  const right = up.clone().cross(normal).normalize();
  up = normal.clone().cross(right).normalize();
  const faceInward = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  group.quaternion.copy(upright).slerp(faceInward, topViewAmount());

  // Keep the chart center fixed while its plane pitches and turns.
  const localChartCenter = new THREE.Vector3(180 * group.scale.x, chartFrameHeight / 2 * group.scale.y, 0).applyQuaternion(group.quaternion);
  group.position.set(0, familyViewCenterY, centerZ).sub(localChartCenter);
}
function syncChartFacing() {
  const visiblePeople = Object.keys(currentNatalGates || {}).filter(familyMemberIsVisible);
  const soloPerson = visiblePeople.length === 1 ? visiblePeople[0] : null;
  for (const person of ['daniel', 'camille']) {
    const centerZ = soloPerson ? 0 : person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
    const inward = new THREE.Vector3(0, 0, centerZ >= 0 ? -1 : 1);
    orientPlaneToCamera(planeGroups[person], familyLayout.parentScale, false, 0, centerZ, chartRoot, inward);
    orientPlaneToCamera(transitGroups[person], familyLayout.parentScale, false, 0, centerZ, chartRoot, inward);
  }
  familyChildren.forEach((child, index) => {
    const parent = familyGroups[child.id];
    if (!parent) return;
    if (soloPerson === child.id) {
      parent.position.set(0, 0, 0);
      parent.rotation.y = 0;
    }
    const chart = parent.children.find(item => item.name.includes('SVG plane'));
    orientPlaneToCamera(chart, familyLayout.childScale, false, parent.rotation.y, 0, parent, new THREE.Vector3(0, 0, 1));
    orientPlaneToCamera(transitGroups[child.id], familyLayout.childScale, false, parent.rotation.y, 0, parent, new THREE.Vector3(0, 0, 1));
  });
}
function worldPointInFamily(point) {
  chartRoot.updateWorldMatrix(true, false);
  return chartRoot.worldToLocal(point.clone());
}
function worldVectorInFamily(origin, vector) {
  const localOrigin = worldPointInFamily(origin);
  return worldPointInFamily(origin.clone().add(vector)).sub(localOrigin);
}
function worldVectorInObject(object, origin, vector) {
  object.updateWorldMatrix(true, false);
  const localOrigin = object.worldToLocal(origin.clone());
  const localTip = object.worldToLocal(origin.clone().add(vector));
  return localTip.sub(localOrigin);
}
function attachParticleToFamily(bead, worldPosition, worldVelocity) {
  const localPosition = worldPointInFamily(worldPosition);
  const localVelocity = worldVectorInFamily(worldPosition, worldVelocity);
  chartRoot.attach(bead);
  bead.position.copy(localPosition);
  return localVelocity;
}
function gatesFor(person) {
  if (person === 'daniel') return parseGateList('#danielGates');
  if (person === 'camille') return parseGateList('#camilleGates');
  return new Set(familyChildren.find(child => child.id === person)?.gates || []);
}
function summarizeChart(gates, activations) {
  const template = templatePerson('daniel');
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
  return transitSnapshot?.gatePlanets?.[gate]?.join(', ') || 'transit';
}
function personCurrentlyInFront() {
  chartRoot.updateMatrixWorld(true);
  const towardViewer = camera.getWorldDirection(new THREE.Vector3()).negate();
  const target = controls.target;
  const candidates = [];
  for (const person of ['daniel', 'camille']) {
    const group = planeGroups[person];
    if (!group?.visible) continue;
    candidates.push({ person, point: group.localToWorld(new THREE.Vector3(180, chartFrameHeight / 2, 0)) });
  }
  for (const child of familyChildren) {
    const group = familyGroups[child.id];
    if (!group?.visible) continue;
    const chart = group.children.find(item => item.name.includes('SVG plane'));
    if (chart) candidates.push({ person: child.id, point: chart.localToWorld(new THREE.Vector3(180, chartFrameHeight / 2, 0)) });
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
  document.querySelector('#familyReading')?.style.setProperty('--chart-text-color', chartTextColor(readingPerson));
  root.replaceChildren();
  const peers = ['daniel', 'camille', ...familyChildren.map(child => child.id)].filter(person => person !== readingPerson);
  const gates = new Map([[readingPerson, gatesFor(readingPerson)]]);
  for (const peer of peers) gates.set(peer, gatesFor(peer));
  const activations = person => window.hdNatalPlanetaryActivations?.[person] || familyChildren.find(child => child.id === person)?.activations || [];
  const personName = person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  const familyPeople = ['daniel', 'camille', ...familyChildren.map(child => child.id)];
  const appendReadingText = (element, text) => appendInteractiveReadingText(element, text, familyPeople, personName);
  const frontName = personName(readingPerson);
  const summary = summarizeChart(gates.get(readingPerson), activations(readingPerson));
  const heading = document.querySelector('#familyReadingTitle');
  if (heading) heading.textContent = frontName;
  if (!summary) return;

  const allCenterIds = Object.keys(centerDescriptions);
  const relationshipPairs = peers.map(peer => [readingPerson, peer]);
  const chartFacts = person => {
    const chartGates = gates.get(person) || gatesFor(person);
    const chartSummary = summarizeChart(chartGates, activations(person));
    const definedCenterSet = new Set(chartSummary?.definedCenters || []);
    const activatedCenterSet = new Set([...chartGates].map(gate => gateDescriptions.get(gate)?.center).filter(Boolean));
    const allTransitGates = new Set(transitSnapshot?.gates || []);
    const chartTransits = [...allTransitGates].filter(gate => !chartGates.has(gate));
    const transitChannelChanges = transitToggle.checked && transitSnapshot
      ? templateChannels('daniel').flatMap(node => {
        const from = +node.dataset.from, to = +node.dataset.to;
        const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
        const transitGates = [from, to].filter(gate => allTransitGates.has(gate) && !chartGates.has(gate));
        if (!transitGates.length || !(chartGates.has(from) || allTransitGates.has(from)) || !(chartGates.has(to) || allTransitGates.has(to)) || (chartGates.has(from) && chartGates.has(to))) return [];
        return [{
          channel: `${Math.min(from, to)}–${Math.max(from, to)}`,
          channelName: channelDescriptions.get(id)?.name || relationshipChannelReadings[id]?.name || '',
          transitGates: transitGates.map(gate => ({ gate, planets: transitPlanetNames(gate), expectedThrough: transitGateWindow(gate) }))
        }];
      })
      : [];
    return {
      id: person,
      name: personName(person),
      role: person === 'daniel' || person === 'camille' ? 'parent' : 'child',
      type: chartSummary?.type,
      profile: chartSummary?.profile,
      authority: chartSummary?.authority,
      strategy: chartSummary?.strategy,
      natalGates: [...chartGates].sort((a, b) => a - b),
      definedCenters: chartSummary?.definedCenters || [],
      undefinedCenters: allCenterIds.filter(center => !definedCenterSet.has(center) && activatedCenterSet.has(center)),
      fullyOpenCenters: allCenterIds.filter(center => !definedCenterSet.has(center) && !activatedCenterSet.has(center)),
      natalChannels: chartSummary?.definedChannels || [],
      gateDetails: [...chartGates].sort((a, b) => a - b).map(gate => ({
        gate,
        name: gateDescriptions.get(gate)?.name || '',
        description: gateDescriptions.get(gate)?.description || '',
        center: gateDescriptions.get(gate)?.center || ''
      })),
      natalChannelDetails: templateChannels('daniel').flatMap(node => {
        const from = +node.dataset.from, to = +node.dataset.to;
        if (!chartGates.has(from) || !chartGates.has(to)) return [];
        const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
        const guide = channelDescriptions.get(id) || relationshipChannelReadings[id];
        return [{
          channel: id,
          name: guide?.name || '',
          description: guide?.description || '',
          gates: [from, to].map(gate => ({ gate, name: gateDescriptions.get(gate)?.name || '' }))
        }];
      }),
      transitChannelChanges,
      transitGates: chartTransits.map(gate => ({ gate, planets: transitPlanetNames(gate), expectedThrough: transitGateWindow(gate) }))
    };
  };
  const relationshipFacts = (personA, personB) => {
    const gatesA = gates.get(personA) || gatesFor(personA);
    const gatesB = gates.get(personB) || gatesFor(personB);
    const summaryA = summarizeChart(gatesA, activations(personA));
    const summaryB = summarizeChart(gatesB, activations(personB));
    const combined = summarizeChart(new Set([...gatesA, ...gatesB]), [...activations(personA), ...activations(personB)]);
    const natalPairCenters = new Set(combined?.definedCenters || []);
    const transitSet = new Set(transitToggle.checked ? transitSnapshot?.gates || [] : []);
    const withTransit = summarizeChart(new Set([...gatesA, ...gatesB, ...transitSet]), [...activations(personA), ...activations(personB)]);
    const centersA = new Set(summaryA?.definedCenters || []);
    const centersB = new Set(summaryB?.definedCenters || []);
    const centersTogether = new Set(combined?.definedCenters || []);
    const activatedA = new Set([...gatesA].map(gate => gateDescriptions.get(gate)?.center).filter(Boolean));
    const activatedB = new Set([...gatesB].map(gate => gateDescriptions.get(gate)?.center).filter(Boolean));
    const nameA = personName(personA), nameB = personName(personB);
    const roleA = personA === 'daniel' || personA === 'camille' ? 'parent' : 'child';
    const roleB = personB === 'daniel' || personB === 'camille' ? 'parent' : 'child';
    const relationshipType = roleA === 'parent' && roleB === 'parent' ? 'parent-parent' : roleA === 'child' && roleB === 'child' ? 'child-child' : 'parent-child';
    const natalBridges = templateChannels('daniel').flatMap(node => {
      const from = +node.dataset.from, to = +node.dataset.to;
      if (!(gatesA.has(from) || gatesB.has(from)) || !(gatesA.has(to) || gatesB.has(to))) return [];
      if ((gatesA.has(from) && gatesA.has(to)) || (gatesB.has(from) && gatesB.has(to))) return [];
      const fromOwners = [ ...(gatesA.has(from) ? [nameA] : []), ...(gatesB.has(from) ? [nameB] : []) ];
      const toOwners = [ ...(gatesA.has(to) ? [nameA] : []), ...(gatesB.has(to) ? [nameB] : []) ];
      if (!fromOwners.length || !toOwners.length || ![...fromOwners, ...toOwners].includes(nameA) || ![...fromOwners, ...toOwners].includes(nameB)) return [];
      const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
      const guide = channelDescriptions.get(id) || relationshipChannelReadings[id];
      return [{
        channel: id,
        connectionType: 'cross-chart natal bridge',
        channelName: guide?.name || '',
        channelDescription: guide?.description || '',
        connectionMeaning: `${nameA} and ${nameB} complete this channel across their charts while together; this is a shared connection theme and does not change either person's natal definition.`,
        gateContributions: [from, to].map(gate => ({
          gate,
          name: gateDescriptions.get(gate)?.name || '',
          description: gateDescriptions.get(gate)?.description || '',
          natalOwners: [ ...(gatesA.has(gate) ? [nameA] : []), ...(gatesB.has(gate) ? [nameB] : []) ],
          transitPlanets: []
        }))
      }];
    });
    return {
      relationshipType,
      ...(relationshipType === 'parent-child' ? {
        parent: roleA === 'parent' ? nameA : nameB,
        child: roleA === 'child' ? nameA : nameB
      } : {}),
      centerDynamics: allCenterIds.map(center => ({
        center,
        firstDefined: centersA.has(center),
        secondDefined: centersB.has(center),
        definedInPair: centersTogether.has(center),
        definedWithTransit: new Set(withTransit?.definedCenters || []).has(center),
        firstState: centersA.has(center) ? 'defined' : activatedA.has(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
        secondState: centersB.has(center) ? 'defined' : activatedB.has(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
        relationship: centersA.has(center) && centersB.has(center) ? 'defined by both' :
          centersA.has(center) ? `${nameA} defined; ${nameB} undefined` :
            centersB.has(center) ? `${nameB} defined; ${nameA} undefined` :
              centersTogether.has(center) ? 'defined only by the pair' : 'undefined in both and in the pair'
      })),
      natalBridges,
      transitDefinedCenters: allCenterIds.filter(center => new Set(withTransit?.definedCenters || []).has(center) && !natalPairCenters.has(center))
    };
  };
  const transitGateSet = new Set(transitToggle.checked ? transitSnapshot?.gates || [] : []);
  const activeTransitBridgeChannels = (personA, personB) => {
    const gatesA = gates.get(personA) || new Set();
    const gatesB = gates.get(personB) || new Set();
    const natalGates = { [personA]: gatesA, [personB]: gatesB };
    return templateChannels('daniel').flatMap(node => {
      const from = +node.dataset.from, to = +node.dataset.to;
      const channel = `${Math.min(from, to)}-${Math.max(from, to)}`;
      if ((gatesA.has(from) && gatesA.has(to)) || (gatesB.has(from) && gatesB.has(to))) return [];
      const hasRelationshipBridge = relationshipLinkSpecs(from, to, personA, personB, natalGates, transitGateSet).length > 0;
      const transitGates = [from, to].filter(gate => transitGateSet.has(gate) && !gatesA.has(gate) && !gatesB.has(gate));
      if (!hasRelationshipBridge || !transitGates.length) return [];
      const reading = channelDescriptions.get(channel) || relationshipChannelReadings[channel];
      const expectedThrough = transitGates.map(gate => `Gate ${gate} ${transitGateWindow(gate)}`).join('; ');
      return [{
        channel,
        connectionType: 'transit-assisted relationship completion',
        channelName: reading?.name || '',
        channelDescription: reading?.description || '',
        gateContributions: [from, to].map(gate => ({
          gate,
          name: gateDescriptions.get(gate)?.name || '',
          natalOwners: [ ...(gatesA.has(gate) ? [personName(personA)] : []), ...(gatesB.has(gate) ? [personName(personB)] : []) ],
          transitPlanets: transitGateSet.has(gate) ? transitPlanetNames(gate) : ''
        })),
        expectedThrough
      }];
    });
  };
  const viewContext = {
    frontPerson: chartFacts(readingPerson),
    relationships: relationshipPairs.map(([a, b]) => {
      const pair = { ids: [a, b], people: [personName(a), personName(b)], charts: [chartFacts(a), chartFacts(b)] };
      Object.assign(pair, relationshipFacts(a, b));
      pair.transitBridgeChannels = activeTransitBridgeChannels(a, b);
      pair.transitChannelRecurrence = publicPairRecurrence(pair, pair.transitBridgeChannels.map(channel => channel.channel));
      return pair;
    }),
    transitsShown: Boolean(transitToggle.checked),
    transitAsOf: transitSnapshot ? new Date(transitSnapshot.epoch * 1000).toLocaleString() : null,
    transitEpoch: transitSnapshot ? transitSnapshot.epoch * 1000 : null,
    lifetimeTimeline: lifetimeTimelineActive
  };
  viewContext.pentaMode = readingMode === 'penta';
  viewContext.penta = buildPenta(familyPeople.map(person => ({
    id: person,
    name: personName(person),
    role: person === 'daniel' || person === 'camille' ? 'parent' : 'child',
    gates: [...(gates.get(person) || gatesFor(person))]
  })));
  viewContext.familyRecurrence = publicFamilyRecurrence([viewContext.frontPerson, ...viewContext.relationships.map(pair => pair.charts[1])]);
  readingViewKey = JSON.stringify(viewContext);
  window.hdCurrentReadingView = viewContext;

  const familyButton = document.querySelector('#showFamilyView');
  const pentaButton = document.querySelector('#showPentaView');
  familyButton?.setAttribute('aria-pressed', String(readingMode === 'family'));
  pentaButton?.setAttribute('aria-pressed', String(readingMode === 'penta'));
  const aiButton = document.querySelector('#generateFamilyReading');
  if (aiButton) aiButton.textContent = readingMode === 'penta' ? '✦ AI Penta reading' : '✦ AI reading';
  if (readingMode === 'penta') {
    document.querySelector('#familyReading')?.style.setProperty('--chart-text-color', '#7864a6');
    if (heading) heading.textContent = `Family Penta · ${viewContext.penta.memberCount} members`;
    const intro = document.createElement('p');
    intro.textContent = viewContext.penta.eligible
      ? `This group layer reads how ${viewContext.penta.memberCount} family charts combine around practical roles, direction, memory, rhythm, resources, and shared experience. It summarizes natal gates only; it is not a fifth bodygraph.`
      : `A Penta reading is intended for 3–5 people. This family group has ${viewContext.penta.memberCount} charts, so the Penta pattern is not available.`;
    root.append(intro);
    if (viewContext.penta.eligible) {
      for (const channel of viewContext.penta.channels) {
        const item = document.createElement('p');
        const gateText = channel.gateContributions.map(({ gate, members }) => `Gate ${gate}: ${members.join(', ') || 'not contributed'}`).join('; ');
        item.textContent = `${channel.channel} ${channel.name} — ${channel.function}. ${channel.complete ? `${channel.completion}; ${gateText}.` : `Incomplete in this family: ${gateText}.`}`;
        appendReadingText(item, item.textContent);
        root.append(item);
      }
      const gaps = viewContext.penta.gates.filter(item => !item.covered).map(item => item.gate);
      const coverage = document.createElement('p');
      coverage.textContent = `The family covers ${viewContext.penta.coveredGateCount} of 12 Penta gates and completes ${viewContext.penta.completeChannelCount} of 6 Penta channels in the group reading.${gaps.length ? ` Gates not represented are ${gaps.join(', ')}.` : ' All 12 gates are represented.'}`;
      appendReadingText(coverage, coverage.textContent);
      root.append(coverage);
    }
    const note = document.createElement('small');
    note.textContent = 'Penta is a Human Design group framework for 3–5 people. These are reflective themes, not fixed roles or predictions.';
    root.append(note);
    readingViewKey = JSON.stringify(viewContext);
    window.hdCurrentReadingView = viewContext;
    const cached = generatedReadings.get(readingViewKey);
    if (cached) renderAiReading(cached, familyPeople, personName);
    return;
  }

  const describeCenters = (centers, withThemes = false) => centers.map(center => {
    const [name, theme] = centerDescriptions[center] || [center, ''];
    const centerTheme = theme.replace(/[.!?]+$/, '').toLowerCase();
    return withThemes && centerTheme ? `${name} (${centerTheme})` : name;
  });
  const frontDefined = new Set(summary.definedCenters);
  const frontOpen = allCenterIds.filter(center => !frontDefined.has(center));
  const intro = document.createElement('p');
  const channelNames = summary.definedChannels.map(id => {
    const reading = channelDescriptions.get(id) || relationshipChannelReadings[id];
    return `${id.replace('-', '–')}${reading?.name ? ` ${reading.name}` : ''}`;
  });
  intro.textContent = `In front, ${frontName}'s ${summary.type}${summary.profile ? ` (${summary.profile})` : ''} chart has defined centers ${describeCenters([...frontDefined], true).join(', ') || 'none'}${channelNames.length ? ` through channels including ${channelNames.join(', ')}` : ''}. Its undefined (open) centers are ${describeCenters(frontOpen, true).join(', ') || 'none'}. In Human Design, definition is read as relatively consistent energy; an undefined center is more receptive to and can amplify other people's energy. Neither is better or worse, and the suggested strategy is to ${summary.strategy}.`;
  appendReadingText(intro, intro.textContent);
  root.append(intro);

  const natalFrontGates = gates.get(readingPerson);
  const transitGates = new Set(transitSnapshot?.gates || []);
  const transitChannels = [];
  const channels = templateChannels('daniel').map(channel => {
    const from = +channel.dataset.from, to = +channel.dataset.to;
    const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
    return { id, from, to, label: id.replace('-', '–'), reading: channelDescriptions.get(id) || relationshipChannelReadings[id] };
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
    if (!transitChannels.length) {
      transitSection.textContent = `At ${asOf}, the transits do not complete a new channel in ${frontName}'s chart, so there is no temporary channel change to highlight.`;
    } else {
      const channelDetails = transitChannels.map(channel => {
        const names = channel.reading?.name ? ` · ${channel.reading.name}` : '';
        const bounds = channel.temporaryGates.map(gate => `gate ${gate} ${transitGateWindow(gate)}`).join(' and ');
        return `the ${channel.label}${names} channel is temporarily complete while ${bounds}; after the contributing transit gate moves on, it will no longer be completed by the transit`;
      });
      const centers = temporaryCenters.length ? ` Together, these activations temporarily define ${temporaryCenters.map(center => centerDescriptions[center]?.[0] || center).join(', ')}.` : '';
      transitSection.textContent = `At ${asOf}, the transits temporarily complete ${channelDetails.join('; ')}.${centers}`;
    }
    appendReadingText(transitSection, transitSection.textContent);
    root.append(transitSection);
  }

  for (const [personA, personB] of relationshipPairs) {
    const gatesA = gates.get(personA) || gatesFor(personA), gatesB = gates.get(personB) || gatesFor(personB);
    const nameA = personName(personA), nameB = personName(personB);
    const summaryA = summarizeChart(gatesA, activations(personA));
    const summaryB = summarizeChart(gatesB, activations(personB));
    const sharedGates = [...gatesA].filter(gate => gatesB.has(gate)).sort((a, b) => a - b);
    const sharedChannels = channels.filter(channel => gatesA.has(channel.from) && gatesA.has(channel.to) && gatesB.has(channel.from) && gatesB.has(channel.to));
    const complementary = channels.filter(channel => (gatesA.has(channel.from) && !gatesA.has(channel.to) && !gatesB.has(channel.from) && gatesB.has(channel.to)) || (gatesA.has(channel.to) && !gatesA.has(channel.from) && !gatesB.has(channel.to) && gatesB.has(channel.from)));
    const facts = [];
    const centersA = new Set(summaryA?.definedCenters || []), centersB = new Set(summaryB?.definedCenters || []);
    const combinedGates = new Set([...gatesA, ...gatesB]);
    const combinedSummary = summarizeChart(combinedGates, [...activations(personA), ...activations(personB)]);
    const combinedCenters = new Set(combinedSummary?.definedCenters || []);
    const bothDefined = allCenterIds.filter(center => centersA.has(center) && centersB.has(center));
    const aDefinedBOpen = allCenterIds.filter(center => centersA.has(center) && !centersB.has(center));
    const bDefinedAOpen = allCenterIds.filter(center => centersB.has(center) && !centersA.has(center));
    const openInBoth = allCenterIds.filter(center => !centersA.has(center) && !centersB.has(center));
    const newlyDefinedTogether = allCenterIds.filter(center => combinedCenters.has(center) && !centersA.has(center) && !centersB.has(center));
    const openInConnection = allCenterIds.filter(center => !combinedCenters.has(center));
    const definedInConnection = allCenterIds.filter(center => combinedCenters.has(center));
    facts.push(`Together, their connection defines ${describeCenters(definedInConnection).join(', ') || 'no centers'}; ${openInConnection.length ? `${describeCenters(openInConnection).join(', ')} remain undefined (open)` : 'no centers remain undefined'}`);
    if (bothDefined.length) {
      facts.push(`Both charts define ${describeCenters(bothDefined).join(', ')}, so ${describeCenters(bothDefined).join(' and ')} are relatively consistent themes for each person and may feel mutually reinforcing`);
    }
    if (aDefinedBOpen.length) {
      facts.push(`${nameA} defines ${describeCenters(aDefinedBOpen).join(', ')} while those centers are undefined (open) in ${nameB}'s chart; in Human Design terms, ${nameA} may bring a steadier expression there, while ${nameB} may be more receptive to and amplify it, with their experience varying by context`);
    }
    if (bDefinedAOpen.length) {
      facts.push(`${nameB} defines ${describeCenters(bDefinedAOpen).join(', ')} while those centers are undefined (open) in ${nameA}'s chart; ${nameB} may bring a steadier expression there, while ${nameA} may be more receptive to and amplify it, with their experience varying by context`);
    }
    if (openInBoth.length) {
      facts.push(`${describeCenters(openInBoth).join(', ')} are undefined (open) in both individual charts, so neither person supplies a fixed baseline in those areas`);
    }
    if (newlyDefinedTogether.length) {
      facts.push(`Together, their complementary gates define ${describeCenters(newlyDefinedTogether).join(', ')} in the connection, creating a shared energy neither chart defines alone`);
    }
    if (openInConnection.length) {
      facts.push(`In the combined chart, ${describeCenters(openInConnection).join(', ')} remain undefined (open) and receptive`);
    }
    if (complementary.length) {
      const descriptions = complementary.map(channel => {
        const fromOwner = gatesA.has(channel.from) ? nameA : nameB;
        const toOwner = gatesA.has(channel.to) ? nameA : nameB;
        const fromMeaning = gateDescriptions.get(channel.from);
        const toMeaning = gateDescriptions.get(channel.to);
        const fromLabel = `Gate ${channel.from}${fromMeaning?.name ? ` (${fromMeaning.name})` : ''}`;
        const toLabel = `Gate ${channel.to}${toMeaning?.name ? ` (${toMeaning.name})` : ''}`;
        const title = channel.reading?.name ? ` ${channel.reading.name}` : '';
        const channelTheme = channel.reading?.description?.replace(/[.!?]+$/, '');
        return `${fromOwner}'s hanging ${fromLabel} pairs with ${toOwner}'s ${toLabel}, completing the ${channel.label}${title} channel in their connection${channelTheme ? `, whose theme is ${channelTheme.charAt(0).toLowerCase()}${channelTheme.slice(1)}` : ''}`;
      });
      facts.push(`${descriptions.join('; ')}. In Human Design terms, this can create a shared channel dynamic while they are together; it does not change either person's natal chart definition`);
    }
    if (sharedChannels.length) facts.push(`Both charts also define ${sharedChannels.map(channel => `${channel.label}${channel.reading?.name ? ` ${channel.reading.name}` : ''}`).join(', ')} individually, reinforcing a shared channel theme`);
    if (sharedGates.length) facts.push(`They share gates ${sharedGates.join(', ')}, adding common activation themes`);
    if (transitToggle.checked && transitSnapshot) {
      const activeA = new Set([...gatesA, ...(layersFor(personA).transits ? transitGates : [])]);
      const activeB = new Set([...gatesB, ...(layersFor(personB).transits ? transitGates : [])]);
      const temporaryConnections = channels.flatMap(channel => {
        if (gatesA.has(channel.from) && gatesA.has(channel.to) || gatesB.has(channel.from) && gatesB.has(channel.to)) return [];
        const directions = [[channel.from, channel.to], [channel.to, channel.from]];
        return directions.flatMap(([gateA, gateB]) => {
          if (!activeA.has(gateA) || !activeB.has(gateB) || (!gatesA.has(gateA) && !gatesB.has(gateB))) return [];
          const temporaryGates = [
            ...(!gatesA.has(gateA) && transitGates.has(gateA) ? [gateA] : []),
            ...(!gatesB.has(gateB) && transitGates.has(gateB) ? [gateB] : [])
          ];
          return temporaryGates.length ? [{ channel, temporaryGates }] : [];
        });
      });
      if (temporaryConnections.length) {
        const connectionText = temporaryConnections.map(({ channel, temporaryGates }) => {
          const title = channel.reading?.name ? ` (${channel.reading.name})` : '';
          const gatesText = temporaryGates.map(gate => `Gate ${gate}, activated by ${transitPlanetNames(gate)}, ${transitGateWindow(gate)}`).join(' and ');
          return `the ${channel.label}${title} channel temporarily, while ${gatesText}; it will no longer be completed by the transit after its contributing gate moves on`;
        });
        facts.push(`${lifetimeTimelineActive ? 'At the selected time, the transits' : 'Current transits'} temporarily complete ${connectionText.join('; ')}`);
      }
    }
    const item = document.createElement('p');
    const itemText = facts.length
      ? `${nameA} and ${nameB}'s relationship: ${facts.join('. ')}.`
      : `${nameA} and ${nameB}'s relationship has no shared gates or complementary channel completions in their natal charts.`;
    appendReadingText(item, itemText);
    root.append(item);
  }
  const note = document.createElement('small');
  note.textContent = 'These are Human Design prompts for reflection, not fixed claims about anyone or a compatibility verdict. Transit windows are estimates and can shift.';
  root.append(note);
  const cached = generatedReadings.get(readingViewKey);
  if (cached) renderAiReading(cached, familyPeople, personName);
  else if (window.hdUsingPublicExample) {
    const publicReading = generatePublicDemoReading(viewContext);
    if (publicReading) {
      generatedReadings.set(readingViewKey, publicReading);
      renderAiReading(publicReading, familyPeople, personName);
    }
  }
}
document.querySelector('#showFamilyView')?.addEventListener('click', () => {
  readingMode = 'family';
  frontFamilyReading();
});
document.querySelector('#showPentaView')?.addEventListener('click', () => {
  readingMode = 'penta';
  frontFamilyReading();
});
document.querySelector('#toggleChannelFlow')?.addEventListener('click', event => {
  channelFlowEnabled = !channelFlowEnabled;
  const configToggle = document.querySelector('#animateFlow');
  if (configToggle) configToggle.checked = channelFlowEnabled;
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(channelFlowEnabled));
  button.textContent = `Flow · ${channelFlowEnabled ? 'On' : 'Off'}`;
  for (const flow of flowAnimations) flow.bead.visible = channelFlowEnabled;
  for (const particle of centerParticleAnimations) particle.bead.visible = channelFlowEnabled;
});
document.querySelector('#generateFamilyReading')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  const root = document.querySelector('#familyReadingBody');
  if (!window.hdCurrentReadingView || !window.CastaliaHumanDesignAIReading?.generate) {
    button.textContent = 'Chart loading…';
    return;
  }
  const requestedKey = readingViewKey;
  const people = ['daniel', 'camille', ...familyChildren.map(child => child.id)];
  const personName = person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  button.disabled = true;
  button.textContent = 'Reading…';
  let status = root.querySelector('.ai-reading-status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'ai-reading-status';
    root.append(status);
  }
  status.textContent = 'Generating a grounded reading for this view…';
  try {
    const answer = await window.CastaliaHumanDesignAIReading.generate(window.hdCurrentReadingView);
    generatedReadings.set(requestedKey, answer);
    if (readingViewKey === requestedKey) {
      status.remove();
      renderAiReading(answer, people, personName);
    }
    button.textContent = '✦ Refresh AI reading';
  } catch (error) {
    if (readingViewKey === requestedKey) status.textContent = error.message || 'Could not generate the reading. Try again.';
    button.textContent = '✦ Try AI reading again';
  } finally {
    button.disabled = false;
  }
});
controls.addEventListener('start', () => { orbitDragging = true; });
controls.addEventListener('end', () => {
  orbitDragging = false;
  refreshRelationshipPairing(true);
  refreshFrontFamilyReading();
});
controls.addEventListener('change', refreshFrontFamilyReading);
const pale = new THREE.Color('#070707');
const gray = new THREE.Color('#96928a');
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
function curveFromSvgSubPath(subPath, z, reverse = false) {
  const curve = new THREE.Curve();
  curve.getPoint = (t, target = new THREE.Vector3()) => {
    const point = subPath.getPointAt(reverse ? 1 - THREE.MathUtils.clamp(t, 0, 1) : THREE.MathUtils.clamp(t, 0, 1));
    return target.set(point.x, point.y, z);
  };
  curve.getTangent = (t, target = new THREE.Vector3()) => {
    const tangent = subPath.getTangentAt(reverse ? 1 - THREE.MathUtils.clamp(t, 0, 1) : THREE.MathUtils.clamp(t, 0, 1));
    if (reverse) tangent.negate();
    return target.set(tangent.x, tangent.y, 0).normalize();
  };
  return curve;
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
function gradientTubeMaterial(opacity = 1, additive = false) {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    toneMapped: false
  });
}
function applyTubeGradient(geometry, fromColor, toColor, fromT = 0, toT = 1) {
  const positions = geometry.getAttribute('position');
  const tubularSegments = geometry.parameters.tubularSegments;
  const radialSegments = geometry.parameters.radialSegments;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const segment = Math.floor(index / (radialSegments + 1));
    const localT = fromT + (toT - fromT) * Math.min(1, segment / tubularSegments);
    color.copy(fromColor).lerp(toColor, localT);
    const offset = index * 3;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
function createDynamicTube(radius, opacity, additive, tubularSegments = 36, radialSegments = 7, fromColor = '#ffffff', toColor = '#ffffff') {
  const geometry = new THREE.BufferGeometry();
  const ringSize = radialSegments + 1;
  const vertexCount = (tubularSegments + 1) * ringSize;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const colorA = new THREE.Color(fromColor), colorB = new THREE.Color(toColor), color = new THREE.Color();
  for (let ring = 0; ring <= tubularSegments; ring++) {
    color.copy(colorA).lerp(colorB, ring / tubularSegments);
    for (let side = 0; side <= radialSegments; side++) {
      const offset = (ring * ringSize + side) * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }
  const indices = [];
  for (let ring = 0; ring < tubularSegments; ring++) {
    for (let side = 0; side < radialSegments; side++) {
      const a = ring * ringSize + side;
      const b = (ring + 1) * ringSize + side;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = additive ? 2 : 3;
  mesh.userData.svgPart = true;
  return { mesh, geometry, radius, tubularSegments, radialSegments };
}
// Two narrow walls leave the channel interior clear for its particles.
function channelSidePoints(points, side, normal = new THREE.Vector3(0, 0, 1)) {
  return points.map((point, index) => {
    const tangent = points[Math.min(index + 1, points.length - 1)].clone()
      .sub(points[Math.max(0, index - 1)]).normalize();
    const lateral = normal.clone().cross(tangent);
    if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
    return point.clone().addScaledVector(lateral.normalize(), side * channelWallOffset);
  });
}
function separateHangingChannels(points, flex, neighbors) {
  if (flex.locked) return points;
  const clearance = 16; // Keep tube walls and free tips visibly separated.
  return points.map((point, index) => {
    const weight = THREE.MathUtils.smoothstep(index / (points.length - 1), 0.18, 0.5);
    if (!weight) return point;
    const push = new THREE.Vector3();
    for (const neighbor of neighbors) {
      if (neighbor.flex === flex) continue;
      // Complementary ends must still be able to meet and lock.
      if (flex.reachTarget?.person === neighbor.flex.person
        && flex.channelId === neighbor.flex.channelId) continue;
      let nearest = null, distanceSq = clearance * clearance;
      for (let i = 1; i < neighbor.points.length; i++) {
        const a = neighbor.points[i - 1], b = neighbor.points[i];
        const segment = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(segment) / (segment.lengthSq() || 1), 0, 1);
        const candidate = a.clone().addScaledVector(segment, t);
        const d = candidate.distanceToSquared(point);
        if (d < distanceSq) { nearest = candidate; distanceSq = d; }
      }
      if (!nearest) continue;
      const direction = point.clone().sub(nearest);
      const distance = Math.sqrt(distanceSq);
      if (distance < 0.001) {
        direction.set(0, 0, flex.channelId.localeCompare(neighbor.flex.channelId) < 0 ? -1 : 1);
      } else direction.multiplyScalar(1 / distance);
      push.addScaledVector(direction, (clearance - distance) * 0.65);
    }
    push.clampLength(0, 8);
    return point.clone().addScaledVector(push, weight);
  });
}
function avoidHangingObstacles(points, flex) {
  const chart = flex.chart;
  chart.updateWorldMatrix(true, false);
  const polygons = chart.userData.channelObstacles || [];
  const gates = currentGatePoints[flex.person] || new Map();
  const anchor = gates.get(flex.activeGate);
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return Array.from({ length: 73 }, (_, index) => {
    const point = curve.getPointAt(index / 72);
    if (index === 0) return point;
    const local = chart.worldToLocal(chartRoot.localToWorld(point.clone()));
    // Only the exact attachment is exempt. Free ends can loop back near
    // their own gate and must still obey the chakra boundary.
    const socketClearance = THREE.MathUtils.lerp(0, 10, THREE.MathUtils.smoothstep(index / 72, 0, 0.2));
    for (let pass = 0; pass < 3; pass++) {
      for (const polygon of polygons) {
        let closest = null, distance = Infinity;
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const t = THREE.MathUtils.clamp(((local.x - a.x) * dx + (local.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          const edge = new THREE.Vector2(a.x + t * dx, a.y + t * dy);
          const d = Math.hypot(local.x - edge.x, local.y - edge.y);
          if (d < distance) { distance = d; closest = edge; }
        }
        const inside = pointInPolygon(local.x, local.y, polygon);
        if (closest && (inside || distance < socketClearance)) {
          const direction = new THREE.Vector2(local.x - closest.x, local.y - closest.y);
          if (inside) direction.negate();
          if (direction.lengthSq() < 1e-8) {
            const center = polygon.reduce((sum, p) => sum.add(p), new THREE.Vector2()).multiplyScalar(1 / polygon.length);
            direction.copy(closest).sub(center);
          }
          direction.normalize();
          local.x = closest.x + direction.x * socketClearance;
          local.y = closest.y + direction.y * socketClearance;
        }
      }
      for (const [gate, location] of gates) {
        if (gate === flex.activeGate) continue;
        const direction = new THREE.Vector2(local.x - location.x, local.y - location.y);
        if (direction.length() < 10) {
          if (direction.lengthSq() < 1e-8) direction.set(1, 0);
          direction.normalize().multiplyScalar(10);
          local.x = location.x + direction.x;
          local.y = location.y + direction.y;
        }
      }
    }
    return chartRoot.worldToLocal(chart.localToWorld(local));
  });
}
function constrainedPolyline(points) {
  const curve = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceToSquared(points[i - 1]) > 1e-10)
      curve.add(new THREE.LineCurve3(points[i - 1].clone(), points[i].clone()));
  }
  return curve;
}
function updateDynamicTube(tube, points) {
  if (points.length < 2) return;
  const curve = constrainedPolyline(points);
  const { tubularSegments, radialSegments, radius, geometry } = tube;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3(), vertex = new THREE.Vector3();
  const ringSize = radialSegments + 1;
  for (let ring = 0; ring <= tubularSegments; ring++) {
    curve.getPointAt(ring / tubularSegments, point);
    for (let side = 0; side <= radialSegments; side++) {
      const angle = side / radialSegments * Math.PI * 2;
      vertex.copy(frames.normals[ring]).multiplyScalar(-Math.cos(angle));
      vertex.addScaledVector(frames.binormals[ring], Math.sin(angle)).multiplyScalar(radius).add(point);
      position.setXYZ(ring * ringSize + side, vertex.x, vertex.y, vertex.z);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}
function gradientTubesFromCurve(curve, radius, fromColor, toColor, dashed = false) {
  const wallMaterial = gradientTubeMaterial(0.24, true);
  const coreMaterial = gradientTubeMaterial();
  const makePair = (path, segments, fromT, toT) => {
    const wallGeometry = new THREE.TubeGeometry(path, segments, radius * 2.8, 8, false);
    applyTubeGradient(wallGeometry, fromColor, toColor, fromT, toT);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.renderOrder = 2;
    wall.userData.svgPart = true;
    const coreGeometry = new THREE.TubeGeometry(path, segments, radius, 6, false);
    applyTubeGradient(coreGeometry, fromColor, toColor, fromT, toT);
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.renderOrder = 3;
    core.userData.svgPart = true;
    return [wall, core];
  };
  if (!dashed) return makePair(curve, 96, 0, 1);
  const total = curve.getLength();
  if (!Number.isFinite(total) || total <= 0) {
    wallMaterial.dispose();
    coreMaterial.dispose();
    return [];
  }
  const meshes = [];
  const dashLength = 7, gapLength = 4;
  for (let start = 0; start < total; start += dashLength + gapLength) {
    const end = Math.min(start + dashLength, total);
    const divisions = Math.max(2, Math.ceil((end - start) / 1.5));
    const points = [];
    for (let index = 0; index <= divisions; index++) {
      const distance = start + (end - start) * index / divisions;
      points.push(curve.getPointAt(distance / total));
    }
    const segment = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    meshes.push(...makePair(segment, Math.max(4, divisions * 2), start / total, end / total));
  }
  return meshes;
}
function addFlowMotion(target, curve, color, hover = null, reverse = false, size = 1, phaseOffset = 0, particleCount = 1, transport = null) {
  if (curve) systemChannelRoutes.push({ container: target, curve, reverse, transport });
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function randomPointInPolygon(polygon) {
  const bounds = polygon.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  for (let attempt = 0; attempt < 48; attempt++) {
    const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
    const y = THREE.MathUtils.lerp(bounds.minY, bounds.maxY, Math.random());
    if (pointInPolygon(x, y, polygon)) return new THREE.Vector2(x, y);
  }
  return polygon.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / polygon.length);
}
function seedCenterParticle(particle) {
  particle.container.attach(particle.bead);
  particle.bead.scale.setScalar(1);
  const point = randomPointInPolygon(particle.polygon);
  particle.bead.position.set(point.x, point.y, 5.2);
  const angle = Math.random() * Math.PI * 2;
  const speed = 2.6 + Math.random() * 3.8;
  particle.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
  particle.state = 'plane';
  particle.age = 0;
  particle.escapeAt = 2.2 + Math.random() * 5.5;
}
function spawnSystemParticle(group, polygon, centerId, color) {
      const bead = new THREE.Group();
      const tint = new THREE.Color(color);
      const glowMaterial = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
      const coreMaterial = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color('#fffdf2'), 0.64), toneMapped: false });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6), glowMaterial);
      const core = new THREE.Mesh(new THREE.SphereGeometry(particleRadius, 8, 6), coreMaterial);
      glow.renderOrder = 5;
      core.renderOrder = 6;
      bead.add(glow, core);
      bead.userData.centerParticle = true;
      group.add(bead);
      const particle = {
        bead, glow, glowMaterial, coreMaterial, chakraColor: new THREE.Color(color), container: group, centerId,
        polygon: polygon.map(point => point.clone()), velocity: new THREE.Vector3(),
        state: 'plane', age: 0, escapeAt: 0, escapeVelocity: null,
        escapeDuration: 8 + Math.random() * 4
      };
      centerParticleAnimations.push(particle);
      seedCenterParticle(particle);
      bead.visible = channelFlowEnabled;
      return particle;
}
function addCenterParticleAnimations(group, paths) {
  for (const path of paths) {
    const node = path.userData?.node;
    if (!node?.getAttribute('class')?.split(/\s+/).includes('center-shape')) continue;
    const center = node.closest('.center');
    const shape = path.toShapes(true)[0];
    if (!center || !shape) continue;
    const polygon = shape.getPoints(32);
    if (polygon.length < 3) continue;
    const centerId = center.getAttribute('data-center') || 'center';
    const color = node.getAttribute('data-base-fill')
      || node.style?.getPropertyValue('--chakra-color') || '#8bd8ff';
    if (centerId === 'sacral') sacralEmitters.push({ group, polygon, color, elapsed: 0, particles: [] });
    const count = centerId === 'sacral' ? 24 : center.getAttribute('data-defined') === 'true' ? 6 : 3;
    for (let index = 0; index < count; index++) {
      spawnSystemParticle(group, polygon, centerId, color);
    }
  }
}
function clearCenterParticleAnimations() {
  sacralEmitters.length = 0;
  for (const particle of centerParticleAnimations) {
    particle.bead.removeFromParent();
    particle.bead.traverse(object => {
      object.geometry?.dispose();
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
    });
  }
  centerParticleAnimations.length = 0;
}
function releaseCenterParticleInto3D(particle) {
  const parent = particle.bead.parent;
  if (!parent) return;
  const worldPosition = particle.bead.getWorldPosition(new THREE.Vector3());
  const rotation = parent.getWorldQuaternion(new THREE.Quaternion());
  const normal = new THREE.Vector3(0, 0, Math.random() < 0.5 ? -1 : 1).applyQuaternion(rotation).normalize();
  const tangent = particle.velocity.clone().applyQuaternion(rotation).normalize();
  const lateral = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const worldVelocity = normal.multiplyScalar(34 + Math.random() * 18)
    .addScaledVector(tangent, 10 + Math.random() * 8)
    .addScaledVector(lateral, 8 + Math.random() * 8);
  // Center motes leave the flat polygon into its chart's local 3D space. Keep
  // them under that chart so camera-facing corrections cannot strand them.
  particle.escapeVelocity = worldVectorInObject(parent, worldPosition, worldVelocity);
  particle.bead.scale.setScalar(1);
  particle.state = 'escaped';
  particle.age = 0;
  particle.escapeDuration = 8 + Math.random() * 4;
}
function releaseParticleInto3D(flow) {
  const parent = flow.bead.parent;
  if (!parent) return;
  const endpoint = flow.reverse ? 0 : 1;
  const worldPosition = flow.bead.getWorldPosition(new THREE.Vector3());
  const worldRotation = parent.getWorldQuaternion(new THREE.Quaternion());
  const tangent = flow.curve.getTangentAt(endpoint).normalize();
  if (flow.reverse) tangent.negate();
  tangent.applyQuaternion(worldRotation).normalize();
  const normal = new THREE.Vector3(0, 0, Math.random() < 0.5 ? -1 : 1).applyQuaternion(worldRotation).normalize();
  const lateral = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const worldVelocity = normal.multiplyScalar(42 + Math.random() * 22)
    .addScaledVector(tangent, 12 + Math.random() * 8)
    .addScaledVector(lateral, 8 + Math.random() * 8);
  flow.bead.scale.setScalar(1);
  const receiver = findReceivingChannel(flow);
  if (receiver) {
    const targetReverse = receiver.transport.fromGate === flow.transport.exitGate
      ? false
      : receiver.transport.toGate === flow.transport.exitGate ? true : receiver.reverse;
    const endpoint = receiver.curve.getPointAt(targetReverse ? 1 : 0);
    const target = receiver.container.localToWorld(endpoint.clone());
    const distance = worldPosition.distanceTo(target);
    const targetNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(receiver.container.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const lift = Math.min(130, 35 + distance * 0.22);
    flow.transitStart = worldPointInFamily(worldPosition);
    const control1World = worldPosition.clone().addScaledVector(normal, lift).addScaledVector(tangent, 28);
    flow.transitControl1 = worldPointInFamily(control1World);
    attachParticleToFamily(flow.bead, worldPosition, worldVelocity);
    flow.transitReceiver = receiver;
    flow.transitReverse = targetReverse;
    flow.transitDuration = THREE.MathUtils.clamp(distance / (52 + Math.random() * 22), 1.4, 8);
    flow.transitProgress = 0;
    flow.state = 'transit';
    flow.escapeAge = 0;
    flow.targetNormal = targetNormal;
    flow.transitLift = lift;
    return;
  }
  flow.escapeVelocity = worldVectorInObject(parent, worldPosition, worldVelocity);
  flow.state = 'escaped';
  flow.escapeAge = 0;
  flow.escapeDuration = 8 + Math.random() * 4;
}
function findReceivingChannel(flow) {
  if (!flow.transport) return null;
  const visiblePerson = person => planeGroups[person]
    ? planeGroups[person].visible
    : (familyGroups[person]?.visible ?? false);
  const candidates = flowAnimations.filter(candidate =>
    candidate !== flow && candidate.state === 'plane' && candidate.transport
    && candidate.transport.person !== flow.transport.person
    && visiblePerson(candidate.transport.person)
    && candidate.container?.visible !== false
  );
  if (!candidates.length) return null;
  const matchingGate = candidates.filter(candidate =>
    candidate.transport.fromGate === flow.transport.exitGate
    || candidate.transport.toGate === flow.transport.exitGate
  );
  const pool = matchingGate.length ? matchingGate : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
function arriveAtReceivingChannel(flow) {
  const receiver = flow.transitReceiver;
  if (!receiver?.container) {
    recycleParticleIntoPlane(flow);
    return;
  }
  flow.container = receiver.container;
  flow.curve = receiver.curve;
  flow.reverse = flow.transitReverse;
  flow.transport = {
    ...receiver.transport,
    exitGate: flow.reverse ? receiver.transport.fromGate : receiver.transport.toGate
  };
  flow.duration = receiver.duration;
  flow.container.attach(flow.bead);
  flow.bead.rotation.set(0, 0, 0);
  flow.bead.position.copy(flow.curve.getPointAt(flow.reverse ? 1 : 0));
  flow.progress = 0;
  flow.state = 'plane';
  flow.transitReceiver = null;
  flow.transitControl1 = null;
  flow.targetNormal = null;
  flow.transitStart = null;
  flow.transitLift = null;
}
function recycleParticleIntoPlane(flow) {
  if (!flow.container) return;
  flow.container.attach(flow.bead);
  flow.bead.scale.setScalar(1);
  flow.bead.rotation.set(0, 0, 0);
  flow.bead.position.copy(flow.curve.getPointAt(flow.reverse ? 1 : 0));
  flow.progress = flow.phase;
  flow.state = 'plane';
  flow.escapeAge = 0;
  flow.escapeVelocity = null;
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
    // Separate overlapping chart tracks through the channel body, but taper
    // the offset to zero at both gate markers so every rail remains attached.
    const progress = index / Math.max(1, points.length - 1);
    const endpointTaper = Math.sin(Math.PI * progress);
    return {
      x: point.x - dy / length * amount * endpointTaper,
      y: point.y + dx / length * amount * endpointTaper
    };
  });
}
function snapChannelEndpoints(points, gatePoints, fromGate, toGate) {
  if (points.length < 2) return points;
  const from = gatePoints.get(+fromGate);
  const to = gatePoints.get(+toGate);
  if (!from || !to) return points;
  const direct = Math.hypot(points[0].x - from.x, points[0].y - from.y)
    + Math.hypot(points.at(-1).x - to.x, points.at(-1).y - to.y);
  const reverse = Math.hypot(points[0].x - to.x, points[0].y - to.y)
    + Math.hypot(points.at(-1).x - from.x, points.at(-1).y - from.y);
  const start = direct <= reverse ? from : to;
  const end = direct <= reverse ? to : from;
  const key = fromGate + ':' + toGate + ':' + (direct <= reverse);
  if (gatePoints.routes?.has(key)) return gatePoints.routes.get(key);
  const polygons = gatePoints.obstacles || [];
  const clear = (a, b) => {
    const count = Math.max(12, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      if (polygons.some(polygon => pointInPolygon(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, polygon))) return false;
    }
    return true;
  };
  let route = [start, end];
  if (!clear(start, end)) {
    const nodes = [start, end];
    for (const polygon of polygons) {
      const center = polygon.reduce((sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }), { x: 0, y: 0 });
      for (const point of polygon) {
        const length = Math.hypot(point.x - center.x, point.y - center.y) || 1;
        nodes.push({ x: point.x + (point.x - center.x) / length * 3, y: point.y + (point.y - center.y) / length * 3 });
      }
    }
    const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set();
    distances[0] = 0;
    while (visited.size < nodes.length) {
      let current = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
      if (current < 0 || !Number.isFinite(distances[current]) || current === 1) break;
      visited.add(current);
      for (let i = 0; i < nodes.length; i++) {
        if (visited.has(i)) continue;
        const distance = distances[current] + Math.hypot(nodes[i].x - nodes[current].x, nodes[i].y - nodes[current].y);
        if (distance < distances[i] && clear(nodes[current], nodes[i])) { distances[i] = distance; previous[i] = current; }
      }
    }
    if (Number.isFinite(distances[1])) {
      route = [];
      for (let index = 1; index >= 0; index = previous[index]) route.unshift(nodes[index]);
    } else {
      // Keep the original exterior SVG route if no visibility path was found;
      // never substitute the straight line already known to cross a chakra.
      route = points.map(point => ({ x: point.x, y: point.y }));
      route[0] = start;
      route[route.length - 1] = end;
    }
  }
  // Dense linear samples keep later interpolation close to the clear route.
  const aligned = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const count = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let j = 1; j <= count; j++) aligned.push({ x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count });
  }
  gatePoints.routes?.set(key, aligned);
  return aligned;
}
function inquiryContext(key, title) {
  const gate = key.match(/(?:^|:)gate:(\d+)$/);
  if (gate) return { kind: 'gate', label: title };
  const channel = key.match(/(?:^|:)channel:(\d+)[–-](\d+)$/);
  if (channel) return { kind: 'channel', label: title };
  const center = key.match(/(?:^|:)center:([^:]+)$/);
  if (center) {
    const entry = Object.entries(centerDescriptions).find(([, [label]]) => label.toLocaleLowerCase() === center[1].toLocaleLowerCase());
    return entry ? { kind: 'center', label: entry[1][0] } : null;
  }
  return null;
}
function hoverInfo(key, title, detail) {
  const feature = inquiryContext(key, title);
  const questions = feature ? interpretiveQuestions(feature.kind, feature.label) : [];
  return { hoverKey: key, hoverTip: { title, detail, questions } };
}
function activationDescription(activations = []) {
  if (!activations.length) return '';
  return ['personality', 'design'].map(type => {
    const planets = [...new Set(activations.filter(item => item.type === type).map(item => item.planet.replaceAll('_', ' ')))];
    if (!planets.length) return '';
    const label = type === 'personality' ? 'Personality (black)' : 'Design (red)';
    return `${label}: ${planets.join(', ')}`;
  }).filter(Boolean).join('; ');
}
function channelForGate(gateNumber, doc) {
  const featureSource = featureDocument || doc;
  if (!featureSource) return null;
  const gate = [...featureSource.querySelectorAll('.channel-group[data-from][data-to]')]
    .find(channel => +channel.dataset.from === gateNumber || +channel.dataset.to === gateNumber);
  if (!gate) return null;
  const from = +gate.dataset.from, to = +gate.dataset.to;
  const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
  const counterpart = from === gateNumber ? to : from;
  return { node: gate, from, to, id, counterpart, reading: channelDescriptions.get(id) || relationshipChannelReadings[id] };
}
function gateCounterpartReading(gateNumber, doc) {
  const pairing = channelForGate(gateNumber, doc);
  if (!pairing) return '';
  const counterpartMeaning = gateDescriptions.get(pairing.counterpart);
  const counterpartNode = doc.querySelector(`.gate[data-gate="${pairing.counterpart}"]`);
  const counterpartOpen = counterpartNode?.dataset.state !== 'closed';
  const counterpartName = counterpartMeaning?.name ? ` · ${counterpartMeaning.name}` : '';
  const counterpartDescription = counterpartMeaning?.description || 'its complementary gate theme';
  const channelName = pairing.reading?.name ? ` · ${pairing.reading.name}` : '';
  const channelDescription = pairing.reading?.description || 'Together the two gates form a channel with a shared theme.';
  return ` Its counterpart is Gate ${pairing.counterpart}${counterpartName}: ${counterpartDescription}. Together they form Channel ${pairing.id.replace('-', '–')}${channelName}; ${channelDescription} The counterpart is currently ${counterpartOpen ? 'open' : 'active'} in this chart.`;
}
function describePathFeature(node, person, activationsByGate, transitSnapshot = null) {
  const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2');
  const gate = gateGroup(node);
  const channel = channelGroup(node);
  const center = centerGroup(node);
  if (gate) {
    const number = +gate.dataset.gate;
    const centerName = centerDescriptions[gate.dataset.center]?.[0] || (gate.dataset.center || 'body').replace(/-/g, ' ');
    const active = gate.dataset.state === 'closed';
    const transitPlanets = transitSnapshot?.gatePlanets?.[number] || [];
    const key = `${person}:gate:${number}`;
    const meaning = gateDescriptions.get(number);
    const doc = gate.ownerDocument || sourceDocument;
    const activation = activationDescription(activationsByGate.get(number));
    const activationNote = activation ? ` Planetary activations: ${activation}.` : '';
    const transitNote = transitPlanets.length ? ` Current transit activation: ${transitPlanets.join(', ')}.` : '';
    return hoverInfo(key, `Gate ${number}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || 'A gate is one activation point in a channel.'}${gateCounterpartReading(number, doc)} ${owner} · ${centerName} center · natal ${active ? 'active' : 'open'}${transitPlanets.length ? '; currently activated by transit' : ''}.${activationNote}${transitNote}`);
  }
  if (channel) {
    const channelId = `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`;
    const label = channelId.replace('-', '–');
    const circuit = channel.dataset.circuitLabel || channel.dataset.circuit || 'BodyGraph';
    const circuitGroup = channel.dataset.circuitGroupLabel || '';
    const complete = channel.dataset.defined === 'true';
    const key = `${person}:channel:${label}`;
    const meaning = channelDescriptions.get(channelId) || relationshipChannelReadings[channelId];
    const doc = channel.ownerDocument || sourceDocument;
    const gateReading = [channel.dataset.from, channel.dataset.to].map(gateNumber => {
      const gateMeaning = gateDescriptions.get(+gateNumber);
      const gateName = gateMeaning?.name ? ` · ${gateMeaning.name}` : '';
      return `Gate ${gateNumber}${gateName}: ${gateMeaning?.description || 'one side of this channel'}`;
    });
    const gateState = [channel.dataset.from, channel.dataset.to].map(gateNumber => {
      const gateNode = doc?.querySelector(`.gate[data-gate="${gateNumber}"]`);
      return `Gate ${gateNumber} is ${gateNode?.dataset.state === 'closed' ? 'active' : 'open'}`;
    });
    const fromActivations = activationDescription(activationsByGate.get(+channel.dataset.from));
    const toActivations = activationDescription(activationsByGate.get(+channel.dataset.to));
    const gateActivations = [
      fromActivations && `Gate ${channel.dataset.from}: ${fromActivations}`,
      toActivations && `Gate ${channel.dataset.to}: ${toActivations}`
    ].filter(Boolean);
    const activationNote = gateActivations.length ? ` Planetary activations · ${gateActivations.join(' · ')}.` : '';
    return hoverInfo(key, `Channel ${label}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || `${owner} · ${circuit}.`} Its two ends are ${gateReading.join('; ')}. Together, these counterparts carry the channel’s shared desire and theme. ${gateState.join('; ')}. ${owner} · ${circuit}${circuitGroup ? ` · ${circuitGroup}` : ''} · ${complete ? 'complete' : 'open'}.${activationNote}`);
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
function addBodygraphSvgPlane(group, paths, activationVisibility = {}, transitGates = new Set()) {
  const svgRoot = paths.find(path => path.userData?.node)?.userData.node.ownerSVGElement;
  if (!svgRoot) return;
  const artwork = svgRoot.cloneNode(true);
  // The Three.js pass below draws every channel from its SVG path. Hide the
  // rasterized channel strokes so defined channels are not painted twice.
  artwork.querySelectorAll('.channel-group').forEach(channel => {
    channel.style.setProperty('display', 'none', 'important');
    channel.querySelectorAll('.channel,.channel-core,.channel-highlight,.channel-flow,.channel-hit,.hanging-segments,.channel-open-ends')
      .forEach(path => path.style.opacity = '0');
    channel.classList.remove('is-partial', 'is-hanging-flex', 'is-flowing', 'is-transit-defined');
    channel.style.removeProperty('transform');
    channel.style.removeProperty('transform-origin');
    channel.style.removeProperty('transform-box');
  });
  // This SVG is a static chart texture. Its source document carries CSS
  // hanging-half animations from the interactive standalone BodyGraph; only
  // the Three.js hanging-channel meshes should move in this view.
  artwork.querySelectorAll('.physics-particle,.flow-dot,.hanging-active-half,.hanging-segments,.channel-arrowhead-layer')
    .forEach(node => node.remove());
  artwork.setAttribute('width', '360');
  artwork.setAttribute('height', String(chartFrameHeight));
  artwork.removeAttribute('style');
  artwork.removeAttribute('role');
  artwork.removeAttribute('aria-labelledby');
  artwork.querySelectorAll('title,desc,text,script,.gate-number,.svg-tooltip,#gate-state-legend,#flow-control,#flow-direction-legend').forEach(node => node.remove());
  artwork.querySelectorAll('.gate[data-state="closed"]').forEach(gate => {
    const types = (gate.getAttribute('data-activation') || '').toLowerCase().match(/\b(design|personality)\b/g) || [];
    if (types.length && !types.some(type => activationVisibility[type] !== false)) {
      gate.querySelectorAll('.gate-marker').forEach(marker => marker.style.setProperty('opacity', '0', 'important'));
    }
  });
  // Open the chakra boundary at activated gates; a marker alone does not
  // remove the wall beneath the channel entrance.
  const svgNS = 'http://www.w3.org/2000/svg';
  let openingDefs = artwork.querySelector('defs');
  if (!openingDefs) {
    openingDefs = document.createElementNS(svgNS, 'defs');
    artwork.prepend(openingDefs);
  }
  artwork.querySelectorAll('.center[data-center]').forEach((center, index) => {
    const shape = center.querySelector('.center-shape');
    if (!shape) return;
    shape.removeAttribute('mask');
    const gates = [...artwork.querySelectorAll('.gate[data-gate]')]
      .filter(gate => {
        if (gate.dataset.center !== center.dataset.center) return false;
        if (activationVisibility.allChannels || transitGates.has(Number(gate.dataset.gate))) return true;
        if (gate.dataset.state !== 'closed') return false;
        const types = (gate.getAttribute('data-activation') || '').toLowerCase().match(/\b(design|personality)\b/g) || [];
        return types.length === 0 || types.some(type => activationVisibility[type] !== false);
      });
    if (!gates.length) return;
    // Keep the chakra interior intact: only the boundary receives openings.
    const fill = shape.cloneNode(true);
    fill.removeAttribute('id');
    fill.removeAttribute('mask');
    fill.style.setProperty('stroke', 'none', 'important');
    shape.before(fill);
    shape.style.setProperty('fill', 'none', 'important');
    shape.style.setProperty('filter', 'none', 'important');
    const mask = document.createElementNS(svgNS, 'mask');
    const id = 'threejs-gate-openings-' + index;
    mask.id = id;
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '-1000');
    mask.setAttribute('y', '-1000');
    mask.setAttribute('width', '3000');
    mask.setAttribute('height', '3000');
    const background = document.createElementNS(svgNS, 'rect');
    for (const [key, value] of Object.entries({ x: -1000, y: -1000, width: 3000, height: 3000, fill: 'white' })) background.setAttribute(key, String(value));
    mask.append(background);
    for (const gate of gates) {
      const marker = gate.querySelector('.gate-marker');
      if (!marker?.hasAttribute('cx')) continue;
      const hole = document.createElementNS(svgNS, 'ellipse');
      hole.setAttribute('cx', gate.getAttribute('data-opening-x') || marker.getAttribute('cx'));
      hole.setAttribute('cy', gate.getAttribute('data-opening-y') || marker.getAttribute('cy'));
      const markerX = Number(marker.getAttribute('cx')), markerY = Number(marker.getAttribute('cy'));
      const neighborDistance = Math.min(...gates.filter(other => other !== gate).map(other => {
        const otherMarker = other.querySelector('.gate-marker');
        return otherMarker ? Math.hypot(Number(otherMarker.getAttribute('cx')) - markerX, Number(otherMarker.getAttribute('cy')) - markerY) : Infinity;
      }));
      const sacralBottom = center.dataset.center === 'sacral' && [42, 3, 9].includes(Number(gate.dataset.gate));
      const openingWidth = channelClearWidth;
      hole.setAttribute('rx', String(openingWidth / 2 / 1.4));
      hole.setAttribute('ry', String(openingWidth / 2));
      hole.setAttribute('fill', 'black');
      mask.append(hole);
      // Markers can sit inward from the outline (notably the throat).
      // Cut a short socket all the way through the nearest chakra boundary.
      const x = Number(gate.getAttribute('data-opening-x') || marker.getAttribute('cx')), y = Number(gate.getAttribute('data-opening-y') || marker.getAttribute('cy'));
      // Work from XML attributes: detached SVG geometry APIs can throw
      // on Safari before the artwork has ever been attached to a document.
      let outline = [];
      if (shape.localName === 'rect') {
        const sx = Number(shape.getAttribute('x')), sy = Number(shape.getAttribute('y'));
        const width = Number(shape.getAttribute('width')), height = Number(shape.getAttribute('height'));
        outline = [[sx, sy], [sx + width, sy], [sx + width, sy + height], [sx, sy + height]];
      } else {
        const numbers = (shape.getAttribute('points') || shape.getAttribute('d') || '').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
        for (let i = 0; i + 1 < numbers.length; i += 2) outline.push([numbers[i], numbers[i + 1]]);
      }
      let nearest = null, distance = Infinity;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const point = { x: a[0] + t * dx, y: a[1] + t * dy };
        const d = Math.hypot(point.x - x, point.y - y);
        if (d < distance) { nearest = point; distance = d; }
      }
      if (sacralBottom && shape.localName === 'rect') {
        nearest = { x, y: Number(shape.getAttribute('y')) + Number(shape.getAttribute('height')) };
        distance = Math.abs(nearest.y - y);
      }
      if (nearest) {
        const dx = (nearest.x - x) / (distance || 1), dy = (nearest.y - y) / (distance || 1);
        const socket = document.createElementNS(svgNS, 'path');
        socket.setAttribute('d', 'M' + x + ',' + y + ' L' + (nearest.x + dx * 3) + ',' + (nearest.y + dy * 3));
        socket.setAttribute('stroke', 'black');
        socket.setAttribute('stroke-width', String(openingWidth / (Math.hypot(1.4 * dy, dx) || 1)));
        socket.setAttribute('stroke-linecap', 'round');
        socket.setAttribute('fill', 'none');
        mask.append(socket);
      }
    }
    openingDefs.append(mask);
    shape.setAttribute('mask', 'url(#' + id + ')');
  });
  artwork.querySelector('rect.canvas')?.remove();
  const style = [...artwork.querySelectorAll('style')].at(-1);
  if (style) style.textContent += `
    *,*::before,*::after{animation:none!important;transition:none!important}
    .channel-group,.channel-group *{transform:none!important;animation:none!important;transition:none!important}
    .gate[data-state="open"] .gate-marker{fill:none!important;stroke:none!important;opacity:0!important;visibility:hidden!important}
    .gate[data-state="closed"] .gate-marker{fill:#f5a742!important;stroke:#613b13!important;stroke-width:1!important;opacity:1!important;visibility:visible!important}
    .gate[data-state="closed"][data-activation*="design"] .gate-marker{stroke:#ff5968!important}
    .gate[data-state="closed"][data-activation*="personality"] .gate-marker{stroke:#419dff!important}
    .gate[data-state="closed"][data-activation*="design"][data-activation*="personality"] .gate-marker{stroke:#c184ff!important}`;
  const markup = new XMLSerializer().serializeToString(artwork);
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  // The chart group flips its y axis to convert SVG's downward-positive
  // coordinates into the upright Three.js plane; undo TextureLoader's image
  // flip here so that transform doesn't turn the artwork upside down.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(360, chartFrameHeight),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  plane.position.set(180, chartFrameHeight / 2, 0);
  plane.userData.svgArtwork = true;
  plane.renderOrder = 0;
  group.add(plane);
}
function makePlaneGroup(paths, person, sharedChannels, relationshipChannels, options = {}) {
  const group = new THREE.Group();
  group.userData.chartPerson = person;
  const owner = options.name || window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  group.name = `${owner} · ${person === 'daniel' ? 'blue' : person === 'camille' ? 'pink' : 'child'} SVG plane`;
  const color = options.color || chartColor(person);
  const transitColor = new THREE.Color('#c0c7d2');
  const transitGates = new Set(options.transitSnapshot?.gates || []);
  // Use the same gate set that generated this person's extracted SVG. Reading
  // marker attributes back from SVGLoader nodes is unreliable across SVG
  // parsing/cloning and can invert the defined versus hanging classification.
  const activeGates = options.activeGates || new Set();
  const planetaryActivations = options.activations || window.hdNatalPlanetaryActivations?.[person] || familyChildren.find(child => child.id === person)?.activations || [];
  const activationsByGate = new Map();
  for (const activation of planetaryActivations) {
    if (!activationsByGate.has(activation.gate)) activationsByGate.set(activation.gate, []);
    activationsByGate.get(activation.gate).push(activation);
  }
  const activationVisibility = options.activationVisibility || { design: true, personality: true };
  const gateActivationTypes = gate => new Set([
    ...(activationsByGate.get(+gate) || []).map(activation => String(activation.type || '').toLowerCase()),
    ...(sourceDocument?.querySelector(`.gate[data-gate="${gate}"]`)?.getAttribute('data-activation') || '').toLowerCase().match(/\b(design|personality)\b/g) || []
  ].filter(type => type === 'design' || type === 'personality'));
  const activationTypesVisible = types => types.size === 0 || [...types].some(type => activationVisibility[type] !== false);
  addChartColorShadow(group, color);
  addBodygraphSvgPlane(group, paths, activationVisibility, transitGates);
  group.userData.channelObstacles = paths.filter(path =>
    path.userData?.node?.getAttribute('class')?.split(/\s+/).includes('center-shape'))
    .flatMap(path => path.toShapes(true).map(shape => shape.getPoints(32)));
  const gatePoints = getGatePoints(paths);
  // Mark the two edges of each active socket without filling its opening.
  const socketGates = new Set();
  for (const path of paths) {
    const node = path.userData?.node;
    const gate = node && gateGroup(node);
    if (!gate || !node.classList.contains('gate-marker')) continue;
    const number = Number(gate.dataset.gate);
    if (socketGates.has(number)) continue;
    socketGates.add(number);
    const point = gatePoints.get(number);
    if (!point) continue;
    const types = gateActivationTypes(number);
    const design = activeGates.has(number) && types.has('design') && activationVisibility.design !== false;
    const personality = activeGates.has(number) && types.has('personality') && activationVisibility.personality !== false;
    const transit = transitGates.has(number);
    if (!design && !personality && !transit) continue;
    const tint = design && personality ? '#c184ff' : design ? '#ff5968' : personality ? '#419dff' : '#c0c7d2';
    const matchingChannel = paths.find(candidate => {
      const element = candidate.userData?.node;
      const channel = element && channelGroup(element);
      return channel && element.classList.contains('channel') && candidate.subPaths?.length
        && [Number(channel.dataset.from), Number(channel.dataset.to)].includes(number);
    });
    let tangent = new THREE.Vector3(0, 1, 0);
    if (matchingChannel) {
      const channel = channelGroup(matchingChannel.userData.node);
      const samples = snapChannelEndpoints(matchingChannel.subPaths[0].getPoints(32), gatePoints, channel.dataset.from, channel.dataset.to);
      if (Math.hypot(samples[0].x - point.x, samples[0].y - point.y) > Math.hypot(samples.at(-1).x - point.x, samples.at(-1).y - point.y)) samples.reverse();
      tangent.set(samples[1].x - samples[0].x, samples[1].y - samples[0].y, 0).normalize();
    }
    const lateral = new THREE.Vector3(-tangent.y, tangent.x, 0);
    const hover = describePathFeature(node, person, activationsByGate, options.transitSnapshot);
    for (const side of [-1, 1]) {
      const pixel = new THREE.Mesh(new THREE.PlaneGeometry(channelWallRadius * 2, channelWallRadius * 2),
        new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
      pixel.position.set(point.x, point.y, 4);
      pixel.position.addScaledVector(lateral, side * channelWallOffset);
      pixel.userData.channelWall = true;
      pixel.renderOrder = 12;
      if (hover) Object.assign(pixel.userData, hover);
      group.add(pixel);
    }
  }
  const renderedChannels = new Set();
  if (layersFor(person).allChannels) {
    const baseChannels = new Set();
    for (const path of paths) {
      const node = path.userData?.node;
      const channel = node && channelGroup(node);
      if (!channel || !node.classList.contains('channel') || !path.subPaths?.length) continue;
      const key = [Number(channel.dataset.from), Number(channel.dataset.to)].sort((a, b) => a - b).join('-');
      if (baseChannels.has(key)) continue;
      baseChannels.add(key);
      const hover = describePathFeature(node, person, activationsByGate, options.transitSnapshot);
      for (const subPath of path.subPaths) {
        const points = snapChannelEndpoints(subPath.getPoints(32), gatePoints, channel.dataset.from, channel.dataset.to)
          .map(point => new THREE.Vector3(point.x, point.y, 1.8));
        for (const side of [-1, 1]) {
          const wall = tubeFromPoints(channelSidePoints(points, side), 0.3, lineMaterial('#888888', 0.38), 1.8);
          if (!wall) continue;
          wall.userData.channelWall = true;
          if (hover) Object.assign(wall.userData, hover);
          group.add(wall);
        }
      }
    }
  }
  for (const path of paths) {
    const node = path.userData.node;
    if (!node) continue;
    const channel = channelGroup(node);
    const gate = gateGroup(node);
    const center = centerGroup(node);
    const cls = node.getAttribute('class') || '';
    const fromActive = Boolean(channel && activeGates.has(+channel.dataset.from));
    const toActive = Boolean(channel && activeGates.has(+channel.dataset.to));
    const active = Boolean(channel && fromActive && toActive);
    // Transit-completed channels are drawn once as full tubes by the overlay.
    if (channel && !active
      && (fromActive || transitGates.has(+channel.dataset.from))
      && (toActive || transitGates.has(+channel.dataset.to))) continue;
    const gateActive = gate?.getAttribute('data-state') === 'closed';
    const centerActive = center?.getAttribute('data-defined') === 'true';
    const isChannel = cls.split(/\s+/).includes('channel');
    const isGateMarker = cls.includes('gate-marker');
    const isCenterShape = cls.includes('center-shape');
    const centerChannelCount = isCenterShape ? Number(center?.getAttribute('data-channel-count') || 0) : 0;
    const centerActiveGateCount = isCenterShape ? Number(center?.getAttribute('data-active-gate-count') || 0) : 0;
    const channelId = channel ? `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}` : null;
    const channelTypes = new Set([
      ...(fromActive ? gateActivationTypes(channel.dataset.from) : []),
      ...(toActive ? gateActivationTypes(channel.dataset.to) : [])
    ]);
    if (channel && (active || fromActive !== toActive) && !activationTypesVisible(channelTypes)) continue;
    const hover = describePathFeature(node, person, activationsByGate, options.transitSnapshot);
    if (hover && channelId && relationshipChannels.has(channelId)) {
      hover.hoverKey = `relationship:channel:${channelId}`;
      hover.hoverTip.participantIds = [...(options.relationshipParticipants?.get(channelId) || [])];
    }

    if (path.subPaths?.length && isChannel) {
      if (renderedChannels.has(channelId)) continue;
      renderedChannels.add(channelId);
      // Keep each person's channels tinted by their chart color, including
      // open channels; lower opacity keeps the active paths in focus.
      const roadColor = channelTypes.has('design') && channelTypes.has('personality') ? '#c184ff'
        : channelTypes.has('design') ? '#ff5968'
          : channelTypes.has('personality') ? '#419dff' : color;
      // In exact front view, separate shared tracks by a few pixels so both
      // contributors remain visibly blue and pink instead of blending purple.
      // Hanging is a per-channel gate state; a defined center does not stop
      // an unmatched active gate on that center from flexing.
      const hanging = channel?.dataset.defined !== 'true' && !active && fromActive !== toActive;
      if (!active && !hanging) continue;
      const opacity = active ? (exactFrontAlignment ? 0.82 : 0.9) : hanging ? 0.48 : 0.13;
      const sharedOffset = exactFrontAlignment && active && sharedChannels.has(channelId) ? (person === 'daniel' ? -2.2 : 2.2) : 0;
      // Each SVG rail becomes a two-lane carriageway; the divider and dashed lane marks make the road legible in depth.
      const roadMat = lineMaterial(roadColor, opacity);
      const laneMat = lineMaterial(pale, active ? (exactFrontAlignment ? 0.38 : 0.58) : hanging ? 0.36 : 0.08);
      const activeGate = +channel.dataset[fromActive ? 'from' : 'to'];
      const activePoint = hanging ? gatePoints.get(activeGate) : null;
      for (const subPath of path.subPaths) {
        const rawPoints = snapChannelEndpoints(
          subPath.getPoints(16), gatePoints, channel.dataset.from, channel.dataset.to
        );
        const points = sharedOffset ? offsetPathPoints(rawPoints, sharedOffset) : rawPoints;
        if (hanging && activePoint) {
          const openGate = +channel.dataset[fromActive ? 'to' : 'from'];
          const openPoint = gatePoints.get(openGate);
          const startsAtActive = Math.hypot(rawPoints[0].x - activePoint.x, rawPoints[0].y - activePoint.y)
            <= Math.hypot(rawPoints[rawPoints.length - 1].x - activePoint.x, rawPoints[rawPoints.length - 1].y - activePoint.y);
          const fullRoute = (startsAtActive ? rawPoints : [...rawPoints].reverse())
            .map(point => new THREE.Vector3(point.x, point.y, 3.3));
          // A hanging gate owns only its half of the channel. Never place its
          // moving free end at the opposite center's fixed gate.
          const hangingCurve = new THREE.CatmullRomCurve3(fullRoute, false, 'centripetal');
          const route = Array.from({ length: 19 }, (_, index) => hangingCurve.getPointAt(index / 36));
          const sourcePolygon = (group.userData.channelObstacles || []).reduce((best, polygon) => {
            const distance = Math.min(...polygon.map(point => Math.hypot(point.x - activePoint.x, point.y - activePoint.y)));
            return !best || distance < best.distance ? { polygon, distance } : best;
          }, null)?.polygon;
          if (sourcePolygon) {
            const centroid = sourcePolygon.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / sourcePolygon.length);
            const outward = new THREE.Vector3(activePoint.x - centroid.x, activePoint.y - centroid.y, 0).normalize();
            const length = Math.max(18, Math.min(38, hangingCurve.getLength() * 0.5));
            for (let index = 1; index < route.length; index++) {
              const t = index / (route.length - 1);
              const departure = route[0].clone().addScaledVector(outward, length * t);
              route[index].lerp(departure, 0.75);
            }
          }
          const colorForGate = (svgRoot, gate) => {
            const gateNode = svgRoot?.querySelector(`.gate[data-gate="${gate}"]`);
            const centerShape = gateNode && svgRoot?.querySelector(`.center[data-center="${gateNode.dataset.center}"] .center-shape`);
            return centerShape?.getAttribute('data-base-fill')
              || centerShape?.style?.getPropertyValue('--chakra-color')
              || color;
          };
          const sinkColor = colorForGate(sourceDocument?.documentElement, openGate);
          const activeGateNode = channel.ownerSVGElement?.querySelector(`.gate[data-gate="${activeGate}"]`);
          const activeGateTypes = new Set([
            ...(activationsByGate.get(activeGate) || []).map(activation => String(activation.type || '').toLowerCase()),
            ...(activeGateNode?.getAttribute('data-activation') || '').toLowerCase().match(/\b(design|personality)\b/g) || []
          ]);
          const hangingType = activeGateTypes.has('design') && activeGateTypes.has('personality')
            ? 'both'
            : activeGateTypes.has('design') ? 'design'
              : activeGateTypes.has('personality') ? 'personality' : 'untyped';
          const hangingAccent = hangingType === 'design' ? '#ff5968'
            : hangingType === 'personality' ? '#419dff'
              : hangingType === 'both' ? '#c184ff' : '#eab64b';
          const sourceColor = hangingType === 'untyped' ? colorForGate(channel.ownerSVGElement, activeGate) : hangingAccent;
          const reachTarget = options.relationshipReachTargets?.get(channelId) || null;
          const tubeGroup = new THREE.Group();
          hangingFlexContainer.add(tubeGroup);
          if (hover) Object.assign(tubeGroup.userData, hover);
          const activationHalo = new THREE.Mesh(
            new THREE.RingGeometry(channelClearWidth / 2, channelClearWidth / 2 + channelWallRadius * 2, 24),
            new THREE.MeshBasicMaterial({
              color: hangingAccent, transparent: true, opacity: 0.96,
              blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
              depthWrite: false, toneMapped: false
            })
          );
          activationHalo.renderOrder = 7;
          activationHalo.name = `${hangingType} hanging gate marker`;
          tubeGroup.add(activationHalo);
          const wall = createDynamicTube(channelWallRadius, 0.85, false, 36, 6, sourceColor, sinkColor);
          const core = createDynamicTube(channelWallRadius, 0.85, false, 36, 6, sourceColor, sinkColor);
          const particleSourceColor = new THREE.Color(sourceColor);
          const particleSinkColor = new THREE.Color(sinkColor);
          const flowParticles = [];
          if (hover) { Object.assign(wall.mesh.userData, hover); Object.assign(core.mesh.userData, hover); }
          tubeGroup.add(wall.mesh, core.mesh);
          const phase = [...channelId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
          hangingFlexAnimations.push({
            tubeGroup, wall, core, route, chart: group, person, channelId,
            activeGate, openGate, activePoint, openPoint, reachTarget, activationHalo,
            isSink: channel.dataset.direction === 'directed' && activeGate === Number(channel.dataset.to),
            sourceCenter: channel.ownerSVGElement?.querySelector('.gate[data-gate="' + openGate + '"]')?.dataset.center,
            activeCenter: activeGateNode?.dataset.center,
            hangingType,
            phase: (phase % 13) * 0.37,
            amplitude: Math.min(8 + (phase % 5) * 2.2, route[0].distanceTo(route.at(-1)) * 0.18),
            duration: 2.7 + (phase % 7) * 0.23,
            flowParticles, particleSourceColor, particleSinkColor,
            tipPosition: null, tipVelocity: new THREE.Vector3(),
            locked: Boolean(reachTarget && lockedRelationshipLinks.has(reachTarget.lockKey)),
            lockKey: reachTarget?.lockKey || null
          });
          continue;
        }
        const centerline = points.map(point => new THREE.Vector3(point.x, point.y, 3.3));
        for (const side of [-1, 1]) {
          const rail = channelSidePoints(centerline, side);
          const road = tubeFromPoints(rail, active ? channelWallRadius : 0.15, roadMat, 3.3);
          if (road) {
            road.userData.channelWall = true;
            if (hover) Object.assign(road.userData, hover);
            group.add(road);
          }
        }
        if (!active && !hanging && hover) {
          const hitMaterial = new THREE.MeshBasicMaterial({
            color: '#ffffff', transparent: true, opacity: 0,
            colorWrite: false, depthWrite: false, side: THREE.DoubleSide
          });
          const hitTube = tubeFromPoints(points, 5.5, hitMaterial, 2.45);
          if (hitTube) { Object.assign(hitTube.userData, hover); group.add(hitTube); }
        }
        if (active && points.length > 2) {
          const from = gatePoints.get(+channel.dataset.from);
          const startsAtFrom = from && Math.hypot(rawPoints[0].x - from.x, rawPoints[0].y - from.y) <= Math.hypot(rawPoints[rawPoints.length - 1].x - from.x, rawPoints[rawPoints.length - 1].y - from.y);
          const flowCurve = new THREE.CatmullRomCurve3(
            centerline, false, 'centripetal');
          for (const gateNumber of [channel.dataset.from, channel.dataset.to]) {
            const opening = gatePoints.get(+gateNumber);
            if (!opening) continue;
            const ring = new THREE.Mesh(new THREE.RingGeometry(channelClearWidth / 2, channelClearWidth / 2 + channelWallRadius * 2, 24),
              new THREE.MeshBasicMaterial({ color: roadColor, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
            ring.position.set(opening.x, opening.y, 3.4);
            ring.renderOrder = 8;
            ring.userData.channelWall = true;
            if (hover) Object.assign(ring.userData, hover);
            group.add(ring);
          }
          const [fromGate, toGate] = startsAtFrom === false
            ? [channel.dataset.to, channel.dataset.from]
            : [channel.dataset.from, channel.dataset.to];
          const channelTransport = { person, channelId, fromGate, toGate };
          addFlowMotion(group, flowCurve, '#ffc247', hover, false, 1, 0, 3, {
            ...channelTransport, exitGate: toGate
          });
          addFlowMotion(group, flowCurve, '#a6edf7', hover, true, 0.82, 0.5, 2, {
            ...channelTransport, exitGate: fromGate
          });
        }

      }
      continue;
    }

    if (path.subPaths?.length && (isGateMarker || isCenterShape)) {
      const gateActivations = gate ? (activationsByGate.get(+gate.dataset.gate) || []) : [];
      const transitActive = isGateMarker && gate && transitGates.has(+gate.dataset.gate);
      if (isGateMarker && gateActive && !activationTypesVisible(gateActivationTypes(gate.dataset.gate))) continue;
      const gateDesign = gateActivations.some(item => item.type === 'design');
      const gatePersonality = gateActivations.some(item => item.type === 'personality');
      const gateFillColor = gateDesign && gatePersonality ? '#c184ff'
        : gateDesign ? '#ff5968' : gatePersonality ? '#419dff' : color;
      const fillColor = isGateMarker ? (transitActive ? transitColor : gateActive ? gateFillColor : pale) : (centerActiveGateCount ? color : pale);
      const centerTintBase = exactFrontAlignment ? 0.08 : 0.12;
      const centerTintPerGate = exactFrontAlignment ? 0.055 : 0.07;
      const centerTint = centerActiveGateCount
        ? Math.min(exactFrontAlignment ? 0.58 : 0.76, centerTintBase + centerActiveGateCount * centerTintPerGate)
        : 0.12;
      const fillOpacity = isCenterShape
        ? centerTint
        : transitActive ? 0.9 : gateActive ? (exactFrontAlignment ? 0.78 : 0.88) : 0;
      const fillMat = new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide, depthWrite: false });
      const outlineActive = isCenterShape ? centerActive : gateActive || transitActive;
      const outlineColor = isGateMarker && transitActive ? transitColor : color;
      const outlineMat = lineMaterial(outlineColor, exactFrontAlignment ? (outlineActive ? 0.92 : 0.56) : (outlineActive ? 1 : 0.76));
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
  addCenterParticleAnimations(group, paths);
  addChartInitial(person, owner.trim().charAt(0).toUpperCase(), color);
  // The embedded SVG is the visual source of truth. Keep the traced Three.js
  // geometry as invisible raycast targets for existing chart interactions.
  group.traverse(object => {
    if (!object.userData.svgPart || object.userData.channelWall || !object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.colorWrite = false;
      material.depthWrite = false;
    }
  });
  // SVG coordinates use a downward-positive Y axis. Flip the finished plane so the chart reads upright in 3D.
  group.scale.y = -1;
  group.position.set(-180, chartFrameHeight, 0);
  if (options.scale) {
    const xScale = options.flipX ? -options.scale : options.scale;
    const xOffset = options.flipX ? 180 * options.scale : -180 * options.scale;
    group.scale.set(xScale, -options.scale, options.scale);
    group.position.set(xOffset + (options.offsetX || 0), chartFrameHeight * options.scale + (options.offsetY || 0), 0);
  }
  return group;
}
function parseGateList(selector) {
  return new Set((document.querySelector(selector).value.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 64));
}
function extractLayer(doc, person, gates, activations = []) {
  const svg = doc.documentElement.cloneNode(true);
  const keep = svg.querySelector(person === 'daniel' ? '.person--daniel' : '.person--camille') || svg.querySelector('#bodygraph-art');
  // The current bodygraph template has one chart with its own centered art transform.
  if (!keep) throw new Error('BodyGraph template is missing its chart artwork');
  if (keep.id === 'bodygraph-art') keep.setAttribute('transform', 'translate(-72 0) scale(1.4 1)');
  else if (exactFrontAlignment) keep.setAttribute('transform', 'scale(1.08 1)');
  for (const child of [...svg.children]) {
    if (child === keep || ['defs', 'style'].includes(child.localName)) continue;
    child.remove();
  }
  // The live SVG adds animated copies of channel paths. Three.js builds
  // its own hanging geometry, so parse only each original centerline.
  keep.querySelectorAll('.hanging-active-half,.hanging-segments,.channel-arrowhead-layer,.channel-open-ends,.channel-backdrop,.physics-particle,.flow-dot').forEach(node => node.remove());
  const activationTypes = new Map();
  for (const activation of activations) {
    const type = String(activation.type || '').toLowerCase();
    if (!activationTypes.has(activation.gate)) activationTypes.set(activation.gate, new Set());
    if (type) activationTypes.get(activation.gate).add(type);
  }
  keep.querySelectorAll('.gate').forEach(g => {
    const gate = +g.dataset.gate;
    g.setAttribute('data-state', gates.has(gate) ? 'closed' : 'open');
    const types = [...(activationTypes.get(gate) || [])];
    if (types.length) g.setAttribute('data-activation', types.join(' '));
    else g.removeAttribute('data-activation');
  });
  const centerChannelCounts = new Map();
  const gateCenters = new Map([...keep.querySelectorAll('.gate[data-gate][data-center]')].map(gate => [+gate.dataset.gate, gate.dataset.center]));
  keep.querySelectorAll('.channel-group[data-from][data-to]').forEach(ch => {
    const fromActive = gates.has(+ch.dataset.from);
    const toActive = gates.has(+ch.dataset.to);
    const defined = fromActive && toActive;
    ch.setAttribute('data-defined', String(defined));
    ch.toggleAttribute('data-family-hanging', fromActive !== toActive);
    if (defined) {
      const fromCenter = gateCenters.get(+ch.dataset.from);
      const toCenter = gateCenters.get(+ch.dataset.to);
      if (fromCenter) centerChannelCounts.set(fromCenter, (centerChannelCounts.get(fromCenter) || 0) + 1);
      if (toCenter) centerChannelCounts.set(toCenter, (centerChannelCounts.get(toCenter) || 0) + 1);
    }
  });
  keep.querySelectorAll('.center').forEach(center => {
    const count = centerChannelCounts.get(center.dataset.center) || 0;
    const activeGateCount = [...gateCenters].filter(([gate, centerId]) => centerId === center.dataset.center && gates.has(gate)).length;
    center.setAttribute('data-defined', String(count > 0));
    center.setAttribute('data-channel-count', String(count));
    center.setAttribute('data-active-gate-count', String(activeGateCount));
    const shape = center.querySelector('.center-shape');
    if (shape) shape.style.fillOpacity = count > 0 ? '.42' : '';
  });
  svg.querySelectorAll('script,#gate-state-legend,#flow-control,#flow-direction-legend,#svg-tooltip').forEach(el => el.remove());
  svg.setAttribute('viewBox', `0 0 360 ${chartFrameHeight}`);
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
  result.obstacles = paths.filter(path => path.userData?.node?.classList.contains('center-shape'))
    .flatMap(path => path.toShapes(true).map(shape => shape.getPoints(16)));
  result.routes = new Map();
  for (const path of paths) {
    const node = path.userData.node;
    if (!node?.getAttribute('class')?.includes('gate-marker')) continue;
    const gate = gateGroup(node);
    if (!gate || !path.subPaths?.length) continue;
    const points = path.subPaths[0].getPoints(20);
    if (!points.length) continue;
    const center = { x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 };
    // Use the transformed center outline, not an inset SVG marker, as
    // the routing endpoint. An interior endpoint makes exterior routing fail.
    const centerPath = paths.find(candidate => candidate.userData?.node?.classList.contains('center-shape')
      && centerGroup(candidate.userData.node)?.dataset.center === gate.dataset.center);
    const polygon = centerPath?.toShapes(true)[0]?.getPoints(16);
    if (polygon?.length) {
      let nearest = null, distance = Infinity;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const point = { x: a.x + t * dx, y: a.y + t * dy };
        const d = Math.hypot(point.x - center.x, point.y - center.y);
        if (d < distance) { nearest = point; distance = d; }
      }
      if (nearest) { center.x = nearest.x; center.y = nearest.y; }
    }
    result.set(+gate.dataset.gate, center);
  }
  return result;
}
function chartPointInFamily(point, person, localDepth = 0) {
  const isChild = familyChildren.some(child => child.id === person);
  const chart = isChild
    ? familyGroups[person]?.children.find(item => item.name.includes('SVG plane'))
    : planeGroups[person];
  if (!chart) {
    const scale = isChild ? familyLayout.childScale : familyLayout.parentScale;
    const centerZ = person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
    return new THREE.Vector3((point.x - 180) * scale, -point.y * scale + chartFrameHeight * scale, centerZ + localDepth * scale);
  }
  chartRoot.updateWorldMatrix(true, true);
  const worldPoint = chart.localToWorld(new THREE.Vector3(point.x, point.y, localDepth));
  return chartRoot.worldToLocal(worldPoint);
}
function visibleFamilyPairs() {
  if (!currentNatalGates) return [];
  const people = Object.keys(currentNatalGates).filter(person => {
    if (!includedFamilyMembers.has(person)) return false;
    if (person === 'daniel') return planeGroups.daniel?.visible ?? true;
    if (person === 'camille') return planeGroups.camille?.visible ?? true;
    return familyGroups[person]?.visible ?? true;
  });
  const pairs = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) pairs.push([people[i], people[j]]);
  }
  return pairs;
}
function familyMemberIsVisible(person) {
  if (!includedFamilyMembers.has(person)) return false;
  if (person === 'daniel') return planeGroups.daniel?.visible ?? true;
  if (person === 'camille') return planeGroups.camille?.visible ?? true;
  return familyGroups[person]?.visible ?? true;
}
function syncTransitGroupVisibility() {
  for (const [person, group] of Object.entries(transitGroups)) {
    group.visible = transitToggle.checked && familyMemberIsVisible(person);
  }
}
function familyPairsWithinReach() {
  chartRoot.updateMatrixWorld(true);
  const centerFor = person => {
    const childIndex = familyChildren.findIndex(child => child.id === person);
    if (childIndex >= 0) {
      const side = childIndex % 2 === 0 ? 1 : -1;
      const childOrdinal = Math.floor(childIndex / 2);
      const sideCount = side > 0 ? Math.ceil(familyChildren.length / 2) : Math.floor(familyChildren.length / 2);
      const spread = sideCount > 1 ? (childOrdinal / (sideCount - 1) - 0.5) * (Math.PI / 3) : 0;
      const angle = side > 0 ? spread : Math.PI - spread;
      const distance = childPlaneRadius();
      return new THREE.Vector3(
        Math.cos(angle) * distance,
        chartFrameHeight * familyLayout.childScale / 2,
        Math.sin(angle) * distance
      );
    }
    if (planeGroups[person]) return chartPointInFamily({ x: 180, y: chartFrameHeight / 2 }, person);
    const radius = Number(document.querySelector('#separation').value) / 2;
    return new THREE.Vector3(0, chartFrameHeight * familyLayout.parentScale / 2, person === frontPerson ? radius : -radius);
  };
  const centers = new Map(Object.keys(currentNatalGates || {}).map(person => [person, centerFor(person)]));
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return [];
  camera.updateMatrixWorld(true);
  const projectChartPoint = (person, point) => chartRoot.localToWorld(chartPointInFamily(point, person)).project(camera);
  const centerPixels = new Map();
  const radiusPixels = new Map();
  const halfWidth = chartSilhouetteWidth / 2;
  for (const person of centers.keys()) {
    const center = projectChartPoint(person, { x: 180, y: chartFrameHeight / 2 });
    centerPixels.set(person, new THREE.Vector2((center.x + 1) * rect.width / 2, (1 - center.y) * rect.height / 2));
    const corners = [
      { x: 180 - halfWidth, y: 0 }, { x: 180 + halfWidth, y: 0 },
      { x: 180 - halfWidth, y: chartFrameHeight }, { x: 180 + halfWidth, y: chartFrameHeight }
    ];
    const radius = Math.max(...corners.map(point => {
      const projected = projectChartPoint(person, point);
      const pixel = new THREE.Vector2((projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2);
      return pixel.distanceTo(centerPixels.get(person));
    }));
    radiusPixels.set(person, radius);
  }
  return visibleFamilyPairs().filter(([a, b]) => {
    if (lockedRelationshipPairs.has(relationshipPairKey(a, b))) return true;
    const distance = centerPixels.get(a)?.distanceTo(centerPixels.get(b));
    const reach = Math.max(radiusPixels.get(a) || 0, radiusPixels.get(b) || 0) * 2;
    return Number.isFinite(distance) && distance <= reach;
  });
}
function refreshRelationshipPairing(force = false) {
  if (!currentChartData || !currentNatalGates) return;
  // Rebuilding channel geometry parses SVG paths and disposes GPU resources.
  // OrbitControls emits changes on every drag frame, so defer that work until
  // the drag settles and cap refreshes during damping and auto-rotation.
  if (orbitDragging && !force) return;
  const now = performance.now();
  if (!force && now - lastRelationshipRefreshAt < 1000) return;
  const pairs = familyPairsWithinReach()
    .filter(([a, b]) => !relationshipMutedCharts.has(a) && !relationshipMutedCharts.has(b));
  const key = pairs.map(pair => pair.join(':')).sort().join('|');
  const pairChanged = key !== activeRelationshipPairKey;
  if (!pairChanged) return;
  lastRelationshipRefreshAt = now;
  rebuildRelationship();
}
function relationshipLinkSpecs(a, b, personA, personB, natalGates, transitGates) {
  const gatesA = natalGates[personA] || new Set();
  const gatesB = natalGates[personB] || new Set();
  const activeA = new Set([...gatesA, ...(layersFor(personA).transits ? transitGates : [])]);
  const activeB = new Set([...gatesB, ...(layersFor(personB).transits ? transitGates : [])]);
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
function makeTransitGroup(data, snapshot, natalGates, person) {
  const group = new THREE.Group();
  const owner = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2');
  group.name = `Current Human Design transit overlay · ${owner}`;
  group.userData.chartPerson = person;
  const renderedChannels = new Set();
  const gatePoints = getGatePoints(data.paths);
  const transitGates = new Set(snapshot.gates);
  const activeGates = new Set([...natalGates, ...transitGates]);
  const color = new THREE.Color('#c0c7d2');
  const roadMaterial = lineMaterial(color, 0.96);
  for (const path of data.paths) {
    const node = path.userData.node;
    if (!node) continue;
    const cls = node.getAttribute('class') || '';
    const channel = channelGroup(node);
    if (!channel || !cls.split(/\s+/).includes('channel') || cls.includes('paired-rail')) continue;
    const from = +channel.dataset.from, to = +channel.dataset.to;
    if (!activeGates.has(from) || !activeGates.has(to) || (!transitGates.has(from) && !transitGates.has(to)) || !path.subPaths?.length) continue;
    const channelId = `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (natalGates.has(from) && natalGates.has(to)) continue;
    if (renderedChannels.has(channelId)) continue;
    renderedChannels.add(channelId);
    const reading = channelDescriptions.get(channelId) || relationshipChannelReadings[channelId];
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
    const points = snapChannelEndpoints(path.subPaths[0].getPoints(48), gatePoints, from, to);
    const centerline = points.map(point => new THREE.Vector3(point.x, point.y, 3.3));
    for (const side of [-1, 1]) {
      const wallPoints = channelSidePoints(centerline, side);
      // Dotted walls identify a transit; its particle route stays continuous.
      for (const wall of dashedTubesFromPoints(wallPoints, channelWallRadius, roadMaterial, 3.3, 1.2, 2.2)) {
        Object.assign(wall.userData, hover);
        group.add(wall);
      }
    }
    for (const gateNumber of [from, to]) {
      const opening = gatePoints.get(gateNumber);
      if (!opening) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(channelClearWidth / 2, channelClearWidth / 2 + channelWallRadius * 2, 24),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      ring.position.set(opening.x, opening.y, 3.3);
      ring.renderOrder = 8;
      Object.assign(ring.userData, hover);
      group.add(ring);
    }
    const flowCurve = new THREE.CatmullRomCurve3(centerline, false, 'centripetal');
    addFlowMotion(group, flowCurve, color.getStyle(), hover);
    addFlowMotion(group, flowCurve, color.getStyle(), hover, true);
  }
  // Transit gate color is applied directly to the gate marker on the natal
  // plane. This overlay adds continuous temporary channel walls and system particle routes.
  group.scale.y = -1;
  group.position.set(-180, 180, 0);
  return group;
}
function rebuildRelationship() {
  const multipleCharts = includedFamilyMembers.size > 1;
  relationshipInteractionEnabled = multipleCharts;
  document.querySelector('#showBridges').checked = multipleCharts;
  selectedKey = null;
  clearHover();
  if (!sourceDocument || !loader) return;
  if (!natalParentsReady) {
    setStatus('Calculating parent natal charts…');
    return;
  }
  const separation = Number(document.querySelector('#separation').value);
  familyLayout.parentRadius = separation / 2;
  clearChartInitials();
  clearCenterParticleAnimations();
  flowAnimations.length = 0;
  systemChannelRoutes.length = 0;
  hangingFlexAnimations.length = 0;
  releaseGroup(relationshipGroup);
  releaseGroup(hangingFlexContainer);
  relationshipGroup = new THREE.Group();
  relationshipGroup.name = 'Relationship channels formed by reaching hanging ends';
  chartRoot.add(relationshipGroup);
  hangingFlexContainer = new THREE.Group();
  hangingFlexContainer.name = 'Unmatched hanging channels';
  chartRoot.add(hangingFlexContainer);
  const danielGates = parseGateList('#danielGates');
  const camilleGates = parseGateList('#camilleGates');
  const natalGates = { daniel: danielGates, camille: camilleGates };
  familyChildren.forEach(child => { natalGates[child.id] = new Set(child.gates || []); });
  const activeTransitSnapshot = transitToggle.checked ? transitSnapshot : null;
  const activationVisibility = {
    design: designActivationToggle?.checked !== false,
    personality: personalityActivationToggle?.checked !== false
  };
  const sharedChannels = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')]
    .filter(channel => danielGates.has(+channel.dataset.from) && danielGates.has(+channel.dataset.to) && camilleGates.has(+channel.dataset.from) && camilleGates.has(+channel.dataset.to))
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const transitGates = new Set(activeTransitSnapshot?.gates || []);
  currentNatalGates = natalGates;
  if (planeGroups.daniel) planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  if (planeGroups.camille) planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  const exchangePairs = (relationshipInteractionEnabled ? familyPairsWithinReach() : [])
    .filter(([a, b]) => !relationshipMutedCharts.has(a) && !relationshipMutedCharts.has(b));
  const relationshipChannels = new Set();
  const relationshipParticipants = new Map();
  const relationshipReachTargets = Object.fromEntries(Object.keys(natalGates).map(person => [person, new Map()]));
  const channelElements = templateChannels('daniel');
  for (const [personA, personB] of exchangePairs) {
      for (const channel of channelElements) {
        const a = +channel.dataset.from, b = +channel.dataset.to;
        const specs = relationshipLinkSpecs(a, b, personA, personB, natalGates, transitGates);
        if (specs.length) {
          relationshipChannels.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
          const channelId = `${Math.min(a, b)}-${Math.max(a, b)}`;
          for (const spec of specs) {
            if (!relationshipParticipants.has(channelId)) relationshipParticipants.set(channelId, new Set());
            relationshipParticipants.get(channelId).add(spec.fromPerson);
            relationshipParticipants.get(channelId).add(spec.toPerson);
            const addReachTarget = (person, activeGate, targetPerson, openGate) => {
              if (!natalGates[person]?.has(activeGate) || natalGates[person]?.has(openGate)) return;
              relationshipReachTargets[person].set(channelId, {
                person: targetPerson, gate: openGate,
                lockKey: `${relationshipPairKey(person, targetPerson)}:${channelId}:${person}`
              });
            };
            addReachTarget(spec.fromPerson, spec.fromGate, spec.toPerson, spec.toGate);
            addReachTarget(spec.toPerson, spec.toGate, spec.fromPerson, spec.fromGate);
          }
        }
      }
  }
  const chartData = {};
  for (const person of ['daniel', 'camille']) {
    const natalActivations = window.hdNatalPlanetaryActivations?.[person] || [];
    const data = loader.parse(extractLayer(sourceDocument, person, natalGates[person], natalActivations));
    chartData[person] = data;
    releaseGroup(planeGroups[person]);
    const group = makePlaneGroup(data.paths, person, sharedChannels, relationshipChannels, {
      scale: familyLayout.parentScale, transitSnapshot: layersFor(person).transits ? activeTransitSnapshot : null,
      activeGates: natalGates[person],
      activationVisibility: layersFor(person),
      relationshipParticipants,
      relationshipReachTargets: relationshipReachTargets[person]
    });
    group.position.z = person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
    planeGroups[person] = group;
    chartRoot.add(group);
  }
  for (const [person, group] of Object.entries(familyGroups)) {
    releaseGroup(group);
    delete familyGroups[person];
  }
  const half = separation / 2;
  // Keep the parent pair's shared center at the same radius as the children.
  familyLayout.parentRadius = half;
  planeGroups.daniel.position.z = frontPerson === 'daniel' ? familyLayout.parentRadius : -familyLayout.parentRadius;
  planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  document.querySelector('#separation').value = String(separation);
  document.querySelector('#separationValue').value = String(separation);
  document.querySelector('#mainSeparation').value = String(separation);
  document.querySelector('#mainSeparationValue').value = String(separation);
  for (const [person, group] of Object.entries(transitGroups)) {
    releaseGroup(group);
    delete transitGroups[person];
  }
  if (activeTransitSnapshot) {
    for (const person of ['daniel', 'camille']) {
      if (!layersFor(person).transits) continue;
      const natalGates = parseGateList(person === 'daniel' ? '#danielGates' : '#camilleGates');
      const activations = new Set([...natalGates, ...activeTransitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, person, activations, window.hdNatalPlanetaryActivations?.[person] || []));
      const group = makeTransitGroup(transitData, activeTransitSnapshot, natalGates, person);
      group.scale.set(familyLayout.parentScale, -familyLayout.parentScale, familyLayout.parentScale);
      group.position.set(-180 * familyLayout.parentScale, chartFrameHeight * familyLayout.parentScale, 0);
      group.position.z = planeGroups[person].position.z;
      transitGroups[person] = group;
      chartRoot.add(group);
      group.visible = transitToggle.checked && familyMemberIsVisible(person);
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
    // Chart position determines which side of the family it occupies. Keep
    // the SVG itself unmirrored so every child reads in the same forward view.
    const flipX = false;
    childPosition.position.set(offsetX, offsetY, offsetZ);
    childPosition.rotation.y = Math.atan2(-offsetX, -offsetZ);
    const childGates = natalGates[child.id];
    const childData = loader.parse(extractLayer(sourceDocument, 'daniel', childGates, child.activations || []));
    chartData[child.id] = childData;
    const color = chartColor(child.id);
    const childGroup = makePlaneGroup(childData.paths, child.id, new Set(), relationshipChannels, {
      color, name: child.name, scale: childScale, flipX, transitSnapshot: layersFor(child.id).transits ? activeTransitSnapshot : null,
      activeGates: childGates,
      activationVisibility: layersFor(child.id),
      relationshipParticipants,
      relationshipReachTargets: relationshipReachTargets[child.id]
    });
    childPosition.visible = includedFamilyMembers.has(child.id);
    childPosition.add(childGroup);
    familyGroups[child.id] = childPosition;
    chartRoot.add(childPosition);
    if (activeTransitSnapshot && layersFor(child.id).transits) {
      const activations = new Set([...childGates, ...activeTransitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, 'daniel', activations, child.activations || []));
      const transitGroup = makeTransitGroup(transitData, activeTransitSnapshot, childGates, child.id);
      transitGroup.scale.set(flipX ? -childScale : childScale, -childScale, childScale);
      transitGroup.position.set(flipX ? 180 * childScale : -180 * childScale, chartFrameHeight * childScale, 0);
      transitGroups[child.id] = transitGroup;
      childPosition.add(transitGroup);
      transitGroup.visible = transitToggle.checked && familyMemberIsVisible(child.id);
    }
  });
  currentChartData = chartData;
  currentGatePoints = Object.fromEntries(Object.entries(chartData).map(([person, data]) => [person, getGatePoints(data.paths)]));
  currentTransitSnapshot = activeTransitSnapshot;
  planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  syncTransitGroupVisibility();
  syncChartFacing();
  const overlapPairs = familyPairsWithinReach()
    .filter(([a, b]) => !relationshipMutedCharts.has(a) && !relationshipMutedCharts.has(b));
  activeRelationshipPairKey = overlapPairs.map(pair => pair.join(':')).sort().join('|');
  const formedChannels = new Set(hangingFlexAnimations
    .filter(flex => flex.reachTarget)
    .map(flex => [flex.person, flex.reachTarget.person].sort().join(':') + `:${flex.channelId}`));
  relationshipGroup.userData.bridgeCount = formedChannels.size;
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  fitCameraToFamily();
  frontFamilyReading();
  const pairNames = overlapPairs.map(pair => pair.map(person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child')).join('–'));
  setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel bridge${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} within reach${pairNames.length ? ` (${pairNames.join(', ')})` : ''}.`);
}

function soloFamilyMember(person) {
  relationshipInteractionEnabled = true;
  includedFamilyMembers.clear();
  includedFamilyMembers.add(person);
  document.querySelector('#showDaniel').checked = person === 'daniel';
  document.querySelector('#showCamille').checked = person === 'camille';
  for (const child of familyChildren) {
    if (familyGroups[child.id]) familyGroups[child.id].visible = person === child.id;
  }
  renderFamilyMemberOptions();
  if (sourceDocument && loader) rebuildRelationship();
}

function renderFamilyMemberOptions() {
  const container = document.querySelector('#familyChildOptions');
  if (!container) return;
  container.replaceChildren();
  familyChildren.forEach((child, index) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const label = document.createElement('label');
    label.className = 'toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = includedFamilyMembers.has(child.id);
    checkbox.dataset.familyMember = child.id;
    checkbox.addEventListener('change', () => {
      engageRelationship();
      if (checkbox.checked) includedFamilyMembers.add(child.id);
      else includedFamilyMembers.delete(child.id);
      if (familyGroups[child.id]) familyGroups[child.id].visible = checkbox.checked;
      if (sourceDocument && loader) rebuildRelationship();
    });
    label.append(checkbox, document.createTextNode(` ${child.name || `Child ${index + 1}`}`));
    const solo = document.createElement('button');
    solo.type = 'button';
    solo.className = 'solo-member';
    solo.textContent = 'Solo';
    solo.setAttribute('aria-label', `Show ${child.name || `Child ${index + 1}`} by themselves`);
    solo.addEventListener('click', () => soloFamilyMember(child.id));
    row.append(label, solo);
    container.append(row);
  });
  if (!familyChildren.length) {
    const empty = document.createElement('span');
    empty.className = 'note';
    empty.textContent = 'Sign in and load a family profile to add children.';
    container.append(empty);
  }
}

window.addEventListener('castalia-family-children-updated', event => {
  const previousIds = new Set(familyChildren.map(child => child.id));
  const nextChildren = Array.isArray(event.detail) ? event.detail : [];
  const nextIds = new Set(nextChildren.map(child => child.id));
  for (const id of previousIds) if (!nextIds.has(id)) includedFamilyMembers.delete(id);
  familyChildren = nextChildren;
  if (initialView === 'family') {
    for (const child of familyChildren) if (!previousIds.has(child.id)) includedFamilyMembers.add(child.id);
  }
  familyChildren.forEach((child, index) => { window.hdChartNames[child.id] = child.name || `Child ${index + 1}`; });
  renderFamilyMemberOptions();
  if (sourceDocument && loader) { rebuildRelationship(); resize(); }
});

async function refreshTransits() {
  const status = document.querySelector('#transitStatus');
  if (lifetimeTimelineActive) return;
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
    if (!lifetimeTimelineActive && timelineStatus) timelineStatus.textContent = `Current transits · ${time}`;
    if (sourceDocument && loader) rebuildRelationship();
  } catch (error) {
    status.textContent = `Current transits unavailable: ${error.message}`;
    if (!lifetimeTimelineActive && timelineStatus) timelineStatus.textContent = `Current transit data unavailable: ${error.message}`;
  }
}

const timelineSlider = document.querySelector('#timelineAgeSlider');
const timelineDateTime = document.querySelector('#timelineDateTime');
const timelineAgeOutput = document.querySelector('#timelineAge');
const timelineStatus = document.querySelector('#timelineStatus');
const timelineFamilyAges = document.querySelector('#timelineFamilyAges');
const timelineBirthButton = document.querySelector('#timelineBirth');
const timelinePlayButton = document.querySelector('#timelinePlay');
const timelineNowButton = document.querySelector('#timelineNow');
let lifetimeStartEpoch = null;
let lifetimeEndEpoch = null;
let timelineRequestId = 0;
let timelineDebounceTimer = null;
let timelinePlaybackFrame = null;
let timelinePlaybackStart = null;
let timelinePlaybackAge = 0;
let timelinePlaybackMonth = -1;

function localDateTimeValue(epoch) {
  const date = new Date(epoch * 1000);
  const part = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function timelineEpochAtAge(age) {
  return lifetimeStartEpoch + (lifetimeEndEpoch - lifetimeStartEpoch) * Math.min(100, Math.max(0, age)) / 100;
}

function updateTimelineDisplay(epoch) {
  if (!Number.isFinite(lifetimeStartEpoch) || !Number.isFinite(lifetimeEndEpoch)) return;
  const boundedEpoch = Math.min(lifetimeEndEpoch, Math.max(lifetimeStartEpoch, epoch));
  const age = (boundedEpoch - lifetimeStartEpoch) / (lifetimeEndEpoch - lifetimeStartEpoch) * 100;
  timelineSlider.value = age.toFixed(3);
  timelineAgeOutput.value = `${age.toFixed(1)} years`;
  timelineDateTime.value = localDateTimeValue(boundedEpoch);
  const ages = Object.entries(window.hdFamilyBirthEpochs || {}).map(([person, birthEpoch]) => {
    const name = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : 'Person 2');
    const years = (boundedEpoch - birthEpoch) / (365.2425 * 86400);
    return years < 0 ? `${name}: not born` : `${name}: ${years.toFixed(1)}`;
  });
  const anchorName = window.hdTimelineAnchor?.name || 'Blue chart';
  timelineFamilyAges.textContent = `${anchorName}'s 0–100 lifetime${ages.length ? ` · ${ages.join(' · ')}` : ''}`;
  timelineNowButton.disabled = Date.now() < lifetimeStartEpoch || Date.now() > lifetimeEndEpoch;
}

let timelineSnapshotPending = false;
let queuedTimelineEpoch = null;
async function showTimelineTransits(epoch) {
  if (!window.CastaliaHumanDesignTransit?.snapshotAt) return;
  if (timelineSnapshotPending) {
    queuedTimelineEpoch = epoch;
    return;
  }
  timelineSnapshotPending = true;
  const requestId = ++timelineRequestId;
  const selected = new Date(epoch * 1000);
  const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(selected);
  timelineStatus.textContent = `Loading ${formatted}…`;
  try {
    const snapshot = await window.CastaliaHumanDesignTransit.snapshotAt(selected);
    if (requestId === timelineRequestId) {
      transitSnapshot = snapshot;
      // The ordinary near-term exit estimates describe today's transits only;
      // don't carry those bounds into a historical or future timeline frame.
      transitDurationEstimates = [];
      lifetimeTimelineActive = Math.abs(epoch - Date.now() / 1000) > 60;
      timelineStatus.textContent = `${formatted} · ephemeris snapshot`;
      const transitStatus = document.querySelector('#transitStatus');
      if (transitStatus) transitStatus.textContent = `Selected time · ${formatted}; transits are applied per bodygraph.`;
      if (sourceDocument && loader) rebuildRelationship();
    }
  } catch (error) {
    if (requestId === timelineRequestId) timelineStatus.textContent = `Transit data unavailable: ${error.message}`;
  } finally {
    timelineSnapshotPending = false;
    if (queuedTimelineEpoch != null) {
      const nextEpoch = queuedTimelineEpoch;
      queuedTimelineEpoch = null;
      void showTimelineTransits(nextEpoch);
    }
  }
}

function selectTimelineEpoch(epoch, immediate = false) {
  if (!Number.isFinite(lifetimeStartEpoch) || !Number.isFinite(lifetimeEndEpoch)) return;
  const boundedEpoch = Math.min(lifetimeEndEpoch, Math.max(lifetimeStartEpoch, epoch));
  updateTimelineDisplay(boundedEpoch);
  lifetimeTimelineActive = Math.abs(boundedEpoch - Date.now() / 1000) > 60;
  if (timelineDebounceTimer) clearTimeout(timelineDebounceTimer);
  if (immediate) void showTimelineTransits(boundedEpoch);
  else timelineDebounceTimer = setTimeout(() => void showTimelineTransits(boundedEpoch), 180);
}

function pauseTimeline() {
  if (timelinePlaybackFrame != null) cancelAnimationFrame(timelinePlaybackFrame);
  timelinePlaybackFrame = null;
  timelinePlaybackStart = null;
  timelinePlayButton.textContent = 'Play';
  timelinePlayButton.setAttribute('aria-pressed', 'false');
}

function playTimelineFrame(now) {
  if (timelinePlaybackStart == null) timelinePlaybackStart = now;
  // One simulated month takes 0.65 seconds, so a full century takes about
  // thirteen minutes. This keeps the moving transit pattern inspectable.
  const age = Math.min(100, timelinePlaybackAge + (now - timelinePlaybackStart) / 1000 * (100 / (1200 * 0.65)));
  const month = Math.floor(age * 12);
  updateTimelineDisplay(timelineEpochAtAge(age));
  if (month !== timelinePlaybackMonth) {
    timelinePlaybackMonth = month;
    void showTimelineTransits(timelineEpochAtAge(age));
  }
  if (age >= 100) {
    timelineSlider.value = '100';
    updateTimelineDisplay(lifetimeEndEpoch);
    pauseTimeline();
    return;
  }
  timelinePlaybackFrame = requestAnimationFrame(playTimelineFrame);
}

function setTimelineAnchor(anchor) {
  const birthEpoch = Number(anchor?.birthEpoch);
  if (!Number.isFinite(birthEpoch)) return;
  pauseTimeline();
  timelineRequestId += 1;
  queuedTimelineEpoch = null;
  lifetimeStartEpoch = birthEpoch;
  const end = new Date(birthEpoch * 1000);
  end.setUTCFullYear(end.getUTCFullYear() + 100);
  lifetimeEndEpoch = end.getTime() / 1000;
  timelineSlider.disabled = false;
  timelineDateTime.disabled = false;
  timelineBirthButton.disabled = false;
  timelinePlayButton.disabled = false;
  const current = Date.now() / 1000;
  const initialEpoch = Math.min(lifetimeEndEpoch, Math.max(lifetimeStartEpoch, current));
  updateTimelineDisplay(initialEpoch);
  lifetimeTimelineActive = false;
  if (Math.abs(initialEpoch - current) > 60) void showTimelineTransits(initialEpoch);
  else timelineStatus.textContent = 'Current transits · use the slider to explore this 100-year timeline.';
}

timelineSlider.addEventListener('input', () => selectTimelineEpoch(timelineEpochAtAge(Number(timelineSlider.value))));
timelineSlider.addEventListener('pointerdown', pauseTimeline);
timelineSlider.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) pauseTimeline();
});
timelineDateTime.addEventListener('change', () => {
  pauseTimeline();
  const epoch = new Date(timelineDateTime.value).getTime() / 1000;
  if (Number.isFinite(epoch)) selectTimelineEpoch(epoch, true);
});
timelineBirthButton.addEventListener('click', () => {
  pauseTimeline();
  selectTimelineEpoch(lifetimeStartEpoch, true);
});
timelineNowButton.addEventListener('click', () => {
  pauseTimeline();
  timelineRequestId += 1;
  queuedTimelineEpoch = null;
  lifetimeTimelineActive = false;
  const now = Date.now() / 1000;
  updateTimelineDisplay(now);
  timelineStatus.textContent = 'Refreshing current transit data…';
  void refreshTransits();
});
timelinePlayButton.addEventListener('click', () => {
  if (timelinePlaybackFrame != null) {
    pauseTimeline();
    return;
  }
  let age = Number(timelineSlider.value);
  if (age >= 100) {
    age = 0;
    updateTimelineDisplay(lifetimeStartEpoch);
    void showTimelineTransits(lifetimeStartEpoch);
  }
  timelinePlaybackAge = age;
  timelinePlaybackMonth = Math.floor(age * 12);
  timelinePlaybackStart = null;
  lifetimeTimelineActive = true;
  timelinePlayButton.textContent = 'Pause';
  timelinePlayButton.setAttribute('aria-pressed', 'true');
  timelinePlaybackFrame = requestAnimationFrame(playTimelineFrame);
});
window.addEventListener('castalia-timeline-anchor-updated', event => setTimelineAnchor(event.detail));
if (window.hdTimelineAnchor) setTimelineAnchor(window.hdTimelineAnchor);

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  fitCameraToFamily(rect);
}
function fitCameraToFamily(rect = canvas.getBoundingClientRect()) {
  if (!rect.width || !rect.height) return;
  const aspect = rect.width / rect.height;
  const chartWidth = chartSilhouetteWidth * familyLayout.parentScale;
  const chartHeight = chartFrameHeight * familyLayout.parentScale;
  const halfWidth = chartSilhouetteWidth / 2;
  const persons = Object.keys(currentNatalGates || {}).filter(person => {
    if (!includedFamilyMembers.has(person)) return false;
    if (person === 'daniel') return planeGroups.daniel?.visible ?? true;
    if (person === 'camille') return planeGroups.camille?.visible ?? true;
    return familyGroups[person]?.visible ?? true;
  });
  if (persons.length === 1) {
    chartRoot.updateWorldMatrix(true, false);
    const center = chartRoot.localToWorld(chartPointInFamily({ x: 180, y: chartFrameHeight / 2 }, persons[0]));
    const shift = center.sub(controls.target);
    camera.position.add(shift);
    controls.target.add(shift);
  }
  chartRoot.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  let projectedHalfWidth = 0, projectedHalfHeight = 0;
  for (const person of persons) {
    for (const point of [
      { x: 180 - halfWidth, y: 0 }, { x: 180 + halfWidth, y: 0 },
      // Include the dynamically spread root center and its name tag below it.
      { x: 180 - halfWidth, y: chartFrameHeight + 45 }, { x: 180 + halfWidth, y: chartFrameHeight + 45 }
    ]) {
      const world = chartRoot.localToWorld(chartPointInFamily(point, person));
      const relative = world.sub(controls.target);
      projectedHalfWidth = Math.max(projectedHalfWidth, Math.abs(relative.dot(cameraRight)));
      projectedHalfHeight = Math.max(projectedHalfHeight, Math.abs(relative.dot(cameraUp)));
    }
  }
  // A solo chart should use the available viewport height, especially on
  // portrait screens. Family views retain extra framing for all visible charts.
  if (persons.length === 1) {
    const fitHalfHeight = Math.max(projectedHalfHeight, projectedHalfWidth / aspect) * 1.01 + 1;
    const fitHalfWidth = fitHalfHeight * aspect;
    camera.left = -fitHalfWidth;
    camera.right = fitHalfWidth;
    camera.top = fitHalfHeight;
    camera.bottom = -fitHalfHeight;
    camera.updateProjectionMatrix();
    return;
  }
  // Grow the family framing only as needed to fit every visible chart.
  const fitHalfWidth = Math.max(
    chartWidth / 0.8,
    projectedHalfWidth * 1.28 + 8,
    (projectedHalfHeight * 1.28 + 8) * aspect,
    chartHeight / 1.7 * aspect
  );
  const fitHalfHeight = fitHalfWidth / aspect;
  camera.left = -fitHalfWidth;
  camera.right = fitHalfWidth;
  camera.top = fitHalfHeight;
  camera.bottom = -fitHalfHeight;
  camera.updateProjectionMatrix();
}
function setSeparation(value) {
  relationshipInteractionEnabled = true;
  const half = Number(value) / 2;
  familyLayout.parentRadius = half;
  if (planeGroups.daniel) planeGroups.daniel.position.z = frontPerson === 'daniel' ? half : -half;
  if (planeGroups.camille) planeGroups.camille.position.z = -planeGroups.daniel.position.z;
  document.querySelector('#separation').value = String(value);
  document.querySelector('#separationValue').value = String(value);
  document.querySelector('#mainSeparation').value = String(value);
  document.querySelector('#mainSeparationValue').value = String(value);
  if (sourceDocument) {
    rebuildRelationship();
    resize();
  }
}
function orient(mode) {
  relationshipInteractionEnabled = true;
  exactFrontAlignment = mode !== 'edge';
  if (sourceDocument) rebuildRelationship();
  // Clear the prior angle lock so preset views and Reset can choose their angle.
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.reset();
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  if (mode === 'edge') camera.position.set(800, familyViewCenterY, 0.01);
  else camera.position.set(0, familyViewCenterY, 820);
  controls.target.set(0, familyViewCenterY, 0);
  controls.update();
  syncChartFacing();
  const currentTopViewAmount = topViewAmount();
  if (now - lastCameraFitAt > 300 && (Math.abs(currentTopViewAmount - lastFittedTopViewAmount) > 0.025 || currentTopViewAmount > 0.2)) {
    fitCameraToFamily();
    lastCameraFitAt = now;
    lastFittedTopViewAmount = currentTopViewAmount;
  }
  refreshRelationshipPairing();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tip = document.querySelector('#sceneTip');
function pauseAutoRotate() {
  autoRotate = false;
  const toggle = document.querySelector('#autoRotateToggle');
  if (toggle) toggle.checked = false;
}
let hoveredKey = null;
let selectedKey = null;
let highlightedKey = null;
let highlighted = [];
const gateSelectionRings = [];
let touchStart = null;
const activeTouchPointers = new Set();
let multiTouchGesture = false;
let lastTouchSelectionAt = -Infinity;
function clearHighlight() {
  for (const ring of gateSelectionRings) {
    ring.removeFromParent();
    ring.geometry.dispose();
    ring.material.dispose();
  }
  gateSelectionRings.length = 0;
  for (const { mesh, material, highlightedMaterial, renderOrder } of highlighted) {
    mesh.material = material;
    mesh.renderOrder = renderOrder;
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
  const gateMatch = key.match(/^([^:]+):gate:(\d+)$/);
  if (gateMatch) {
    const person = gateMatch[1], gateNumber = Number(gateMatch[2]);
    const people = person === 'reading' ? Object.keys(currentGatePoints) : [person];
    for (const id of people) {
      if (!familyMemberIsVisible(id)) continue;
      const chart = planeGroups[id] || familyGroups[id]?.children.find(item => item.userData.chartPerson === id);
      const point = currentGatePoints[id]?.get(gateNumber);
      if (!chart || !point) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.8, 40),
        new THREE.MeshBasicMaterial({ color: '#ffe493', side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
      ring.position.set(point.x, point.y, 8);
      ring.renderOrder = 100;
      chart.add(ring);
      gateSelectionRings.push(ring);
    }
  }
  const featureMatches = featureKey => {
    if (featureKey === key) return true;
    const match = key.match(/^reading:(gate|channel|center):(.+)$/);
    if (!match) return false;
    if (match[1] === 'gate') return featureKey.match(/(?:^|:)gate:(\d+)$/)?.[1] === match[2];
    if (match[1] === 'center') {
      const centerLabel = centerDescriptions[match[2]]?.[0];
      return Boolean(centerLabel && featureKey.toLocaleLowerCase().endsWith(`:center:${centerLabel}`.toLocaleLowerCase()));
    }
    const channelId = match[2];
    const featureChannel = featureKey.match(/(?:channel:)(\d+)[–-](\d+)$/);
    return Boolean(featureChannel && `${Math.min(+featureChannel[1], +featureChannel[2])}-${Math.max(+featureChannel[1], +featureChannel[2])}` === channelId);
  };
  chartRoot.traverse(object => {
    if (!object.material || !featureMatches(object.userData.hoverKey || '')) return;
    const original = object.material;
    // Invisible raycast spheres should not become solid selection blobs.
    if (!object.userData.svgPart && !object.userData.channelWall
      && (Array.isArray(original) ? original : [original]).every(material => !material.colorWrite)) return;
    const renderOrder = object.renderOrder;
    const highlightedMaterials = (Array.isArray(original) ? original : [original]).map(material => {
      const copy = material.clone();
      copy.colorWrite = true;
      copy.depthWrite = false;
      copy.depthTest = false;
      copy.vertexColors = false;
      if (copy.color) copy.color.set('#ffe493');
      copy.transparent = true;
      copy.opacity = object.geometry?.type === 'ShapeGeometry' ? 0.3 : 1;
      copy.needsUpdate = true;
      return copy;
    });
    object.material = Array.isArray(original) ? highlightedMaterials : highlightedMaterials[0];
    object.renderOrder = 30;
    highlighted.push({ mesh: object, material: original, highlightedMaterial: object.material, renderOrder });
  });
}
document.querySelector('#familyReadingBody').addEventListener('click', event => {
  const button = event.target.closest('button[data-reading-feature]');
  if (!button) return;
  pauseAutoRotate();
  const key = `reading:${button.dataset.readingFeature}`;
  selectedKey = selectedKey === key ? null : key;
  hoveredKey = selectedKey;
  applyHighlight(selectedKey);
  tip.hidden = true;
  for (const link of document.querySelectorAll('#familyReadingBody button[data-reading-feature]')) {
    link.setAttribute('aria-pressed', String(selectedKey === `reading:${link.dataset.readingFeature}`));
  }
});
function clearHover() {
  hoveredKey = null;
  if (!selectedKey) tip.hidden = true;
  canvas.style.cursor = 'grab';
  applyHighlight(selectedKey);
}
function renderTip(info) {
  tip.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = info.title;
  const detail = document.createElement('span');
  detail.textContent = info.detail;
  tip.append(title, detail);
  const visibleParticipants = [...new Set(info.participantIds || [])]
    .filter(familyMemberIsVisible)
    .map(person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : familyChildren.find(child => child.id === person)?.name || person));
  if (visibleParticipants.length) {
    const participants = document.createElement('span');
    participants.textContent = `Visible participants: ${visibleParticipants.join(' and ')}.`;
    tip.append(participants);
  }
  for (const prompt of info.questions || []) {
    const line = document.createElement('span');
    line.className = 'tip-question';
    line.textContent = `${prompt.audience} prompt: ${prompt.text}`;
    tip.append(line);
  }
}
function setHover(info, key) {
  if (key !== hoveredKey) {
    hoveredKey = key;
    if (!selectedKey) applyHighlight(key);
  }
  renderTip(info);
  tip.hidden = false;
  canvas.style.cursor = 'help';
}
function selectFeature(info, key, clientX, clientY) {
  selectedKey = selectedKey === key ? null : key;
  hoveredKey = selectedKey;
  applyHighlight(selectedKey);
  if (selectedKey) {
    renderTip(info);
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
  const hits = raycaster.intersectObject(chartRoot, true).filter(intersection => {
    if (!intersection.object.userData.hoverTip) return false;
    for (let object = intersection.object; object; object = object.parent) {
      if (!object.visible) return false;
    }
    return true;
  });
  // Gate sockets sit on channel ends: give the gate precedence at that spot.
  return hits.find(hit => /:gate:\d+$/.test(hit.object.userData.hoverKey || '')) || hits[0];
}
function chartAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  for (const intersection of raycaster.intersectObject(chartRoot, true)) {
    let object = intersection.object;
    while (object && object !== chartRoot) {
      if (object.userData.chartPerson) return object.userData.chartPerson;
      object = object.parent;
    }
  }
  return null;
}
function positionTip() {
  // Tips occupy a reserved footer below the canvas rather than following the pointer.
}

canvas.addEventListener('pointermove', event => {
  // OrbitControls owns pointer moves during a drag; raycasting every chart
  // feature on those same high-frequency events can stall or exhaust the page.
  if (event.pointerType === 'touch' || event.buttons !== 0 || orbitDragging) return;
  const hit = featureAt(event.clientX, event.clientY);
  if (!hit) { if (!selectedKey) clearHover(); return; }
  setHover(hit.object.userData.hoverTip, hit.object.userData.hoverKey);
  positionTip(event.clientX, event.clientY);
});
canvas.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') clearHover(); });
canvas.addEventListener('pointerdown', event => {
  pauseAutoRotate();
  engageRelationship();
  if (event.pointerType !== 'touch') return;
  activeTouchPointers.add(event.pointerId);
  if (activeTouchPointers.size === 1 && !multiTouchGesture) {
    touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    return;
  }
  // Once a second finger is down, OrbitControls owns the gesture as a pinch.
  // Do not interpret either finger lifting as a tap on a chart feature.
  touchStart = null;
  multiTouchGesture = true;
  lastTouchSelectionAt = performance.now();
});
canvas.addEventListener('wheel', pauseAutoRotate, { passive: true });
canvas.addEventListener('dblclick', event => {
  if (event.button !== 0 || event.pointerType === 'touch') return;
  const person = chartAt(event.clientX, event.clientY);
  if (!person) return;
  event.preventDefault();
  event.stopPropagation();
  pauseAutoRotate();
  selectedKey = null;
  clearHover();
  if (relationshipMutedCharts.has(person)) relationshipMutedCharts.delete(person);
  else relationshipMutedCharts.add(person);
  rebuildRelationship();
  const name = window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child');
  setStatus(relationshipMutedCharts.has(person)
    ? `Relationship connections hidden for ${name}. Double-click the bodygraph to restore them.`
    : `Relationship connections restored for ${name}.`);
});
canvas.addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch') return;
  activeTouchPointers.delete(event.pointerId);
  if (multiTouchGesture) {
    if (activeTouchPointers.size === 0) {
      multiTouchGesture = false;
      lastTouchSelectionAt = performance.now();
    }
    return;
  }
  if (!touchStart || touchStart.id !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
  touchStart = null;
  if (moved > 10) return;
  const hit = featureAt(event.clientX, event.clientY);
  if (!hit) { selectedKey = null; clearHover(); return; }
  lastTouchSelectionAt = performance.now();
  selectFeature(hit.object.userData.hoverTip, hit.object.userData.hoverKey, event.clientX, event.clientY);
});
canvas.addEventListener('pointercancel', event => {
  if (event.pointerType !== 'touch') return;
  activeTouchPointers.delete(event.pointerId);
  touchStart = null;
  if (activeTouchPointers.size === 0) multiTouchGesture = false;
});
canvas.addEventListener('click', event => {
  if (event.detail === 0 || performance.now() - lastTouchSelectionAt < 500) return;
  const hit = featureAt(event.clientX, event.clientY);
  if (hit) selectFeature(hit.object.userData.hoverTip, hit.object.userData.hoverKey, event.clientX, event.clientY);
  else { selectedKey = null; clearHover(); }
});

function loadFeatureDescriptions(svgDocument) {
  featureDocument = svgDocument;
  for (const gate of svgDocument.querySelectorAll('.gate[data-gate]')) {
    const tooltip = gate.dataset.tooltip || gate.getAttribute('aria-label') || '';
    const separator = tooltip.indexOf(':');
    const name = separator >= 0 ? tooltip.slice(0, separator).trim() : '';
    const description = gate.dataset.reading || (separator >= 0 ? tooltip.slice(separator + 1).trim() : 'A gate is one activation point in a channel.');
    gateDescriptions.set(+gate.dataset.gate, { name, description, center: gate.dataset.center || '' });
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
    sourceDocument = await loadBodygraphTemplate('../bodygraph.svg?v=active-center-fill-20261106');
    try {
      const descriptionsResponse = await fetch('../bodygraph.svg?v=active-center-fill-20261106');
      if (descriptionsResponse.ok) {
        const descriptionsDocument = new DOMParser().parseFromString(await descriptionsResponse.text(), 'image/svg+xml');
        if (!descriptionsDocument.querySelector('parsererror')) loadFeatureDescriptions(descriptionsDocument);
      }
    } catch (error) {
      console.warn('Could not load optional gate/channel descriptions:', error);
    }
    loader = new SVGLoader();
    if (Array.isArray(window.hdRelationshipChildren)) familyChildren = window.hdRelationshipChildren;
    if (initialView === 'family') familyChildren.forEach(child => includedFamilyMembers.add(child.id));
    familyChildren.forEach((child, index) => {
      window.hdChartNames[child.id] = child.name || `Child ${index + 1}`;
    });
    renderFamilyMemberOptions();
    // Natal auth supplies each chart's actual activated gates.
    if (window.hdNatalPlanetaryActivations &&
        document.querySelector('#danielGates').value.trim() &&
        document.querySelector('#camilleGates').value.trim()) {
      natalParentsReady = true;
      rebuildRelationship();
    } else {
      setStatus('Calculating parent natal charts…');
    }
    resize();
    void refreshTransits();
    window.setInterval(() => void refreshTransits(), 15 * 60 * 1000);
  } catch (error) {
    setStatus(`Unable to load BodyGraph geometry: ${error.message}`);
    console.error(error);
  }
}

function useCalculatedNatalParents(event) {
  const activations = event?.detail || window.hdNatalPlanetaryActivations;
  if (!activations?.daniel?.length || !activations?.camille?.length) return;
  natalParentsReady = true;
  rebuildRelationship();
  refreshRelationshipPairing();
  refreshFrontFamilyReading();
}
window.addEventListener('castalia-natal-activations-updated', useCalculatedNatalParents);
window.addEventListener('castalia-example-charts-ready', useCalculatedNatalParents);
window.addEventListener('castalia-natal-profiles-ready', useCalculatedNatalParents);

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
document.querySelector('#separation').addEventListener('input', e => setSeparation(e.target.value));
document.querySelector('#mainSeparation').addEventListener('input', e => setSeparation(e.target.value));
for (const selector of ['#danielGates', '#camilleGates']) document.querySelector(selector).addEventListener('input', () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuildRelationship, 220); });
const showBridgesToggle = document.querySelector('#showBridges');
const relationshipToggleButton = document.querySelector('#relationshipToggleButton');
function syncRelationshipToggleButton() {
  const enabled = showBridgesToggle.checked;
  relationshipToggleButton.setAttribute('aria-pressed', String(enabled));
  relationshipToggleButton.textContent = `Relationships · ${enabled ? 'On' : 'Off'}`;
}
showBridgesToggle.addEventListener('change', e => {
  if (e.target.checked) {
    relationshipInteractionEnabled = true;
    if (sourceDocument && loader && natalParentsReady) rebuildRelationship();
  } else {
    lockedRelationshipPairs.clear();
    lockedRelationshipLinks.clear();
    for (const flex of hangingFlexAnimations) {
      flex.locked = false;
      flex.tipVelocity.set(0, 0, 0);
    }
  }
  if (relationshipGroup) relationshipGroup.visible = e.target.checked;
  syncRelationshipToggleButton();
});
relationshipToggleButton.addEventListener('click', () => {
  showBridgesToggle.checked = !showBridgesToggle.checked;
  showBridgesToggle.dispatchEvent(new Event('change', { bubbles: true }));
});
syncRelationshipToggleButton();
document.querySelector('#showDaniel').addEventListener('change', e => {
  selectedKey = null;
  clearHover();
  engageRelationship();
  if (e.target.checked) includedFamilyMembers.add('daniel');
  else includedFamilyMembers.delete('daniel');
  if (planeGroups.daniel) planeGroups.daniel.visible = e.target.checked;
  syncTransitGroupVisibility();
  if (sourceDocument && loader) rebuildRelationship();
  refreshFrontFamilyReading();
});
document.querySelector('#showCamille').addEventListener('change', e => {
  selectedKey = null;
  clearHover();
  engageRelationship();
  if (e.target.checked) includedFamilyMembers.add('camille');
  else includedFamilyMembers.delete('camille');
  if (planeGroups.camille) planeGroups.camille.visible = e.target.checked;
  syncTransitGroupVisibility();
  if (sourceDocument && loader) rebuildRelationship();
  refreshFrontFamilyReading();
});
document.querySelector('#soloDaniel').addEventListener('click', () => soloFamilyMember('daniel'));
document.querySelector('#soloCamille').addEventListener('click', () => soloFamilyMember('camille'));
const autoRotateToggle = document.querySelector('#autoRotateToggle');
autoRotateToggle.checked = autoRotate;
autoRotateToggle.addEventListener('change', event => { autoRotate = event.target.checked; });
for (const toggle of [designActivationToggle, personalityActivationToggle]) {
  toggle?.addEventListener('change', () => {
    if (sourceDocument && loader) rebuildRelationship();
  });
}
const animateFlowToggle = document.querySelector('#animateFlow');
animateFlowToggle.checked = channelFlowEnabled;
animateFlowToggle.addEventListener('change', event => {
  const readingToggle = document.querySelector('#toggleChannelFlow');
  if (readingToggle) readingToggle.click();
  animateFlowToggle.checked = channelFlowEnabled;
});
const configDrawer = document.querySelector('#familyConfigDrawer');
const configToggle = document.querySelector('#familyConfigToggle');
function setConfigDrawerOpen(open) {
  configDrawer.classList.toggle('is-open', open);
  configDrawer.setAttribute('aria-hidden', String(!open));
  configToggle.setAttribute('aria-expanded', String(open));
}
configToggle.addEventListener('click', () => setConfigDrawerOpen(!configDrawer.classList.contains('is-open')));
document.querySelector('#familyConfigClose').addEventListener('click', () => setConfigDrawerOpen(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && configDrawer.classList.contains('is-open')) setConfigDrawerOpen(false);
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
// Main-view checkboxes mirror the existing layer controls in both directions.
for (const [selector, control] of [
  ['#mainDesign', designActivationToggle],
  ['#mainPersonality', personalityActivationToggle],
  ['#mainTransits', transitToggle]
]) {
  const checkbox = document.querySelector(selector);
  checkbox.checked = control.checked;
  checkbox.addEventListener('change', () => {
    control.checked = checkbox.checked;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
  control.addEventListener('change', () => { checkbox.checked = control.checked; });
}
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
  if (event.key === '[' || event.key === ']') {
    pauseAutoRotate();
    event.preventDefault();
    rotateFamily(Math.PI / 4 * (event.key === ']' ? 1 : -1));
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  pauseAutoRotate();
  event.preventDefault();
  const step = (event.shiftKey ? Math.PI / 4 : event.altKey ? 0.28 : 0.1) * (event.key === 'ArrowLeft' ? 1 : -1);
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
  syncChartFacing();
  syncChartInitials();
  refreshRelationshipPairing();
  const cameraOffset = camera.position.clone().sub(controls.target);
  const cameraAzimuth = Math.atan2(cameraOffset.x, cameraOffset.z);
  const angle = THREE.MathUtils.euclideanModulo(familyAzimuth - cameraAzimuth + Math.PI, Math.PI * 2) - Math.PI;
  rotationReadout.textContent = `Rotation ${Math.round(THREE.MathUtils.radToDeg(angle))}°`;
  const elapsed = now / 1000;
  chartRoot.updateMatrixWorld(true);
  const familyChart = person => familyChildren.some(item => item.id === person)
    ? familyGroups[person]?.children.find(item => item.name.includes('SVG plane'))
    : planeGroups[person];
  const memberVisible = person => familyChildren.some(item => item.id === person)
    ? Boolean(familyGroups[person]?.visible)
    : Boolean(planeGroups[person]?.visible);
  const pointCache = new Map();
  const familyPoint = (person, point) => {
    const key = `${person}:${point.x}:${point.y}:${point.z}`;
    if (pointCache.has(key)) return pointCache.get(key);
    const chart = familyChart(person);
    if (!chart) return null;
    const result = chartRoot.worldToLocal(chart.localToWorld(point.clone()));
    pointCache.set(key, result);
    return result;
  };
  const rootInverse = chartRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
  const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const familyViewRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion).applyQuaternion(rootInverse).normalize();
  const familyViewUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion).applyQuaternion(rootInverse).normalize();
  const familyNormal = person => {
    const chart = familyChart(person);
    return chart
      ? new THREE.Vector3(0, 0, 1).applyQuaternion(chart.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(rootInverse).normalize()
      : new THREE.Vector3(0, 0, 1);
  };
  const pairNormal = (a, b) => {
    const firstId = [a, b].sort()[0];
    const low = familyNormal(firstId);
    const high = familyNormal(firstId === a ? b : a);
    if (low.dot(high) < 0) high.negate();
    const blended = low.add(high);
    return blended.lengthSq() > 0.001 ? blended.normalize() : low;
  };
  // Use one snapshot for every strand, avoiding update-order bias.
  const hangingNeighbors = hangingFlexAnimations
    .filter(flex => flex.avoidancePoints && memberVisible(flex.person))
    .map(flex => ({ flex, points: flex.avoidancePoints }));
  for (const flex of hangingFlexAnimations) {
    const natalGatesForFlex = currentNatalGates?.[flex.person];
    const isStillHanging = Boolean(natalGatesForFlex
      && natalGatesForFlex.has(flex.activeGate)
      && !natalGatesForFlex.has(flex.openGate));
    if (!isStillHanging) {
      flex.tubeGroup.visible = false;
      continue;
    }
    const canReach = Boolean(flex.reachTarget && relationshipGroup.visible
      && memberVisible(flex.person) && memberVisible(flex.reachTarget.person));
    flex.tubeGroup.visible = memberVisible(flex.person);
    if (!flex.tubeGroup.visible) continue;
    const sourceGate = currentGatePoints[flex.person]?.get(flex.activeGate);
    if (!sourceGate) continue;
    const basePoints = flex.route.map(point => familyPoint(flex.person, point)).filter(Boolean).map(point => point.clone());
    if (basePoints.length < 2) continue;
    const activeAnchor = familyPoint(flex.person, new THREE.Vector3(sourceGate.x, sourceGate.y, 3.3));
    if (!activeAnchor) continue;
    flex.activationHalo.position.copy(activeAnchor);
    flex.activationHalo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), familyNormal(flex.person));
    const startDelta = activeAnchor.clone().sub(basePoints[0]);
    const restEnd = basePoints[basePoints.length - 1].clone();
    let target = null;
    let reachNormal = familyNormal(flex.person);
    if (canReach) {
      const targetPoint = currentGatePoints[flex.reachTarget.person]?.get(flex.reachTarget.gate);
      if (targetPoint) {
        target = familyPoint(flex.reachTarget.person, new THREE.Vector3(targetPoint.x, targetPoint.y, 3.3));
        if (target) reachNormal = pairNormal(flex.person, flex.reachTarget.person);
      }
    }
    if (!flex.tipPosition) flex.tipPosition = target && flex.locked ? target.clone() : restEnd.clone();
    const flapAxis = reachNormal.clone().multiplyScalar(0.72).addScaledVector(familyViewRight, 0.68).normalize();
    let twistAxis = flapAxis.clone().cross(reachNormal);
    if (twistAxis.lengthSq() < 0.001) twistAxis.copy(familyViewUp);
    else twistAxis.normalize();
    if (target && flex.locked) {
      flex.tipPosition.copy(target);
    } else {
      const magneticDelta = (target || restEnd).clone().sub(flex.tipPosition);
      const magneticDistance = magneticDelta.length();
      if (magneticDistance > 0.001) {
        const direction = magneticDelta.multiplyScalar(1 / magneticDistance);
        const strength = target
          ? Math.min(900, magneticDistance * 12)
          : Math.min(100, magneticDistance * 5.5);
        flex.tipVelocity.addScaledVector(direction, strength * delta);
        if (target) {
          const fieldCurl = direction.clone().cross(reachNormal);
          if (fieldCurl.lengthSq() > 0.001) {
            fieldCurl.normalize();
            flex.tipVelocity.addScaledVector(fieldCurl, Math.sin(elapsed * 2.4 + flex.phase) * strength * 0.025 * delta);
          }
        }
      }
      flex.tipVelocity.multiplyScalar(Math.exp(-(target ? 5.5 : 5.2) * delta));
      flex.tipVelocity.clampLength(0, target ? 300 : 90);
      flex.tipPosition.addScaledVector(flex.tipVelocity, delta);
      if (target && flex.tipPosition.distanceTo(target) < 12) {
        flex.locked = true;
        const counterpart = hangingFlexAnimations.find(other => other.person === flex.reachTarget.person
          && other.channelId === flex.channelId && other.reachTarget?.person === flex.person);
        if (counterpart) {
          counterpart.locked = true;
          counterpart.tipVelocity.set(0, 0, 0);
          if (counterpart.lockKey) lockedRelationshipLinks.add(counterpart.lockKey);
        }
        if (flex.lockKey) {
          lockedRelationshipLinks.add(flex.lockKey);
          lockedRelationshipPairs.add(relationshipPairKey(flex.person, flex.reachTarget.person));
        }
        flex.tipPosition.copy(target);
        flex.tipVelocity.set(0, 0, 0);
      } else if (!target && flex.tipPosition.distanceTo(restEnd) < 0.6 && flex.tipVelocity.length() < 3) {
        flex.tipPosition.copy(restEnd);
        flex.tipVelocity.set(0, 0, 0);
        flex.locked = false;
      }
    }
    if (!target) flex.locked = false;
    const sway = Math.sin(elapsed * 2 * Math.PI / flex.duration + flex.phase);
    const flutter = Math.cos(elapsed * 2 * Math.PI / (flex.duration * 0.78) + flex.phase * 1.7);
    const endPoint = flex.tipPosition.clone();
    if (!flex.locked) {
      const tipAmplitude = flex.amplitude * (target ? 0.38 : 0.62);
      endPoint.addScaledVector(flapAxis, sway * tipAmplitude);
      endPoint.addScaledVector(twistAxis, flutter * tipAmplitude * 0.32);
    }
    const endDelta = endPoint.clone().sub(basePoints[basePoints.length - 1]);
    let points = basePoints.map((point, index) => {
      const t = index / (basePoints.length - 1);
      const bend = THREE.MathUtils.smoothstep(t, 0.18, 1);
      point.addScaledVector(startDelta, 1 - bend).addScaledVector(endDelta, bend);
      const flop = flex.locked ? 0 : target ? 0.7 : 1;
      const envelope = Math.sin(Math.PI * bend) * flop;
      point.addScaledVector(flapAxis, envelope * sway * flex.amplitude);
      point.addScaledVector(twistAxis, envelope * flutter * flex.amplitude * 0.28);
      return point;
    });
    points = separateHangingChannels(points, flex, hangingNeighbors);
    if (!target) {
      points = avoidHangingObstacles(points, flex);
      // Preserve forward progress from the socket to the free end. Collision
      // corrections must never turn a short strand into a loop or hairpin.
      const anchor = points[0].clone();
      const forward = restEnd.clone().sub(activeAnchor).normalize();
      const restLength = restEnd.distanceTo(activeAnchor);
      let previousAdvance = 0;
      for (let index = 1; index < points.length; index++) {
        const t = index / (points.length - 1);
        const minimumAdvance = Math.max(previousAdvance + restLength / (points.length - 1) * 0.15, restLength * t * 0.65);
        const advance = points[index].clone().sub(anchor).dot(forward);
        if (advance < minimumAdvance) points[index].addScaledVector(forward, minimumAdvance - advance);
        previousAdvance = Math.max(advance, minimumAdvance);
        // Bound sideways deflection as well as forward progress. Abrupt
        // collision pushes can otherwise make the two offset walls curl.
        const step = points[index].clone().sub(points[index - 1]);
        const forwardStep = Math.max(0.001, step.dot(forward));
        const sideways = step.clone().addScaledVector(forward, -step.dot(forward));
        sideways.clampLength(0, forwardStep * 0.65);
        points[index].copy(points[index - 1]).addScaledVector(forward, forwardStep).add(sideways);
      }
    }
    if (target && flex.locked) {
      // Both halves share the same straight axis and exact midpoint. Half
      // the arc length of two independently bent curves does not meet.
      points = Array.from({ length: 37 }, (_, index) => activeAnchor.clone().lerp(target, index / 36));
    }
    const fullChannelCurve = constrainedPolyline(points);
    const renderPoints = target
      ? Array.from({ length: 19 }, (_, index) => fullChannelCurve.getPointAt(index / 36))
      : points;
    flex.avoidancePoints = renderPoints.filter((point, index) => index % 3 === 0 || index === renderPoints.length - 1).map(point => point.clone());
    const particlePathPoints = points.map(point => point.clone());
    if (target) {
      const gapStart = points[points.length - 1];
      const gap = target.clone().sub(gapStart);
      const gapLength = gap.length();
      const fieldLift = Math.min(18, gapLength * 0.07);
      for (let step = 1; step <= 6; step++) {
        const t = step / 6;
        particlePathPoints.push(gapStart.clone().lerp(target, t)
          .addScaledVector(reachNormal, Math.sin(Math.PI * t) * fieldLift));
      }
    }
    const particleCurve = constrainedPolyline(particlePathPoints);
    if (!flex.systemRoute) {
      flex.systemRoute = { container: chartRoot, curve: particleCurve, reverse: flex.isSink, person: flex.person, hanging: true, sourceCenter: flex.sourceCenter, activeCenter: flex.activeCenter };
      systemChannelRoutes.push(flex.systemRoute);
    }
    flex.systemRoute.curve = particleCurve;
    const showFlow = channelFlowEnabled && (!target || (canReach
      && flex.person.localeCompare(flex.reachTarget.person) < 0));
    for (const particle of flex.flowParticles) {
      particle.bead.visible = showFlow;
      if (!particle.bead.visible) continue;
      const progress = (elapsed * 0.27 + particle.phase) % 1;
      particle.bead.position.copy(particleCurve.getPointAt(progress));
      particle.material.color.copy(flex.particleSourceColor).lerp(flex.particleSinkColor, progress);
    }
    updateDynamicTube(flex.wall, channelSidePoints(renderPoints, -1, reachNormal));
    updateDynamicTube(flex.core, channelSidePoints(renderPoints, 1, reachNormal));
  }
  ambientParticles.rotation.y = elapsed * 0.006;
  const ambientPositions = ambientParticles.geometry.attributes.position.array;
  for (let i = 0; i < ambientParticleCount; i++) {
    const offset = i * 3;
    const phase = elapsed * 0.08 + i * 0.17;
    ambientPositions[offset] += ambientParticleVelocities[offset] * delta + Math.sin(phase) * delta * 1.1;
    ambientPositions[offset + 1] += ambientParticleVelocities[offset + 1] * delta + Math.cos(phase * 0.7) * delta * 0.35;
    ambientPositions[offset + 2] += ambientParticleVelocities[offset + 2] * delta + Math.cos(phase) * delta * 1.1;
    if (Math.abs(ambientPositions[offset]) > 980) ambientParticleVelocities[offset] *= -1;
    if (ambientPositions[offset + 1] > 560 || ambientPositions[offset + 1] < -100) ambientParticleVelocities[offset + 1] *= -1;
    if (Math.abs(ambientPositions[offset + 2]) > 980) ambientParticleVelocities[offset + 2] *= -1;
  }
  ambientParticles.geometry.attributes.position.needsUpdate = true;
  for (const flow of flowAnimations) {
    flow.bead.visible = channelFlowEnabled;
    if (!channelFlowEnabled) continue;
    if (flow.state === 'plane') {
      flow.progress = Math.min(1, flow.progress + delta / flow.duration);
      flow.bead.position.copy(flow.curve.getPointAt(flow.reverse ? 1 - flow.progress : flow.progress));
      if (flow.progress >= 1) releaseParticleInto3D(flow);
    } else if (flow.state === 'transit') {
      const receiver = flow.transitReceiver;
      if (!receiver?.container) {
        recycleParticleIntoPlane(flow);
      } else {
        flow.transitProgress = Math.min(1, flow.transitProgress + delta / flow.transitDuration);
        const targetLocal = receiver.curve.getPointAt(flow.transitReverse ? 1 : 0);
        const targetWorld = receiver.container.localToWorld(targetLocal.clone());
        const targetFamily = worldPointInFamily(targetWorld);
        const targetNormal = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(receiver.container.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const targetNormalFamily = worldVectorInFamily(targetWorld, targetNormal).normalize();
        const control2 = targetFamily.clone().addScaledVector(targetNormalFamily, flow.transitLift);
        const t = flow.transitProgress;
        const u = 1 - t;
        flow.bead.position.set(
          u ** 3 * flow.transitStart.x + 3 * u ** 2 * t * flow.transitControl1.x + 3 * u * t ** 2 * control2.x + t ** 3 * targetFamily.x,
          u ** 3 * flow.transitStart.y + 3 * u ** 2 * t * flow.transitControl1.y + 3 * u * t ** 2 * control2.y + t ** 3 * targetFamily.y,
          u ** 3 * flow.transitStart.z + 3 * u ** 2 * t * flow.transitControl1.z + 3 * u * t ** 2 * control2.z + t ** 3 * targetFamily.z
        );
        if (flow.transitProgress >= 1) arriveAtReceivingChannel(flow);
      }
    } else {
      flow.escapeAge += delta;
      const velocity = flow.escapeVelocity;
      const position = flow.bead.position;
      const swirl = new THREE.Vector3(-position.z, 0, position.x).normalize();
      velocity.addScaledVector(swirl, delta * 2.4);
      velocity.y -= delta * 0.45;
      velocity.multiplyScalar(Math.pow(0.94, delta));
      position.addScaledVector(velocity, delta);
      const fade = THREE.MathUtils.clamp((flow.escapeDuration - flow.escapeAge) / 2, 0, 1);
      flow.bead.scale.setScalar(fade * fade);
      if (flow.escapeAge >= flow.escapeDuration) recycleParticleIntoPlane(flow);
    }
    const pulse = 0.76 + 0.24 * Math.sin(elapsed * 5.2 + flow.phase * Math.PI * 2);
    flow.glow.scale.setScalar(pulse);
    flow.glowMaterial.opacity = 0.24 + pulse * 0.22;
  }
  for (const emitter of sacralEmitters) {
    if (!channelFlowEnabled || !familyMemberIsVisible(emitter.group.userData.chartPerson)) continue;
    emitter.elapsed += delta;
    if (emitter.elapsed < 0.25) continue;
    emitter.elapsed %= 0.25;
    let particle = emitter.particles.find(item => item.state === 'pooled');
    if (!particle && emitter.particles.length < 96) {
      particle = spawnSystemParticle(emitter.group, emitter.polygon, 'sacral', emitter.color);
      particle.emitter = emitter;
      emitter.particles.push(particle);
    } else if (particle) {
      particle.container = emitter.group;
      particle.polygon = emitter.polygon.map(point => point.clone());
      particle.centerId = 'sacral';
      particle.chakraColor.set(emitter.color);
      particle.glowMaterial.color.copy(particle.chakraColor);
      particle.coreMaterial.color.copy(particle.chakraColor).lerp(new THREE.Color('#fffdf2'), 0.64);
      particle.channelCooldown = 0;
      seedCenterParticle(particle);
    }
  }
  for (const particle of centerParticleAnimations) {
    if (particle.state === 'pooled') { particle.bead.visible = false; continue; }
    particle.bead.visible = channelFlowEnabled && particle.container.visible;
    if (!channelFlowEnabled) continue;
    if (particle.state === 'channel') {
      const route = particle.channelRoute;
      particle.channelDistance += delta * 28;
      const progress = Math.min(1, particle.channelDistance / Math.max(1, route.curve.getLength()));
      const point = route.curve.getPointAt(route.reverse ? 1 - progress : progress);
      particle.bead.position.copy(particle.container.worldToLocal(route.container.localToWorld(point.clone())));
      if (progress === 1) {
        const world = particle.bead.getWorldPosition(new THREE.Vector3());
        const receiver = centerParticleAnimations.find(other => {
          const local = other.container.worldToLocal(world.clone());
          const center = other.polygon.reduce((sum, p) => sum.add(p), new THREE.Vector2()).multiplyScalar(1 / other.polygon.length);
          const inward = new THREE.Vector2(center.x - local.x, center.y - local.y).normalize().multiplyScalar(5);
          return familyMemberIsVisible(other.container.userData.chartPerson)
            && (route.hanging || other.container.userData.chartPerson === route.container.userData.chartPerson)
            && pointInPolygon(local.x + inward.x, local.y + inward.y, other.polygon);
        });
        if (receiver) {
          receiver.container.attach(particle.bead);
          particle.container = receiver.container;
          particle.centerId = receiver.centerId;
          particle.chakraColor.copy(receiver.chakraColor);
          particle.glowMaterial.color.copy(particle.chakraColor);
          particle.coreMaterial.color.copy(particle.chakraColor).lerp(new THREE.Color('#fffdf2'), 0.64);
          particle.polygon = receiver.polygon.map(point => point.clone());
          const center = particle.polygon.reduce((sum, p) => sum.add(p), new THREE.Vector2()).multiplyScalar(1 / particle.polygon.length);
          const inward = new THREE.Vector3(center.x - particle.bead.position.x, center.y - particle.bead.position.y, 0).normalize();
          particle.bead.position.addScaledVector(inward, 5);
          particle.bead.position.z = 5.2;
          particle.velocity.copy(inward).multiplyScalar(9);
          particle.channelCooldown = 2;
          particle.state = 'plane';
          particle.age = 0;
          particle.escapeAt = 4 + Math.random() * 4;
        } else releaseCenterParticleInto3D(particle);
      }
    } else if (particle.state === 'plane') {
      const position = particle.bead.position;
      const world = particle.bead.getWorldPosition(new THREE.Vector3());
      particle.channelCooldown = Math.max(0, (particle.channelCooldown || 0) - delta);
      if (!particle.channelCooldown) {
        const outlets = systemChannelRoutes.filter(route => route.hanging && !route.reverse
          && route.person === particle.container.userData.chartPerson && route.activeCenter === particle.centerId);
        let nearest = null, nearestDistance = 45;
        for (const outlet of outlets) {
          const entry = particle.container.worldToLocal(outlet.container.localToWorld(outlet.curve.getPointAt(0).clone()));
          const distance = entry.distanceTo(position);
          if (distance < nearestDistance) { nearest = entry; nearestDistance = distance; }
        }
        if (nearest) {
          const pull = nearest.sub(position); pull.z = 0;
          particle.velocity.lerp(pull.normalize().multiplyScalar(14), 1 - Math.exp(-delta * 4));
        }
      }
      const route = !particle.channelCooldown && systemChannelRoutes.find(route => {
        if (route.hanging && (route.reverse || route.person !== particle.container.userData.chartPerson)) return false;
        if (!route.hanging && route.container.userData.chartPerson !== particle.container.userData.chartPerson) return false;
        const entry = route.container.localToWorld(route.curve.getPointAt(route.reverse ? 1 : 0).clone());
        return entry.distanceTo(world) < 7;
      });
      if (route) {
        particle.channelRoute = route;
        particle.channelDistance = 0;
        particle.state = 'channel';
        continue;
      }
      const nextX = position.x + particle.velocity.x * delta;
      const nextY = position.y + particle.velocity.y * delta;
      if (pointInPolygon(nextX, nextY, particle.polygon)) {
        position.x = nextX;
        position.y = nextY;
      } else {
        const centroid = particle.polygon.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / particle.polygon.length);
        const inward = new THREE.Vector2(centroid.x - position.x, centroid.y - position.y).normalize();
        particle.velocity.set(inward.x * (3 + Math.random() * 3), inward.y * (3 + Math.random() * 3), 0);
        const bounceX = position.x + particle.velocity.x * delta;
        const bounceY = position.y + particle.velocity.y * delta;
        if (pointInPolygon(bounceX, bounceY, particle.polygon)) {
          position.x = bounceX;
          position.y = bounceY;
        } else {
          const point = randomPointInPolygon(particle.polygon);
          position.x = point.x;
          position.y = point.y;
        }
      }
      particle.age += delta;
      if (particle.age >= particle.escapeAt) releaseCenterParticleInto3D(particle);
    } else {
      particle.age += delta;
      const velocity = particle.escapeVelocity;
      // Sink tips recruit the same escaped system motes, selected by the
      // chakra they came from; no channel-specific particles are emitted.
      const world = particle.bead.getWorldPosition(new THREE.Vector3());
      let sink = null, sinkPoint = null, sinkDistance = 140;
      for (const route of systemChannelRoutes) {
        if (!route.hanging || !route.reverse || route.sourceCenter !== particle.centerId
          || !familyMemberIsVisible(route.person)) continue;
        const tip = route.container.localToWorld(route.curve.getPointAt(1).clone());
        const distance = tip.distanceTo(world);
        if (distance < sinkDistance) { sink = route; sinkPoint = tip; sinkDistance = distance; }
      }
      if (sink) {
        const target = particle.container.worldToLocal(sinkPoint);
        const direction = target.sub(particle.bead.position).normalize();
        velocity.lerp(direction.multiplyScalar(42), 1 - Math.exp(-delta * 5));
        particle.age = 0;
        particle.bead.scale.setScalar(1);
        if (sinkDistance < 7) {
          particle.channelRoute = sink;
          particle.channelDistance = 0;
          particle.state = 'channel';
          continue;
        }
      }
      const position = particle.bead.position;
      const swirl = new THREE.Vector3(-position.z, 0, position.x).normalize();
      velocity.addScaledVector(swirl, delta * 2.4);
      velocity.y -= delta * 0.35;
      velocity.multiplyScalar(Math.pow(0.95, delta));
      position.addScaledVector(velocity, delta);
      const fade = THREE.MathUtils.clamp((particle.escapeDuration - particle.age) / 2, 0, 1);
      particle.bead.scale.setScalar(fade * fade);
      if (particle.age >= particle.escapeDuration) {
        if (particle.emitter) { particle.state = 'pooled'; particle.bead.visible = false; }
        else seedCenterParticle(particle);
      }
    }
    const pulse = 0.74 + 0.26 * Math.sin(elapsed * 4.6 + particle.age * 1.2);
    particle.glow.scale.setScalar(pulse);
    particle.glowMaterial.opacity = 0.2 + pulse * 0.25;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
init();
animate();
