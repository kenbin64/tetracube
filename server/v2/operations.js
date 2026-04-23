/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — OPERATIONS (dimension-typed verbs)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Each verb is permitted at exactly one D-level.  Attempting a verb at a
 * mismatched level returns INVALID_OPERATION (a dimensional mismatch — the
 * write has no valid coordinate).
 *
 *   setPoint            — D1 POINT (scalar identity)
 *   appendLine          — D2 LINE  (additive along x)
 *   appendWidth         — D3 WIDTH (additive along y)
 *   crossPlane          — D4 PLANE (multiplicative: z = x·y)
 *   pushDelta           — D5 STACK (additive on z, delta-gated)
 *   accumulateVolume    — D6 VOLUME (additive planes)
 *   sealM               — D7 M    (multiplicative: m = x·y·z; closes object)
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const dims = require('./dimensions');
const store = require('./store');
const { requireBootstrapped } = require('./void');

function _write(level, args) {
  const { namespace } = args;
  requireBootstrapped(namespace);
  dims.assertVerbLevel(args.verb || dims.verbFor(level), level);
  return store.upsertCell({ ...args, level });
}

function setPoint({ namespace, table, rowKey = '', colKey = '', value }) {
  return _write(1, { namespace, table, rowKey, colKey, value, verb: 'setPoint' });
}

function appendLine({ namespace, table, rowKey, value }) {
  return _write(2, { namespace, table, rowKey, colKey: '', value, verb: 'appendLine' });
}

function appendWidth({ namespace, table, rowKey, colKey, value }) {
  return _write(3, { namespace, table, rowKey, colKey, value, verb: 'appendWidth' });
}

function crossPlane({ namespace, table, value }) {
  return _write(4, { namespace, table, rowKey: '', colKey: '', value, verb: 'crossPlane' });
}

/**
 * D5 pushDelta — append to a cell's z-stack.  Requires the cell to already
 * exist (writes on void are rejected; use setPoint/appendWidth first).
 */
function pushDelta({ namespace, table, rowKey = '', colKey = '', delta }) {
  requireBootstrapped(namespace);
  const cell = store.readCell(namespace, table, rowKey, colKey);
  if (!cell) {
    const err = new Error(
      `cannot pushDelta on void coord (${namespace},${table},${rowKey},${colKey})`
    );
    err.code = 'DELTA_ON_VOID';
    err.strict = true;
    throw err;
  }
  return store.pushDelta(cell.addr_hash, delta);
}

function accumulateVolume({ namespace, table, value }) {
  return _write(6, { namespace, table, rowKey: '_volume', colKey: '', value, verb: 'accumulateVolume' });
}

/**
 * D7 sealM — compute m = x·y·z and write the volumetric identity of an
 * object.  Returns the sealed m alongside the cell address.
 */
function sealM({ namespace, table, x, y, z }) {
  requireBootstrapped(namespace);
  const m = dims.volumetricIdentity(x, y, z);
  const meta = dims.buildDimensionalMetadata({ level: 7, x, y, z_axis: z });
  const result = store.upsertCell({
    namespace, table, rowKey: '_m', colKey: '',
    level: 7, value: { m, x, y, z, dimensional_metadata: meta },
    verb: 'sealM',
  });
  return { ...result, m };
}

/**
 * Transversal tombstone — marks a cell as deleted without removing it from
 * the manifold.  The cell's value_kind flips to 'tombstone' and a delta
 * frame {_tombstone:true, reason, ts} is pushed onto its z-stack.  Prior
 * state remains recoverable via readStackHot().  Void coords cannot be
 * tombstoned (TOMBSTONE_ON_VOID) — there is nothing there to delete.
 * Idempotent: tombstoning a tombstoned cell is a no-op.
 */
function tombstone({ namespace, table, rowKey = '', colKey = '', reason = null }) {
  requireBootstrapped(namespace);
  const cell = store.readCell(namespace, table, rowKey, colKey);
  if (!cell) {
    const err = new Error(
      `cannot tombstone void coord (${namespace},${table},${rowKey},${colKey})`
    );
    err.code = 'TOMBSTONE_ON_VOID';
    err.strict = true;
    throw err;
  }
  if (cell.value_kind === 'tombstone') {
    return {
      addr_hash: cell.addr_hash, changed: false,
      state: 'tombstoned', level: cell.level,
    };
  }
  const envelope = { _tombstone: true, reason, ts: Date.now() };
  const result = store.upsertCell({
    namespace, table, rowKey, colKey, level: cell.level,
    value: envelope, value_kind: 'tombstone',
  });
  const frame = store.pushDelta(cell.addr_hash, envelope);
  return { ...result, state: 'tombstoned', frame };
}

module.exports = {
  setPoint, appendLine, appendWidth, crossPlane,
  pushDelta, accumulateVolume, sealM, tombstone,
};
