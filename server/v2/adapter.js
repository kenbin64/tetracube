/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — STORAGE ADAPTER CONTRACT
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * An adapter is any storage backend that implements the functions below.
 * It stores opaque records; it does NOT know about dimensions, deltas,
 * verbs, or gyroid geometry.  Those all live above this line in store.js.
 *
 * A conforming adapter lets TetracubeDB run over SQLite, a plain filesystem,
 * a cloud bucket, Postgres, DuckDB, Redis, IndexedDB — anywhere you can
 * store bytes at a key.  Implementing one is ~200 lines of mechanical code.
 *
 * Record shapes (all JSON-serializable):
 *
 *   Cell     { addr_hash, namespace, table_name, row_key, col_key,
 *              level, fib_scale, gx, gy, gz,
 *              value_kind, value_json, identity, physics_ref, tier,
 *              created_at, updated_at }
 *
 *   Frame    { addr_hash, seq, delta_json, hash, recorded_at, tier:'hot' }
 *   ColdFrame{ addr_hash, seq, delta_gz:Uint8Array, hash, recorded_at }
 *
 *   Extern   { addr_hash, uri, origin, handshake_ref, last_fetch, etag }
 *
 *   NS       { namespace, seed_addr, created_at }
 *
 * NOTE: neighbors and handshakes are NOT adapter concerns (AGENTS.md §3.11,
 * §3.13, §17.7).  Neighbors are geometry — computed from coordinates on read
 * via findCellByCoords.  Handshakes are deltas — stored as cells in the
 * `__tcdb__` namespace with a status z-stack.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

/**
 * @typedef {Object} Adapter
 * // ── lifecycle ────────────────────────────────────────────────────────────
 * @property {() => void}                              init      Idempotent schema / fs init.
 * @property {() => string}                            name      'sqlite'|'memory'|'fs'|...
 * // ── cells ────────────────────────────────────────────────────────────────
 * @property {(addr: string) => Cell|null}             getCell
 * @property {(cell: Cell) => void}                    putCell
 * @property {(ns: string, table: string, row: string, col: string) => Cell|null}
 *                                                    getCellByCoord
 * @property {(ns: string, table: string, opts?: {limit?:number,offset?:number})
 *            => Cell[]}                               scanPlane
 * @property {(gx:number, gy:number, gz:number, eps?:number) => Cell|null}
 *                                                    findCellByCoords
 * // ── stack (hot + cold) ───────────────────────────────────────────────────
 * @property {(addr: string, limit?: number) => Frame[]}
 *                                                    getHotFrames
 * @property {(addr: string) => Frame|null}            getHotTopFrame
 * @property {(f: Frame) => void}                      putHotFrame
 * @property {(addr: string, seq: number) => void}     deleteHotFrame
 * @property {(addr: string, limit?: number) => ColdFrame[]}
 *                                                    getColdFrames
 * @property {(f: ColdFrame) => void}                  putColdFrame
 * @property {() => Array<{addr_hash:string,n:number}>} listHotAddrsWithCount
 * // ── externs ──────────────────────────────────────────────────────────────
 * @property {(addr: string) => Extern|null}           getExtern
 * @property {(e: Extern) => void}                     putExtern
 * // ── namespaces ───────────────────────────────────────────────────────────
 * @property {(name: string) => NS|null}               getNamespace
 * @property {(ns: NS) => void}                        putNamespace
 * @property {() => NS[]}                              listNamespaces
 */

// Required method names — used by assertConforms() to verify adapters.
// Neighbors and handshakes are intentionally NOT here; see module header.
const REQUIRED_METHODS = Object.freeze([
  'init', 'name',
  'getCell', 'putCell', 'getCellByCoord', 'scanPlane', 'findCellByCoords',
  'getHotFrames', 'getHotTopFrame', 'putHotFrame', 'deleteHotFrame',
  'getColdFrames', 'putColdFrame', 'listHotAddrsWithCount',
  'getExtern', 'putExtern',
  'getNamespace', 'putNamespace', 'listNamespaces',
]);

/**
 * Assert an object conforms to the Adapter contract.  Throws with
 * ADAPTER_NONCONFORMANT on missing methods — fail fast at setAdapter time.
 */
function assertConforms(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    const err = new Error('adapter must be an object');
    err.code = 'ADAPTER_NONCONFORMANT';
    err.strict = true;
    throw err;
  }
  const missing = REQUIRED_METHODS.filter((m) => typeof candidate[m] !== 'function');
  if (missing.length) {
    const err = new Error(`adapter missing methods: ${missing.join(', ')}`);
    err.code = 'ADAPTER_NONCONFORMANT';
    err.strict = true;
    err.detail = { missing };
    throw err;
  }
  return candidate;
}

module.exports = { REQUIRED_METHODS, assertConforms };
