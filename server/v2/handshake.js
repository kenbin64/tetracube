/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — HANDSHAKE (scope-entry / M-boundary crossing)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Handshakes are deltas (AGENTS.md §3.13): a status transition from
 * pending → accepted.  They live as cells inside the system namespace
 * __tcdb__ at (table='handshakes', row=knock_hash, col=nonce).  No
 * dedicated storage primitive exists for them — the adapter contract
 * only needs upsertCell / scanPlane / pushDelta.
 *
 *   knock   — negotiates scope entry.  Writes a D3 cell with status='pending'.
 *   accept  — flips status to 'accepted'; pushes an audit frame on the stack.
 *   oneshot — accepts a single payload reference.  Stores the handshake as
 *             a D3 cell with status='accepted', plus an extern row pinning
 *             the URI (origin data is NEVER copied inside).
 *   list    — scanPlane lens over (__tcdb__, handshakes).
 *   verifyAccepted(knock_hash, nonce) — used by motion.ascendM.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const crypto = require('crypto');
const gyroid = require('../gyroid_core');
const store = require('./store');

const HS_TABLE = 'handshakes';

function _addrStr(a) {
  return `${a.gx.toFixed(6)}:${a.gy.toFixed(6)}:${a.gz.toFixed(6)}`;
}

function _invalid(msg) {
  const err = new Error(msg);
  err.code = 'INVALID_HANDSHAKE';
  err.strict = true;
  return err;
}

function _readHandshake(knock_hash, nonce) {
  return store.readCell(store.SYS_NS, HS_TABLE, knock_hash, nonce, 3);
}

/**
 * Record a knock and return the token.  Status='pending' until a subsequent
 * accept() call resolves it.  Idempotent: re-knocking with the same token
 * returns the existing pending record.
 */
function knock({ from, to }) {
  store.initSchemaV2();
  if (!from || !to) throw _invalid('knock requires from and to gyroid addresses');
  const token = gyroid.knockNeighbor(from.gx, from.gy, from.gz, to.gx, to.gy, to.gz);
  const existing = _readHandshake(token.knock, token.nonce);
  if (existing) {
    return {
      knock: token.knock, nonce: token.nonce,
      from: token.from, to: token.to,
      status: existing.value.status,
    };
  }
  store.upsertCell({
    namespace: store.SYS_NS, table: HS_TABLE,
    rowKey: token.knock, colKey: token.nonce, level: 3,
    value: {
      kind: 'knock',
      from_addr: _addrStr(token.from), to_addr: _addrStr(token.to),
      nonce: token.nonce, knock_hash: token.knock,
      status: 'pending', created_at: Date.now(),
    },
  });
  return { ...token, status: 'pending' };
}

/**
 * Accept a pending knock.  Idempotent: accepting an already-accepted knock
 * returns the existing state unchanged.
 */
function accept({ knock_hash, nonce }) {
  store.initSchemaV2();
  const cell = _readHandshake(knock_hash, nonce);
  if (!cell || cell.value.kind !== 'knock') {
    const err = new Error('unknown knock');
    err.code = 'UNKNOWN_KNOCK';
    err.strict = true;
    throw err;
  }
  if (cell.value.status === 'accepted') {
    return { knock_hash, nonce, status: 'accepted' };
  }
  const next = { ...cell.value, status: 'accepted', accepted_at: Date.now() };
  store.upsertCell({
    namespace: store.SYS_NS, table: HS_TABLE,
    rowKey: knock_hash, colKey: nonce, level: 3, value: next,
  });
  store.pushDelta(cell.addr_hash, { status: 'accepted', at: next.accepted_at });
  return { knock_hash, nonce, status: 'accepted' };
}

/**
 * Check whether a (knock_hash, nonce) maps to an accepted handshake.  Used by
 * motion.ascendM.  Returns true / false; does not throw.
 */
function verifyAccepted(knock_hash, nonce) {
  if (!knock_hash || !nonce) return false;
  const cell = _readHandshake(knock_hash, nonce);
  return !!(cell && cell.value && cell.value.status === 'accepted');
}

/**
 * One-shot: accept a URI pointer from an outside source without granting
 * scope.  Writes a D3 handshake cell (kind=oneshot, status=accepted) and
 * pins the URI in the extern map with handshake_ref = handshake addr_hash.
 * Origin data is NEVER copied inside the manifold.
 */
function oneshot({ origin, uri, etag = null }) {
  store.initSchemaV2();
  if (!uri) throw _invalid('oneshot requires a uri');
  const nonce = crypto.randomBytes(16).toString('hex');
  const knock_hash = crypto.createHash('sha256')
    .update(`oneshot:${origin || ''}:${uri}:${nonce}`).digest('hex');
  const extern_addr = crypto.createHash('sha256')
    .update(`extern:${origin || ''}:${uri}`).digest('hex');

  const hs = store.upsertCell({
    namespace: store.SYS_NS, table: HS_TABLE,
    rowKey: knock_hash, colKey: nonce, level: 3,
    value: {
      kind: 'oneshot', from_addr: origin || '', to_addr: '',
      nonce, knock_hash, status: 'accepted',
      uri, created_at: Date.now(),
    },
  });
  const a = store.getAdapter();
  a.putExtern({
    addr_hash: extern_addr, uri, origin: origin || '',
    handshake_ref: hs.addr_hash, etag,
  });
  return { addr_hash: extern_addr, uri, origin, handshake_ref: hs.addr_hash, nonce };
}

/**
 * List handshakes (admin / debug).  Bounded scan over (__tcdb__, handshakes).
 */
function list({ limit = 100 } = {}) {
  store.initSchemaV2();
  const rows = store.scanPlane(store.SYS_NS, HS_TABLE, { limit });
  return rows.map((r) => ({
    addr_hash: r.addr_hash,
    kind: r.value.kind, status: r.value.status,
    from_addr: r.value.from_addr, to_addr: r.value.to_addr,
    knock_hash: r.value.knock_hash, nonce: r.value.nonce,
    created_at: r.value.created_at,
  }));
}

module.exports = { knock, accept, oneshot, list, verifyAccepted, HS_TABLE };
