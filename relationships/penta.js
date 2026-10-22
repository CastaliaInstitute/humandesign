export const pentaGates = [
  { gate: 31, function: 'Order and leadership' },
  { gate: 8, function: 'Example and contribution' },
  { gate: 33, function: 'Traditions and recollection' },
  { gate: 7, function: 'Direction and the future' },
  { gate: 1, function: 'Distinctive expression' },
  { gate: 13, function: 'Listening and memory' },
  { gate: 15, function: 'Shared rhythm and flow' },
  { gate: 5, function: 'Household routine' },
  { gate: 2, function: 'Direction of resources' },
  { gate: 14, function: 'Provision and capacity' },
  { gate: 46, function: 'Embodied discovery' },
  { gate: 29, function: 'Commitment and experience' }
];

export const pentaChannels = [
  { channel: '1-8', gates: [1, 8], name: 'Inspiration', function: 'Family expression and example', layer: 'roles' },
  { channel: '7-31', gates: [7, 31], name: 'Alpha', function: 'Group direction and leadership', layer: 'roles' },
  { channel: '13-33', gates: [13, 33], name: 'The Prodigal', function: 'Memory, experience, and traditions', layer: 'roles' },
  { channel: '15-5', gates: [5, 15], name: 'Rhythm', function: 'The shared rhythm and routines of home', layer: 'resources' },
  { channel: '2-14', gates: [2, 14], name: 'The Beat', function: 'Direction and provision of resources', layer: 'resources' },
  { channel: '29-46', gates: [29, 46], name: 'Discovery', function: 'Commitment to experience and the wider world', layer: 'resources' }
];

export function buildPenta(members) {
  const normalized = members.map(member => ({
    id: member.id,
    name: member.name,
    role: member.role || 'member',
    gates: new Set(member.gates || member.natalGates || [])
  }));
  const memberCount = normalized.length;
  const gateStatus = pentaGates.map(({ gate, function: groupFunction }) => ({
    gate,
    function: groupFunction,
    members: normalized.filter(member => member.gates.has(gate)).map(member => member.name),
    covered: normalized.some(member => member.gates.has(gate))
  }));
  const channelStatus = pentaChannels.map(channel => {
    const [firstGate, secondGate] = channel.gates;
    const firstMembers = normalized.filter(member => member.gates.has(firstGate)).map(member => member.name);
    const secondMembers = normalized.filter(member => member.gates.has(secondGate)).map(member => member.name);
    const complete = firstMembers.length > 0 && secondMembers.length > 0;
    const singleMember = normalized.find(member => member.gates.has(firstGate) && member.gates.has(secondGate));
    return {
      ...channel,
      complete,
      completion: !complete ? 'gap' : singleMember ? 'both gates in one chart' : 'gates contributed across charts',
      gateContributions: [
        { gate: firstGate, members: firstMembers },
        { gate: secondGate, members: secondMembers }
      ]
    };
  });
  const coveredGateCount = gateStatus.filter(item => item.covered).length;
  const completeChannelCount = channelStatus.filter(item => item.complete).length;
  return {
    name: 'Family Penta',
    memberCount,
    eligible: memberCount >= 3 && memberCount <= 5,
    memberRange: '3–5',
    members: normalized.map(({ id, name, role }) => ({ id, name, role })),
    coveredGateCount,
    gapCount: gateStatus.length - coveredGateCount,
    completeChannelCount,
    incompleteChannelCount: channelStatus.length - completeChannelCount,
    gates: gateStatus,
    channels: channelStatus
  };
}
