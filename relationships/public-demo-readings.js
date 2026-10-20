import { publicFamilyRecurrence } from './relationship-recurrence-data.js?v=family-opportunities-20261020';

const individualReadings = {
  daniel: `Daniel’s chart has a steady core in the G, Throat, Spleen, Sacral, and Root centers. In Human Design, these defined centers are described as more consistent ways of experiencing direction, expression, instinct, work energy, and pressure. The Head, Ajna, Ego, and Solar Plexus are undefined, which means those themes may be more changeable and sensitive to the people around him—not missing or weaker. In family life, he might notice himself picking up someone else’s urgency or certainty. A helpful pause is: “Is this pressure mine, and is this still a yes?” Once he has a genuine response, a quick heads-up can help everyone adjust to his pace. His chart links self-expression with action (10–34) and describes energy that can arrive in starts and stops (3–60).`,
  camille: `Camille’s G, Throat, Ego, and Sacral centers are defined in her chart; Human Design describes these as relatively consistent themes of direction, expression, will, and available work energy. Her Head, Ajna, Spleen, Solar Plexus, and Root are undefined, so questions, other people’s certainty, instinct, emotion, and urgency may feel different depending on the situation. That isn’t a lack: it can make it easier to notice what is happening around her, while a pause helps separate her own wants from the room’s pressure. Around plans, money, or chores, clear agreements can help. She might ask: “Do I have the energy for this, and do I want it?” Her chart highlights personal choice (10–34), stewardship (21–45), and finding a workable rhythm (5–15).`,
  'child-1': `Aleia’s chart shows defined G, Throat, Sacral, and Root centers. In this framework, those are described as steadier themes around direction, expression, energy, and pressure. Her Head, Ajna, Ego, Spleen, and Solar Plexus are undefined; she may be especially receptive to other people’s questions, expectations, instincts, or feelings, and these can vary with context. Undefined does not mean empty or deficient. In daily life, offering a genuine choice without demanding a particular answer can help her notice her own response: “Would you like to start now or after a snack?” Make room for her ideas and let her finish things at her own pace. Her chart links creative expression with sharing it (1–8), finding a voice in a group (7–31), and moving through beginnings and completions (42–53).`,
  'child-2': `Finn’s chart has defined Head, Ajna, G, Ego, Sacral, and Root centers, described in Human Design as more consistent patterns of inspiration, thinking, direction, will, energy, and pressure. His Throat, Spleen, and Solar Plexus are undefined, so expression, instinct, and emotional atmosphere may be more variable or strongly affected by who is nearby. That doesn’t mean he can’t speak up, trust himself, or feel deeply; it suggests giving him room to find his own timing. Try one clear question, offer a concrete choice, and leave a pause. When plans change, explain what is changing and what stays steady. His chart points to a busy inner world (61–24) and energy that can move through cycles rather than a perfectly even pace (3–60).`,
};

const relationshipReadings = {
  'camille|daniel': `Daniel and Camille both have defined Sacral centers, so Human Design would describe each as bringing a relatively consistent source of work energy and response. They also share 10–34, tying self-direction to action. Their differences matter too: Daniel’s Spleen is defined while Camille’s is undefined, and Camille’s Ego is defined while Daniel’s is undefined; Human Design frames these as different levels of consistency around instinct and will, not as one person being better at either. Daniel’s undefined Solar Plexus may be especially sensitive to emotional atmosphere, while Camille’s is also undefined—so feelings can be amplified between them. Naming whose feeling or deadline it is, and revisiting decisions after emotions settle, can help. Their charts also connect through 11–56, 25–51, and 35–36.`,
  'child-1|daniel': `Daniel and Aleia both have defined G, Throat, Sacral, and Root centers, so this framework suggests shared consistency around direction, expression, energy, and pressure. Daniel’s Spleen is defined while Aleia’s is undefined; Aleia’s defined Throat and Sacral meet Daniel’s own definition there, while her undefined Ego and Solar Plexus may make expectations and feelings around her especially noticeable. In practice, Daniel can model making a choice without requiring Aleia to copy his instinct or carry the plan. Offer an invitation, give her time to respond, and let her contribution be her own. Their charts share 1–8 and 7–31, and connect through 23–43, 12–22, and 25–51.`,
  'camille|child-2': `Camille and Finn bring different patterns of consistency. Camille’s Throat and Ego are defined, while Finn’s Throat is undefined; Finn’s Head, Ajna, and Root are defined, while those centers are undefined in Camille. In Human Design language, each may provide a steady signal in areas where the other is more receptive to context. That can be useful: Camille can make the next step clear, and Finn may bring questions or sustained mental focus. It also helps not to mistake his changing expression for lack of thought, or her openness to pressure for a commitment. Camille’s undefined Solar Plexus and Finn’s undefined Solar Plexus mean emotional atmosphere may be especially noticeable for both. Pause, name feelings simply, and decide once things are calmer. Their charts connect through 4–63, 35–36, and 10–57, among others.`,
  'child-1|child-2': `Aleia and Finn share defined G, Root, and Sacral centers, which Human Design describes as common consistency around direction, pressure, and energy. Their differences can be just as useful to understand: Aleia’s Throat is defined while Finn’s is undefined; Finn’s Head, Ajna, and Ego are defined while those are undefined in Aleia. One may be more consistent in expressing, while the other may bring ongoing questions or willpower. Neither style is the right one. Give them room to talk, think, and decide at different speeds. Their charts connect through 4–63 (questions and answers) and 13–33 (listening and sharing later).`,
  'child-2|daniel': `Daniel and Finn both have defined G, Sacral, and Root centers, suggesting familiar themes of direction, energy, and pressure. Daniel’s Throat and Spleen are defined while Finn’s are undefined; Finn’s Head, Ajna, and Ego are defined while Daniel’s are undefined. In this framework, each brings consistency in places where the other may be more receptive or variable. Daniel can offer a clear explanation without insisting Finn respond immediately; Finn’s questions can be welcomed without Daniel needing to settle every uncertainty. They share 3–60 and connect through 13–33 and 23–43.`,
  'camille|child-1': `Camille and Aleia both have defined G, Throat, and Sacral centers, so they may find familiar ground in direction, expression, and energy. Camille’s Ego is defined while Aleia’s is undefined; Aleia’s Root is defined while Camille’s is undefined. Human Design treats this as a difference in consistency around will and pressure: Camille may bring a steadier sense of what she is willing to take on, while Aleia may notice or amplify urgency around her. Clear, kind boundaries can help—Camille can say what she can do, without expecting Aleia to prove herself, and they can give plans enough time to unfold. Their charts connect through 12–22 and 35–36, bringing emotional expression and changing experiences into the relationship.`,
};

const publicNatalGates = {
  daniel: [1,2,3,7,8,10,12,13,16,19,31,34,36,41,43,46,48,51,56,57,58,60],
  camille: [4,5,7,9,10,11,12,15,21,25,26,28,29,34,35,45,46,50,64],
  'child-1': [1,2,4,6,7,8,13,16,22,23,25,31,36,41,42,45,53],
  'child-2': [3,19,23,24,25,27,32,33,36,37,38,41,44,51,57,60,61,63]
};

const channelOpportunities = {
  '4-63': 'pick one small question to explore together, compare possible answers, and test an idea in practice',
  '12-22': 'choose an easy, low-pressure moment for honest conversation and let either person be quiet if that feels right',
  '13-33': 'make room for one person to tell a story while the other listens, then allow time to reflect before sharing more',
  '21-45': 'coordinate a modest household resource or responsibility with clear, mutual agreements',
  '23-43': 'invite a fresh idea and ask whether the other person wants to hear it before working out how to explain it',
  '25-51': 'try one small courageous thing together, keeping consent and each person’s comfort central',
  '27-50': 'care for something together with clear roles so the responsibility feels shared',
  '28-38': 'choose one meaningful, manageable challenge together without making difficulty the goal',
  '35-36': 'try a manageable new experience together and leave room to talk about how it felt',
  '10-57': 'pause to notice what feels supportive in the moment and keep the choice easy to revise',
  '10-34': 'choose a short hands-on activity only if both people have the energy and genuine interest',
  '3-60': 'try one small new step and allow progress to come in fits and starts'
};

function matchesPublicChart(chart) {
  const expected = publicNatalGates[chart?.id];
  return expected && JSON.stringify(chart.natalGates) === JSON.stringify(expected);
}

function pairKey(pair) {
  return [...(pair.ids || [])].sort().join('|');
}

export function generatePublicDemoReading(view) {
  const front = view?.frontPerson;
  if (!front || !individualReadings[front.id] || !matchesPublicChart(front)) return null;
  const relationships = view.relationships || view.overlappingPairs || [];
  if (relationships.some(pair => !(pair.charts || []).every(matchesPublicChart))) return null;
  const paragraphs = [individualReadings[front.id]];
  if (relationships.length) {
    for (const pair of relationships) {
      const reading = relationshipReadings[pairKey(pair)];
      if (reading) paragraphs.push(reading);
      else paragraphs.push(`${pair.people?.join(' and ') || 'These family members'} are together in this view. Notice what feels familiar between them and where they may have different timing or ways of communicating. The chart details below offer one lens; simple check-ins and direct conversation are more useful than assuming what someone else is feeling.`);
      const recurrence = pair.transitChannelRecurrence;
      const recurrenceNotes = [];
      if (recurrence?.currentState) {
        const stateDuration = recurrence.currentState;
        const median = stateDuration.median_days <= 0.5 ? 'about 12 hours' : `about ${stateDuration.median_days} days`;
        const longest = stateDuration.longest_days < 1 ? `${Math.round(stateDuration.longest_days * 24)} hours` : `${stateDuration.longest_days} days`;
        const sampleDate = new Date(recurrence.sampleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
        const episodeText = stateDuration.episodes === 1
          ? 'was seen in a single sampled episode'
          : `returned in ${stateDuration.episodes.toLocaleString()} sampled episodes`;
        const standout = stateDuration.episodes === 1
          ? ' It is a standout configuration within this pair’s modeled timeline'
          : stateDuration.episodes <= 5
            ? ' It is among the less-repeated configurations in this pair’s modeled timeline'
            : '';
        recurrenceNotes.push(`The bridge-and-center combination sampled on ${sampleDate} ${episodeText} across this pair’s modeled shared lifetime (median ${median}, longest ${longest}), among ${recurrence.uniqueStates.toLocaleString()} modeled combinations.${standout}`);
      }
      if (recurrence?.channels?.length) {
        const item = [...recurrence.channels].sort((a, b) => a.activePct - b.activePct)[0];
        const duration = item.duration || {};
        const median = duration.median_days <= 0.5 ? 'about 12 hours' : `about ${duration.median_days} days`;
        const longest = duration.longest_days < 1 ? `${Math.round(duration.longest_days * 24)} hours` : `${duration.longest_days} days`;
        const rank = item.relativeFrequencyRank && item.comparisonCount
          ? `Ranks ${item.relativeFrequencyRank} of ${item.comparisonCount} possible bridge channels by modeled occupancy for this pair`
          : '';
        const windowNote = item.expectedThrough ? `Current transit window: ${item.expectedThrough}` : '';
        const opportunity = channelOpportunities[item.channel]
          ? `One optional way to explore its theme during this temporary bridge is to ${channelOpportunities[item.channel]}`
          : item.channelDescription
            ? `One optional, low-pressure way to explore ${item.channelName || 'this channel theme'} during this temporary bridge is to notice how it shows up in a shared activity`
            : '';
        const channelNotes = [
          `${item.channel.replace('-', '–')} has ${item.episodes.toLocaleString()} modeled episodes, occupying about ${item.activePct}% of this pair’s lifetime samples (median run ${median}; longest ${longest})`,
          rank,
          windowNote,
          opportunity
        ].filter(Boolean);
        recurrenceNotes.push(`Of the current transit bridges, ${channelNotes.join('. ')}`);
      }
      if (recurrenceNotes.length) paragraphs.push(`${recurrenceNotes.join('. ')}. Based on six-hour samples for this pair, these are modeled recurrence estimates, not population rarity or a forecast of current transit duration.`);
    }
  } else {
    paragraphs.push('Relationship details are not available for the other family charts in this view.');
  }
  const familyCharts = [front, ...relationships.flatMap(pair => pair.charts || []).filter(chart => chart?.id !== front.id)];
  const familyStats = view.familyRecurrence || publicFamilyRecurrence(familyCharts);
  if (familyStats) {
    const span = `${new Date(familyStats.span[0]).getUTCFullYear()}–${new Date(familyStats.span[1]).getUTCFullYear()}`;
    const currentDuration = familyStats.currentStateDuration?.median_days <= 0.5
      ? 'about 12 hours at the scan’s resolution'
      : `about ${familyStats.currentStateDuration.median_days} days at the scan’s resolution`;
    const sampleDate = new Date(familyStats.sampleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const configurationNote = familyStats.currentStateEpisodes === 1
      ? 'This is a standout configuration within the family’s modeled timeline, not a claim that the family is unique in the population.'
      : `The scan found ${familyStats.currentStateEpisodes} sampled episodes of this configuration; this is a family-specific model comparison, not a population ranking.`;
    paragraphs.push(`Across the family’s modeled shared-lifetime window (${span}), the six-hour scan found ${familyStats.uniqueStates.toLocaleString()} different combined relationship states. The full-family combination sampled on ${sampleDate} occurred in ${familyStats.currentStateEpisodes} episode${familyStats.currentStateEpisodes === 1 ? '' : 's'} at this resolution, lasting ${currentDuration}. ${configurationNote}`);
  }
  if (view.transitsShown) {
    const changes = front.transitChannelChanges || [];
    if (changes.length) {
      const channelNotes = changes.map(item => {
        const name = item.channelName ? ` (${item.channelName})` : '';
        const windows = item.transitGates.map(gate => `Gate ${gate.gate}, ${gate.planets}, ${gate.expectedThrough}`).join(' and ');
        return `${item.channel}${name} is temporarily completed while ${windows}; when the transit gate moves on, this channel will no longer be completed by the transit`;
      });
      paragraphs.push(`Current transits are most noticeable where they temporarily complete a channel in ${front.name || 'the chart'}: ${channelNotes.join('; ')}. These are time-limited additions to the natal pattern.`);
    } else {
      paragraphs.push(`The current transits do not complete a new channel in ${front.name || 'the chart'}, so there is no temporary channel change to highlight right now. Transit gates that do not complete a channel are left out of this reading.`);
    }
  }
  return paragraphs.join('\n\n');
}
