import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../relationships/threejs.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function timelineEpochAtAge('), source.indexOf('function updateTimelineDisplay('));
test('lifetime scrub spans exactly birth to the hundredth birthday and clamps ages', () => {
  const birth = Date.UTC(1980, 2, 12) / 1000, end = Date.UTC(2080, 2, 12) / 1000;
  const context = vm.createContext({ lifetimeStartEpoch: birth, lifetimeEndEpoch: end });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('timelineEpochAtAge(0)', context), birth);
  assert.equal(vm.runInContext('timelineEpochAtAge(100)', context), end);
  assert.equal(vm.runInContext('timelineEpochAtAge(-5)', context), birth);
  assert.equal(vm.runInContext('timelineEpochAtAge(120)', context), end);
  assert.equal(vm.runInContext('timelineEpochAtAge(50)', context), (birth + end) / 2);
});
