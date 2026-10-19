import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const config = window.castaliaConfig || {};
const statusNode = document.querySelector('#authStatus');
const loginButton = document.querySelector('#signIn');
const logoutButton = document.querySelector('#signOut');
const personA = document.querySelector('#personA');
const personB = document.querySelector('#personB');
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
  return [...(document.guardians || []), ...(document.children || [])].filter(p =>
    p && p.birth_date && p.birth_time && p.birth_place && p.latitude != null && p.longitude != null
  ).map(p => ({
    name: p.name, github: p.github, relationship: p.relationship, role: p.role,
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
function epochFor(profile) {
  const date = String(profile.birth_date).slice(0, 10);
  const time = formatTime(profile.birth_time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) throw new Error(`${profile.name || 'Profile'} needs a known birth date and time.`);
  if (profile.birth_time_status && !/exact|recorded|confirmed/i.test(profile.birth_time_status)) {
    throw new Error(`${profile.name || 'Profile'} birth time is marked “${profile.birth_time_status}”; exact gate calculations require a verified time.`);
  }
  const offset = Number(profile.utc_offset_sec);
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
function gateAt(longitude) {
  const gateStep = 360 / 64;
  const adjusted = ((longitude - 358.25) % 360 + 360) % 360;
  return GATE_ORDER[Math.min(63, Math.floor(adjusted / gateStep))];
}
async function activeGates(profile) {
  const birth = epochFor(profile), gates = new Set();
  for (const body of BODY_KEYS) gates.add(gateAt(await longitude(birth, body)));
  gates.add(gateAt((await longitude(birth, 'true_node') + 180) % 360));
  let earlier = birth - 100 * 86400, later = birth - 75 * 86400;
  const birthSun = await longitude(birth);
  for (let i = 0; i < 32 && later - earlier > 1; i++) {
    const candidate = Math.floor((earlier + later) / 2);
    const arc = ((birthSun - await longitude(candidate)) % 360 + 360) % 360;
    if (arc > 88) earlier = candidate; else later = candidate;
  }
  const design = Math.floor((earlier + later) / 2);
  for (const body of BODY_KEYS) gates.add(gateAt(await longitude(design, body)));
  gates.add(gateAt((await longitude(design, 'true_node') + 180) % 360));
  return [...gates].sort((a, b) => a - b);
}
function displayProfile(profile, person) {
  names[person] = profile.name || profile.display_name || (person === 'daniel' ? 'Person 1' : 'Person 2');
  const node = document.querySelector(person === 'daniel' ? '#chartNameA' : '#chartNameB');
  if (node) node.textContent = names[person];
}
let selectedProfiles = [];
async function applyProfiles() {
  const [a, b] = selectedProfiles;
  if (!a || !b) return;
  status('Calculating Human Design activations…');
  try {
    const [gatesA, gatesB] = await Promise.all([activeGates(a), activeGates(b)]);
    document.querySelector('#danielGates').value = gatesA.join(', ');
    document.querySelector('#camilleGates').value = gatesB.join(', ');
    document.querySelector('#danielGates').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#camilleGates').dispatchEvent(new Event('input', { bubbles: true }));
    displayProfile(a, 'daniel'); displayProfile(b, 'camille');
    status(`${names.daniel} and ${names.camille} loaded. Birth data remains in this browser.`);
  } catch (error) { status(error.message); }
}
function installProfileOptions(profiles, login) {
  const mine = profiles.findIndex(p => normalizedLogin(p.github) === normalizedLogin(login));
  [personA, personB].forEach(select => { select.replaceChildren(); profiles.forEach((p, i) => select.add(new Option(p.name || `Profile ${i + 1}`, String(i)))); });
  const first = mine >= 0 ? mine : 0;
  const second = profiles.findIndex((p, i) => i !== first && /partner|spouse/i.test(p.relationship || p.role || ''));
  personA.value = String(first); personB.value = String(second >= 0 ? second : Math.min(first + 1, profiles.length - 1));
  const update = () => { selectedProfiles = [profiles[Number(personA.value)], profiles[Number(personB.value)]]; void applyProfiles(); };
  personA.onchange = update; personB.onchange = update; update();
}
let supabase = null, loadedUser = null;
if (config.supabaseUrl && config.supabaseAnonKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true } });
  loginButton.addEventListener('click', async () => {
    status('Opening Castalia sign-in…');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + location.pathname, scopes: 'read:user user:email' } });
    if (error) status(error.message);
  });
  logoutButton.addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
  supabase.auth.onAuthStateChange((_event, session) => { void handleSession(session); });
  supabase.auth.getSession().then(({ data }) => handleSession(data.session));
} else { loginButton.disabled = true; status('Castalia sign-in is not configured yet.'); }
async function handleSession(session) {
  if (!session?.user || !supabase) return;
  const login = session.user.user_metadata?.user_name || session.user.user_metadata?.preferred_username || session.user.user_metadata?.login;
  if (!login) { status('Castalia sign-in succeeded, but GitHub did not provide a username.'); return; }
  if (loadedUser === session.user.id) return;
  loadedUser = session.user.id; loginButton.hidden = true; logoutButton.hidden = false;
  status(`Signed in as ${login}; finding your family natal data…`);
  try {
    const family = await loadFamilyDocument(login, session.provider_token);
    const profiles = profilesFrom(family);
    if (!profiles.length) throw new Error('The GitHub family profile has no complete natal records.');
    installProfileOptions(profiles, login);
    document.querySelector('#profilePicker').hidden = false;
  } catch (error) { loadedUser = null; status(error.message); }
}
