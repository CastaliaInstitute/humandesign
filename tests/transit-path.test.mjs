import test from 'node:test';
import assert from 'node:assert/strict';
import { neighboringTransitGates } from '../relationships/transit-path.js';
const origin = 1800000000;
const day = 86400;
const snapshot = { epoch: origin, bodies: { mercury: 20 } };
test('finds preceding and following gates and transition times', async () => {
  const at = async date => ({ bodies: { mercury: date.getTime()/1000 < origin-day ? 10 : date.getTime()/1000 >= origin+day ? 30 : 20 } });
  const result = await neighboringTransitGates(snapshot, 'mercury', at, value => value, 3);
  assert.equal(result.previous.gate, 10);
  assert.equal(result.current, 20);
  assert.equal(result.next.gate, 30);
  assert.ok(Math.abs(result.previous.epoch - (origin-day)) < 30);
  assert.ok(Math.abs(result.next.epoch - (origin+day)) < 30);
});
test('supports retrograde returning to the preceding gate', async () => {
  const at = async date => ({ bodies: { mercury: Math.abs(date.getTime()/1000-origin) >= day ? 10 : 20 } });
  const result = await neighboringTransitGates(snapshot, 'mercury', at, value => value, 3);
  assert.equal(result.previous.gate, 10);
  assert.equal(result.next.gate, 10);
});
test('reports missing data and no transition without inventing neighbors', async () => {
  const missing = await neighboringTransitGates(snapshot, 'mercury', async () => { throw Error('unavailable'); }, value => value, 1);
  assert.equal(missing.previous, null);
  assert.equal(missing.next, null);
  const unchanged = await neighboringTransitGates(snapshot, 'mercury', async () => snapshot, value => value, 1);
  assert.equal(unchanged.previous, null);
  assert.equal(unchanged.next, null);
});
