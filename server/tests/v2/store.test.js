'use strict';
/**
 * TetracubeDB v2 — store.js invariants
 *
 *   S1. initSchemaV2 is idempotent
 *   S2. upsertCell enforces level ∈ [1,7] (VOID write is forbidden)
 *   S3. upsertCell is identity-gated: same value → {changed:false}, no row rewrite
 *   S4. readCell returns null for void; voidAt returns D0 envelope
 *   S5. scanPlane returns all cells at (ns,table)
 *   S6. getNeighbors computes 6 edges from geometry (no storage round-trip)
 *   S7. pushDelta is hash-gated: same delta → {pushed:false}
 *   S8. bootstrapNamespace is idempotent; seeds D1 origin cell
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// Isolate test DB before any store module is required.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcdb-v2-store-'));
process.env.DATA_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../../v2/store');

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('store — schema + bootstrap', () => {
  it('initSchemaV2 is idempotent', () => {
    store.initSchemaV2();
    store.initSchemaV2();
    assert.ok(true);
  });

  it('bootstrapNamespace seeds a D1 origin and is idempotent', () => {
    const a = store.bootstrapNamespace('test-ns');
    assert.equal(a.bootstrapped, true);
    assert.ok(a.seed_addr);
    const b = store.bootstrapNamespace('test-ns');
    assert.equal(b.bootstrapped, false);
    assert.equal(b.seed_addr, a.seed_addr);
    assert.equal(store.isBootstrapped('test-ns'), true);
  });

  it('listNamespaces returns bootstrapped ones', () => {
    const list = store.listNamespaces();
    assert.ok(list.some((n) => n.namespace === 'test-ns'));
  });
});

describe('store — upsert + identity gate', () => {
  it('rejects D0 VOID writes', () => {
    assert.throws(
      () => store.upsertCell({
        namespace: 'test-ns', table: 't', rowKey: 'r',
        level: 0, value: 1
      }),
      (e) => e.code === 'VOID_WRITE_FORBIDDEN'
    );
  });

  it('rejects out-of-range levels', () => {
    assert.throws(
      () => store.upsertCell({
        namespace: 'test-ns', table: 't', rowKey: 'r',
        level: 8, value: 1
      }),
      (e) => e.code === 'INVALID_LEVEL'
    );
  });

  it('delta-gates on identity (no-op on same value)', () => {
    const a = store.upsertCell({
      namespace: 'test-ns', table: 't', rowKey: 'r',
      level: 1, value: { x: 1 }
    });
    assert.equal(a.changed, true);
    const b = store.upsertCell({
      namespace: 'test-ns', table: 't', rowKey: 'r',
      level: 1, value: { x: 1 }
    });
    assert.equal(b.changed, false);
    assert.equal(b.identity, a.identity);
    const c = store.upsertCell({
      namespace: 'test-ns', table: 't', rowKey: 'r',
      level: 1, value: { x: 2 }
    });
    assert.equal(c.changed, true);
    assert.notEqual(c.identity, a.identity);
  });
});

describe('store — void + scan', () => {
  it('readCell returns null on void coord', () => {
    assert.equal(store.readCell('test-ns', 'nowhere', 'x', 'y'), null);
  });

  it('voidAt returns D0 envelope', () => {
    const v = store.voidAt('test-ns', 'nowhere', 'x', 'y');
    assert.equal(v.level, 0);
    assert.equal(v.state, 'void');
    assert.equal(v.potential, true);
  });

  it('scanPlane returns cells at (ns,table)', () => {
    store.upsertCell({ namespace: 'test-ns', table: 'plane', rowKey: 'a', colKey: 'c1', level: 3, value: 1 });
    store.upsertCell({ namespace: 'test-ns', table: 'plane', rowKey: 'a', colKey: 'c2', level: 3, value: 2 });
    store.upsertCell({ namespace: 'test-ns', table: 'plane', rowKey: 'b', colKey: 'c1', level: 3, value: 3 });
    const rows = store.scanPlane('test-ns', 'plane');
    assert.equal(rows.length, 3);
  });
});

describe('store — neighbors + stack', () => {
  it('getNeighbors computes 6 edges from geometry', () => {
    const cell = store.upsertCell({
      namespace: 'test-ns', table: 'n', rowKey: 'r', colKey: 'c',
      level: 1, value: 42,
    });
    const edges = store.getNeighbors(cell.addr_hash);
    assert.equal(edges.length, 6);
    const dirs = edges.map((e) => e.direction).sort();
    assert.deepEqual(dirs, ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'].sort());
    assert.ok(edges.every((e) => e.state === 'void' || e.state === 'occupied'));
  });

  it('pushDelta hash-gates: identical delta → no-op', () => {
    const cell = store.upsertCell({
      namespace: 'test-ns', table: 'stk', rowKey: 'r',
      level: 1, value: { n: 1 },
    });
    const a = store.pushDelta(cell.addr_hash, { n: 1 });
    assert.equal(a.pushed, true);
    assert.equal(a.seq, 0);
    const b = store.pushDelta(cell.addr_hash, { n: 1 });
    assert.equal(b.pushed, false);
    const c = store.pushDelta(cell.addr_hash, { n: 2 });
    assert.equal(c.pushed, true);
    assert.equal(c.seq, 1);
    const frames = store.readStackHot(cell.addr_hash);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].seq, 1);    // z_max first
  });
});
