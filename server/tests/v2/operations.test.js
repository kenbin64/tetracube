'use strict';
/**
 * TetracubeDB v2 — operations + handshake + archive + motion integration
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcdb-v2-ops-'));
process.env.DATA_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../../v2/store');
const ops = require('../../v2/operations');
const voidMod = require('../../v2/void');
const handshake = require('../../v2/handshake');
const motion = require('../../v2/motion');
const archive = require('../../v2/archive');
const physics = require('../../v2/physics');

const NS = 'ops-ns';

before(() => voidMod.init(NS));

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('operations — dimension-typed verbs', () => {
  it('setPoint writes a D1', () => {
    const r = ops.setPoint({ namespace: NS, table: 't', rowKey: 'p', colKey: '0', value: 1 });
    assert.equal(r.level, 1);
    assert.equal(r.changed, true);
  });

  it('appendWidth writes a D3', () => {
    const r = ops.appendWidth({ namespace: NS, table: 't', rowKey: 'row1', colKey: 'c1', value: 'v' });
    assert.equal(r.level, 3);
  });

  it('crossPlane writes a D4 (mul)', () => {
    const r = ops.crossPlane({ namespace: NS, table: 'p1', value: { x: 3, y: 4 } });
    assert.equal(r.level, 4);
  });

  it('sealM computes m=x·y·z', () => {
    const r = ops.sealM({ namespace: NS, table: 'obj', x: 2, y: 22, z: 44 });
    assert.equal(r.level, 7);
    assert.equal(r.m, 1936);
  });

  it('rejects writes into un-bootstrapped namespace', () => {
    assert.throws(
      () => ops.setPoint({ namespace: 'never-init', table: 't', value: 1 }),
      (e) => e.code === 'NAMESPACE_NOT_BOOTSTRAPPED'
    );
  });

  it('pushDelta on void coord is rejected', () => {
    assert.throws(
      () => ops.pushDelta({ namespace: NS, table: 'nope', rowKey: 'x', delta: {} }),
      (e) => e.code === 'DELTA_ON_VOID'
    );
  });
});

describe('handshake — knock + oneshot', () => {
  it('knock creates a pending token; accept resolves it', () => {
    const from = { gx: 0.1, gy: 0.2, gz: 0.3 };
    const to   = { gx: 1.1, gy: 1.2, gz: 1.3 };
    const tok = handshake.knock({ from, to });
    assert.ok(tok.knock);
    assert.ok(tok.nonce);
    const acc = handshake.accept({ knock_hash: tok.knock, nonce: tok.nonce });
    assert.equal(acc.status, 'accepted');
  });

  it('oneshot stores URI pointer without copying payload', () => {
    const r = handshake.oneshot({ origin: 'kensgames', uri: 'https://x/y.json' });
    assert.ok(r.addr_hash);
    assert.equal(r.uri, 'https://x/y.json');
  });
});

describe('motion — lateral + ascend', () => {
  it('moveLateral rejects invalid direction', () => {
    assert.throws(
      () => motion.moveLateral('deadbeef', 'w+'),
      (e) => e.code === 'INVALID_DIRECTION'
    );
  });

  it('ascendM without handshake is rejected', () => {
    voidMod.init('other-ns');
    assert.throws(
      () => motion.ascendM('other-ns'),
      (e) => e.code === 'HANDSHAKE_REQUIRED'
    );
  });
});

describe('archive — hot → cold gzip', () => {
  it('archives all but z_max into cold tier', () => {
    const cell = store.upsertCell({
      namespace: NS, table: 'archv', rowKey: 'r',
      level: 1, value: { n: 0 },
    });
    for (let i = 1; i <= 5; i++) store.pushDelta(cell.addr_hash, { n: i });
    const res = archive.archiveCell(cell.addr_hash, { keepHot: 1 });
    assert.equal(res.archived, 4);
    assert.equal(res.kept, 1);

    const full = archive.readStack(cell.addr_hash);
    assert.equal(full.length, 5);
    assert.equal(full[0].tier, 'hot');
    assert.equal(full[4].tier, 'cold');
    assert.deepEqual(full[0].delta, { n: 5 });
    assert.deepEqual(full[4].delta, { n: 1 });
  });
});

describe('physics — rule-bound cells', () => {
  it('evaluate runs the registered function with ctx', () => {
    physics.register('decay', ({ prev, dt }) => {
      const v = typeof prev === 'number' ? prev : (prev?.v ?? 10);
      return Math.max(0, v - dt);
    });
    assert.equal(physics.has('decay'), true);
    const fakeCell = { physics_ref: 'decay', value: 100, updated_at: Math.floor(Date.now() / 1000) - 3, addr_hash: 'x' };
    const v = physics.evaluate(fakeCell);
    assert.ok(v <= 100 && v >= 96);
  });

  it('unknown physics_ref throws', () => {
    assert.throws(
      () => physics.evaluate({ physics_ref: 'unknown', value: 1, updated_at: 0, addr_hash: 'x' }),
      (e) => e.code === 'UNKNOWN_PHYSICS'
    );
  });
});
