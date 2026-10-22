import { publicPairRecurrence, publicFamilyRecurrence } from './relationship-recurrence-data.js?v=family-opportunities-20261020';
import { relationshipChannelReadings } from './channel-guide.js?v=metheus-reading-20261020';
import { buildPenta } from './penta.js?v=family-penta-20261020';

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
let gateMetadata = new Map();

const readingInstruction = `You are the Castalia Astrolabe Human Design reader, using the Metheus reading grammar. Treat Human Design as a Promethean symbolic map and the people’s reported circumstances as Epimethean lived experience. Keep those sources distinct while letting the symbolic grammar illuminate the actual situation. A chart is not a physiological mechanism and does not establish why an event happened. You may state causal sequences the user reports as reported context; never claim a center, gate, channel, or transit caused an event or another person’s feelings.

FACTUAL DISCIPLINE: The supplied JSON is the authority for chart facts. Gate ownership is explicitly represented in gateContributions / contributions and chart natalGates. Never infer ownership from gate order, channel order, color, gender, or a previous answer. Use gate and channel names only from the supplied guide. Distinguish (1) a channel defined within one person’s natal chart, (2) a cross-chart natal bridge completed by one gate from each person, and (3) a temporary transit-assisted completion. Do not call a personal natal channel a relationship bridge. A gate activation is not itself a defined channel. Individual defined centers, centers defined by a pair together, transit-defined centers, undefined centers with an activated gate, and fully open centers with no activated gate are different facts; preserve the supplied distinctions. Do not upgrade a gate-only activation into a channel or center definition.

PENTA METHOD: When supplied Penta facts are relevant, read them as a group framework for 3–5 people, distinct from individual charts and pair relationships. Use only the supplied Penta gates, gate owners, and six channels. Explain whether a channel is complete at group level and whether both gates come from one natal chart or are distributed across members. Do not call it an individual defined channel, assign fixed roles, infer causality, or predict outcomes. Penta summaries are natal-only unless transit facts are explicitly supplied.

RELATIONSHIP METHOD: Start from the actual question or reported situation, then interpret the supplied center dynamics: defined by both; defined in one chart and undefined in the other; undefined in both; and newly defined only in the pair, if supplied. Explain these as Human Design themes of relative consistency, receptivity, and amplification—not personality diagnoses or claims about what someone must feel. Then bring in only the channel/gate contributions that clarify the situation. Name who contributes each gate and use the channel’s supplied name and description accurately. Let the interpretation read as a connected account of how the energies may meet, where friction or support could arise, and what the people can notice or try; avoid lists of every center and gate. PARENT–CHILD LENS: Use relationshipType and the parent/child fields. A parent–child bond is developmentally and ethically asymmetric, not a peer partnership. Interpret the adult’s chart as a possible lens on the caregiving environment and the child’s chart as symbolic language for the child’s present experience—not a fixed identity, forecast, or responsibility. Keep safety, care, emotional regulation, and material responsibility with the adults; never imply a child should meet a parent's needs or manage adult stress. Discuss undefined centers as a prompt for adults to notice and support the environment, not proof that a child absorbs or mirrors a specific feeling. Keep the child's agency and age-appropriate needs in view. When the user asks about causality, trace the reported sequence of events and offer bounded relational hypotheses from its timing and actions, clearly as hypotheses grounded in their account—not as chart facts or chart-caused mechanisms. Do not infer an absent person’s inner state; attribute reported experience to the person who reported it and invite correction where uncertain. Treat medical, nursing, financial, employment, and safety details as lived context, not something the chart can diagnose or explain mechanistically.

METHEUS FLOW: scope the question and time period; orient briefly to the source/time of supplied facts; place reported context before pattern; interpret chart observations as symbolic prompts; synthesize the relationship in fluent prose; return agency with at most one useful, non-prescriptive question or experiment. Do not force every step for a narrow question. Preserve ambiguity and disagreement. Prefer “you described…,” “in this framework…,” and “does that fit your experience?” without overusing caveats.

TRANSITS AND TIMELINES: When lifetimeTimeline is true, describe the snapshot as “at the selected time,” never as current or today. Prioritize channels temporarily completed or bridged; explain that completion ends when the contributing transit gate moves on. Give time bounds only when next-gate-exit estimates are supplied; otherwise say the end estimate is unavailable. Mention gates only when they explain a channel change. Ephemeris positions and exit estimates are model estimates, not guarantees. Lifetime recurrence is a retrospective six-hour-sampled estimate for this specific person/pair/family, not population rarity. Distinguish episode count, share of sampled time, and sampled duration; median estimates have roughly six-hour resolution. A recurrence sample date identifies the configuration counted and is current only if it matches the transit snapshot date. Call a configuration unusual only within the supplied modeled timeline and state its count/window. Never infer duration from one snapshot.

LIFETIME CHANNEL QUESTIONS: When lifetimeChannelScan is supplied, it is the evidence for whether a named channel ever completes in the scanned person's chart or relationship during the stated 100-year window. If available is false, do not make a lifetime claim. A natal-defined channel is persistent chart structure; a transit episode is temporary completion by one or more transit gates. For relationship subjects, use natalChannelOwners to distinguish one person's natal channel from a cross-chart natal bridge; never call an individual natal channel a relationship bridge. Use episode dates and durations only from the scan. A “never” conclusion is permitted only when coverage.complete is true; with gaps, say the available scan cannot establish that. The ephemeris is sampled about every six hours, so episode boundaries and durations are approximate. This symbolic framework does not establish financial outcomes.

Write warm, concise, approachable prose with clear names and specific evidence. Do not invent chart facts, dates, traits, mechanisms, certainty, or outcomes. Human Design is a reflective framework, not a scientific finding, diagnosis, or prediction.`;

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

function referenceDateInQuestion(question) {
  const marker = /\b(?:since|from|compared\s+(?:with|to)|versus|vs\.?)\s+(?:the\s+)?/i.exec(question);
  if (!marker) return null;
  const remainder = question.slice(marker.index + marker[0].length);
  const localDate = (year, month, day) => {
    const date = new Date(year, month, day, 12);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  };
  const iso = remainder.match(/\b(\d{4})-(\d{1,2})(?:-(\d{1,2}))?\b/);
  if (iso) {
    return localDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] || 1));
  }
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const named = remainder.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?[,]?\s+)?(\d{4})\b/i);
  if (!named) return null;
  const monthPrefix = named[1].toLowerCase();
  const monthIndex = monthNames.findIndex(name => name.startsWith(monthPrefix));
  if (monthIndex < 0) return null;
  return localDate(Number(named[3]), monthIndex, Number(named[2] || 1));
}

async function getChannelDefinitions() {
  if (!channelDefinitions) {
    channelDefinitions = fetch('/bodygraph.svg', { cache: 'force-cache' }).then(async response => {
      if (!response.ok) throw new Error('Could not load the BodyGraph channel map.');
      const source = await response.text();
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      gateMetadata = new Map([...doc.querySelectorAll('.gate[data-gate]')].map(node => {
        const label = node.getAttribute('aria-label') || '';
        const separator = label.indexOf(':');
        return [Number(node.dataset.gate), {
          name: separator >= 0 ? label.slice(0, separator).trim() : '',
          description: node.dataset.reading || (separator >= 0 ? label.slice(separator + 1).trim() : ''),
          center: node.dataset.center || ''
        }];
      }));
      return [...doc.querySelectorAll('.channel-group[data-from][data-to]')]
        .map(node => ({
          id: `${Math.min(Number(node.dataset.from), Number(node.dataset.to))}-${Math.max(Number(node.dataset.from), Number(node.dataset.to))}`,
          from: Number(node.dataset.from),
          to: Number(node.dataset.to),
          reading: node.dataset.reading || node.getAttribute('aria-label') || '',
          guide: relationshipChannelReadings[`${Math.min(Number(node.dataset.from), Number(node.dataset.to))}-${Math.max(Number(node.dataset.from), Number(node.dataset.to))}`] || null
        }))
        .filter((channel, index, all) => all.findIndex(item => item.id === channel.id) === index);
    }).catch(error => { channelDefinitions = null; throw error; });
  }
  return channelDefinitions;
}

function lifetimeChannelRequest(question, definitions) {
  if (!/\b(?:ever|lifetime|(?:throughout|in|over|during) (?:his|her|their|a) life|across (?:a )?lifetime|since birth|how often)\b/i.test(question)) return null;
  const byId = new Map(definitions.map(channel => [channel.id, channel]));
  const ids = new Set();
  for (const match of question.matchAll(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/g)) {
    const id = `${Math.min(Number(match[1]), Number(match[2]))}-${Math.max(Number(match[1]), Number(match[2]))}`;
    if (byId.has(id)) ids.add(id);
  }
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [id, guide] of Object.entries(relationshipChannelReadings)) {
    if (guide.name && new RegExp(`\\b${escaped(guide.name)}\\b`, 'i').test(question) && byId.has(id)) ids.add(id);
  }
  if (!ids.size) return null;
  return [...ids].map(id => {
    const channel = byId.get(id);
    const guide = relationshipChannelReadings[id] || channel.guide || {};
    return { id, from: channel.from, to: channel.to, name: guide.name || '', description: guide.description || channel.reading || '' };
  });
}

function lifetimeScanSubjects(question, familyCharts) {
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = familyCharts.filter(chart => {
    const labels = [chart.name, chart.id === 'daniel' ? 'Daniel' : '', chart.id === 'camille' ? 'Camille' : ''].filter(Boolean);
    return labels.some(label => new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped(label)}($|[^\\p{L}\\p{N}_])`, 'iu').test(question));
  });
  const relationshipQuestion = /\b(?:relationship|together|between|as a pair|as a family|our family|shared|bridge)\b/i.test(question) || named.length > 1;
  const familyQuestion = /\b(?:family|all of us|everyone)\b/i.test(question);
  const selected = new Set(named.map(chart => chart.id));
  const subjects = [];
  if (!relationshipQuestion) {
    for (const chart of named.length ? named : familyCharts) subjects.push({
      id: `person:${chart.id}`, name: chart.name, type: 'individual', people: [chart.name],
      natalGates: [...chart.natalGates], charts: [{ id: chart.id, name: chart.name, natalGates: [...chart.natalGates] }]
    });
    return subjects;
  }
  const candidates = [];
  if (selected.size > 1) {
    for (let i = 0; i < familyCharts.length; i++) for (let j = i + 1; j < familyCharts.length; j++) {
      if (selected.has(familyCharts[i].id) && selected.has(familyCharts[j].id)) candidates.push([familyCharts[i], familyCharts[j]]);
    }
  } else if (selected.size === 1) {
    const person = familyCharts.find(item => item.id === [...selected][0]);
    for (const chart of familyCharts) if (chart.id !== person.id) candidates.push([person, chart]);
  } else {
    for (let i = 0; i < familyCharts.length; i++) for (let j = i + 1; j < familyCharts.length; j++) candidates.push([familyCharts[i], familyCharts[j]]);
  }
  for (const [first, second] of candidates) {
    const charts = [first, second].map(chart => ({ id: chart.id, name: chart.name, natalGates: [...chart.natalGates] }));
    subjects.push({
      id: `relationship:${first.id}:${second.id}`, name: `${first.name} + ${second.name}`,
      type: 'relationship', people: [first.name, second.name], charts,
      natalGates: [...new Set([...first.natalGates, ...second.natalGates])]
    });
  }
  if (familyQuestion && familyCharts.length > 2) {
    const charts = familyCharts.map(chart => ({ id: chart.id, name: chart.name, natalGates: [...chart.natalGates] }));
    subjects.push({
      id: 'family:all', name: familyCharts.map(chart => chart.name).join(' + '),
      type: 'family', people: familyCharts.map(chart => chart.name), charts,
      natalGates: [...new Set(familyCharts.flatMap(chart => [...chart.natalGates]))]
    });
  }
  return subjects;
}

function chartStructure(natalGates, definitions) {
  const channels = definitions.filter(({ from, to }) => natalGates.has(from) && natalGates.has(to));
  const defined = new Set(channels.flatMap(({ from, to }) => [gateMetadata.get(from)?.center, gateMetadata.get(to)?.center]).filter(Boolean));
  const centers = ['head', 'ajna', 'throat', 'g', 'ego', 'spleen', 'solar', 'sacral', 'root'];
  const activated = new Set([...natalGates].map(gate => gateMetadata.get(gate)?.center).filter(Boolean));
  return {
    definedCenters: centers.filter(center => defined.has(center)),
    undefinedCenters: centers.filter(center => !defined.has(center) && activated.has(center)),
    fullyOpenCenters: centers.filter(center => !defined.has(center) && !activated.has(center)),
    natalGateDetails: [...natalGates].sort((a, b) => a - b).map(gate => ({
      gate,
      name: gateMetadata.get(gate)?.name || '',
      description: gateMetadata.get(gate)?.description || '',
      center: gateMetadata.get(gate)?.center || ''
    })),
    natalChannels: channels.map(({ id, from, to }) => ({
      channel: id,
      name: relationshipChannelReadings[id]?.name || '',
      description: relationshipChannelReadings[id]?.description || '',
      gates: [from, to].map(gate => ({ gate, name: gateMetadata.get(gate)?.name || '' }))
    }))
  };
}

function relationshipStructure(first, second, definitions, transitGates = new Set()) {
  const firstStructure = chartStructure(first.natalGates, definitions);
  const secondStructure = chartStructure(second.natalGates, definitions);
  const firstCenters = new Set(firstStructure.definedCenters);
  const secondCenters = new Set(secondStructure.definedCenters);
  const pairGates = new Set([...first.natalGates, ...second.natalGates]);
  const pairCenters = new Set(chartStructure(pairGates, definitions).definedCenters);
  const withTransitCenters = new Set(chartStructure(new Set([...pairGates, ...transitGates]), definitions).definedCenters);
  const centers = ['head', 'ajna', 'throat', 'g', 'ego', 'spleen', 'solar', 'sacral', 'root'];
  const relationshipType = first.role === 'parent' && second.role === 'parent' ? 'parent-parent' :
    first.role === 'child' && second.role === 'child' ? 'child-child' : 'parent-child';
  return {
    relationshipType,
    ...(relationshipType === 'parent-child' ? {
      parent: first.role === 'parent' ? first.name : second.name,
      child: first.role === 'child' ? first.name : second.name
    } : {}),
    centerDynamics: centers.map(center => ({
      center,
      firstDefined: firstCenters.has(center),
      secondDefined: secondCenters.has(center),
      definedInPair: pairCenters.has(center),
      definedWithTransit: withTransitCenters.has(center),
      firstState: firstCenters.has(center) ? 'defined' : firstStructure.undefinedCenters.includes(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
      secondState: secondCenters.has(center) ? 'defined' : secondStructure.undefinedCenters.includes(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
      relationship: firstCenters.has(center) && secondCenters.has(center) ? 'defined by both' :
        firstCenters.has(center) ? `${first.name} defined; ${second.name} undefined or fully open` :
          secondCenters.has(center) ? `${second.name} defined; ${first.name} undefined or fully open` :
            pairCenters.has(center) ? 'defined only by the pair' : 'undefined in both and in the pair'
    })),
    transitDefinedCenters: centers.filter(center => withTransitCenters.has(center) && !pairCenters.has(center))
  };
}

function activeChannels(definitions, natalGates, transitGates, transitLabel = 'current transit') {
  const active = new Set([...natalGates, ...transitGates]);
  return definitions.filter(({ from, to }) => active.has(from) && active.has(to))
    .map(({ id, from, to, reading, guide }) => ({
      channel: id,
      channelName: guide?.name || '',
      channelDescription: guide?.description || '',
      from: `${from} (${natalGates.has(from) ? 'natal' : 'transit'})`,
      to: `${to} (${natalGates.has(to) ? 'natal' : 'transit'})`,
      gateContributions: [from, to].map(gate => ({ gate, name: gateMetadata.get(gate)?.name || '', source: natalGates.has(gate) ? 'natal' : 'transit' })),
      type: natalGates.has(from) && natalGates.has(to) ? 'natal' : `completed by ${transitLabel}`,
      chartGuide: guide?.description || reading
    }));
}

function transitChannelChanges(definitions, natalGates, snapshot, durationByPlanet) {
  const transitGates = new Set(snapshot.gates);
  return definitions.filter(({ from, to }) => {
    const transitContributed = (transitGates.has(from) && !natalGates.has(from)) || (transitGates.has(to) && !natalGates.has(to));
    return transitContributed && new Set([...natalGates, ...transitGates]).has(from) && new Set([...natalGates, ...transitGates]).has(to) && !(natalGates.has(from) && natalGates.has(to));
  }).map(({ id, from, to, reading, guide }) => {
    const transitEndpoints = [from, to].filter(gate => transitGates.has(gate) && !natalGates.has(gate));
    const planets = [...new Set(transitEndpoints.flatMap(gate => snapshot.gatePlanets[gate] || []))];
    const exits = planets.map(planet => durationByPlanet[planet]?.nextGateExit).filter(Boolean).map(value => new Date(value).getTime());
    const endsAt = exits.length ? Math.min(...exits) : null;
    const remainingMs = endsAt === null ? null : Math.max(0, endsAt - snapshot.epoch * 1000);
    const hours = remainingMs === null ? null : Math.floor(remainingMs / 3600000);
    return {
      channel: id,
      channelName: guide?.name || '',
      channelDescription: guide?.description || '',
      gates: `${from}–${to}`,
      chartGuide: guide?.description || reading,
      gateContributions: [from, to].map(gate => ({
        gate,
        name: gateMetadata.get(gate)?.name || '',
        source: natalGates.has(gate) ? 'natal' : 'transit',
        planets: transitEndpoints.includes(gate) ? snapshot.gatePlanets[gate] || [] : []
      })),
      natalGates: [from, to].filter(gate => natalGates.has(gate)),
      transitGates: transitEndpoints.map(gate => ({ gate, name: gateMetadata.get(gate)?.name || '', planets: snapshot.gatePlanets[gate] || [] })),
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
  ];
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
      channelName: relationshipChannelReadings[id]?.name || '',
      channelDescription: relationshipChannelReadings[id]?.description || '',
      gates: `${from}–${to}`,
      chartGuide: relationshipChannelReadings[id]?.description || reading,
      connectionType: contributedGates.length ? 'transit-assisted relationship completion' : 'cross-chart natal bridge',
      gateContributions: [from, to].map(gate => ({
        gate,
        name: gateMetadata.get(gate)?.name || '',
        description: gateMetadata.get(gate)?.description || '',
        natalOwners: gateContributors(gate),
        transitPlanets: transitGates.has(gate) ? snapshot.gatePlanets[gate] || [] : []
      })),
      contributions: [from, to].map(gate => {
        const owners = [...gateContributors(gate), ...(transitGates.has(gate) ? ['transit'] : [])];
        return `Gate ${gate}${gateMetadata.get(gate)?.name ? ` (${gateMetadata.get(gate).name})` : ''}: ${owners.join(' + ') || 'no contribution'}`;
      }),
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

function compareChannelSets(firstSet, secondSet, currentOnlyDetails = new Map()) {
  const referenceById = new Map(firstSet.map(channel => [channel.channel, channel]));
  const currentById = new Map(secondSet.map(channel => [channel.channel, channel]));
  return {
    addedSinceReference: [...currentById.values()]
      .filter(channel => !referenceById.has(channel.channel))
      .map(channel => {
        const detail = currentOnlyDetails.get(channel.channel);
        return {
          channel: channel.channel,
          channelName: channel.channelName || '',
          description: channel.channelDescription || channel.chartGuide,
          expectedToStopCompletingAtLocal: detail?.expectedToStopCompletingAtLocal || null,
          estimatedRemaining: detail?.estimatedRemaining || 'end estimate unavailable'
        };
      }),
    noLongerActiveSinceReference: [...referenceById.values()]
      .filter(channel => !currentById.has(channel.channel))
      .map(channel => ({ channel: channel.channel, channelName: channel.channelName || '', description: channel.channelDescription || channel.chartGuide }))
  };
}

async function buildChartContext(question = '', onProgress = () => {}) {
  await waitForNatalProfiles();
  const transit = window.CastaliaHumanDesignTransit;
  const timelineView = window.hdCurrentReadingView;
  const lifetimeTimeline = Boolean(timelineView?.lifetimeTimeline && Number.isFinite(timelineView.transitEpoch));
  if (!transit?.currentSnapshot || !transit?.snapshotAt || !transit?.estimateDurations) throw new Error('The transit ephemeris is still loading. Try again in a moment.');
  const snapshot = lifetimeTimeline
    ? await transit.snapshotAt(new Date(timelineView.transitEpoch))
    : await transit.currentSnapshot();
  const referenceDate = referenceDateInQuestion(question);
  const [durations, definitions] = await Promise.all([
    lifetimeTimeline && !referenceDate ? Promise.resolve([]) : transit.estimateDurations(snapshot, 240),
    getChannelDefinitions()
  ]);
  const referenceSnapshot = referenceDate ? await transit.snapshotAt(referenceDate) : null;
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
      role: 'child',
      birthEpoch: child.birthEpoch,
      natalGates: [...gates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, gates, transitGates, lifetimeTimeline ? 'transit at the selected time' : 'current transit'),
      ...chartStructure(gates, definitions),
      transitChannelChanges: transitChannelChanges(definitions, gates, snapshot, durationByPlanet)
    };
  });
  const charts = {
    blue: {
      name: window.hdChartNames?.daniel || document.querySelector('#chartNameA')?.textContent || 'Blue chart',
      role: 'parent',
      natalGates: [...danielGates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, danielGates, transitGates, lifetimeTimeline ? 'transit at the selected time' : 'current transit'),
      ...chartStructure(danielGates, definitions),
      transitChannelChanges: transitChannelChanges(definitions, danielGates, snapshot, durationByPlanet)
    },
    pink: {
      name: window.hdChartNames?.camille || document.querySelector('#chartNameB')?.textContent || 'Pink chart',
      role: 'parent',
      natalGates: [...camilleGates].sort((a, b) => a - b),
      currentlyActiveChannels: activeChannels(definitions, camilleGates, transitGates, lifetimeTimeline ? 'transit at the selected time' : 'current transit'),
      ...chartStructure(camilleGates, definitions),
      transitChannelChanges: transitChannelChanges(definitions, camilleGates, snapshot, durationByPlanet)
    }
  };
  const familyCharts = [
    { id: 'daniel', name: charts.blue.name, role: 'parent', natalGates: danielGates },
    { id: 'camille', name: charts.pink.name, role: 'parent', natalGates: camilleGates },
    ...children.map(child => ({ id: child.id, name: child.name, role: 'child', natalGates: new Set(child.natalGates) }))
  ];
  const familyPenta = buildPenta(familyCharts.map(chart => ({ ...chart, gates: [...chart.natalGates] })));
  let lifetimeChannelScan = null;
  const requestedLifetimeChannels = lifetimeChannelRequest(question, definitions);
  if (requestedLifetimeChannels) {
    try {
      const subjects = lifetimeScanSubjects(question, familyCharts);
      const childBirths = Object.fromEntries(children.map(child => [child.id, Number(child.birthEpoch)]));
      const birthFor = id => Number(window.hdFamilyBirthEpochs?.[id] ?? childBirths[id]);
      const endOfCentury = epoch => {
        const date = new Date(epoch * 1000);
        date.setUTCFullYear(date.getUTCFullYear() + 100);
        return date.getTime() / 1000;
      };
      const fallbackBirth = Number(window.hdTimelineAnchor?.birthEpoch ?? window.hdFamilyBirthEpochs?.daniel);
      if (!Number.isFinite(fallbackBirth)) throw new Error('A chart birth date is needed to anchor the 100-year transit scan.');
      for (const subject of subjects) {
        const births = subject.charts.map(chart => birthFor(chart.id));
        if (births.length && births.every(Number.isFinite)) {
          subject.startEpoch = subject.type === 'relationship' ? Math.max(...births) : births[0];
          subject.endEpoch = subject.type === 'relationship' ? Math.min(...births.map(endOfCentury)) : endOfCentury(births[0]);
        } else {
          subject.startEpoch = fallbackBirth;
          subject.endEpoch = endOfCentury(fallbackBirth);
        }
        if (subject.endEpoch <= subject.startEpoch) throw new Error(`The 100-year windows for ${subject.name} do not overlap.`);
      }
      const startEpoch = Math.min(...subjects.map(subject => subject.startEpoch));
      const endEpoch = Math.max(...subjects.map(subject => subject.endEpoch));
      const scanResults = await transit.scanChannelTimeline(startEpoch, endEpoch, subjects, requestedLifetimeChannels, progress => {
        if (progress.complete === progress.total || progress.complete % 12 === 0) {
          onProgress(`Scanning lifetime transits · ${progress.complete} of ${progress.total} months…`);
        }
      });
      lifetimeChannelScan = {
        available: true,
        scope: 'Each individual is scanned from birth through age 100. A relationship is scanned during the years both people are alive, up to age 100.',
        cadence: 'approximately six-hour samples',
        results: scanResults
      };
    } catch (error) {
      lifetimeChannelScan = { available: false, reason: error.message, results: [] };
    }
  }
  const familyConnections = [];
  for (let i = 0; i < familyCharts.length; i++) {
    for (let j = i + 1; j < familyCharts.length; j++) {
      const bridges = bridgesBetween(definitions, familyCharts[i], familyCharts[j], transitGates, snapshot, durationByPlanet);
      familyConnections.push({
        people: [familyCharts[i].name, familyCharts[j].name],
        ...relationshipStructure(familyCharts[i], familyCharts[j], definitions, transitGates),
        recurrence: publicPairRecurrence(
          { charts: [familyCharts[i], familyCharts[j]] },
          bridges.filter(bridge => bridge.transitContributed).map(bridge => bridge.channel)
        ),
        channels: bridges
      });
    }
  }
  let comparison = null;
  if (referenceSnapshot) {
    const referenceTransitGates = new Set(referenceSnapshot.gates);
    const referenceCharts = [
      { id: 'daniel', name: charts.blue.name, role: 'parent', natalGates: danielGates },
      { id: 'camille', name: charts.pink.name, role: 'parent', natalGates: camilleGates },
      ...children.map(child => ({ id: child.id, name: child.name, role: 'child', natalGates: new Set(child.natalGates) }))
    ];
    const currentChannelDetails = new Map();
    for (const chart of referenceCharts) {
      for (const channel of transitChannelChanges(definitions, chart.natalGates, snapshot, durationByPlanet)) {
        currentChannelDetails.set(`${chart.id}:${channel.channel}`, channel);
      }
    }
    const chartChanges = referenceCharts.map(chart => {
      const before = activeChannels(definitions, chart.natalGates, referenceTransitGates, 'transit at the reference date');
      const after = activeChannels(definitions, chart.natalGates, transitGates, 'transit at the selected time');
      const changes = compareChannelSets(before, after, new Map(
        [...currentChannelDetails.entries()]
          .filter(([key]) => key.startsWith(`${chart.id}:`))
          .map(([key, detail]) => [key.slice(chart.id.length + 1), detail])
      ));
      return { person: chart.name, ...changes };
    });
    const relationshipChanges = [];
    for (let i = 0; i < referenceCharts.length; i++) {
      for (let j = i + 1; j < referenceCharts.length; j++) {
        const first = referenceCharts[i], second = referenceCharts[j];
        const before = bridgesBetween(definitions, first, second, referenceTransitGates, referenceSnapshot, {});
        const after = bridgesBetween(definitions, first, second, transitGates, snapshot, durationByPlanet);
        const changes = compareChannelSets(before, after, new Map(after.map(channel => [channel.channel, channel])));
        if (changes.addedSinceReference.length || changes.noLongerActiveSinceReference.length) {
          relationshipChanges.push({ people: [first.name, second.name], ...changes });
        }
      }
    }
    comparison = {
      referenceAsOf: referenceSnapshot.timestamp,
      referenceAsOfLocal: new Date(referenceSnapshot.epoch * 1000).toLocaleString(),
      selectedAsOf: snapshot.timestamp,
      selectedAsOfLocal: new Date(snapshot.epoch * 1000).toLocaleString(),
      ephemeris: `${referenceSnapshot.sampleStepSeconds / 60}-minute reference samples; ${snapshot.sampleStepSeconds / 60}-minute selected-time samples`,
      people: chartChanges,
      relationships: relationshipChanges
    };
  }
  return {
    asOf: snapshot.timestamp,
    asOfLocal: new Date(snapshot.epoch * 1000).toLocaleString(),
    lifetimeTimeline,
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
    penta: familyPenta,
    ...(lifetimeChannelScan ? { lifetimeChannelScan } : {}),
    currentRelationshipBridges: bridgesBetween(definitions, familyCharts[0], familyCharts[1], transitGates, snapshot, durationByPlanet),
    familyConnections,
    ...(comparison ? { comparison } : {}),
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
  const prior = conversation.filter(turn => turn.role === 'user').slice(-6).map(turn => `User-reported context/question (not a chart fact): ${turn.text}`).join('\n');
  const prompt = firstReading
    ? `Give a warm, specific reading of this example family BodyGraph. Start with how the parents' defined and undefined centers interact, then describe each parent–child relationship using its relationshipType and parent/child fields. Treat parenthood as an asymmetric caregiving relationship: reflect on how the adult's defined and undefined centers may shape the environment, and how the child's chart may offer a lens on the child's experience, while keeping care and regulation responsibilities with the adults. Do not cast a child as a peer, mediator, caretaker, or fixed chart type. Weave the energies into a fluent account rather than inventorying centers. Distinguish each person's natal channels from cross-chart bridges and transit-assisted completions. Separate natal patterns from ${context.lifetimeTimeline ? 'transits at the selected time' : 'current transits'}. Focus the transit portion on channels temporarily completed in a chart or relationship, and explain when they are expected to stop completing as their transit gates move on. Include local time bounds only where supplied. Use recurrence data only when its sample date matches the snapshot; state count and sample window, and describe distinctiveness only within this family's modeled timeline. A temporary bridge may suggest one optional, low-pressure activity tied to its channel theme, never a guaranteed outcome. Mention transit gates only to explain a channel change. Use the Metheus sequence: lived context, chart evidence, symbolic interpretation, then a grounded synthesis that leaves room for the family to say what fits. Do not infer unsupported traits or anyone's inner state.`
    : question;
  const compareGuidance = context.comparison
    ? 'Use the supplied comparison object to identify channels newly active since the reference date and channels that were active then but are no longer active at the selected time. Name both dates. Report changes for individual charts and family relationships. If a list is empty, say no channels changed in that category. For each newly active channel, give its estimated end time when supplied; otherwise say its end estimate is unavailable. Do not infer end dates for channels that have already ended.'
    : '';
  return [
    'Verified chart and selected-time/current transit context (JSON facts):',
    JSON.stringify(context),
    prior ? `Recent user-reported context (these statements are not chart facts):\n${prior}` : '',
    compareGuidance,
    `User ${firstReading ? 'request' : 'question'}: ${prompt}`
  ].filter(Boolean).join('\n\n');
}

async function requestReading(question, firstReading = false) {
  const publicExampleReading = firstReading && !signedIn && window.hdUsingPublicExample;
  if (!signedIn && !publicExampleReading) return;
  if (!firstReading && !question.trim()) return;
  if (firstReading) firstReadingStarted = true;
  const loading = addMessage('assistant', firstReading ? 'Generating the family chart reading…' : 'Checking the chart and selected-time transits…');
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
    const context = await buildChartContext(question, progress => { loading.textContent = progress; });
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
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Castalia AI reading is not configured on this deployment.');
  const token = signedIn ? await window.CastaliaHumanDesignAuth?.getAccessToken() : config.supabaseAnonKey;
  if (!token) throw new Error('Your Castalia session expired. Sign in again to continue.');
  const context = await buildChartContext();
  const userMessage = [
    'Verified family chart, channel guide, and selected-time/current transit context (JSON facts):',
    JSON.stringify(context),
    'Current camera view (JSON facts):',
    JSON.stringify(view),
    view.pentaMode
      ? `Write a concise, fluent reading of the family Penta using the supplied Penta facts. Treat it as a group-level layer for this family, not an extra person or bodygraph. State how many of the 12 Penta gates are covered and which of the six Penta channels are complete or incomplete. Choose the most meaningful one or two patterns and explain them in approachable language, naming members who contribute each gate and whether both gates come from one natal chart or are distributed across members. Describe group functions as themes to notice, not fixed assignments or claims about who must provide, lead, remember, or care for others. Do not discuss pair relationships or front-person traits. Do not add transits; this example Penta is natal-only. End with one practical reflection about how the family can make the pattern visible in everyday coordination. Keep it specific to supplied facts, in 2–4 compact paragraphs, without tables or prediction.`
      : `Write a concise, fluent reading for this exact view. Begin with a grounded interpretation of the front-facing person's chart, connecting type, strategy, authority, profile, defined/undefined centers, and natal channels. Then give the three relationship interpretations in the supplied relationships array, one per other family member, regardless of scene position. For each pair, use centerDynamics as the source of truth: explain the most relevant defined/undefined exchange, including centers defined only by the pair when present. For relationshipType parent-child, name the parent and child and use a caregiving lens: the adult shapes the care environment and remains responsible for safety and emotional regulation; the child's chart is a reflective lens on their experience, never a fixed identity or responsibility to support the adult. Do not flatten parent-child dynamics into peer reciprocity or imply that a child should regulate, mediate, or caretake for a parent. Use the exact gateContributions to name who supplies each gate; do not derive ownership from gate order. Distinguish a person's own natal channels from cross-chart bridges and transit-assisted completions. Use channel names/descriptions only as supplied. Build a relational account of how consistent energy, openness/amplification, and complementary channels may interact; connect it to reported context only when relevant and attribute reports to the person who shared them. The chart is symbolic language for reflection, not a mechanism that caused the reported events. Use Metheus flow: context, verified chart observation, symbolic reading, practical synthesis. Do not mention whether charts overlap, align, or are visible together. End with a short transit note only when ${context.lifetimeTimeline ? 'transits at the selected date and time' : 'current transits'} affect the front chart or one of these relationships. Prioritize temporary channel completions; give end times only where estimates are supplied. Suggest at most one optional realistic experiment tied to a supplied channel. Prefer specific evidence over generic praise or lists; do not repeat every gate, center, or transit. Write 4–6 compact paragraphs, without tables or a compatibility verdict.`,
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
