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
const directives = require('./directives');
const lens = require('./lens');
const dims = require('./dimensions');
const dimensionOS = require('../dimensionOS');

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

  // Directive registry + substrate pointer ingestion
  r.post('/directives/register', (req, res) => _send(res, () => directives.registerDirective(req.body || {})));
  r.get('/directives/:namespace/:directive_id', (req, res) => _send(res, () => {
    const { namespace, directive_id } = req.params;
    const row = directives.getDirective(namespace, directive_id);
    if (!row) {
      const err = new Error(`directive not found: ${namespace}/${directive_id}`);
      err.code = 'UNKNOWN_DIRECTIVE';
      err.strict = true;
      throw err;
    }
    return row;
  }));
  r.get('/directives/:namespace', (req, res) => _send(res, () => {
    const { namespace } = req.params;
    const limit = parseInt(req.query.limit || '200', 10);
    return directives.listDirectives({ namespace, limit });
  }));
  r.post('/directives/pointer/ingest', (req, res) => _send(res, () => directives.ingestPointer(req.body || {})));

  // ── Lens: geometric extraction (dimensionOS) ──────────────────────────────
  // Extract the geometric profile of any manifold coordinate.
  // Data is derived from the gyroid surface equation — not from stored cells.
  // Stored cells, if present, appear as an overlay on top of the geometry.
  //
  //   GET /lens/:namespace/:table/:rowKey/:colKey?level=3
  //     → full extraction: geometry + overlay (if any)
  //
  //   GET /lens/surface?gx=1.2&gy=0.7
  //     → raw surface profile at given gyroid coordinates (no namespace)
  //
  //   GET /lens/scan?gxMin=0&gxMax=6.28&gyMin=0&gyMax=6.28&steps=8
  //     → scan a region of the manifold surface
  //
  r.get('/lens/surface', (req, res) => _send(res, () => {
    const gx = parseFloat(req.query.gx);
    const gy = parseFloat(req.query.gy);
    const gz = req.query.gz !== undefined ? parseFloat(req.query.gz) : null;
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      const err = new Error('gx and gy query parameters are required and must be numbers');
      err.code = 'INVALID_COORDS';
      err.strict = true;
      throw err;
    }
    return lens.surfaceAt(gx, gy, gz);
  }));

  r.get('/lens/scan', (req, res) => _send(res, () => {
    const gxMin = parseFloat(req.query.gxMin ?? '0');
    const gxMax = parseFloat(req.query.gxMax ?? String(2 * Math.PI));
    const gyMin = parseFloat(req.query.gyMin ?? '0');
    const gyMax = parseFloat(req.query.gyMax ?? String(2 * Math.PI));
    const steps = parseInt(req.query.steps || '8', 10);
    return lens.scanSurface([gxMin, gxMax], [gyMin, gyMax], steps);
  }));

  r.get('/lens/:namespace/:table/:rowKey/:colKey', (req, res) => _send(res, () => {
    const { namespace, table, rowKey, colKey } = req.params;
    const level = parseInt(req.query.level || '1', 10);
    return lens.extract(namespace, table, rowKey, colKey, level);
  }));

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

  // ── dimensionOS: manifold identity + substrate registry ──────────────────
  // dimensionOS.net is the extraction layer: domains resolve to substrates,
  // not files.  These routes expose the OS identity and substrate registry.
  //
  //   GET  /dimensionos/identity       — read the D7 root identity cell
  //   GET  /dimensionos/substrates     — list registered substrates
  //   POST /dimensionos/substrates     — register a substrate
  //
  r.get('/dimensionos/identity', (_req, res) => _send(res, () => {
    const cell = dimensionOS.readIdentity();
    if (!cell) {
      // Not yet seeded — seed it now and return
      dimensionOS.seedIdentity();
      return dimensionOS.readIdentity();
    }
    return cell;
  }));

  r.get('/dimensionos/substrates', (req, res) => _send(res, () => {
    const limit = parseInt(req.query.limit || '200', 10);
    return dimensionOS.listSubstrates({ limit });
  }));

  r.post('/dimensionos/substrates', (req, res) => _send(res, () =>
    dimensionOS.registerSubstrate(req.body || {})
  ));

  return r;
}

module.exports = { createRouter };
