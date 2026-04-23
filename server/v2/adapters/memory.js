/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — MEMORY ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 * Zero-dependency in-process reference.  State is held in Maps; nothing is
 * persisted across process restarts.  Used for tests, ephemeral nodes, and
 * as the baseline that proves the adapter boundary.
 *
 * Factory: create({ now? }) returns a fresh, isolated adapter instance.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

function create({ now = () => Math.floor(Date.now() / 1000) } = {}) {
  const cells = new Map();  // addr_hash        -> Cell
  const stackHot = new Map();  // addr_hash        -> Frame[] (seq-ascending)
  const stackCold = new Map();  // addr_hash        -> ColdFrame[]
  const externs = new Map();  // addr_hash        -> Extern
  const namespaces = new Map();  // name             -> NS

  let _initialized = false;

  const api = {
    name: () => 'memory',
    init() { _initialized = true; },

    // ── cells ───────────────────────────────────────────────────────────────
    getCell(addr) { return cells.get(addr) || null; },
    putCell(c) {
      const ts = now();
      const existing = cells.get(c.addr_hash);
      cells.set(c.addr_hash, {
        addr_hash: c.addr_hash,
        namespace: c.namespace,
        table_name: c.table_name,
        row_key: c.row_key || '',
        col_key: c.col_key || '',
        level: c.level,
        fib_scale: c.fib_scale,
        gx: c.gx, gy: c.gy, gz: c.gz,
        value_kind: c.value_kind || 'inline',
        value_json: c.value_json,
        identity: c.identity,
        physics_ref: c.physics_ref || null,
        tier: c.tier || 'hot',
        created_at: existing ? existing.created_at : ts,
        updated_at: ts,
      });
    },
    getCellByCoord(ns, tbl, row, col) {
      const r = row || '', c = col || '';
      let best = null;
      for (const v of cells.values()) {
        if (v.namespace === ns && v.table_name === tbl &&
          v.row_key === r && v.col_key === c) {
          if (!best || v.level > best.level) best = v;
        }
      }
      return best;
    },
    scanPlane(ns, tbl, { limit = 1000, offset = 0 } = {}) {
      const out = [];
      for (const v of cells.values()) {
        if (v.namespace === ns && v.table_name === tbl) out.push(v);
      }
      out.sort((a, b) =>
        a.row_key.localeCompare(b.row_key) || a.col_key.localeCompare(b.col_key));
      return out.slice(offset, offset + limit);
    },
    findCellByCoords(gx, gy, gz, eps = 1e-4) {
      for (const v of cells.values()) {
        if (Math.abs(v.gx - gx) < eps &&
          Math.abs(v.gy - gy) < eps &&
          Math.abs(v.gz - gz) < eps) return v;
      }
      return null;
    },

    // ── z-stack ─────────────────────────────────────────────────────────────
    getHotFrames(addr, limit = 50) {
      const arr = stackHot.get(addr) || [];
      return arr.slice(-limit).reverse();
    },
    getHotTopFrame(addr) {
      const arr = stackHot.get(addr);
      return arr && arr.length ? arr[arr.length - 1] : null;
    },
    putHotFrame(f) {
      let arr = stackHot.get(f.addr_hash);
      if (!arr) { arr = []; stackHot.set(f.addr_hash, arr); }
      arr.push({
        addr_hash: f.addr_hash, seq: f.seq,
        delta_json: f.delta_json, hash: f.hash,
        recorded_at: now(), tier: 'hot'
      });
    },
    deleteHotFrame(addr, seq) {
      const arr = stackHot.get(addr);
      if (!arr) return;
      const i = arr.findIndex((f) => f.seq === seq);
      if (i >= 0) arr.splice(i, 1);
    },
    getColdFrames(addr, limit = 50) {
      const arr = stackCold.get(addr) || [];
      return arr.slice(-limit).reverse();
    },
    putColdFrame(f) {
      let arr = stackCold.get(f.addr_hash);
      if (!arr) { arr = []; stackCold.set(f.addr_hash, arr); }
      arr.push({ ...f });
    },
    listHotAddrsWithCount() {
      const out = [];
      for (const [addr, arr] of stackHot) out.push({ addr_hash: addr, n: arr.length });
      return out;
    },

    // ── externs ─────────────────────────────────────────────────────────────
    getExtern(addr) { return externs.get(addr) || null; },
    putExtern(e) {
      const prior = externs.get(e.addr_hash);
      externs.set(e.addr_hash, {
        addr_hash: e.addr_hash, uri: e.uri, origin: e.origin || '',
        handshake_ref: e.handshake_ref || null,
        last_fetch: e.last_fetch || null,
        etag: e.etag != null ? e.etag : (prior ? prior.etag : null),
      });
    },

    // ── namespaces ──────────────────────────────────────────────────────────
    getNamespace(name) { return namespaces.get(name) || null; },
    putNamespace(ns) {
      if (namespaces.has(ns.namespace)) return;
      namespaces.set(ns.namespace,
        { namespace: ns.namespace, seed_addr: ns.seed_addr, created_at: now() });
    },
    listNamespaces() {
      return Array.from(namespaces.values())
        .sort((a, b) => a.namespace.localeCompare(b.namespace));
    },

    // ── debug / introspection (non-contract) ────────────────────────────────
    _dump() { return { cells, stackHot, namespaces, externs }; },
    _initialized: () => _initialized,
  };
  return api;
}

module.exports = { create };
