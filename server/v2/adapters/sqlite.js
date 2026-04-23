/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — SQLITE ADAPTER
 * ═════════════════════════════════════════════════════════════════════════════
 * Reference adapter backing the v2 dimensional layer with SQLite (via the
 * v1 store's shared handle).  Implements the Adapter contract in adapter.js.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/lib/tetracubedb';
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'tetracube.db');

let _handle = null;
let _initialized = false;

function _db() {
  if (_handle) return _handle;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });
  _handle = new Database(DB_PATH);
  _handle.pragma('journal_mode = WAL');
  _handle.pragma('foreign_keys = ON');
  _handle.pragma('synchronous = NORMAL');
  _handle.pragma('cache_size = -32000');
  _handle.pragma('temp_store = MEMORY');
  return _handle;
}

function init() {
  if (_initialized) return;
  _db().exec(`
    CREATE TABLE IF NOT EXISTS v2_namespaces (
      namespace TEXT PRIMARY KEY, seed_addr TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS v2_cells (
      addr_hash TEXT PRIMARY KEY, namespace TEXT NOT NULL, table_name TEXT NOT NULL,
      row_key TEXT NOT NULL DEFAULT '', col_key TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL, fib_scale INTEGER NOT NULL,
      gx REAL NOT NULL, gy REAL NOT NULL, gz REAL NOT NULL,
      value_kind TEXT NOT NULL DEFAULT 'inline', value_json TEXT NOT NULL DEFAULT 'null',
      identity TEXT NOT NULL, physics_ref TEXT, tier TEXT NOT NULL DEFAULT 'hot',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_v2_cells_ns_tbl ON v2_cells (namespace, table_name);
    CREATE INDEX IF NOT EXISTS idx_v2_cells_ns_tbl_row ON v2_cells (namespace, table_name, row_key);
    CREATE INDEX IF NOT EXISTS idx_v2_cells_identity ON v2_cells (identity);
    CREATE INDEX IF NOT EXISTS idx_v2_cells_level ON v2_cells (level);
    CREATE TABLE IF NOT EXISTS v2_extern (
      addr_hash TEXT PRIMARY KEY, uri TEXT NOT NULL, origin TEXT NOT NULL DEFAULT '',
      handshake_ref TEXT, last_fetch INTEGER, etag TEXT
    );
    CREATE TABLE IF NOT EXISTS v2_stack_hot (
      id INTEGER PRIMARY KEY AUTOINCREMENT, addr_hash TEXT NOT NULL, seq INTEGER NOT NULL,
      delta_json TEXT NOT NULL, hash TEXT NOT NULL,
      recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_v2_stack_hot_addr_seq ON v2_stack_hot (addr_hash, seq);
    CREATE TABLE IF NOT EXISTS v2_stack_cold (
      id INTEGER PRIMARY KEY AUTOINCREMENT, addr_hash TEXT NOT NULL, seq INTEGER NOT NULL,
      delta_gz BLOB NOT NULL, hash TEXT NOT NULL, recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_v2_stack_cold_addr_seq ON v2_stack_cold (addr_hash, seq);
  `);
  _initialized = true;
}

const getCell = (addr) =>
  _db().prepare('SELECT * FROM v2_cells WHERE addr_hash=?').get(addr) || null;

function putCell(c) {
  _db().prepare(`
    INSERT INTO v2_cells
      (addr_hash,namespace,table_name,row_key,col_key,level,fib_scale,
       gx,gy,gz,value_kind,value_json,identity,physics_ref,tier,
       created_at,updated_at)
    VALUES (?,?,?,?,?,?,?, ?,?,?, ?,?,?,?,?, unixepoch(), unixepoch())
    ON CONFLICT(addr_hash) DO UPDATE SET
      level=excluded.level, fib_scale=excluded.fib_scale,
      value_kind=excluded.value_kind, value_json=excluded.value_json,
      identity=excluded.identity, physics_ref=excluded.physics_ref,
      tier=excluded.tier, updated_at=unixepoch()
  `).run(c.addr_hash, c.namespace, c.table_name, c.row_key || '', c.col_key || '',
    c.level, c.fib_scale, c.gx, c.gy, c.gz, c.value_kind || 'inline',
    c.value_json, c.identity, c.physics_ref || null, c.tier || 'hot');
}

const getCellByCoord = (ns, tbl, row, col) =>
  _db().prepare(`SELECT * FROM v2_cells WHERE namespace=? AND table_name=? AND row_key=? AND col_key=?
                  ORDER BY level DESC LIMIT 1`).get(ns, tbl, row || '', col || '') || null;

const scanPlane = (ns, tbl, { limit = 1000, offset = 0 } = {}) =>
  _db().prepare(`SELECT * FROM v2_cells WHERE namespace=? AND table_name=?
                  ORDER BY row_key ASC, col_key ASC LIMIT ? OFFSET ?`)
    .all(ns, tbl, limit, offset);

const findCellByCoords = (gx, gy, gz, eps = 1e-4) =>
  _db().prepare(`SELECT * FROM v2_cells
                  WHERE ABS(gx-?) < ? AND ABS(gy-?) < ? AND ABS(gz-?) < ?
                  LIMIT 1`).get(gx, eps, gy, eps, gz, eps) || null;

const getHotFrames = (addr, limit = 50) =>
  _db().prepare(`SELECT * FROM v2_stack_hot WHERE addr_hash=? ORDER BY seq DESC LIMIT ?`).all(addr, limit);
const getHotTopFrame = (addr) =>
  _db().prepare(`SELECT * FROM v2_stack_hot WHERE addr_hash=? ORDER BY seq DESC LIMIT 1`).get(addr) || null;
const putHotFrame = (f) =>
  _db().prepare(`INSERT INTO v2_stack_hot (addr_hash,seq,delta_json,hash) VALUES (?,?,?,?)`)
    .run(f.addr_hash, f.seq, f.delta_json, f.hash);
const deleteHotFrame = (addr, seq) =>
  _db().prepare(`DELETE FROM v2_stack_hot WHERE addr_hash=? AND seq=?`).run(addr, seq);
const getColdFrames = (addr, limit = 50) =>
  _db().prepare(`SELECT * FROM v2_stack_cold WHERE addr_hash=? ORDER BY seq DESC LIMIT ?`).all(addr, limit);
const putColdFrame = (f) =>
  _db().prepare(`INSERT INTO v2_stack_cold (addr_hash,seq,delta_gz,hash,recorded_at) VALUES (?,?,?,?,?)`)
    .run(f.addr_hash, f.seq, f.delta_gz, f.hash, f.recorded_at);
const listHotAddrsWithCount = () =>
  _db().prepare(`SELECT addr_hash, COUNT(*) AS n FROM v2_stack_hot GROUP BY addr_hash`).all();

const getExtern = (addr) =>
  _db().prepare('SELECT * FROM v2_extern WHERE addr_hash=?').get(addr) || null;
const putExtern = (e) =>
  _db().prepare(`INSERT INTO v2_extern (addr_hash,uri,origin,handshake_ref,last_fetch,etag)
                  VALUES (?,?,?,?,?,?)
                  ON CONFLICT(addr_hash) DO UPDATE SET
                    uri=excluded.uri, origin=excluded.origin,
                    handshake_ref=excluded.handshake_ref,
                    last_fetch=excluded.last_fetch,
                    etag=COALESCE(excluded.etag, v2_extern.etag)`)
    .run(e.addr_hash, e.uri, e.origin || '', e.handshake_ref || null,
      e.last_fetch || null, e.etag || null);

const getNamespace = (name) =>
  _db().prepare('SELECT * FROM v2_namespaces WHERE namespace=?').get(name) || null;
const putNamespace = (ns) =>
  _db().prepare(`INSERT OR IGNORE INTO v2_namespaces (namespace,seed_addr) VALUES (?,?)`)
    .run(ns.namespace, ns.seed_addr);
const listNamespaces = () =>
  _db().prepare(`SELECT * FROM v2_namespaces ORDER BY namespace ASC`).all();

module.exports = {
  init, name: () => 'sqlite',
  db: _db,
  getCell, putCell, getCellByCoord, scanPlane, findCellByCoords,
  getHotFrames, getHotTopFrame, putHotFrame, deleteHotFrame,
  getColdFrames, putColdFrame, listHotAddrsWithCount,
  getExtern, putExtern,
  getNamespace, putNamespace, listNamespaces,
};
