import { generatePublicDemoReading } from './public-demo-readings.js?v=family-opportunities-20261020';
import { publicPairRecurrence, publicFamilyRecurrence } from './relationship-recurrence-data.js?v=family-opportunities-20261020';

const config = window.castaliaConfig || {};
const launcher = document.querySelector('#chartChatLauncher');
const panel = document.querySelector('#chartChat');
const closeButton = document.querySelector('#closeChartChat');
const messages = document.querySelector('#chatMessages');
const loginBox = document.querySelector('#chatLogin');
const loginText = document.querySelector('#chatLoginText');
const loginButton = document.querySelector('#chatSignIn');
const form = document.querySelector('#chatForm');
const questionBox = document.querySelector('#chatQuestion');
const sendButton = document.querySelector('#chatSend');
const conversation = [];
let signedIn = false;
let firstReadingStarted = false;
let channelDefinitions;

const readingInstruction = `You are the Castalia Astrolabe Human Design chart reader. Interpret supplied natal gates and current Human Design transits in clear, grounded language. When discussing transits, prioritize channels that are temporarily completed or bridged in a chart or relationship, and explain that the channel will no longer be completed by that transit when its contributing gate moves on. Give the channel's estimated active window using the supplied next-gate-exit estimates. Mention an individual gate only when it helps explain a channel completion; do not list transit gates that create no channel change. Use the supplied BodyGraph channel guide. The supplied ephemeris and exit estimates are factual sources of truth, based on 15-minute samples and not guarantees. If no exit is available in the window, say the end time is unknown. If lifetime recurrence statistics are supplied, use them as retrospective six-hour-sampled model estimates for this specific pair or family. Distinguish episode counts, share of sampled time, and sampled duration; median estimates have roughly six-hour resolution. A recurrence sample date identifies the historical configuration counted: do not call it current unless it matches the transit snapshot date. Call attention to a configuration that occurred only once or among the least frequent modeled returns, state its count and sampled window, and call it unusual only within this family's modeled timeline. Never imply population uniqueness or rarity. For a current transit bridge, connect its channel theme to one optional, practical way the people could explore that energy together while the supplied window lasts; use the channel guide and actual exit estimate, and present this as an invitation, not a promised effect or required action. Do not invent an opportunity unrelated to the supplied gates and channels. Separate natal activations from temporary transits. When reading multiple charts, weave defined and undefined centers into a relational interpretation: describe consistent patterns, sensitivity to context, shared definition, and what complementary channels add. Avoid reducing people to a checklist. Explain Human Design as a reflective framework, never as a scientific finding, diagnosis, or prediction. Do not invent chart facts, transit dates, certainty, or personality traits. Answer directly in specific, warm, readable prose.`;

function addMessage(role, text, extraClass = '') {
  const node = document.createElement('div');
  node.className = `chat-message ${role}${extraClass ? ` ${extraClass}` : ''}`;
  node.textContent = text;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function setOpen(open) {
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  if (open) {
    updateAuthUI();
    if (!firstReadingStarted && (signedIn || window.hdUsingPublicExample)) void requestReading('', true);
    if (signedIn) questionBox.focus({ preventScroll: true });
  }
}

function updateAuthUI() {
  loginBox.hidden = signedIn;
  form.hidden = !signedIn;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    loginText.textContent = 'Castalia sign-in is not configured on this deployment.';
    loginButton.hidden = true;
    return;
  }
  loginButton.hidden = signedIn;
  loginText.textContent = signedIn
    ? ''
    : window.hdUsingPublicExample
      ? 'Generate a reading for the public family example. Sign in with Castalia to ask follow-up questions.'
      : 'Sign in with Castalia to get a reading and ask questions about the charts.';
}

function parseGates(selector) {
  return new Set((document.querySelector(selector)?.value || '').match(/\d+/g)?.map(Number) || []);
}

async function getChannelDefinitions() {
  if (!channelDefinitions) {
    channelDefinitions = fetch('/bodygraph.svg', { cache: 'force-cache' }).then(async response => {
      if (!response.ok) throw new Error('Could not load the BodyGraph channel map.');
      const source = await response.text();
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      return [...doc.querySelectorAll('.channel-group[data-from][data-to]')]
        .map(node => ({
          id: node.dataset.channel || `${node.dataset.from}-${node.dataset.to}`,
          from: Number(node.dataset.from),
          to: Number(node.dataset.to),
          reading: node.dataset.reading || node.getAttribute('aria-label') || ''
        }))
        .filter((channel, index, all) => all.findIndex(item => item.id === channel.id) === index);
    }).catch(error => { channelDefinitions = null; throw error; });
  }
  return channelDefinitions;
}

function activeChannels(definitions, natalGates, transitGates) {
  const active = new Set([...natalGates, ...transitGates]);
  return definitions.filter(({ from, to }) => active.has(from) && active.has(to))
    .map(({ id, from, to, reading }) => ({
      channel: id,
      from: `${from} (${natalGates.has(from) ? 'natal' : 'transit'})`,
      to: `${to} (${natalGates.has(to) ? 'natal' : 'transit'})`,
      type: natalGates.has(from) && natalGates.has(to) ? 'natal' : 'completed by current transit',
      chartGuide: reading
    }));
}

function transitChannelChanges(definitions, natalGates, snapshot, durationByPlanet) {
  const transitGates = new Set(snapshot.gates);
  return definitions.filter(({ from, to }) => {
    const transitContributed = (transitGates.has(from) && !natalGates.has(from)) || (transitGates.has(to) && !natalGates.has(to));
    return transitContributed && new Set([...natalGates, ...transitGates]).has(from) && new Set([...natalGates, ...transitGates]).has(to) && !(natalGates.has(from) && natalGates.has(to));
  }).map(({ id, from, to, reading }) => {
    const transitEndpoints = [from, to].filter(gate => transitGates.has(gate) && !natalGates.has(gate));
    const planets = [...new Set(transitEndpoints.flatMap(gate => snapshot.gatePlanets[gate] || []))];
    const exits = planets.map(planet => durationByPlanet[planet]?.nextGateExit).filter(Boolean).map(value => new Date(value).getTime());
    const endsAt = exits.length ? Math.min(...exits) : null;
    const remainingMs = endsAt === null ? null : Math.max(0, endsAt - snapshot.epoch * 1000);
    const hours = remainingMs === null ? null : Math.floor(remainingMs / 3600000);
    return {
      channel: id,
      gates: `${from}–${to}`,
      chartGuide: reading,
      natalGates: [from, to].filter(gate => natalGates.has(gate)),
      transitGates: transitEndpoints.map(gate => ({ gate, planets: snapshot.gatePlanets[gate] || [] })),
      expectedToStopCompletingAt: endsAt === null ? null : new Date(endsAt).toISOString(),
      expectedToStopCompletingAtLocal: endsAt === null ? null : new Date(endsAt).toLocaleString(),
      estimatedRemaining: hours === null ? 'end estimate unavailable' : hours >= 24 ? `about ${Math.floor(hours / 24)}d ${hours % 24}h` : `about ${Math.max(1, hours)}h`
    };
  });
}

function bridgesBetween(definitions, first, second, transitGates, snapshot, durationByPlanet) {
  const firstActive = new Set([...first.natalGates, ...transitGates]);
  const secondActive = new Set([...second.natalGates, ...transitGates]);
  const gateContributors = gate => [
    ...(first.natalGates.has(gate) ? [`${first.name} natal`] : []),
    ...(second.natalGates.has(gate) ? [`${second.name} natal`] : []),
    ...(transitGates.has(gate) ? ['transit'] : [])
  ].join(' + ') || 'no natal contribution';
  return definitions.filter(({ from, to }) => {
    if ((first.natalGates.has(from) && first.natalGates.has(to)) || (second.natalGates.has(from) && second.natalGates.has(to))) return false;
    return (firstActive.has(from) && secondActive.has(to) && (first.natalGates.has(from) || second.natalGates.has(to))) ||
      (secondActive.has(from) && firstActive.has(to) && (second.natalGates.has(from) || first.natalGates.has(to)));
  }).map(({ id, from, to, reading }) => {
    const contributedGates = [from, to].filter(gate => transitGates.has(gate) && !first.natalGates.has(gate) && !second.natalGates.has(gate));
    const planets = [...new Set(contributedGates.flatMap(gate => snapshot.gatePlanets[gate] || []))];
    const exits = planets.map(planet => durationByPlanet[planet]?.nextGateExit).filter(Boolean).map(value => new Date(value).getTime());
    const endsAt = exits.length ? Math.min(...exits) : null;
    const remainingMs = endsAt === null ? null : Math.max(0, endsAt - snapshot.epoch * 1000);
    const hours = remainingMs === null ? null : Math.floor(remainingMs / 3600000);
    return {
      channel: id,
      gates: `${from}–${to}`,
      chartGuide: reading,
      contributions: [`Gate ${from}: ${gateContributors(from)}`, `Gate ${to}: ${gateContributors(to)}`],
      transitContributed: contributedGates.length > 0,
      transitGates: contributedGates.map(gate => ({ gate, planets: snapshot.gatePlanets[gate] || [] })),
      expectedToStopCompletingAt: endsAt === null ? null : new Date(endsAt).toISOString(),
      expectedToStopCompletingAtLocal: endsAt === null ? null : new Date(endsAt).toLocaleString(),
      estimatedRemaining: hours === null ? 'end estimate unavailable' : hours >= 24 ? `about ${Math.floor(hours / 24)}d ${hours % 24}h` : `about ${Math.max(1, hours)}h`
    };
  });
}

function remainingLabel(snapshotEpoch, exitsAt) {
  if (!exitsAt) return 'No gate exit found in the available ephemeris window';
  const remainingMs = Math.max(0, new Date(exitsAt).getTime() - snapshotEpoch * 1000);
  const hours = Math.floor(remainingMs / 3600000);
  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return days ? `about ${days}d ${remainderHours}h remaining` : `about ${Math.max(1, hours)}h remaining`;
}

async function buildChartContext() {
  await waitForNatalProfiles();
  const transit = window.CastaliaHumanDesignTransit;
  if (!transit?.currentSnapshot || !transit?.estimateDurations) throw new Error('The transit ephemeris is still loading. Try again in a moment.');
  const snapshot = await transit.currentSnapshot();
  const [durations, definitions] = await Promise.all([
    transit.estimateDurations(snapshot),
    getChannelDefinitions()
  ]);
  const danielGates = parseGates('#danielGates');
  const camilleGates = parseGates('#camilleGates');
  if (!danielGates.size || !camilleGates.size) throw new Error('The selected charts are still being calculated. Wait a moment and try again.');
  const transitGates = new Set(snapshot.gates);
  const durationByPlanet = Object.fromEntries(durations.map(item => [item.planet, {
    gate: item.gate,
    nextGateExit: item.exitsAt,
    remaining: remainingLabel(snapshot.epoch, item.exitsAt)
  }]));
  const children = (window.hdRelationshipChildren || []).map(child => {
    const gates = new Set(child.gates || []);
    return {
      id: child.id,
      name: child.name || child.id || 'Child chart',
      natalGates: [...gates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, gates, transitGates),
      transitChannelChanges: transitChannelChanges(definitions, gates, snapshot, durationByPlanet)
    };
  });
  const charts = {
    blue: {
      name: window.hdChartNames?.daniel || document.querySelector('#chartNameA')?.textContent || 'Blue chart',
      natalGates: [...danielGates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, danielGates, transitGates),
      transitChannelChanges: transitChannelChanges(definitions, danielGates, snapshot, durationByPlanet)
    },
    pink: {
      name: window.hdChartNames?.camille || document.querySelector('#chartNameB')?.textContent || 'Pink chart',
      natalGates: [...camilleGates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, camilleGates, transitGates),
      transitChannelChanges: transitChannelChanges(definitions, camilleGates, snapshot, durationByPlanet)
    }
  };
  const familyCharts = [
    { id: 'daniel', name: charts.blue.name, natalGates: danielGates },
    { id: 'camille', name: charts.pink.name, natalGates: camilleGates },
    ...children.map(child => ({ id: child.id, name: child.name, natalGates: new Set(child.natalGates) }))
  ];
  const familyConnections = [];
  for (let i = 0; i < familyCharts.length; i++) {
    for (let j = i + 1; j < familyCharts.length; j++) {
      const bridges = bridgesBetween(definitions, familyCharts[i], familyCharts[j], transitGates, snapshot, durationByPlanet);
      if (bridges.length) familyConnections.push({
        people: [familyCharts[i].name, familyCharts[j].name],
        recurrence: publicPairRecurrence(
          { charts: [familyCharts[i], familyCharts[j]] },
          bridges.filter(bridge => bridge.transitContributed).map(bridge => bridge.channel)
        ),
        channels: bridges
      });
    }
  }
  return {
    asOf: snapshot.timestamp,
    asOfLocal: new Date(snapshot.epoch * 1000).toLocaleString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ephemeris: `${snapshot.source}; ${snapshot.sampleStepSeconds / 60}-minute samples; tropical ecliptic`,
    transitGateActivations: Object.entries(snapshot.gatePlanets).map(([gate, planets]) => ({
      gate: Number(gate), planets: planets.map(planet => ({
        name: planet,
        ...durationByPlanet[planet],
        nextGateExitLocal: durationByPlanet[planet]?.nextGateExit
          ? new Date(durationByPlanet[planet].nextGateExit).toLocaleString()
          : null
      }))
    })),
    charts,
    children,
    currentRelationshipBridges: bridgesBetween(definitions, familyCharts[0], familyCharts[1], transitGates, snapshot, durationByPlanet),
    familyConnections,
    familyRecurrence: publicFamilyRecurrence(familyCharts.map(chart => ({ id: chart.id, natalGates: [...chart.natalGates].sort((a, b) => a - b) })))
  };
}

async function waitForNatalProfiles() {
  const deadline = Date.now() + 45000;
  if (signedIn) {
    while (!window.hdNatalProfilesReady && Date.now() < deadline) {
      if (window.hdNatalProfilesError) throw new Error(`The signed-in natal charts could not be loaded: ${window.hdNatalProfilesError}`);
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
    if (!window.hdNatalProfilesReady) throw new Error('The signed-in natal charts are still loading. Wait a moment and try again.');
    return;
  }
  if (!window.hdUsingPublicExample) throw new Error('Sign in with Castalia to get a reading for your selected charts.');
  while (!window.hdExampleNatalProfilesReady && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 250));
  }
  if (!window.hdExampleNatalProfilesReady) throw new Error('The example charts are still being calculated. Wait a moment and try again.');
}

function composeUserMessage(question, context, firstReading) {
  const prior = conversation.slice(-8).map(turn => `${turn.role === 'user' ? 'User' : 'Reader'}: ${turn.text}`).join('\n');
  const prompt = firstReading
    ? 'Give me a warm, specific reading of this example family BodyGraph. Start with the parent dynamic, then describe each child in relation to the family using the supplied family connections. Separate natal patterns from current transits. Focus the transit portion on channels temporarily completed in each chart or relationship, and explain when they are expected to stop completing as their transit gates move on. Include estimated local time bounds where available. Use lifetime recurrence data to call attention to a genuinely distinctive configuration within this family’s modeled timeline, giving its count and sample date; do not call it unique or rare in the population. For a current temporary bridge, connect its channel theme to one practical, low-pressure activity the people could try together before the estimated window closes. Keep the activity optional and time-bounded, and never imply a guaranteed outcome. Mention a transit gate only to explain a channel change; do not list all active gates. Keep it grounded in supplied gates, recurrence statistics, and channel descriptions; do not infer unsupported traits.'
    : question;
  return [
    'Verified chart and current transit context (JSON facts):',
    JSON.stringify(context),
    prior ? `Recent conversation:\n${prior}` : '',
    `User ${firstReading ? 'request' : 'question'}: ${prompt}`
  ].filter(Boolean).join('\n\n');
}

async function requestReading(question, firstReading = false) {
  const publicExampleReading = firstReading && !signedIn && window.hdUsingPublicExample;
  if (!signedIn && !publicExampleReading) return;
  if (!firstReading && !question.trim()) return;
  if (firstReading) firstReadingStarted = true;
  const loading = addMessage('assistant', firstReading ? 'Generating the family chart reading…' : 'Checking the chart and current transits…');
  sendButton.disabled = true;
  questionBox.disabled = true;
  try {
    const token = signedIn
      ? await window.CastaliaHumanDesignAuth?.getAccessToken()
      : config.supabaseAnonKey;
    if (!token) {
      if (signedIn) {
        signedIn = false;
        updateAuthUI();
        loading.remove();
        addMessage('assistant', 'Your Castalia session expired. Sign in again to continue.', 'error');
        return;
      }
      throw new Error('Castalia sign-in is not configured for this example reading.');
    }
    const context = await buildChartContext();
    const userMessage = composeUserMessage(question, context, firstReading);
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/+$/, '')}/functions/v1/voice-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        message: userMessage,
        face: 'astrology',
        systemInstruction: readingInstruction,
        generateTts: false,
        commonplaceMode: 'off',
        responseFormat: 'json'
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Castalia Astrolabe returned ${response.status}.`);
    const answer = String(result.reply || '').trim();
    if (!answer) throw new Error('The Astrolabe returned an empty reading. Please try again.');
    loading.remove();
    addMessage('assistant', answer);
    if (!firstReading) {
      conversation.push({ role: 'user', text: question.trim() }, { role: 'assistant', text: answer });
      if (conversation.length > 12) conversation.splice(0, conversation.length - 12);
    } else {
      conversation.push({ role: 'assistant', text: answer });
    }
  } catch (error) {
    loading.remove();
    addMessage('assistant', error.message || 'I could not load the transit reading. Please try again.', 'error');
    if (firstReading) firstReadingStarted = false;
  } finally {
    sendButton.disabled = false;
    questionBox.disabled = false;
    questionBox.focus({ preventScroll: true });
  }
}

async function generateFrontViewReading(view) {
  const publicExampleReading = !signedIn && window.hdUsingPublicExample;
  if (!signedIn && !publicExampleReading) throw new Error('Sign in with Castalia to generate readings for your selected charts.');
  if (publicExampleReading) {
    const reading = generatePublicDemoReading(view);
    if (reading) return reading;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Castalia AI reading is not configured on this deployment.');
  const token = signedIn ? await window.CastaliaHumanDesignAuth?.getAccessToken() : config.supabaseAnonKey;
  if (!token) throw new Error('Your Castalia session expired. Sign in again to continue.');
  const context = await buildChartContext();
  const userMessage = [
    'Verified family chart, channel guide, and current transit context (JSON facts):',
    JSON.stringify(context),
    'Current camera view (JSON facts):',
    JSON.stringify(view),
    'Write a concise, fluent reading for this exact view. Begin with a specific individual interpretation of the front-facing chart that connects type, strategy, authority, profile, defined/undefined centers, and natal channels into a coherent picture. Then give the three family relationship interpretations listed in the relationships array, one for each other family member, regardless of their geometric position in the scene. Explain energy exchange through centers, shared definition, and complementary channels. Call out a distinctive configuration when recurrence statistics support it, with the sample date and family-specific count. Do not mention whether charts overlap, align, or are visible together. End with a short transit note only when current transits affect the front chart or one of these relationships. Prioritize channels the transits temporarily complete and say when each is expected to stop completing as its gate moves on; include local time bounds. Where useful, suggest one optional, realistic activity connected to a current relationship channel that the people could try during its estimated window. Mention a transit gate only to explain a channel change, and omit gates that create no channel change. Prefer practical reflection and specific evidence over generic praise or lists. Do not repeat every gate, center, or transit. Write 4–6 compact paragraphs, without tables or a compatibility verdict.'
  ].join('\n\n');
  const response = await fetch(`${String(config.supabaseUrl).replace(/\/+$/, '')}/functions/v1/voice-pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      message: userMessage,
      face: 'astrology',
      systemInstruction: readingInstruction,
      generateTts: false,
      commonplaceMode: 'off',
      responseFormat: 'json'
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Castalia Astrolabe returned ${response.status}.`);
  const answer = String(result.reply || '').trim();
  if (!answer) throw new Error('The Astrolabe returned an empty reading. Please try again.');
  return answer;
}

window.CastaliaHumanDesignAIReading = { generate: generateFrontViewReading };

launcher.addEventListener('click', () => setOpen(panel.hidden));
closeButton.addEventListener('click', () => setOpen(false));
loginButton.addEventListener('click', () => document.querySelector('#signIn')?.click());
form.addEventListener('submit', event => {
  event.preventDefault();
  const question = questionBox.value.trim();
  if (!question) return;
  addMessage('user', question);
  questionBox.value = '';
  void requestReading(question);
});
questionBox.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
window.addEventListener('castalia-example-charts-ready', () => {
  updateAuthUI();
  if (!panel.hidden && !signedIn && !firstReadingStarted) void requestReading('', true);
});
window.addEventListener('castalia-auth-change', event => {
  signedIn = Boolean(event.detail?.signedIn);
  updateAuthUI();
  if (signedIn && !panel.hidden && !firstReadingStarted) void requestReading('', true);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) setOpen(false);
});
updateAuthUI();
const authApi = window.CastaliaHumanDesignAuth;
if (authApi) {
  authApi.getAccessToken().then(token => {
    signedIn = Boolean(token);
    updateAuthUI();
    if (signedIn && !panel.hidden && !firstReadingStarted) void requestReading('', true);
  }).catch(error => console.warn('Could not read Castalia sign-in state for chart chat:', error));
}
