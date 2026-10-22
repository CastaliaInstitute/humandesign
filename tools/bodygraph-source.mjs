import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const getAttributes = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));

export async function loadBodygraphSource(filePath = path.join(root, 'bodygraph.svg')) {
  const svg = await readFile(filePath, 'utf8');
  const gateMetadata = new Map();
  for (const match of svg.matchAll(/<g\b(?=[^>]*\bclass="gate")([^>]*)>/g)) {
    const item = getAttributes(match[1]);
    const gate = Number(item['data-gate']);
    const label = item['aria-label'] || '';
    const separator = label.indexOf(':');
    gateMetadata.set(gate, {
      name: separator >= 0 ? label.slice(0, separator).trim() : '',
      description: item['data-reading'] || (separator >= 0 ? label.slice(separator + 1).trim() : ''),
      center: item['data-center'] || ''
    });
  }
  const channels = [];
  for (const match of svg.matchAll(/<g\b(?=[^>]*\bclass="channel-group")([^>]*)>/g)) {
    const item = getAttributes(match[1]);
    const from = Number(item['data-from']), to = Number(item['data-to']);
    channels.push({
      id: `${Math.min(from, to)}-${Math.max(from, to)}`,
      from, to,
      circuit: item['data-circuit'] || '',
      circuitName: item['data-circuit-label'] || '',
      circuitGroup: item['data-circuit-group-label'] || '',
      circuitType: item['data-circuit-type'] || '',
      reading: item['data-reading'] || item['aria-label'] || ''
    });
  }
  return { svg, gateMetadata, gates: [...gateMetadata].map(([gate, detail]) => ({ gate, ...detail })), channels };
}
