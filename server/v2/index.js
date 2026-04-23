/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — HTTP ROUTER
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Exposes the dimensional paradigm under /v2/*:
 *
 *   POST   /v2/namespace/init                — bootstrap a namespace (D0→D1)
 *   GET    /v2/namespaces                    — list namespaces
 *   GET    /v2/cell/:ns/:table/:row/:col     — read cell (void envelope on miss)
 *   DELETE /v2/cell/:ns/:table/:row/:col     — tombstone cell (soft delete)
 *   POST   /v2/op/:verb                      — dimension-typed write verbs
 *   POST   /v2/stack/push                    — D5 pushDelta
 *   GET    /v2/stack/:ns/:table/:row/:col    — read full stack (hot + cold)
 *   GET    /v2/neighbors/:addr               — 6-cardinal edges
 *   POST   /v2/motion/lateral                — moveLateral
 *   POST   /v2/motion/ascend                 — ascendM (requires handshake)
 *   POST   /v2/handshake/knock               — negotiate scope entry
 *   POST   /v2/handshake/accept              — accept a pending knock
 *   POST   /v2/handshake/oneshot             — accept a one-shot URI pointer
 *   POST   /v2/git/resolve                   — resolve a git-backed cell
 *   POST   /v2/git/stack                     — walk git commit history
 *   POST   /v2/archive/run                   — archive cold frames (admin)
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const express = require('express');
const store = require('./store');
const voidMod = require('./void');
const ops = require('./operations');
const motion = require('./motion');
const handshake = require('./handshake');
const git = require('./git');
const archive = require('./archive');
const dims = require('./dimensions');

function strictError(err) {
  // AGENTS.md §3 shape: { success:false, error, detail, strict:true }
  return {
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    detail: err.detail != null ? err.detail : (err.message || null),
    message: err.message || null,
    strict: !!err.strict,
  };
}

function _send(res, fn) {
  try { return res.json(fn()); }
  catch (err) {
    const status = err.strict ? 400 : 500;
    return res.status(status).json(strictError(err));
  }
}

async function _asyncSend(res, fn) {
  try { return res.json(await fn()); }
  catch (err) {
    const status = err.strict ? 400 : 500;
    return res.status(status).json(strictError(err));
  }
}

function createRouter() {
  const r = express.Router();
  store.initSchemaV2();

  // Namespace bootstrap
  r.post('/namespace/init', (req, res) => _send(res, () => {
    const { namespace } = req.body || {};
    return voidMod.init(namespace);
  }));
  r.get('/namespaces', (_req, res) => _send(res, () => store.listNamespaces()));

  // Cell read (void-tolerant)
  r.get('/cell/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    return voidMod.readOrVoid(ns, table, row, col);
  }));

  // Cell tombstone (soft delete — preserves history on the z-stack)
  r.delete('/cell/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    const reason = (req.body && req.body.reason) || null;
    return ops.tombstone({ namespace: ns, table, rowKey: row, colKey: col, reason });
  }));

  // Dimension-typed verbs
  r.post('/op/:verb', (req, res) => _send(res, () => {
    const { verb } = req.params;
    const level = dims.levelForVerb(verb);
    if (level === null) {
      const err = new Error(`unknown verb '${verb}'`);
      err.code = 'UNKNOWN_VERB'; err.strict = true; throw err;
    }
    const fn = ops[verb];
    if (!fn) {
      const err = new Error(`verb '${verb}' not implemented`);
      err.code = 'UNKNOWN_VERB'; err.strict = true; throw err;
    }
    return fn(req.body || {});
  }));

  // Stack
  r.post('/stack/push', (req, res) => _send(res, () => ops.pushDelta(req.body || {})));
  r.get('/stack/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    const limit = parseInt(req.query.limit || '50', 10);
    const cell = store.readCell(ns, table, row, col);
    if (!cell) return { frames: [], state: 'void' };
    return { addr_hash: cell.addr_hash, frames: archive.readStack(cell.addr_hash, { limit }) };
  }));

  // Neighbors + motion
  r.get('/neighbors/:addr', (req, res) => _send(res, () => store.getNeighbors(req.params.addr)));
  r.post('/motion/lateral', (req, res) => _send(res, () => {
    const { addr_hash, direction } = req.body || {};
    return motion.moveLateral(addr_hash, direction);
  }));
  r.post('/motion/ascend', (req, res) => _send(res, () => {
    const { target_namespace, knock_hash, nonce } = req.body || {};
    return motion.ascendM(target_namespace, { knock_hash, nonce });
  }));

  // Handshake
  r.post('/handshake/knock', (req, res) => _send(res, () => handshake.knock(req.body || {})));
  r.post('/handshake/accept', (req, res) => _send(res, () => handshake.accept(req.body || {})));
  r.post('/handshake/oneshot', (req, res) => _send(res, () => handshake.oneshot(req.body || {})));
  r.get('/handshakes', (_req, res) => _send(res, () => handshake.list()));

  // Git-backed cells (async)
  r.post('/git/resolve', (req, res) => _asyncSend(res, () => git.resolve(req.body || {})));
  r.post('/git/stack', (req, res) => _asyncSend(res, () => git.walkStack(req.body || {})));

  // Archive (admin)
  r.post('/archive/run', (req, res) => _send(res, () => {
    const keepHot = parseInt((req.body && req.body.keepHot) || '1', 10);
    return archive.archiveAll({ keepHot });
  }));

  // Health + dimensional metadata
  r.get('/health', (_req, res) => res.json({
    ok: true, service: 'tetracubedb-v2',
    schema: store.SCHEMA_VERSION,
    max_level: dims.MAX_LEVEL,
    fib: dims.FIB,
  }));

  return r;
}

module.exports = { createRouter };
