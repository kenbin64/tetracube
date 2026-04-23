/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — MOTION (lateral traversal vs M-boundary ascent)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   moveLateral(addr, direction)
 *     Free traversal along the 6-cardinal edges inside the same namespace.
 *     Neighbors are pure geometry (AGENTS.md §3.11) — computed from the
 *     source cell's coordinates on each call; nothing is persisted.  Returns
 *     the neighbor cell or a void envelope if no cell exists at that coord.
 *
 *   ascendM(addr, target_namespace, { knock_hash, nonce })
 *     Crosses an M-boundary to reach another object's scope.  Requires an
 *     accepted handshake cell under (__tcdb__, handshakes, knock_hash, nonce).
 *     On success, returns the target namespace's origin cell.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const gyroid = require('../gyroid_core');
const store = require('./store');
const handshake = require('./handshake');

const VALID_DIRECTIONS = ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'];

/**
 * Step one edge from a source cell.  Returns the neighbor cell, or a
 * void envelope at the neighbor's coordinate if no cell exists there.
 */
function moveLateral(addr_hash, direction) {
  if (!VALID_DIRECTIONS.includes(direction)) {
    const err = new Error(
      `invalid direction '${direction}'; expected one of ${VALID_DIRECTIONS.join(',')}`
    );
    err.code = 'INVALID_DIRECTION';
    err.strict = true;
    throw err;
  }
  store.initSchemaV2();
  const cell = store.readCellByAddr(addr_hash);
  if (!cell) return { direction, state: 'unreachable' };

  const coords = gyroid.neighborAddresses(cell.gx, cell.gy, cell.gz, 0.3)
    .find((n) => n.direction === direction);
  const hit = store.getAdapter().findCellByCoords(coords.gx, coords.gy, coords.gz, 1e-4);
  if (!hit) {
    return {
      direction, state: 'void', level: 0,
      gx: coords.gx, gy: coords.gy, gz: coords.gz,
    };
  }
  return { direction, ...store._hydrate(hit) };
}

/**
 * Cross an M-boundary into another namespace.  Requires an accepted
 * handshake cell for (knock_hash, nonce).
 */
function ascendM(target_namespace, { knock_hash, nonce } = {}) {
  store.initSchemaV2();
  if (!store.isBootstrapped(target_namespace)) {
    const err = new Error(`target namespace '${target_namespace}' not bootstrapped`);
    err.code = 'NAMESPACE_NOT_BOOTSTRAPPED';
    err.strict = true;
    throw err;
  }
  if (!handshake.verifyAccepted(knock_hash, nonce)) {
    const err = new Error('M-boundary crossing requires an accepted handshake');
    err.code = 'HANDSHAKE_REQUIRED';
    err.strict = true;
    throw err;
  }
  const ns = store.getAdapter().getNamespace(target_namespace);
  return ns ? store.readCellByAddr(ns.seed_addr) : null;
}

module.exports = { moveLateral, ascendM, VALID_DIRECTIONS };
