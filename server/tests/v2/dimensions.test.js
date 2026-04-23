'use strict';
/**
 * TetracubeDB v2 — dimensions.js invariants
 *
 *   D1. level ∈ [0,7]  (hard cap)
 *   D2. fib_scale[level] = DIM_FIB[level]  (Fibonacci constraint)
 *   D3. verb ↔ level is bijective at writeable levels (1..7)
 *   D4. assertVerbLevel rejects mismatches with INVALID_OPERATION
 *   D5. buildDimensionalMetadata computes plane=x·y, volume=plane·z, m=x·y·z at L7
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const dims = require('../../v2/dimensions');

describe('dimensions — D0–D7 hard cap', () => {
  it('accepts each of 0..7', () => {
    for (let l = 0; l <= 7; l++) assert.equal(dims.assertLevel(l), l);
  });

  it('rejects 8, -1, 1.5, "2"', () => {
    for (const bad of [8, -1, 1.5, '2', null, undefined]) {
      assert.throws(() => dims.assertLevel(bad), (e) => e.code === 'INVALID_LEVEL');
    }
  });
});

describe('dimensions — fib_scale constraint', () => {
  it('returns canonical fib when omitted', () => {
    assert.equal(dims.assertFibScale(0), 0);
    assert.equal(dims.assertFibScale(1), 1);
    assert.equal(dims.assertFibScale(2), 1);
    assert.equal(dims.assertFibScale(3), 2);
    assert.equal(dims.assertFibScale(4), 3);
    assert.equal(dims.assertFibScale(5), 5);
    assert.equal(dims.assertFibScale(6), 8);
    assert.equal(dims.assertFibScale(7), 13);
  });

  it('rejects mismatched fib_scale', () => {
    assert.throws(
      () => dims.assertFibScale(4, 5),
      (e) => e.code === 'INVALID_FIB_SCALE'
    );
  });
});

describe('dimensions — verb routing', () => {
  it('maps each level to its canonical verb', () => {
    assert.equal(dims.verbFor(1), 'setPoint');
    assert.equal(dims.verbFor(2), 'appendLine');
    assert.equal(dims.verbFor(3), 'appendWidth');
    assert.equal(dims.verbFor(4), 'crossPlane');
    assert.equal(dims.verbFor(5), 'pushDelta');
    assert.equal(dims.verbFor(6), 'accumulateVolume');
    assert.equal(dims.verbFor(7), 'sealM');
  });

  it('rejects appendLine on a D4 PLANE target', () => {
    assert.throws(
      () => dims.assertVerbLevel('appendLine', 4),
      (e) => e.code === 'INVALID_OPERATION'
    );
  });

  it('rejects crossPlane on a D2 LINE target', () => {
    assert.throws(
      () => dims.assertVerbLevel('crossPlane', 2),
      (e) => e.code === 'INVALID_OPERATION'
    );
  });

  it('levelForVerb round-trips', () => {
    for (let l = 1; l <= 7; l++) {
      const v = dims.verbFor(l);
      assert.equal(dims.levelForVerb(v), l);
    }
  });
});

describe('dimensions — metadata computation', () => {
  it('computes plane=x·y, volume=plane·z', () => {
    const md = dims.buildDimensionalMetadata({ level: 4, x: 3, y: 45, z_axis: 135 });
    assert.equal(md.plane, 135);
    assert.equal(md.volume, 135 * 135);
    assert.equal(md.fib_scale, 3);
    assert.equal(md.mode, 'mul');
    assert.equal(md.m, null);   // not sealed at L4
  });

  it('computes m=x·y·z at L7 seal', () => {
    const md = dims.buildDimensionalMetadata({ level: 7, x: 3, y: 45, z_axis: 135 });
    assert.equal(md.m, 3 * 45 * 135);
    assert.equal(md.fib_scale, 13);
  });

  it('volumetricIdentity computes scalar m', () => {
    assert.equal(dims.volumetricIdentity(2, 22, 44), 1936);
    assert.equal(dims.volumetricIdentity(4, 15, 60), 3600);
  });
});
