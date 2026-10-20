import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const config = window.castaliaConfig || {};
const statusNode = document.querySelector('#authStatus');
const loginButton = document.querySelector('#signIn');
const logoutButton = document.querySelector('#signOut');
const personA = document.querySelector('#personA');
const personB = document.querySelector('#personB');
const birthDetails = document.querySelector('#birthDetails');
const birthDetailsButton = document.querySelector('#toggleBirthDetails');
const authPanel = document.querySelector('#authPanel');
const menuToggle = document.querySelector('#menuToggle');
const authMenu = document.querySelector('#authMenu');
const names = { daniel: 'Person 1', camille: 'Person 2' };
window.hdChartNames = names;
function status(message) { statusNode.textContent = message; }
function b64ToUtf8(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function normalizedLogin(value) { return String(value || '').replace(/^@/, '').trim().toLowerCase(); }
function repoHeaders(token) { return { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }
async function githubJson(url, token) {
  const response = await fetch(url, { headers: repoHeaders(token) });
  if (!response.ok && (response.status === 401 || response.status === 403)) {
    throw new Error('GitHub repository access was not granted. Public family repositories can be read; private natal data needs a repository-scoped, read-only GitHub App connection.');
  }
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}
async function loadFamilyDocument(login, token) {
  const repos = token
    ? await githubJson('https://api.github.com/user/repos?affiliation=owner,collaborator&sort=updated&per_page=100', token)
    : await githubJson(`https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=100`);
  const candidates = repos.filter(r => /^castalia-family(?:-|$)/i.test(r.name));
  for (const repo of candidates) {
    try {
      const item = await githubJson(`https://api.github.com/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/contents/castalia-family.json`, token);
      if (item.encoding === 'base64' && item.content) return JSON.parse(b64ToUtf8(item.content));
    } catch (error) {
      if (!String(error.message).includes('404')) console.warn('Skipping GitHub data source:', error.message);
    }
  }
  throw new Error('No readable castalia-family.json was found in a castalia-family-* GitHub repository. Private repositories need a repository-scoped, read-only GitHub connection.');
}
function profilesFrom(document) {
  const guardians = (document.guardians || []).map(p => ({ ...p, familyRole: 'guardian' }));
  const children = (document.children || []).map(p => ({ ...p, familyRole: 'child' }));
  return [...guardians, ...children].filter(p =>
    p && p.birth_date && p.birth_time && p.birth_place && p.latitude != null && p.longitude != null
  ).map(p => ({
    name: p.name, github: p.github, relationship: p.relationship, role: p.role, familyRole: p.familyRole,
    birth_date: p.birth_date, birth_time: p.birth_time, birth_time_status: p.birth_time_status,
    birth_place: p.birth_place, timezone: p.timezone, utc_offset_sec: p.utc_offset_sec,
    latitude: p.latitude, longitude: p.longitude
  }));
}
function formatTime(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  let m = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (!m) m = value.match(/^(\d{1,2})\s*(am|pm)$/);
  if (!m) return null;
  let hour = Number(m[1]), minute = Number(m[2] || 0);
  if (m[3] === 'pm' && hour < 12) hour += 12;
  if (m[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
function inputTime(raw) {
  const parsed = formatTime(raw);
  return parsed ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` : '';
}
function offsetForLocalTime(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const { hour, minute } = time;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let instant = target;
  let parts;
  for (let attempt = 0; attempt < 4; attempt++) {
    parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    const correction = target - represented;
    instant += correction;
    if (correction === 0) break;
  }
  parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  if (represented !== target) throw new Error(`That local time does not exist in ${timeZone}, likely due to a daylight-saving transition.`);
  return (target - instant) / 1000;
}
function epochFor(profile) {
  const date = String(profile.birth_date).slice(0, 10);
  const time = formatTime(profile.birth_time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) throw new Error(`${profile.name || 'Profile'} needs a known birth date and time.`);
  if (!/exact|recorded|confirmed/i.test(profile.birth_time_status || '')) {
    throw new Error(`${profile.name || 'Profile'} birth time is marked “${profile.birth_time_status}”; exact gate calculations require a verified time.`);
  }
  const offset = profile.timezone
    ? offsetForLocalTime(date, time, profile.timezone)
    : Number(profile.utc_offset_sec);
  if (!Number.isFinite(offset)) throw new Error(`${profile.name || 'Profile'} is missing utc_offset_sec.`);
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, time.hour, time.minute) / 1000 - offset);
}
const GATE_ORDER = [25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,41,19,13,49,30,55,37,63,22,36];
const BODY_KEYS = ['sun','earth','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto','true_node'];
const ephemerisCache = new Map();
async function dayData(epoch) {
  const date = new Date(epoch * 1000).toISOString().slice(0, 10);
  if (!ephemerisCache.has(date)) ephemerisCache.set(date, fetch(`https://ephemeris.castalia.institute/data/human-design/${date}.json`).then(async response => {
    if (!response.ok) throw new Error(`Ephemeris request failed (${response.status}) for ${date}.`);
    return response.json();
  }));
  return ephemerisCache.get(date);
}
async function longitude(epoch, body = 'sun') {
  const data = await dayData(epoch);
  const index = Math.floor((epoch - data.t0) / data.step);
  const values = data.bodies?.[body];
  if (!Number.isInteger(index) || index < 0 || index >= values?.length) throw new Error(`Ephemeris sample missing for ${body}.`);
  return ((Number(values[index]) % 360) + 360) % 360;
}
function gatePositionAt(longitude) {
  const gateStep = 360 / 64;
  const adjusted = ((longitude - 358.25) % 360 + 360) % 360;
  const position = adjusted / gateStep;
  const index = Math.min(63, Math.floor(position));
  return { gate: GATE_ORDER[index], line: Math.min(6, Math.floor((position - index) * 6) + 1) };
}
async function chartActivationsAt(epoch, type) {
  const activations = [];
  for (const planet of BODY_KEYS) {
    const position = gatePositionAt(await longitude(epoch, planet));
    activations.push({ planet: planet === 'true_node' ? 'north_node' : planet, ...position, type });
  }
  activations.push({ planet: 'south_node', ...gatePositionAt((await longitude(epoch, 'true_node') + 180) % 360), type });
  return activations;
}
async function activeChart(profile) {
  const birth = epochFor(profile);
  let earlier = birth - 100 * 86400, later = birth - 75 * 86400;
  const birthSun = await longitude(birth);
  for (let i = 0; i < 32 && later - earlier > 1; i++) {
    const candidate = Math.floor((earlier + later) / 2);
    const arc = ((birthSun - await longitude(candidate)) % 360 + 360) % 360;
    if (arc > 88) earlier = candidate; else later = candidate;
  }
  const design = Math.floor((earlier + later) / 2);
  const activations = [
    ...await chartActivationsAt(birth, 'personality'),
    ...await chartActivationsAt(design, 'design')
  ];
  const gates = [...new Set(activations.map(activation => activation.gate))].sort((a, b) => a - b);
  return { gates, activations };
}
async function publishChildren(profiles) {
  const childProfiles = (profiles || [])
    .map((profile, originalIndex) => ({ profile, originalIndex }))
    .filter(({ profile }) => profile.familyRole === 'child')
    // Newer birth dates are younger, so left-to-right layout follows increasing age.
    .sort((a, b) => String(b.profile.birth_date || '').localeCompare(String(a.profile.birth_date || '')) || a.originalIndex - b.originalIndex);
  const children = await Promise.all(childProfiles.map(async ({ profile }, index) => {
    try {
      return { id: `child-${index + 1}`, name: profile.name || `Child ${index + 1}`, ...await activeChart(profile) };
    } catch (error) {
      console.warn(`Skipping child chart for ${profile.name || `Child ${index + 1}`}:`, error.message);
      return null;
    }
  }));
  window.hdRelationshipChildren = children.filter(Boolean);
  window.dispatchEvent(new CustomEvent('castalia-family-children-updated', { detail: window.hdRelationshipChildren }));
}
// Public sample charts publish the calculated gates, not the children's birth records.
const publicExampleChildren = [
  {
    id: 'child-1', name: 'Aleia',
    gates: [1,2,4,6,7,8,13,16,22,23,25,31,36,41,42,45,53],
    activations: [
      {planet:'sun',gate:2,line:2,type:'personality'},{planet:'earth',gate:1,line:2,type:'personality'},
      {planet:'moon',gate:4,line:4,type:'personality'},{planet:'mercury',gate:42,line:1,type:'personality'},
      {planet:'venus',gate:25,line:5,type:'personality'},{planet:'mars',gate:31,line:6,type:'personality'},
      {planet:'jupiter',gate:45,line:6,type:'personality'},{planet:'saturn',gate:25,line:1,type:'personality'},
      {planet:'uranus',gate:8,line:3,type:'personality'},{planet:'neptune',gate:25,line:4,type:'personality'},
      {planet:'pluto',gate:41,line:2,type:'personality'},{planet:'north_node',gate:36,line:4,type:'personality'},
      {planet:'south_node',gate:6,line:4,type:'personality'},{planet:'sun',gate:13,line:4,type:'design'},
      {planet:'earth',gate:7,line:4,type:'design'},{planet:'moon',gate:23,line:1,type:'design'},
      {planet:'mercury',gate:13,line:1,type:'design'},{planet:'venus',gate:25,line:3,type:'design'},
      {planet:'mars',gate:53,line:5,type:'design'},{planet:'jupiter',gate:16,line:6,type:'design'},
      {planet:'saturn',gate:22,line:1,type:'design'},{planet:'uranus',gate:23,line:5,type:'design'},
      {planet:'neptune',gate:36,line:6,type:'design'},{planet:'pluto',gate:41,line:1,type:'design'},
      {planet:'north_node',gate:36,line:6,type:'design'},{planet:'south_node',gate:6,line:6,type:'design'}
    ]
  },
  {
    id: 'child-2', name: 'Finn',
    gates: [3,19,23,24,25,27,32,33,36,37,38,41,44,51,57,60,61,63],
    activations: [
      {planet:'sun',gate:24,line:4,type:'personality'},{planet:'earth',gate:44,line:4,type:'personality'},
      {planet:'moon',gate:61,line:6,type:'personality'},{planet:'mercury',gate:51,line:2,type:'personality'},
      {planet:'venus',gate:3,line:5,type:'personality'},{planet:'mars',gate:25,line:2,type:'personality'},
      {planet:'jupiter',gate:23,line:6,type:'personality'},{planet:'saturn',gate:63,line:6,type:'personality'},
      {planet:'uranus',gate:23,line:4,type:'personality'},{planet:'neptune',gate:25,line:1,type:'personality'},
      {planet:'pluto',gate:41,line:1,type:'personality'},{planet:'north_node',gate:51,line:1,type:'personality'},
      {planet:'south_node',gate:57,line:1,type:'personality'},{planet:'sun',gate:19,line:5,type:'design'},
      {planet:'earth',gate:33,line:5,type:'design'},{planet:'moon',gate:32,line:6,type:'design'},
      {planet:'mercury',gate:61,line:4,type:'design'},{planet:'venus',gate:38,line:2,type:'design'},
      {planet:'mars',gate:61,line:1,type:'design'},{planet:'jupiter',gate:27,line:6,type:'design'},
      {planet:'saturn',gate:37,line:1,type:'design'},{planet:'uranus',gate:23,line:1,type:'design'},
      {planet:'neptune',gate:36,line:4,type:'design'},{planet:'pluto',gate:60,line:5,type:'design'},
      {planet:'north_node',gate:51,line:3,type:'design'},{planet:'south_node',gate:57,line:3,type:'design'}
    ]
  }
];
window.hdRelationshipChildren = publicExampleChildren;
window.dispatchEvent(new CustomEvent('castalia-family-children-updated', { detail: publicExampleChildren }));
function displayProfile(profile, person) {
  names[person] = profile.name || profile.display_name || (person === 'daniel' ? 'Person 1' : 'Person 2');
  const node = document.querySelector(person === 'daniel' ? '#chartNameA' : '#chartNameB');
  if (node) node.textContent = names[person];
}
function profileFromBirthFields(profile, suffix) {
  const date = document.querySelector(`#birthDate${suffix}`).value;
  const time = document.querySelector(`#birthTime${suffix}`).value;
  const verified = document.querySelector(`#birthVerified${suffix}`).checked;
  const edited = {
    ...profile,
    birth_date: date,
    birth_time: time,
    birth_place: document.querySelector(`#birthPlace${suffix}`).value.trim(),
    timezone: document.querySelector(`#birthZone${suffix}`).value.trim(),
    birth_time_status: verified ? 'confirmed' : (profile.birth_time_status || 'unverified')
  };
  try {
    localStorage.setItem(`castalia-hd-natal:${profileStorageId(profile)}`, JSON.stringify({
      birth_date: edited.birth_date,
      birth_time: edited.birth_time,
      birth_place: edited.birth_place,
      timezone: edited.timezone,
      birth_time_status: edited.birth_time_status
    }));
  } catch (error) { console.warn('Could not save local birth details:', error); }
  return edited;
}
function profileStorageId(profile) {
  return normalizedLogin(profile.github) || String(profile.name || 'profile').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
function fillBirthFields(profile, suffix) {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(`castalia-hd-natal:${profileStorageId(profile)}`) || '{}'); }
  catch (error) { console.warn('Could not read local birth details:', error); }
  const data = { ...profile, ...stored };
  document.querySelector(`#birthDate${suffix}`).value = String(data.birth_date || '').slice(0, 10);
  const timeIsVerified = /exact|recorded|confirmed/i.test(data.birth_time_status || '');
  document.querySelector(`#birthTime${suffix}`).value = timeIsVerified ? inputTime(data.birth_time) : '';
  document.querySelector(`#birthTime${suffix}`).placeholder = timeIsVerified ? 'HH:MM' : 'Enter verified local time';
  document.querySelector(`#birthPlace${suffix}`).value = data.birth_place || '';
  document.querySelector(`#birthZone${suffix}`).value = data.timezone || '';
  document.querySelector(`#birthVerified${suffix}`).checked = /exact|recorded|confirmed/i.test(data.birth_time_status || '');
  document.querySelector(`#birthName${suffix}`).textContent = profile.name || `Person ${suffix === 'A' ? '1' : '2'}`;
}
function showBirthDetails(show) {
  birthDetails.hidden = !show;
  authPanel.classList.toggle('is-editing', show);
  if (show) {
    authPanel.classList.add('is-open');
    if (authMenu) authMenu.hidden = false;
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
  }
  birthDetailsButton.textContent = show ? 'Hide birth details' : (selectedProfiles.some(p => p.github || p.birth_date) ? 'Edit birth details' : 'Enter birth details');
}
let selectedProfiles = [
  {
    name: 'Daniel', birth_date: '1972-05-06', birth_time: '09:30',
    birth_place: 'Tallahassee, FL', timezone: 'America/New_York',
    utc_offset_sec: -14400, birth_time_status: 'confirmed'
  },
  {
    name: 'Camille', birth_date: '1983-09-23', birth_time: '09:17',
    birth_place: 'Exeter, NH', timezone: 'America/New_York',
    utc_offset_sec: -14400, birth_time_status: 'confirmed'
  }
];
fillBirthFields(selectedProfiles[0], 'A'); fillBirthFields(selectedProfiles[1], 'B');
displayProfile(selectedProfiles[0], 'daniel'); displayProfile(selectedProfiles[1], 'camille');
window.hdUsingPublicExample = false;
window.hdExampleNatalProfilesReady = false;
async function applyProfiles(signedInChart = false, publicExample = false) {
  if (!publicExample) {
    window.hdUsingPublicExample = false;
    window.hdExampleNatalProfilesReady = false;
  }
  const [baseA, baseB] = selectedProfiles;
  if (!baseA || !baseB) return;
  const a = profileFromBirthFields(baseA, 'A');
  const b = profileFromBirthFields(baseB, 'B');
  status('Calculating Human Design activations…');
  try {
    const [chartA, chartB] = await Promise.all([activeChart(a), activeChart(b)]);
    document.querySelector('#danielGates').value = chartA.gates.join(', ');
    document.querySelector('#camilleGates').value = chartB.gates.join(', ');
    window.hdNatalPlanetaryActivations = { daniel: chartA.activations, camille: chartB.activations };
    window.dispatchEvent(new CustomEvent('castalia-natal-activations-updated', { detail: window.hdNatalPlanetaryActivations }));
    document.querySelector('#danielGates').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#camilleGates').dispatchEvent(new Event('input', { bubbles: true }));
    displayProfile(a, 'daniel'); displayProfile(b, 'camille');
    status(`${names.daniel} and ${names.camille} charts calculated. Form edits are saved in this browser.`);
    window.hdUsingPublicExample = Boolean(publicExample && !signedInChart);
    if (window.hdUsingPublicExample) {
      window.hdExampleNatalProfilesReady = true;
      window.dispatchEvent(new Event('castalia-example-charts-ready'));
    }
    if (signedInChart && signedInProfilesPending) {
      signedInProfilesPending = false;
      window.hdNatalProfilesReady = true;
      window.dispatchEvent(new Event('castalia-natal-profiles-ready'));
    }
  } catch (error) {
    status(error.message);
    if (signedInChart && signedInProfilesPending) {
      signedInProfilesPending = false;
      window.hdNatalProfilesError = error.message;
      window.dispatchEvent(new Event('castalia-natal-profiles-ready'));
    }
  }
}
void applyProfiles(false, true);
function installProfileOptions(profiles, login) {
  void publishChildren(profiles);
  const mine = profiles.findIndex(p => normalizedLogin(p.github) === normalizedLogin(login));
  [personA, personB].forEach(select => { select.replaceChildren(); profiles.forEach((p, i) => select.add(new Option(p.name || `Profile ${i + 1}`, String(i)))); });
  const first = mine >= 0 ? mine : 0;
  const camille = profiles.findIndex((p, i) => i !== first && /camille/i.test(p.name || ''));
  const second = camille >= 0 ? camille : profiles.findIndex((p, i) => i !== first && /partner|spouse/i.test(p.relationship || p.role || ''));
  personA.value = String(first); personB.value = String(second >= 0 ? second : Math.min(first + 1, profiles.length - 1));
  const update = () => {
    window.hdUsingPublicExample = false;
    selectedProfiles = [profiles[Number(personA.value)], profiles[Number(personB.value)]];
    fillBirthFields(selectedProfiles[0], 'A'); fillBirthFields(selectedProfiles[1], 'B');
    const needsReview = selectedProfiles.some(p => !/exact|recorded|confirmed/i.test(p.birth_time_status || ''));
    birthDetailsButton.hidden = false;
    showBirthDetails(needsReview);
    signedInProfilesPending = true;
    window.hdNatalProfilesReady = false;
    window.hdNatalProfilesError = '';
    void applyProfiles(Boolean(loadedUser));
  };
  personA.onchange = update; personB.onchange = update; update();
}
let supabase = null, loadedUser = null;
let signedInProfilesPending = false;
window.hdNatalProfilesReady = false;
window.hdNatalProfilesError = '';
window.CastaliaHumanDesignAuth = {
  isConfigured: () => Boolean(supabase),
  async getAccessToken() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token || null;
  }
};
function publishAuthState(session) {
  window.dispatchEvent(new CustomEvent('castalia-auth-change', { detail: { signedIn: Boolean(session?.user) } }));
}
if (config.supabaseUrl && config.supabaseAnonKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true } });
  loginButton.addEventListener('click', async () => {
    status('Opening Castalia sign-in…');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + location.pathname, scopes: 'read:user user:email' } });
    if (error) status(error.message);
  });
  logoutButton.addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
  supabase.auth.onAuthStateChange((_event, session) => { publishAuthState(session); void handleSession(session); });
  supabase.auth.getSession().then(({ data }) => { publishAuthState(data.session); void handleSession(data.session); });
} else { loginButton.disabled = true; status('Showing Daniel and Camille as example charts. Castalia sign-in is not configured yet.'); }
birthDetailsButton.addEventListener('click', () => showBirthDetails(birthDetails.hidden));
if (menuToggle && authMenu) {
  menuToggle.addEventListener('click', () => {
    const open = authMenu.hidden;
    authMenu.hidden = !open;
    authPanel.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if (!authPanel.contains(event.target) && !authMenu.hidden) {
      authMenu.hidden = true;
      authPanel.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
}
document.querySelector('#applyBirthDetails').addEventListener('click', () => {
  if (loadedUser) {
    signedInProfilesPending = true;
    window.hdNatalProfilesReady = false;
    window.hdNatalProfilesError = '';
  }
  void applyProfiles(Boolean(loadedUser));
});
async function handleSession(session) {
  if (!session?.user || !supabase) return;
  window.hdUsingPublicExample = false;
  const login = session.user.user_metadata?.user_name || session.user.user_metadata?.preferred_username || session.user.user_metadata?.login;
  if (!login) { status('Castalia sign-in succeeded, but GitHub did not provide a username.'); return; }
  if (loadedUser === session.user.id) return;
  loadedUser = session.user.id; loginButton.hidden = true; logoutButton.hidden = false;
  window.hdNatalProfilesReady = false;
  window.hdNatalProfilesError = '';
  status(`Signed in as ${login}; finding your family natal data…`);
  try {
    const family = await loadFamilyDocument(login, session.provider_token);
    const profiles = profilesFrom(family);
    if (!profiles.length) throw new Error('The GitHub family profile has no complete natal records.');
    signedInProfilesPending = true;
    installProfileOptions(profiles, login);
    document.querySelector('#profilePicker').hidden = false;
  } catch (error) {
    loadedUser = null;
    signedInProfilesPending = false;
    window.hdNatalProfilesError = error.message;
    window.dispatchEvent(new Event('castalia-natal-profiles-ready'));
    status(error.message);
  }
}
