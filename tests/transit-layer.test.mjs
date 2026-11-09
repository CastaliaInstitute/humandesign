import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransitLayer } from '../relationships/transit-layer.js';
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.classList = { toggle() {} }; }
  append(child) { this.children.push(child); child.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
  querySelector(key) { this.mockQueries ||= {}; return this.mockQueries[key] ||= new Element('gradient'); }
}
test('automatically draws a path and retains offscreen endpoints', async () => {
  const body = new Element('body');
  globalThis.document = { body, createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
  const epoch = 1800000000;
  globalThis.window = { CastaliaHumanDesignTransit: {
    gateAt: value => value,
    snapshotAt: async date => ({ bodies: { sun: date.getTime()/1000 < epoch-86400 ? 1 : date.getTime()/1000 > epoch+86400 ? 3 : 2 } })
  }};
  const snapshot = { epoch, bodies: { sun: 2 } };
  const layer = createTransitLayer({ enabled: () => true, project: (_, gate) => ({ x: gate === 1 ? -100 : gate * 100, y: 100, visible: gate !== 1 }), showInfo() {} });
  layer.update(snapshot, ['daniel']);
  await new Promise(resolve => setImmediate(resolve));
  layer.update(snapshot, ['daniel']);
  const svg = body.children[0].children[0];
  const paths = svg.children.filter(child => child.attributes.class === 'transit-gate-trail');
  assert.equal(paths.length, 2);
  assert.ok(paths[0].attributes.d.startsWith('M-100,100'));
  assert.equal(paths[0].style.display, '');
  assert.equal(paths[0].attributes.stroke, 'url(#transit-previous-gradient)');
  assert.equal(paths[1].attributes.stroke, 'url(#transit-next-gradient)');
  assert.equal(paths[0].attributes['marker-end'], undefined);
  assert.equal(paths[1].attributes['marker-end'], 'url(#transit-path-arrow)');
  delete globalThis.document; delete globalThis.window;
});
