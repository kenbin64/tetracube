/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — DIMENSIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Enforces the D0–D7 dimensional contract:
 *
 *   level  | name   | fib | mode     | verbs
 *   -------+--------+-----+----------+-------------------------------
 *    0     | VOID   |  0  | void     | (read-only; namespace bootstrap writes a D1)
 *    1     | POINT  |  1  | point    | setPoint
 *    2     | LINE   |  1  | add      | appendLine
 *    3     | WIDTH  |  2  | add      | appendWidth
 *    4     | PLANE  |  3  | mul      | crossPlane        (first cross: z = x·y)
 *    5     | STACK  |  5  | add      | pushDelta
 *    6     | VOLUME |  8  | add      | accumulateVolume
 *    7     | M      | 13  | mul      | sealM             (second cross: m = x·y·z)
 *
 * Hard invariants:
 *   - level must be an integer in [0, 7].   Anything else = INVALID_LEVEL.
 *   - fib_scale must equal DIM_FIB[level].  Anything else = INVALID_FIB_SCALE.
 *   - Verb must match DIM_MODE[level].      A write with verb='appendLine' on
 *     a D4 PLANE target is INVALID_OPERATION; PLANE is multiplicative.
 *
 *   Rationale:  these aren't stylistic rules — they enforce that the storage
 *   shape is isomorphic to the manifold topology.  A write that violates them
 *   is a write that can't be located in the coordinate system.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const {
  DIM,
  DIM_NAMES,
  DIM_FIB,
  DIM_MODE,
} = require('../gyroid_core');

// Canonical verb table — the verbs the /v2 API accepts, keyed by level.
// Each level has exactly one canonical "write verb" (plus 'read' which works
// everywhere).  A write issued with a verb that doesn't match the target's
// level is a dimensional mismatch.
const VERB_FOR_LEVEL = Object.freeze({
  0: null,              // D0 VOID — no direct writes; namespace bootstrap only
  1: 'setPoint',        // D1 POINT
  2: 'appendLine',      // D2 LINE (add)
  3: 'appendWidth',     // D3 WIDTH (add)
  4: 'crossPlane',      // D4 PLANE (mul) — first cross
  5: 'pushDelta',       // D5 STACK (add on z-axis)
  6: 'accumulateVolume',// D6 VOLUME (add)
  7: 'sealM',           // D7 M (mul) — second cross; closes the object
});

// Reverse lookup: verb → level it operates at.
const LEVEL_FOR_VERB = Object.freeze(
  Object.entries(VERB_FOR_LEVEL)
    .filter(([, v]) => v !== null)
    .reduce((acc, [k, v]) => ({ ...acc, [v]: Number(k) }), {})
);

// The seven Fibonacci weights, exposed as a frozen tuple.  Indexing past 7
// is forbidden — that's the D7 hard cap the paradigm requires.
const FIB = Object.freeze(DIM_FIB.slice(0, 8));

const MAX_LEVEL = 7;

/**
 * Validate a level claim.  Throws a strict-error-shaped Error on failure.
 */
function assertLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    const err = new Error(
      `level must be an integer in [0, ${MAX_LEVEL}] (got ${level})`
    );
    err.code = 'INVALID_LEVEL';
    err.strict = true;
    throw err;
  }
  return level;
}

/**
 * Validate fib_scale against the Fibonacci constraint for the given level.
 * If fib_scale is omitted, returns the canonical value; if provided, it must
 * match DIM_FIB[level] exactly.
 */
function assertFibScale(level, fib_scale) {
  assertLevel(level);
  const canonical = FIB[level];
  if (fib_scale === undefined || fib_scale === null) return canonical;
  if (fib_scale !== canonical) {
    const err = new Error(
      `fib_scale ${fib_scale} ≠ fib(${level}) = ${canonical}`
    );
    err.code = 'INVALID_FIB_SCALE';
    err.strict = true;
    throw err;
  }
  return fib_scale;
}

/**
 * Return the operational mode for a level: 'void' | 'point' | 'add' | 'mul'.
 */
function modeFor(level) {
  assertLevel(level);
  return DIM_MODE[level];
}

/**
 * Return the canonical write verb for a level (or null for VOID).
 */
function verbFor(level) {
  assertLevel(level);
  return VERB_FOR_LEVEL[level];
}

/**
 * Return the level a verb operates at, or null if verb is unknown.
 */
function levelForVerb(verb) {
  return LEVEL_FOR_VERB[verb] ?? null;
}

/**
 * Validate that a (verb, level) pair is consistent.  Throws INVALID_OPERATION
 * on mismatch — e.g. appendLine on a D4 PLANE target, or crossPlane on a D2.
 */
function assertVerbLevel(verb, level) {
  assertLevel(level);
  const expected = VERB_FOR_LEVEL[level];
  if (verb !== expected) {
    const err = new Error(
      `verb '${verb}' not valid at D${level} (${DIM_NAMES[level]}); `
      + `expected '${expected}'`
    );
    err.code = 'INVALID_OPERATION';
    err.strict = true;
    throw err;
  }
}

/**
 * Compute m = x * y * z for a D7 seal.  Returns the volumetric identity.
 */
function volumetricIdentity(x, y, z) {
  return x * y * z;
}

/**
 * Build a canonical dimensional_metadata object for a write.
 * Fills in fib_scale from level, theta_deg from level*90, and computes
 * plane (=x*y) and volume (=plane*z_axis) when the axes are provided.
 */
function buildDimensionalMetadata({ level, x = 0, y = 0, z_axis = 0, fib_scale }) {
  assertLevel(level);
  const fs = assertFibScale(level, fib_scale);
  const plane = x * y;
  const volume = plane * z_axis;
  return Object.freeze({
    level,
    level_name: DIM_NAMES[level],
    mode: DIM_MODE[level],
    x, y, z_axis,
    plane,
    volume,
    theta_deg: level * 90,
    fib_scale: fs,
    m: level === 7 ? x * y * z_axis : null,
  });
}

module.exports = {
  DIM, DIM_NAMES, FIB, MAX_LEVEL,
  VERB_FOR_LEVEL, LEVEL_FOR_VERB,
  assertLevel, assertFibScale, assertVerbLevel,
  modeFor, verbFor, levelForVerb,
  volumetricIdentity, buildDimensionalMetadata,
};
