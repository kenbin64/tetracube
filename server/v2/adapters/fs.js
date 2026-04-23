/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — FILESYSTEM ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directory layout (portable to any POSIX-like filesystem — local, FUSE,
 * S3fs, SMB, IPFS-mount, etc.):
 *
 *   <root>/
 *     _ns/<namespace>.json                — NS record
 *     cells/<shard>/<addr>.cell.json      — Cell record
 *     cells/<shard>/<addr>.hot.jsonl      — Hot Frame[] (append-only)
 *     cells/<shard>/<addr>.cold.jsonl     — ColdFrame[] (base64 gz deltas)
 *     cells/<shard>/<addr>.extern.json    — Extern
 *
 * Factory: create({ root }) returns an adapter bound to that root.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

function create({ root }) {
  if (!root) throw new Error('fs adapter: root path required');
  const P = {
    ns: (n) => path.join(root, '_ns', `${n}.json`),
    shard: (addr) => path.join(root, 'cells', addr.slice(0, 2)),
    cell: (addr) => path.join(P.shard(addr), `${addr}.cell.json`),
    hot: (addr) => path.join(P.shard(addr), `${addr}.hot.jsonl`),
    cold: (addr) => path.join(P.shard(addr), `${addr}.cold.jsonl`),
    extern: (addr) => path.join(P.shard(addr), `${addr}.extern.json`),
  };
  const now = () => Math.floor(Date.now() / 1000);
  const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); };
  const readJSONL = (p) => { try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
  const appendJSONL = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, JSON.stringify(o) + '\n'); };

  function init() {
    fs.mkdirSync(path.join(root, '_ns'), { recursive: true });
    fs.mkdirSync(path.join(root, 'cells'), { recursive: true });
  }

  function walkCells() {
    const dir = path.join(root, 'cells');
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const shard of fs.readdirSync(dir)) {
      const sp = path.join(dir, shard);
      if (!fs.statSync(sp).isDirectory()) continue;
      for (const f of fs.readdirSync(sp)) {
        if (!f.endsWith('.cell.json')) continue;
        const c = readJSON(path.join(sp, f));
        if (c) out.push(c);
      }
    }
    return out;
  }

  return {
    name: () => 'fs',
    init,

    // ── cells ───────────────────────────────────────────────────────────────
    getCell: (addr) => readJSON(P.cell(addr)),
    putCell(c) {
      const p = P.cell(c.addr_hash);
      const prior = readJSON(p);
      const ts = now();
      writeJSON(p, {
        addr_hash: c.addr_hash, namespace: c.namespace, table_name: c.table_name,
        row_key: c.row_key || '', col_key: c.col_key || '',
        level: c.level, fib_scale: c.fib_scale,
        gx: c.gx, gy: c.gy, gz: c.gz,
        value_kind: c.value_kind || 'inline', value_json: c.value_json,
        identity: c.identity, physics_ref: c.physics_ref || null,
        tier: c.tier || 'hot',
        created_at: prior ? prior.created_at : ts, updated_at: ts,
      });
    },
    getCellByCoord(ns, tbl, row, col) {
      const r = row || '', c = col || '';
      let best = null;
      for (const v of walkCells()) {
        if (v.namespace === ns && v.table_name === tbl && v.row_key === r && v.col_key === c) {
          if (!best || v.level > best.level) best = v;
        }
      }
      return best;
    },
    scanPlane(ns, tbl, { limit = 1000, offset = 0 } = {}) {
      const out = walkCells().filter((v) => v.namespace === ns && v.table_name === tbl);
      out.sort((a, b) =>
        a.row_key.localeCompare(b.row_key) || a.col_key.localeCompare(b.col_key));
      return out.slice(offset, offset + limit);
    },
    findCellByCoords(gx, gy, gz, eps = 1e-4) {
      for (const v of walkCells()) {
        if (Math.abs(v.gx - gx) < eps && Math.abs(v.gy - gy) < eps && Math.abs(v.gz - gz) < eps) return v;
      }
      return null;
    },

    // ── z-stack ─────────────────────────────────────────────────────────────
    getHotFrames(addr, limit = 50) {
      const arr = readJSONL(P.hot(addr));
      return arr.slice(-limit).reverse();
    },
    getHotTopFrame(addr) {
      const arr = readJSONL(P.hot(addr));
      return arr.length ? arr[arr.length - 1] : null;
    },
    putHotFrame(f) {
      appendJSONL(P.hot(f.addr_hash), { ...f, recorded_at: now(), tier: 'hot' });
    },
    deleteHotFrame(addr, seq) {
      const arr = readJSONL(P.hot(addr)).filter((f) => f.seq !== seq);
      fs.writeFileSync(P.hot(addr), arr.map((f) => JSON.stringify(f)).join('\n') + (arr.length ? '\n' : ''));
    },
    getColdFrames(addr, limit = 50) {
      return readJSONL(P.cold(addr)).slice(-limit).reverse();
    },
    putColdFrame(f) {
      appendJSONL(P.cold(f.addr_hash), {
        ...f, delta_gz_b64: Buffer.from(f.delta_gz).toString('base64'),
      });
    },
    listHotAddrsWithCount() {
      const dir = path.join(root, 'cells');
      if (!fs.existsSync(dir)) return [];
      const out = [];
      for (const shard of fs.readdirSync(dir)) {
        const sp = path.join(dir, shard);
        if (!fs.statSync(sp).isDirectory()) continue;
        for (const f of fs.readdirSync(sp)) {
          if (!f.endsWith('.hot.jsonl')) continue;
          const addr = f.slice(0, -('.hot.jsonl'.length));
          out.push({ addr_hash: addr, n: readJSONL(path.join(sp, f)).length });
        }
      }
      return out;
    },

    // ── externs ─────────────────────────────────────────────────────────────
    getExtern: (addr) => readJSON(P.extern(addr)),
    putExtern(e) {
      const prior = readJSON(P.extern(e.addr_hash));
      writeJSON(P.extern(e.addr_hash), {
        addr_hash: e.addr_hash, uri: e.uri, origin: e.origin || '',
        handshake_ref: e.handshake_ref || null,
        last_fetch: e.last_fetch || null,
        etag: e.etag != null ? e.etag : (prior ? prior.etag : null),
      });
    },

    // ── namespaces ──────────────────────────────────────────────────────────
    getNamespace: (name) => readJSON(P.ns(name)),
    putNamespace(ns) {
      if (fs.existsSync(P.ns(ns.namespace))) return;
      writeJSON(P.ns(ns.namespace), {
        namespace: ns.namespace, seed_addr: ns.seed_addr, created_at: now(),
      });
    },
    listNamespaces() {
      const dir = path.join(root, '_ns');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJSON(path.join(dir, f)))
        .filter(Boolean)
        .sort((a, b) => a.namespace.localeCompare(b.namespace));
    },
  };
}

module.exports = { create };
