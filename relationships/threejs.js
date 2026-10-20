import * as THREE from 'three';
import '../transit-data.js?family-circle-108-20261019&lifetime-ephem-range-20261020';
import { generatePublicDemoReading } from './public-demo-readings.js?v=lifetime-timeline-20261020';
import { publicPairRecurrence, publicFamilyRecurrence } from './relationship-recurrence-data.js?v=family-opportunities-20261020';
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
const chartSilhouetteWidth = 135;
const parentChartScale = 0.9;
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
// Rotate the family centers around their shared axis; chart planes counter-rotate
// so every BodyGraph stays facing the camera throughout the turn.
let familyAzimuth = THREE.MathUtils.degToRad(108);
chartRoot.rotation.y = familyAzimuth;
function rotateFamily(step) {
  familyAzimuth += step;
  chartRoot.rotation.y = familyAzimuth;
  syncChartFacing();
  refreshFrontFamilyReading();
}
const planeGroups = {};
let relationshipGroup = null;
let activeRelationshipPairKey = '';
let lastRelationshipFacingAngle = null;
let currentChartData = null;
let currentNatalGates = null;
let currentTransitSnapshot = null;
const transitGroups = {};
const familyGroups = {};
let familyChildren = [];
let transitSnapshot = null;
let transitDurationEstimates = [];
let lifetimeTimelineActive = false;
const transitToggle = document.querySelector('#showTransits');
try {
  transitToggle.checked = localStorage.getItem('castalia-hd-show-transits') !== 'false';
} catch {
  transitToggle.checked = true;
}
let sourceDocument = null;
let loader = null;
let natalParentsReady = false;
const gateDescriptions = new Map();
const channelDescriptions = new Map();
let rebuildTimer = null;
let exactFrontAlignment = true;
let frontPerson = 'daniel';
let readingFrontPerson = null;
let readingViewKey = '';
const generatedReadings = new Map();
const flowAnimations = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let autoRotate = !reduceMotion;
const autoRotateSpeed = 0.035; // radians per second; one slow turn takes about three minutes
const colors = { daniel: new THREE.Color('#087fa5'), camille: new THREE.Color('#cf4f79') };
const childPalette = ['#488f73', '#b67a37', '#7864a6', '#518a9d'].map(color => new THREE.Color(color));
const familyLayout = { parentScale: parentChartScale, childScale: parentChartScale, parentRadius: 220 };
function childPlaneRadius() {
  return Number(document.querySelector('#separation').value) / 2;
}
function chartColor(person) {
  if (colors[person]) return colors[person];
  const childIndex = Math.max(0, familyChildren.findIndex(child => child.id === person));
  return childPalette[childIndex % childPalette.length];
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
function orientPlaneToCamera(group, scale, flipX, parentYaw = 0, centerZ = 0) {
  if (!group) return;
  const facingYaw = cameraAzimuth() - familyAzimuth - parentYaw;
  const centerLocalX = (flipX ? -1 : 1) * 194.4 * scale;
  group.rotation.y = facingYaw;
  group.position.x = -centerLocalX * Math.cos(facingYaw);
  group.position.z = centerZ + centerLocalX * Math.sin(facingYaw);
}
function syncChartFacing() {
  for (const person of ['daniel', 'camille']) {
    const centerZ = person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
    orientPlaneToCamera(planeGroups[person], familyLayout.parentScale, false, 0, centerZ);
    orientPlaneToCamera(transitGroups[person], familyLayout.parentScale, false, 0, centerZ);
  }
  familyChildren.forEach((child, index) => {
    const parent = familyGroups[child.id];
    if (!parent) return;
    const chart = parent.children.find(item => item.name.includes('SVG plane'));
    orientPlaneToCamera(chart, familyLayout.childScale, false, parent.rotation.y);
    orientPlaneToCamera(transitGroups[child.id], familyLayout.childScale, false, parent.rotation.y);
  });
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
    const allTransitGates = new Set(transitSnapshot?.gates || []);
    const chartTransits = [...allTransitGates].filter(gate => !chartGates.has(gate));
    const transitChannelChanges = transitToggle.checked && transitSnapshot
      ? [...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')].flatMap(node => {
        const from = +node.dataset.from, to = +node.dataset.to;
        const id = `${Math.min(from, to)}-${Math.max(from, to)}`;
        const transitGates = [from, to].filter(gate => allTransitGates.has(gate) && !chartGates.has(gate));
        if (!transitGates.length || !(chartGates.has(from) || allTransitGates.has(from)) || !(chartGates.has(to) || allTransitGates.has(to)) || (chartGates.has(from) && chartGates.has(to))) return [];
        return [{
          channel: `${Math.min(from, to)}–${Math.max(from, to)}`,
          channelName: relationshipChannelReadings[id]?.name || channelDescriptions.get(id)?.name || '',
          transitGates: transitGates.map(gate => ({ gate, planets: transitPlanetNames(gate), expectedThrough: transitGateWindow(gate) }))
        }];
      })
      : [];
    return {
      id: person,
      name: personName(person),
      type: chartSummary?.type,
      profile: chartSummary?.profile,
      authority: chartSummary?.authority,
      strategy: chartSummary?.strategy,
      natalGates: [...chartGates].sort((a, b) => a - b),
      definedCenters: chartSummary?.definedCenters || [],
      openCenters: allCenterIds.filter(center => !(chartSummary?.definedCenters || []).includes(center)),
      natalChannels: chartSummary?.definedChannels || [],
      transitChannelChanges,
      transitGates: chartTransits.map(gate => ({ gate, planets: transitPlanetNames(gate), expectedThrough: transitGateWindow(gate) }))
    };
  };
  const transitGateSet = new Set(transitToggle.checked ? transitSnapshot?.gates || [] : []);
  const activeTransitBridgeChannels = (personA, personB) => {
    const gatesA = gates.get(personA) || new Set();
    const gatesB = gates.get(personB) || new Set();
    const natalGates = { [personA]: gatesA, [personB]: gatesB };
    return [...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')].flatMap(node => {
      const from = +node.dataset.from, to = +node.dataset.to;
      const channel = `${Math.min(from, to)}-${Math.max(from, to)}`;
      if ((gatesA.has(from) && gatesA.has(to)) || (gatesB.has(from) && gatesB.has(to))) return [];
      const hasRelationshipBridge = relationshipLinkSpecs(from, to, personA, personB, natalGates, transitGateSet).length > 0;
      const transitGates = [from, to].filter(gate => transitGateSet.has(gate) && !gatesA.has(gate) && !gatesB.has(gate));
      if (!hasRelationshipBridge || !transitGates.length) return [];
      const reading = relationshipChannelReadings[channel] || channelDescriptions.get(channel);
      const expectedThrough = transitGates.map(gate => `Gate ${gate} ${transitGateWindow(gate)}`).join('; ');
      return [{ channel, channelName: reading?.name || '', channelDescription: reading?.description || '', expectedThrough }];
    });
  };
  const viewContext = {
    frontPerson: chartFacts(readingPerson),
    relationships: relationshipPairs.map(([a, b]) => {
      const pair = { ids: [a, b], people: [personName(a), personName(b)], charts: [chartFacts(a), chartFacts(b)] };
      pair.transitChannelRecurrence = publicPairRecurrence(pair, activeTransitBridgeChannels(a, b));
      return pair;
    }),
    transitsShown: Boolean(transitToggle.checked),
    transitAsOf: transitSnapshot ? new Date(transitSnapshot.epoch * 1000).toLocaleString() : null,
    transitEpoch: transitSnapshot ? transitSnapshot.epoch * 1000 : null,
    lifetimeTimeline: lifetimeTimelineActive
  };
  viewContext.familyRecurrence = publicFamilyRecurrence([viewContext.frontPerson, ...viewContext.relationships.map(pair => pair.charts[1])]);
  readingViewKey = JSON.stringify(viewContext);
  window.hdCurrentReadingView = viewContext;

  const describeCenters = (centers, withThemes = false) => centers.map(center => {
    const [name, theme] = centerDescriptions[center] || [center, ''];
    const centerTheme = theme.replace(/[.!?]+$/, '').toLowerCase();
    return withThemes && centerTheme ? `${name} (${centerTheme})` : name;
  });
  const frontDefined = new Set(summary.definedCenters);
  const frontOpen = allCenterIds.filter(center => !frontDefined.has(center));
  const intro = document.createElement('p');
  const channelNames = summary.definedChannels.map(id => {
    const reading = relationshipChannelReadings[id] || channelDescriptions.get(id);
    return `${id.replace('-', '–')}${reading?.name ? ` ${reading.name}` : ''}`;
  });
  intro.textContent = `In front, ${frontName}'s ${summary.type}${summary.profile ? ` (${summary.profile})` : ''} chart has defined centers ${describeCenters([...frontDefined], true).join(', ') || 'none'}${channelNames.length ? ` through channels including ${channelNames.join(', ')}` : ''}. Its undefined (open) centers are ${describeCenters(frontOpen, true).join(', ') || 'none'}. In Human Design, definition is read as relatively consistent energy; an undefined center is more receptive to and can amplify other people's energy. Neither is better or worse, and the suggested strategy is to ${summary.strategy}.`;
  appendReadingText(intro, intro.textContent);
  root.append(intro);

  const natalFrontGates = gates.get(readingPerson);
  const transitGates = new Set(transitSnapshot?.gates || []);
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
        const title = channel.reading?.name ? ` (${channel.reading.name})` : '';
        const channelTheme = channel.reading?.description?.replace(/[.!?]+$/, '');
        return `the ${channel.label}${title} channel links ${fromOwner}'s Gate ${channel.from} with ${toOwner}'s Gate ${channel.to}${channelTheme ? `, bringing ${channelTheme.charAt(0).toLowerCase()}${channelTheme.slice(1)}` : ''}`;
      });
      facts.push(`${nameA} and ${nameB} complete ${descriptions.join('; ')}`);
    }
    if (sharedChannels.length) facts.push(`Both charts also define ${sharedChannels.map(channel => `${channel.label}${channel.reading?.name ? ` ${channel.reading.name}` : ''}`).join(', ')} individually, reinforcing a shared channel theme`);
    if (sharedGates.length) facts.push(`They share gates ${sharedGates.join(', ')}, adding common activation themes`);
    if (transitToggle.checked && transitSnapshot) {
      const activeA = new Set([...gatesA, ...transitGates]);
      const activeB = new Set([...gatesB, ...transitGates]);
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
    const activation = activationDescription(activationsByGate.get(number));
    const activationNote = activation ? ` Planetary activations: ${activation}.` : '';
    const transitNote = transitPlanets.length ? ` Current transit activation: ${transitPlanets.join(', ')}.` : '';
    return hoverInfo(key, `Gate ${number}${meaning?.name ? ` · ${meaning.name}` : ''}`, `${meaning?.description || 'A gate is one activation point in a channel.'} ${owner} · ${centerName} center · natal ${active ? 'active' : 'open'}${transitPlanets.length ? '; currently activated by transit' : ''}.${activationNote}${transitNote}`);
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
  const transitColor = new THREE.Color('#7c3aed');
  const transitGates = new Set(options.transitSnapshot?.gates || []);
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
    const centerChannelCount = isCenterShape ? Number(center?.getAttribute('data-channel-count') || 0) : 0;
    const channelId = channel ? `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}` : null;
    const hover = describePathFeature(node, person, activationsByGate, options.transitSnapshot);
    if (hover && channelId && relationshipChannels.has(channelId)) hover.hoverKey = `relationship:channel:${channelId}`;

    if (path.subPaths?.length && isChannel) {
      // Keep each person's channels tinted by their chart color, including
      // open channels; lower opacity keeps the active paths in focus.
      const roadColor = color;
      // In exact front view, separate shared tracks by a few pixels so both
      // contributors remain visibly blue and pink instead of blending purple.
      const opacity = active ? (exactFrontAlignment ? 0.46 : 0.78) : 0.10;
      const sharedOffset = exactFrontAlignment && active && sharedChannels.has(channelId) ? (person === 'daniel' ? -2.2 : 2.2) : 0;
      // Each SVG rail becomes a two-lane carriageway; the divider and dashed lane marks make the road legible in depth.
      const roadMat = lineMaterial(roadColor, opacity);
      const laneMat = lineMaterial(pale, active ? (exactFrontAlignment ? 0.22 : 0.7) : 0.08);
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
      const transitActive = isGateMarker && gate && transitGates.has(+gate.dataset.gate);
      const gateFillColor = gateActivations.some(item => item.type === 'design')
        ? '#cf2943'
        : gateActivations.some(item => item.type === 'personality') ? '#24231f' : color;
      const fillColor = isGateMarker ? (transitActive ? transitColor : gateActive ? gateFillColor : pale) : (centerChannelCount ? color : pale);
      const centerTintBase = exactFrontAlignment ? 0.16 : 0.24;
      const centerTintPerChannel = exactFrontAlignment ? 0.065 : 0.085;
      const centerTint = centerChannelCount
        ? Math.min(exactFrontAlignment ? 0.58 : 0.76, centerTintBase + centerChannelCount * centerTintPerChannel)
        : 0.12;
      const fillOpacity = isCenterShape
        ? centerTint
        : transitActive ? 0.86 : gateActive ? (exactFrontAlignment ? 0.35 : 0.55) : 0;
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
  // SVG coordinates use a downward-positive Y axis. Flip the finished plane so the chart reads upright in 3D.
  group.scale.y = -1;
  group.position.set(-194.4, chartViewHeight, 0);
  if (options.scale) {
    const xScale = options.flipX ? -options.scale : options.scale;
    const xOffset = options.flipX ? 194.4 * options.scale : -194.4 * options.scale;
    group.scale.set(xScale, -options.scale, options.scale);
    group.position.set(xOffset + (options.offsetX || 0), chartViewHeight * options.scale + (options.offsetY || 0), 0);
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
  const centerChannelCounts = new Map();
  const gateCenters = new Map([...keep.querySelectorAll('.gate[data-gate][data-center]')].map(gate => [+gate.dataset.gate, gate.dataset.center]));
  keep.querySelectorAll('.channel-group[data-from][data-to]').forEach(ch => {
    const defined = gates.has(+ch.dataset.from) && gates.has(+ch.dataset.to);
    ch.setAttribute('data-defined', String(defined));
    if (defined) {
      const fromCenter = gateCenters.get(+ch.dataset.from);
      const toCenter = gateCenters.get(+ch.dataset.to);
      if (fromCenter) centerChannelCounts.set(fromCenter, (centerChannelCounts.get(fromCenter) || 0) + 1);
      if (toCenter) centerChannelCounts.set(toCenter, (centerChannelCounts.get(toCenter) || 0) + 1);
    }
  });
  keep.querySelectorAll('.center').forEach(center => {
    const count = centerChannelCounts.get(center.dataset.center) || 0;
    center.setAttribute('data-defined', String(count > 0));
    center.setAttribute('data-channel-count', String(count));
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
  let centerX = 0, centerY = 0, centerZ = 0;
  if (isChild) {
    const side = childIndex % 2 === 0 ? 1 : -1;
    const childOrdinal = Math.floor(childIndex / 2);
    const sideCount = side > 0 ? Math.ceil(familyChildren.length / 2) : Math.floor(familyChildren.length / 2);
    const offset = sideCount > 1 ? (childOrdinal / (sideCount - 1) - 0.5) * (Math.PI / 3) : 0;
    const childAngle = side > 0 ? offset : Math.PI - offset;
    centerX = childPlaneRadius() * Math.cos(childAngle);
    centerZ = childPlaneRadius() * Math.sin(childAngle);
  } else {
    centerZ = person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
  }
  const localX = point.x * scale - 194.4 * scale;
  const localY = -point.y * scale + chartViewHeight * scale + centerY;
  const localZ = localDepth * scale;
  const facingYaw = cameraAzimuth() - familyAzimuth;
  return new THREE.Vector3(
    centerX + Math.cos(facingYaw) * localX + Math.sin(facingYaw) * localZ,
    localY,
    centerZ - Math.sin(facingYaw) * localX + Math.cos(facingYaw) * localZ
  );
}
function overlappingChartPairs() {
  if (!currentNatalGates) return [];
  chartRoot.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const candidates = Object.keys(currentNatalGates).filter(person => {
    if (person === 'daniel') return planeGroups.daniel?.visible ?? true;
    if (person === 'camille') return planeGroups.camille?.visible ?? true;
    return familyGroups[person]?.visible ?? true;
  }).map(person => {
    const center = chartPointInFamily({ x: 194.4, y: chartViewHeight / 2 }, person);
    const screen = camera.worldToLocal(chartRoot.localToWorld(center));
    return { person, x: screen.x, y: screen.y };
  });
  const pairs = [];
  const maxDistance = 12;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= maxDistance) pairs.push([a.person, b.person]);
    }
  }
  return pairs;
}
function refreshRelationshipPairing() {
  if (!currentChartData || !currentNatalGates) return;
  const pairs = overlappingChartPairs();
  const key = pairs.map(pair => pair.join(':')).sort().join('|');
  const facingAngle = cameraAzimuth() - familyAzimuth;
  const facingDelta = lastRelationshipFacingAngle === null ? Infinity :
    Math.abs(THREE.MathUtils.euclideanModulo(facingAngle - lastRelationshipFacingAngle + Math.PI, Math.PI * 2) - Math.PI);
  const pairChanged = key !== activeRelationshipPairKey;
  if (!pairChanged && facingDelta < THREE.MathUtils.degToRad(0.5)) return;
  activeRelationshipPairKey = key;
  lastRelationshipFacingAngle = facingAngle;
  releaseGroup(relationshipGroup);
  for (let i = flowAnimations.length - 1; i >= 0; i--) {
    if (!flowAnimations[i].bead.parent) flowAnimations.splice(i, 1);
  }
  relationshipGroup = makeRelationshipGroup(currentChartData, currentNatalGates, currentTransitSnapshot, pairs);
  chartRoot.add(relationshipGroup);
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  if (pairChanged) {
    const names = pairs.map(pair => pair.map(person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child')).join('–'));
    setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel bridge${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} between overlapping charts${names.length ? ` (${names.join(', ')})` : ''}.`);
    frontFamilyReading();
  }
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
function makeRelationshipGroup(chartData, natalGates, transitSnapshot, pairs = []) {
  const group = new THREE.Group();
  group.name = 'Relationship-completed channels · overlapping charts';
  const gateMarkerZ = 3.3;
  const relationshipTeal = lineMaterial(new THREE.Color('#238f8b'), 0.98);
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
  for (const [personA, personB] of pairs) {
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
            ? dashedTubesFromCurve(spline, 1.25, relationshipTeal)
            : [new THREE.Mesh(new THREE.TubeGeometry(spline, 96, 1.25, 6, false), relationshipTeal)];
          for (const bridge of bridges) {
            Object.assign(bridge.userData, tip);
            group.add(bridge);
          }
          addFlowMotion(group, spline, '#8fe3d7', tip);
          addFlowMotion(group, spline, '#66bfe2', tip, true);
          for (const [point, material] of [[link.from, link.fromMaterial], [link.to, link.toMaterial]]) {
            const bead = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), material);
            bead.position.copy(point);
            Object.assign(bead.userData, tip);
            group.add(bead);
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
  const color = chartColor(person);
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
  // Transit gate color is applied directly to the gate marker on the natal
  // plane. This overlay adds only the dashed temporary channels and their flow.
  group.scale.y = -1;
  group.position.set(-194.4, 194.4, 0);
  return group;
}
function rebuildRelationship() {
  selectedKey = null;
  clearHover();
  if (!sourceDocument || !loader) return;
  if (!natalParentsReady) {
    setStatus('Calculating parent natal charts…');
    return;
  }
  flowAnimations.length = 0;
  const danielGates = parseGateList('#danielGates');
  const camilleGates = parseGateList('#camilleGates');
  const natalGates = { daniel: danielGates, camille: camilleGates };
  familyChildren.forEach(child => { natalGates[child.id] = new Set(child.gates || []); });
  const activeTransitSnapshot = transitToggle.checked ? transitSnapshot : null;
  const sharedChannels = new Set([...sourceDocument.querySelectorAll('.channel-group[data-from][data-to]')]
    .filter(channel => danielGates.has(+channel.dataset.from) && danielGates.has(+channel.dataset.to) && camilleGates.has(+channel.dataset.from) && camilleGates.has(+channel.dataset.to))
    .map(channel => `${Math.min(+channel.dataset.from, +channel.dataset.to)}-${Math.max(+channel.dataset.from, +channel.dataset.to)}`));
  const transitGates = new Set(activeTransitSnapshot?.gates || []);
  currentNatalGates = natalGates;
  if (planeGroups.daniel) planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  if (planeGroups.camille) planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  const overlapPairs = overlappingChartPairs();
  const relationshipChannels = new Set();
  const channelElements = [...sourceDocument.querySelectorAll('.person--daniel .channel-group[data-from][data-to]')];
  for (const [personA, personB] of overlapPairs) {
      for (const channel of channelElements) {
        const a = +channel.dataset.from, b = +channel.dataset.to;
        if (relationshipLinkSpecs(a, b, personA, personB, natalGates, transitGates).length) {
          relationshipChannels.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
        }
      }
  }
  const chartData = {};
  for (const person of ['daniel', 'camille']) {
    const data = loader.parse(extractLayer(sourceDocument, person, natalGates[person]));
    chartData[person] = data;
    releaseGroup(planeGroups[person]);
    const group = makePlaneGroup(data.paths, person, sharedChannels, relationshipChannels, {
      scale: familyLayout.parentScale, transitSnapshot: activeTransitSnapshot
    });
    group.position.z = person === frontPerson ? familyLayout.parentRadius : -familyLayout.parentRadius;
    planeGroups[person] = group;
    chartRoot.add(group);
  }
  for (const [person, group] of Object.entries(familyGroups)) {
    releaseGroup(group);
    delete familyGroups[person];
  }
  const separation = Number(document.querySelector('#separation').value);
  const half = separation / 2;
  // Keep the parent pair's shared center at the same radius as the children.
  familyLayout.parentRadius = half;
  planeGroups.daniel.position.z = frontPerson === 'daniel' ? familyLayout.parentRadius : -familyLayout.parentRadius;
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
      group.scale.set(familyLayout.parentScale, -familyLayout.parentScale, familyLayout.parentScale);
      group.position.set(-194.4 * familyLayout.parentScale, chartViewHeight * familyLayout.parentScale, 0);
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
    // Chart position determines which side of the family it occupies. Keep
    // the SVG itself unmirrored so every child reads in the same forward view.
    const flipX = false;
    childPosition.position.set(offsetX, offsetY, offsetZ);
    childPosition.rotation.y = Math.atan2(-offsetX, -offsetZ);
    const childGates = natalGates[child.id];
    const childData = loader.parse(extractLayer(sourceDocument, 'daniel', childGates));
    chartData[child.id] = childData;
    const color = childPalette[index % childPalette.length];
    const childGroup = makePlaneGroup(childData.paths, child.id, new Set(), relationshipChannels, {
      color, name: child.name, scale: childScale, flipX, transitSnapshot: activeTransitSnapshot
    });
    childPosition.visible = true;
    childPosition.add(childGroup);
    familyGroups[child.id] = childPosition;
    chartRoot.add(childPosition);
    if (activeTransitSnapshot) {
      const activations = new Set([...childGates, ...activeTransitSnapshot.gates]);
      const transitData = loader.parse(extractLayer(sourceDocument, 'daniel', activations));
      const transitGroup = makeTransitGroup(transitData, activeTransitSnapshot, childGates, child.id);
      transitGroup.scale.set(flipX ? -childScale : childScale, -childScale, childScale);
      transitGroup.position.set(flipX ? 194.4 * childScale : -194.4 * childScale, chartViewHeight * childScale, 0);
      transitGroups[child.id] = transitGroup;
      childPosition.add(transitGroup);
      transitGroup.visible = transitToggle.checked;
    }
  });
  currentChartData = chartData;
  currentTransitSnapshot = activeTransitSnapshot;
  releaseGroup(relationshipGroup);
  activeRelationshipPairKey = overlapPairs.map(pair => pair.join(':')).sort().join('|');
  relationshipGroup = makeRelationshipGroup(chartData, natalGates, activeTransitSnapshot, overlapPairs);
  chartRoot.add(relationshipGroup);
  relationshipGroup.visible = document.querySelector('#showBridges').checked;
  planeGroups.daniel.visible = document.querySelector('#showDaniel').checked;
  planeGroups.camille.visible = document.querySelector('#showCamille').checked;
  syncChartFacing();
  frontFamilyReading();
  const pairNames = overlapPairs.map(pair => pair.map(person => window.hdChartNames?.[person] || (person === 'daniel' ? 'Person 1' : person === 'camille' ? 'Person 2' : 'Child')).join('–'));
  setStatus(`${relationshipGroup.userData.bridgeCount} relationship channel bridge${relationshipGroup.userData.bridgeCount === 1 ? '' : 's'} between overlapping charts${pairNames.length ? ` (${pairNames.join(', ')})` : ''}.`);
}

window.addEventListener('castalia-family-children-updated', event => {
  familyChildren = Array.isArray(event.detail) ? event.detail : [];
  familyChildren.forEach((child, index) => { window.hdChartNames[child.id] = child.name || `Child ${index + 1}`; });
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
  const aspect = rect.width / rect.height;
  const chartWidth = chartSilhouetteWidth * familyLayout.parentScale;
  const chartHeight = chartViewHeight * familyLayout.parentScale;
  // Size chart width against the viewport, then expand only if the currently
  // projected family footprint requires it. A projected-width calculation
  // avoids shrinking the charts based on the circle's hidden depth.
  const desiredHalfWidth = rect.width * chartWidth / (rect.width * 0.4);
  const chartCenters = Object.keys(currentNatalGates || {}).map(person =>
    chartPointInFamily({ x: 194.4, y: chartViewHeight / 2 }, person)
  );
  let projectedHalfWidth = 0;
  if (chartCenters.length) {
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    chartRoot.updateMatrixWorld(true);
    projectedHalfWidth = Math.max(...chartCenters.map(center =>
      Math.abs(chartRoot.localToWorld(center).sub(controls.target).dot(cameraRight))
    )) + chartWidth / 2 + 8;
  }
  const halfWidth = Math.max(desiredHalfWidth, projectedHalfWidth);
  const halfHeight = Math.max(chartHeight / 2 + 8, halfWidth / aspect);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}
function setSeparation(value) {
  const half = Number(value) / 2;
  familyLayout.parentRadius = half;
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
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  if (mode === 'edge') camera.position.set(800, familyViewCenterY, 0.01);
  else camera.position.set(0, familyViewCenterY, 820);
  controls.target.set(0, familyViewCenterY, 0);
  lockOrbitElevation();
  controls.update();
  syncChartFacing();
  refreshRelationshipPairing();
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
    // relationship.svg is geometry only; natal-auth.js supplies actual gates.
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
for (const selector of ['#danielGates', '#camilleGates']) document.querySelector(selector).addEventListener('input', () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuildRelationship, 220); });
document.querySelector('#showBridges').addEventListener('change', e => { if (relationshipGroup) relationshipGroup.visible = e.target.checked; });
document.querySelector('#showDaniel').addEventListener('change', e => {
  if (planeGroups.daniel) planeGroups.daniel.visible = e.target.checked;
  refreshRelationshipPairing();
  refreshFrontFamilyReading();
});
document.querySelector('#showCamille').addEventListener('change', e => {
  if (planeGroups.camille) planeGroups.camille.visible = e.target.checked;
  refreshRelationshipPairing();
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
  refreshRelationshipPairing();
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
