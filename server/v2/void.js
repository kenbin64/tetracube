/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — VOID / BOOTSTRAP
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The D0 VOID is the empty set: no data, no table, only potential.  It is not
 * an error condition — it is the default state of every coordinate that has
 * never been written.  Reads at void coordinates return a void envelope with
 * HTTP 200; they do NOT 404.  Writes into an un-bootstrapped namespace are
 * rejected strict (NAMESPACE_NOT_BOOTSTRAPPED).
 *
 * Bootstrap:  POST /v2/namespace/init  seeds the D1 origin point at
 * (ns, '_origin', '0', '0') and records the namespace in v2_namespaces.
 * That origin point is the identity of the namespace itself — every other
 * write in that namespace is reachable from it by lateral motion.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const store = require('./store');

/**
 * Initialize a namespace.  Returns { namespace, seed_addr, bootstrapped }.
 * bootstrapped=false means it was already initialized (idempotent).
 */
function init(namespace) {
  if (!namespace || typeof namespace !== 'string') {
    const err = new Error('namespace must be a non-empty string');
    err.code = 'INVALID_NAMESPACE';
    err.strict = true;
    throw err;
  }
  return store.bootstrapNamespace(namespace);
}

/**
 * Guard: throws NAMESPACE_NOT_BOOTSTRAPPED if the namespace hasn't been init'd.
 * Called by every write path before it touches v2_cells.
 */
function requireBootstrapped(namespace) {
  if (!store.isBootstrapped(namespace)) {
    const err = new Error(
      `namespace '${namespace}' has not been initialized; `
      + `POST /v2/namespace/init first`
    );
    err.code = 'NAMESPACE_NOT_BOOTSTRAPPED';
    err.strict = true;
    throw err;
  }
}

/**
 * Read-with-void: tries to read a cell; if absent, returns the D0 envelope
 * instead of null.  Callers can distinguish by `.level === 0`.
 */
function readOrVoid(namespace, table, rowKey, colKey, level = null) {
  const cell = store.readCell(namespace, table, rowKey, colKey, level);
  if (cell) return cell;
  return store.voidAt(namespace, table, rowKey, colKey);
}

module.exports = { init, requireBootstrapped, readOrVoid };
