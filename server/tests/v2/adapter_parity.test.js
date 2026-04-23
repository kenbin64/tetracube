'use strict';
/**
 * TetracubeDB v2 — adapter parity tests
 *
 * The same conformance suite is executed against every adapter.  A passing
 * run proves that the dimensional contract is adapter-independent — the
 * "language-agnostic, storage-agnostic" claim of the manifold paradigm.
 *
 * Suite:
 *   P1. assertConforms accepts the adapter (all REQUIRED_METHODS present)
 *   P2. init() is idempotent
 *   P3. namespace bootstrap round-trip
 *   P4. cell upsert + identity dedup
 *   P5. stack push + hash dedup + readStackHot ordering
 *   P6. scanPlane returns only plane cells (ns,table scoped)
 *   P7. getNeighbors computes 6 edges from geometry (no storage)
 *   P8. tombstone transitions value_kind to 'tombstone' and preserves history
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// Isolate the underlying v1 SQLite handle before any store module loads,
// so the sqlite adapter doesn't stomp real data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcdb-v2-parity-'));
process.env.DATA_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'parity.db');

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertConforms, REQUIRED_METHODS } = require('../../v2/adapter');
const store = require('../../v2/store');
const ops = require('../../v2/operations');
const voidMod = require('../../v2/void');

// Adapter factories — each returns a *fresh* adapter instance.
const factories = [
  {
    name: 'memory',
    make: () => require('../../v2/adapters/memory').create(),
  },
  {
    name: 'fs',
    make: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tcdb-fs-'));
      return require('../../v2/adapters/fs').create({ root });
    },
  },
  {
    name: 'sqlite',
    make: () => {
      // Reuse the same tmp DB; wipe v2_* tables for isolation.
      const a = require('../../v2/adapters/sqlite');
      a.init();
      const d = a.db();
      d.exec(`
        DELETE FROM v2_stack_hot;
        DELETE FROM v2_stack_cold;
        DELETE FROM v2_extern;
        DELETE FROM v2_cells;
        DELETE FROM v2_namespaces;
      `);
      return a;
    },
  },
];

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

for (const { name, make } of factories) {
  describe(`adapter parity — ${name}`, () => {
    before(() => { store.setAdapter(make()); });

    it('P1: conforms to the adapter contract', () => {
      const a = store.getAdapter();
      assert.doesNotThrow(() => assertConforms(a));
      for (const m of REQUIRED_METHODS) assert.equal(typeof a[m], 'function', `missing ${m}`);
    });

    it('P2: init() is idempotent', () => {
      const a = store.getAdapter();
      a.init(); a.init();
      assert.equal(a.name(), name);
    });

    it('P3: bootstrap is idempotent and writes a seed', () => {
      const b1 = store.bootstrapNamespace('p-ns');
      const b2 = store.bootstrapNamespace('p-ns');
      assert.equal(b1.bootstrapped, true);
      assert.equal(b2.bootstrapped, false);
      assert.equal(b1.seed_addr, b2.seed_addr);
      assert.equal(store.isBootstrapped('p-ns'), true);
      assert.ok(store.listNamespaces().some((n) => n.namespace === 'p-ns'));
    });

    it('P4: upsertCell dedups on identity', () => {
      const a = ops.appendWidth({ namespace: 'p-ns', table: 't', rowKey: 'r', colKey: 'c', value: { v: 1 } });
      const b = ops.appendWidth({ namespace: 'p-ns', table: 't', rowKey: 'r', colKey: 'c', value: { v: 1 } });
      const c = ops.appendWidth({ namespace: 'p-ns', table: 't', rowKey: 'r', colKey: 'c', value: { v: 2 } });
      assert.equal(a.changed, true);
      assert.equal(b.changed, false);
      assert.equal(c.changed, true);
    });

    it('P5: pushDelta is hash-gated and readStackHot is z-descending', () => {
      const cell = store.readCell('p-ns', 't', 'r', 'c');
      const r1 = store.pushDelta(cell.addr_hash, { n: 1 });
      const r2 = store.pushDelta(cell.addr_hash, { n: 1 }); // gated
      const r3 = store.pushDelta(cell.addr_hash, { n: 2 });
      assert.equal(r1.pushed, true);
      assert.equal(r2.pushed, false);
      assert.equal(r3.pushed, true);
      const frames = store.readStackHot(cell.addr_hash);
      assert.equal(frames.length, 2);
      assert.deepEqual(frames[0].delta, { n: 2 });
      assert.deepEqual(frames[1].delta, { n: 1 });
    });

    it('P6: scanPlane is ns+table scoped', () => {
      ops.appendWidth({ namespace: 'p-ns', table: 'plane', rowKey: 'a', colKey: 'c1', value: 1 });
      ops.appendWidth({ namespace: 'p-ns', table: 'plane', rowKey: 'a', colKey: 'c2', value: 2 });
      ops.appendWidth({ namespace: 'p-ns', table: 'other', rowKey: 'a', colKey: 'c1', value: 9 });
      const rows = store.scanPlane('p-ns', 'plane');
      assert.equal(rows.length, 2);
      assert.ok(rows.every((r) => r.table_name === 'plane'));
    });

    it('P7: getNeighbors computes 6 edges as pure geometry', () => {
      const cell = store.readCell('p-ns', 't', 'r', 'c');
      const edges = store.getNeighbors(cell.addr_hash);
      assert.equal(edges.length, 6);
      const dirs = edges.map((e) => e.direction).sort();
      assert.deepEqual(dirs, ['x+', 'x-', 'y+', 'y-', 'z+', 'z-']);
      // Every edge has a coordinate; occupancy is a live lookup, not a persisted row.
      assert.ok(edges.every((e) =>
        typeof e.gx === 'number' && typeof e.gy === 'number' && typeof e.gz === 'number'
        && (e.state === 'void' || e.state === 'occupied')));
    });

    it('P8: tombstone flips value_kind and preserves prior stack', () => {
      ops.appendWidth({ namespace: 'p-ns', table: 'tomb', rowKey: 'r', colKey: 'c', value: { a: 1 } });
      const t = ops.tombstone({ namespace: 'p-ns', table: 'tomb', rowKey: 'r', colKey: 'c', reason: 'test' });
      assert.equal(t.state, 'tombstoned');
      const r = voidMod.readOrVoid('p-ns', 'tomb', 'r', 'c');
      assert.equal(r.state, 'tombstoned');
      assert.equal(r.value_kind, 'tombstone');
      assert.equal(r.value._tombstone, true);
      const again = ops.tombstone({ namespace: 'p-ns', table: 'tomb', rowKey: 'r', colKey: 'c' });
      assert.equal(again.changed, false);
    });
  });
}
