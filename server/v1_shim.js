/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v1 SHIM — thin lens over v2
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The v1 URL surface (cell/row/table/stack/query/schema/tables/stats) expressed
 * as 13 thin handlers forwarding to the v2 dimensional primitives.  No auth
 * (PoC); namespaces auto-bootstrap on first write.  Response shapes match the
 * legacy server just enough for `tetracubedb/client/tetracube_client.js` and
 * the kensgames portal adapter to keep running unchanged.
 *
 *   Dimension assignment for the shim:
 *     /v1/cell .. POST     → D3 appendWidth   (row + col → record field)
 *     /v1/stack .. POST    → D5 pushDelta     (temporal append)
 *     /v1/cell .. DELETE   → tombstone        (soft delete + history)
 *
 *   Schemas ride as cells in __tcdb__ / _v1_schemas / ns:table / _.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const express = require('express');
const store = require('./v2/store');
const ops = require('./v2/operations');
const archive = require('./v2/archive');
const gyroid = require('./gyroid_core');

const SCHEMA_TABLE = '_v1_schemas';

function _ensureNs(ns) {
  if (!store.isBootstrapped(ns)) store.bootstrapNamespace(ns);
}

function _cellToV1(cell) {
  if (!cell) return null;
  return {
    addr_hash: cell.addr_hash,
    namespace: cell.namespace,
    table_name: cell.table_name,
    row_key: cell.row_key,
    col_key: cell.col_key,
    dim: cell.level,
    gx: cell.gx, gy: cell.gy, gz: cell.gz,
    value: cell.value,
    created_at: cell.created_at,
    updated_at: cell.updated_at,
    state: cell.state,
  };
}

function _strict(res, err) {
  const status = err.strict ? 400 : 500;
  return res.status(status).json({
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    detail: err.detail || err.message || null,
    message: err.message || null,
    strict: !!err.strict,
  });
}

function _send(res, fn) {
  try { return res.json(fn()); }
  catch (err) { return _strict(res, err); }
}

function createShim() {
  const r = express.Router();

  // ── Health + stats ────────────────────────────────────────────────────────
  r.get('/v1/stats', (_req, res) => _send(res, () => {
    const d = store.db();
    const one = (sql) => d.prepare(sql).get().n;
    return {
      cells: one('SELECT COUNT(*) AS n FROM v2_cells'),
      stacks_hot: one('SELECT COUNT(*) AS n FROM v2_stack_hot'),
      stacks_cold: one('SELECT COUNT(*) AS n FROM v2_stack_cold'),
      namespaces: one('SELECT COUNT(*) AS n FROM v2_namespaces'),
      schema_version: store.SCHEMA_VERSION,
    };
  }));

  // ── Cell endpoints ────────────────────────────────────────────────────────
  r.post('/v1/cell/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    const { value } = req.body || {};
    if (value === undefined) {
      const e = new Error('body.value required');
      e.code = 'VALUE_REQUIRED'; e.strict = true; throw e;
    }
    _ensureNs(ns);
    const result = ops.appendWidth({
      namespace: ns, table, rowKey: row, colKey: col, value,
    });
    return { ok: true, ...result };
  }));

  r.get('/v1/cell/:ns/:table/:row/:col', (req, res) => {
    const { ns, table, row, col } = req.params;
    try {
      const cell = store.readCell(ns, table, row, col);
      if (!cell) return res.status(404).json({ error: 'Not found' });
      return res.json(_cellToV1(cell));
    } catch (err) { return _strict(res, err); }
  });

  r.delete('/v1/cell/:ns/:table/:row/:col', (req, res) => {
    const { ns, table, row, col } = req.params;
    try {
      _ensureNs(ns);
      const cell = store.readCell(ns, table, row, col);
      if (!cell) return res.status(404).json({ error: 'Not found' });
      ops.tombstone({ namespace: ns, table, rowKey: row, colKey: col });
      return res.json({ ok: true });
    } catch (err) { return _strict(res, err); }
  });

  // ── Row endpoints (D3 WIDTH) ──────────────────────────────────────────────
  r.get('/v1/row/:ns/:table/:row', (req, res) => {
    const { ns, table, row } = req.params;
    try {
      const cells = store.scanPlane(ns, table, { limit: 10000 })
        .filter((c) => c.row_key === row && c.value_kind !== 'tombstone');
      if (!cells.length) return res.status(404).json({ error: 'Not found' });
      const record = { _row: row, _dim: 3 };
      for (const c of cells) if (c.col_key) record[c.col_key] = c.value;
      record._gyroid = { gx: cells[0].gx, gy: cells[0].gy, gz: cells[0].gz };
      return res.json(record);
    } catch (err) { return _strict(res, err); }
  });

  r.delete('/v1/row/:ns/:table/:row', (req, res) => _send(res, () => {
    const { ns, table, row } = req.params;
    _ensureNs(ns);
    const cells = store.scanPlane(ns, table, { limit: 10000 })
      .filter((c) => c.row_key === row && c.value_kind !== 'tombstone');
    let n = 0;
    for (const c of cells) {
      ops.tombstone({ namespace: ns, table, rowKey: c.row_key, colKey: c.col_key });
      n += 1;
    }
    return { ok: true, deleted: n };
  }));

  // ── Table endpoints (D4 PLANE) ────────────────────────────────────────────
  r.get('/v1/table/:ns/:table', (req, res) => _send(res, () => {
    const { ns, table } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 10000);
    const offset = parseInt(req.query.offset || '0', 10);
    const cells = store.scanPlane(ns, table, { limit, offset });
    const total = store.db().prepare(
      'SELECT COUNT(*) AS n FROM v2_cells WHERE namespace=? AND table_name=?'
    ).get(ns, table).n;
    return {
      _dim: 4, namespace: ns, table, total,
      rows: cells.map((c) => _cellToV1(c)),
    };
  }));

  // ── Stack endpoints (D5 STACK) ────────────────────────────────────────────
  r.post('/v1/stack/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    const { delta } = req.body || {};
    if (delta === undefined) {
      const e = new Error('body.delta required');
      e.code = 'DELTA_REQUIRED'; e.strict = true; throw e;
    }
    _ensureNs(ns);
    // Auto-create the cell if void (v1 behavior).
    if (!store.readCell(ns, table, row, col)) {
      ops.appendWidth({ namespace: ns, table, rowKey: row, colKey: col, value: null });
    }
    const result = ops.pushDelta({ namespace: ns, table, rowKey: row, colKey: col, delta });
    return { ok: true, ...result };
  }));

  r.get('/v1/stack/:ns/:table/:row/:col', (req, res) => _send(res, () => {
    const { ns, table, row, col } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 5000);
    const cell = store.readCell(ns, table, row, col);
    if (!cell) return { _dim: 5, addr: null, frames: [] };
    const frames = archive.readStack(cell.addr_hash, { limit })
      .map((f) => ({ seq: f.seq, delta: f.delta, at: f.recorded_at }))
      .reverse(); // v1 returned ASC seq
    return { _dim: 5, addr: cell.addr_hash, frames };
  }));

  // ── Gyroid radius query ───────────────────────────────────────────────────
  r.post('/v1/query/radius', (req, res) => _send(res, () => {
    const { namespace, gx, gy, gz, radius = 0.5, limit = 100 } = req.body || {};
    if (!namespace || gx === undefined || gy === undefined || gz === undefined) {
      const e = new Error('namespace, gx, gy, gz required');
      e.code = 'RADIUS_ARGS_REQUIRED'; e.strict = true; throw e;
    }
    const cap = Math.min(limit, 1000);
    const rows = store.db().prepare(`
      SELECT * FROM v2_cells
      WHERE namespace=?
        AND gx BETWEEN ? AND ?
        AND gy BETWEEN ? AND ?
        AND gz BETWEEN ? AND ?
      LIMIT ?
    `).all(
      namespace,
      gx - radius, gx + radius,
      gy - radius, gy + radius,
      gz - radius, gz + radius,
      cap * 3,
    );
    const results = rows
      .filter((r2) => {
        const dx = r2.gx - gx, dy = r2.gy - gy, dz = r2.gz - gz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
      })
      .slice(0, cap)
      .map((r2) => _cellToV1({ ...r2, value: JSON.parse(r2.value_json) }));
    return { _dim: 6, center: { gx, gy, gz }, radius, results };
  }));

  // ── Schema (cell in __tcdb__/_v1_schemas/ns:table/_) ──────────────────────
  r.get('/v1/schema/:ns/:table', (req, res) => {
    const { ns, table } = req.params;
    try {
      const cell = store.readCell(store.SYS_NS, SCHEMA_TABLE, `${ns}:${table}`, '_');
      if (!cell) return res.status(404).json({ error: 'No schema defined' });
      return res.json({
        namespace: ns, table_name: table,
        schema: cell.value, updated_at: cell.updated_at,
      });
    } catch (err) { return _strict(res, err); }
  });

  r.put('/v1/schema/:ns/:table', (req, res) => _send(res, () => {
    const { ns, table } = req.params;
    _ensureNs(store.SYS_NS);
    ops.appendWidth({
      namespace: store.SYS_NS, table: SCHEMA_TABLE,
      rowKey: `${ns}:${table}`, colKey: '_',
      value: req.body || {},
    });
    return { ok: true };
  }));

  // ── Namespace + table listing ─────────────────────────────────────────────
  r.get('/v1/namespaces', (_req, res) => _send(res, () => {
    return store.listNamespaces().map((n) => ({
      namespace: n.namespace,
      tables: store.db().prepare(
        'SELECT COUNT(DISTINCT table_name) AS n FROM v2_cells WHERE namespace=?'
      ).get(n.namespace).n,
      cells: store.db().prepare(
        'SELECT COUNT(*) AS n FROM v2_cells WHERE namespace=?'
      ).get(n.namespace).n,
    }));
  }));

  r.get('/v1/tables/:ns', (req, res) => _send(res, () => {
    const { ns } = req.params;
    return store.db().prepare(`
      SELECT table_name,
             COUNT(*) AS cell_count,
             MAX(updated_at) AS last_updated
      FROM v2_cells WHERE namespace=?
      GROUP BY table_name ORDER BY table_name ASC
    `).all(ns);
  }));

  return r;
}

module.exports = { createShim };
