/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — PHYSICS (rule-bound cells)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * A cell with a non-null `physics_ref` evaluates a registered function on
 * read to produce its current state.  The function receives:
 *
 *   ctx = {
 *     prev: <last-committed value, or null>,
 *     dt:   <seconds since updated_at>,
 *     cell: <the raw cell row>,
 *   }
 *
 * The returned value is the cell's "current" state.  If it differs from the
 * stored identity by more than the delta threshold, a new z-frame is
 * materialized (via store.pushDelta) so the observation enters history.
 *
 * This is how simulated cells, decay curves, and time-bound values live in
 * the manifold: they don't need to be polled — they evaluate when observed.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const store = require('./store');

const _registry = new Map();

/**
 * Register a physics function under a reference name.  The name is what
 * cells record in physics_ref.
 */
function register(name, fn) {
  if (typeof fn !== 'function') {
    const err = new Error('physics function must be callable');
    err.code = 'INVALID_PHYSICS';
    err.strict = true;
    throw err;
  }
  _registry.set(name, fn);
  return name;
}

function unregister(name) {
  return _registry.delete(name);
}

function has(name) {
  return _registry.has(name);
}

function list() {
  return Array.from(_registry.keys());
}

/**
 * Evaluate a cell's physics (if bound).  Returns the evaluated state.
 * If materialize=true and the new state differs from stored identity,
 * a new z-stack frame is pushed.
 */
function evaluate(cell, { materialize = false } = {}) {
  if (!cell || !cell.physics_ref) return cell?.value ?? null;
  const fn = _registry.get(cell.physics_ref);
  if (!fn) {
    const err = new Error(`physics_ref '${cell.physics_ref}' not registered`);
    err.code = 'UNKNOWN_PHYSICS';
    err.strict = true;
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);
  const dt = now - (cell.updated_at || now);
  const ctx = { prev: cell.value, dt, cell };
  const current = fn(ctx);

  if (materialize) {
    store.pushDelta(cell.addr_hash, current);
  }
  return current;
}

module.exports = { register, unregister, has, list, evaluate };
