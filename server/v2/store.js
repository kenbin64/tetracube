/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — MANIFOLD ORCHESTRATOR (adapter-based)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module is pure dimensional logic: address hashing, identity gating,
 * delta framing, neighbor materialization, namespace bootstrap.  It contains
 * no storage code.  All persistence goes through the registered adapter
 * (see ./adapter.js for the contract).
 *
 * Default adapter: ./adapters/sqlite.js (loaded lazily on first use).
 * Swap with setAdapter() to run against fs, memory, or any conforming backend.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const crypto = require('crypto');
const gyroid = require('../gyroid_core');
const dims = require('./dimensions');
const { assertConforms } = require('./adapter');

const SCHEMA_VERSION = '2.0.0';
let _adapter = null;

function _defaultAdapter() {
  return require('./adapters/sqlite');
}

function getAdapter() {
  if (!_adapter) _adapter = assertConforms(_defaultAdapter());
  return _adapter;
}

function setAdapter(adapter) {
  _adapter = assertConforms(adapter);
  _adapter.init();
  return _adapter;
}

function db() {
  const a = getAdapter();
  if (typeof a.db !== 'function') {
    const err = new Error(`adapter '${a.name()}' does not expose a raw db handle`);
    err.code = 'ADAPTER_NO_DB';
    err.strict = true;
    throw err;
  }
  return a.db();
}

// The system namespace — cells under `__tcdb__` model handshakes, identity,
// policy, schema, extern origins (see AGENTS.md §17).  Auto-bootstrapped on
// first init so any subsystem can write into it without a special call.
const SYS_NS = '__tcdb__';

function initSchemaV2() {
  const a = getAdapter();
  a.init();
  if (!a.getNamespace(SYS_NS)) {
    const seed = upsertCell({
      namespace: SYS_NS, table: '_origin', rowKey: '0', colKey: '0',
      level: 1, value: { origin: true, system: true, ts: Date.now() },
    });
    a.putNamespace({ namespace: SYS_NS, seed_addr: seed.addr_hash });
  }
}

// ── Address + identity helpers ────────────────────────────────────────────────

function _addrHash(namespace, table, rowKey, colKey, level) {
  return crypto.createHash('sha256')
    .update(`v2:${namespace}:${table}:${rowKey}:${colKey}:L${level}`)
    .digest('hex');
}

function _identityOf(value) {
  // Stable canonical JSON → sha256.  Same value ⇒ same identity ⇒ dedup key.
  const canonical = JSON.stringify(value, Object.keys(value || {}).sort());
  return crypto.createHash('sha256').update(canonical || 'null').digest('hex');
}

function _coords(namespace, table, rowKey, colKey) {
  return gyroid.addressToGyroid(namespace, table, rowKey || null, colKey || null);
}

// ── Cell CRUD (v2) ────────────────────────────────────────────────────────────

/**
 * Upsert a v2 cell.  Enforces:
 *   - level ∈ [1,7]  (VOID is read-only; bootstrap writes a D1 seed)
 *   - fib_scale = DIM_FIB[level]
 *   - delta-gate: no-op if identity unchanged (returns {changed:false})
 * Returns { addr_hash, changed, identity, gx, gy, gz, level }.
 */
function upsertCell({
  namespace, table, rowKey = '', colKey = '',
  level, value, value_kind = 'inline',
  physics_ref = null, fib_scale,
}) {
  const a = getAdapter();
  a.init();
  if (level === 0) {
    const err = new Error('D0 VOID cannot be written directly; use namespace bootstrap');
    err.code = 'VOID_WRITE_FORBIDDEN';
    err.strict = true;
    throw err;
  }
  dims.assertLevel(level);
  const fs = dims.assertFibScale(level, fib_scale);

  const addr = _addrHash(namespace, table, rowKey, colKey, level);
  const identity = _identityOf(value);
  const { gx, gy, gz } = _coords(namespace, table, rowKey, colKey);
  const value_json = JSON.stringify(value);

  const prior = a.getCell(addr);
  if (prior && prior.identity === identity) {
    return { addr_hash: addr, changed: false, identity, gx, gy, gz, level };
  }

  a.putCell({
    addr_hash: addr, namespace, table_name: table,
    row_key: rowKey, col_key: colKey,
    level, fib_scale: fs, gx, gy, gz,
    value_kind, value_json, identity, physics_ref, tier: 'hot',
  });

  return { addr_hash: addr, changed: true, identity, gx, gy, gz, level };
}

/**
 * Read a cell by address.  Returns null on void (no row).
 */
function readCell(namespace, table, rowKey = '', colKey = '', level = null) {
  const a = getAdapter();
  a.init();
  if (level !== null) {
    const addr = _addrHash(namespace, table, rowKey, colKey, level);
    const row = a.getCell(addr);
    return row ? _hydrate(row) : null;
  }
  // Level-agnostic: return highest level matching the coord, or null.
  const row = a.getCellByCoord(namespace, table, rowKey, colKey);
  return row ? _hydrate(row) : null;
}

function _hydrate(row) {
  return {
    ...row,
    value: JSON.parse(row.value_json),
    state: row.value_kind === 'tombstone' ? 'tombstoned' : 'live',
  };
}

/**
 * Void-state read — returns a D0 envelope for coords that aren't materialized.
 */
function voidAt(namespace, table, rowKey = '', colKey = '') {
  const { gx, gy, gz } = _coords(namespace, table, rowKey, colKey);
  return Object.freeze({
    level: 0,
    level_name: 'void',
    state: 'void',
    potential: true,
    namespace, table, rowKey, colKey,
    gx, gy, gz,
  });
}

/**
 * Scan a plane (D4): all cells at (namespace, table).
 */
function scanPlane(namespace, table, { limit = 1000, offset = 0 } = {}) {
  const a = getAdapter();
  a.init();
  return a.scanPlane(namespace, table, { limit, offset }).map(_hydrate);
}

// ── Neighbors (geometry, not storage — AGENTS.md §3.11) ──────────────────────

/**
 * Read a cell by addr_hash.  Null on void.  Returns the hydrated cell with
 * parsed value and derived state.
 */
function readCellByAddr(addr_hash) {
  const a = getAdapter();
  a.init();
  const row = a.getCell(addr_hash);
  return row ? _hydrate(row) : null;
}

/**
 * Compute the 6-cardinal neighbors of a cell as pure geometry.  No storage:
 * neighbor coords come from gyroid_core, and neighbor_addr is resolved live
 * by coord-lookup.  Missing neighbors have `state:'void'` and `neighbor_addr:null`.
 */
function getNeighbors(addr_hash, delta = 0.3) {
  const a = getAdapter();
  a.init();
  const cell = a.getCell(addr_hash);
  if (!cell) return [];
  const neighbors = gyroid.neighborAddresses(cell.gx, cell.gy, cell.gz, delta);
  return neighbors.map((n) => {
    const hit = a.findCellByCoords(n.gx, n.gy, n.gz, 1e-4);
    return {
      direction: n.direction,
      neighbor_addr: hit ? hit.addr_hash : null,
      gx: n.gx, gy: n.gy, gz: n.gz,
      state: hit ? 'occupied' : 'void',
    };
  });
}

// ── Z-stack (delta history) ───────────────────────────────────────────────────

/**
 * Append a delta frame to the hot stack.  Delta-gates on hash — if the
 * latest frame's hash matches the new hash, returns {pushed:false}.
 */
function pushDelta(addr_hash, delta) {
  const a = getAdapter();
  a.init();
  const delta_json = JSON.stringify(delta);
  const hash = crypto.createHash('sha256').update(delta_json).digest('hex');
  const latest = a.getHotTopFrame(addr_hash);
  if (latest && latest.hash === hash) {
    return { pushed: false, seq: latest.seq, hash };
  }
  const seq = (latest ? latest.seq : -1) + 1;
  a.putHotFrame({ addr_hash, seq, delta_json, hash });
  return { pushed: true, seq, hash };
}

/**
 * Read the top N frames of a cell's stack (z_max descending, hot tier only).
 */
function readStackHot(addr_hash, { limit = 10 } = {}) {
  const a = getAdapter();
  a.init();
  return a.getHotFrames(addr_hash, limit).map((r) => ({
    seq: r.seq,
    delta: JSON.parse(r.delta_json),
    hash: r.hash,
    recorded_at: r.recorded_at,
    tier: 'hot',
  }));
}

// ── Namespace bootstrap ───────────────────────────────────────────────────────

/**
 * Seed a namespace: records the namespace and writes its D1 origin point at
 * (0,0,0,0).  Idempotent: re-calling returns the existing seed addr.
 */
function bootstrapNamespace(namespace) {
  const a = getAdapter();
  a.init();
  const existing = a.getNamespace(namespace);
  if (existing) return { namespace, seed_addr: existing.seed_addr, bootstrapped: false };

  const seed = upsertCell({
    namespace, table: '_origin', rowKey: '0', colKey: '0',
    level: 1, value: { origin: true, ts: Date.now() },
  });
  a.putNamespace({ namespace, seed_addr: seed.addr_hash });
  return { namespace, seed_addr: seed.addr_hash, bootstrapped: true };
}

function isBootstrapped(namespace) {
  const a = getAdapter();
  a.init();
  return !!a.getNamespace(namespace);
}

function listNamespaces() {
  const a = getAdapter();
  a.init();
  return a.listNamespaces();
}

module.exports = {
  SCHEMA_VERSION, SYS_NS, db, initSchemaV2,
  getAdapter, setAdapter,
  upsertCell, readCell, readCellByAddr, voidAt, scanPlane,
  getNeighbors,
  pushDelta, readStackHot,
  bootstrapNamespace, isBootstrapped, listNamespaces,
  _addrHash, _identityOf, _coords, _hydrate,
};
