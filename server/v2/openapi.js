/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — OPENAPI 3.1 SPEC (schemas + metadata)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Canonical, language-agnostic description of the /v2 wire protocol.  Served
 * verbatim at GET /v2/openapi.json.  The adapter parity suite proves the
 * backing storage is interchangeable, so this document is the only source of
 * truth a client in any language needs to drive the manifold.
 *
 * Edit alongside server/v2/index.js — routes and spec must agree.
 * Paths live in ./openapi_paths.js to keep each file under the edit budget.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const pkg = require('../package.json');
const { FIB, MAX_LEVEL, VERB_FOR_LEVEL } = require('./dimensions');
const paths = require('./openapi_paths');

const VERBS = Object.values(VERB_FOR_LEVEL).filter(Boolean);

const schemas = {
  StrictError: {
    type: 'object',
    required: ['success', 'error', 'strict'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: { type: 'string', description: 'machine code, e.g. INVALID_LEVEL' },
      detail: { description: 'free-form detail; type varies by error' },
      message: { type: 'string', nullable: true },
      strict: { type: 'boolean', description: 'true ⇒ client-side fault (400)' },
    },
  },
  Void: {
    type: 'object',
    description: 'D0 envelope returned for unwritten coordinates.',
    properties: {
      level: { type: 'integer', enum: [0] },
      level_name: { type: 'string', enum: ['VOID'] },
      namespace: { type: 'string' }, table_name: { type: 'string' },
      row_key: { type: 'string' }, col_key: { type: 'string' },
      value: { nullable: true },
    },
  },
  Cell: {
    type: 'object',
    description: 'A hydrated manifold cell.',
    properties: {
      addr_hash: { type: 'string' },
      namespace: { type: 'string' }, table_name: { type: 'string' },
      row_key: { type: 'string' }, col_key: { type: 'string' },
      level: { type: 'integer', minimum: 1, maximum: MAX_LEVEL },
      gx: { type: 'number' }, gy: { type: 'number' }, gz: { type: 'number' },
      value_kind: { type: 'string', enum: ['json', 'extern', 'tombstone'] },
      value: { description: 'parsed payload; shape is level-dependent' },
      state: { type: 'string', enum: ['live', 'tombstoned'] },
    },
  },
  Namespace: {
    type: 'object',
    properties: {
      namespace: { type: 'string' }, seed_addr: { type: 'string' },
      created_at: { type: 'integer' },
    },
  },
  BootstrapResult: {
    type: 'object',
    properties: {
      namespace: { type: 'string' }, seed_addr: { type: 'string' },
      bootstrapped: { type: 'boolean', description: 'false ⇒ already existed' },
    },
  },
  StackFrame: {
    type: 'object',
    properties: {
      z: { type: 'integer', description: 'descending z-coord (0=top)' },
      delta: { description: 'frame payload; { _tombstone:true, reason } for deletes' },
      hash: { type: 'string' }, created_at: { type: 'integer' },
    },
  },
  Neighbor: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      neighbor_addr: { type: 'string', nullable: true },
      direction: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'] },
      gx: { type: 'number' }, gy: { type: 'number' }, gz: { type: 'number' },
    },
  },
  HandshakeToken: {
    type: 'object',
    properties: {
      from: { type: 'object' }, to: { type: 'object' },
      nonce: { type: 'string' }, knock: { type: 'string' },
    },
  },
  OpRequest: {
    type: 'object',
    required: ['namespace', 'table'],
    description: 'Canonical write body; required fields vary by verb.',
    properties: {
      namespace: { type: 'string' }, table: { type: 'string' },
      rowKey: { type: 'string' }, colKey: { type: 'string' },
      value: { description: 'payload for additive/point verbs' },
      x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
    },
  },
  OpResult: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      level: { type: 'integer' },
      changed: { type: 'boolean', description: 'false ⇒ identity-gated no-op' },
    },
  },
  TombstoneResult: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      state: { type: 'string', enum: ['tombstoned'] },
      changed: { type: 'boolean' },
      frame: { $ref: '#/components/schemas/StackFrame' },
    },
  },
  Health: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' }, service: { type: 'string' },
      schema: { type: 'string' }, max_level: { type: 'integer' },
      fib: { type: 'array', items: { type: 'integer' } },
    },
  },
};

function spec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'TetracubeDB v2 — Dimensional Manifold Processor',
      version: pkg.version,
      description:
        'Wire protocol for the D0–D7 manifold. Storage-agnostic: any backend\n'
        + 'that implements the adapter contract (memory, fs, sqlite, or a future\n'
        + 'cloud/language port) produces identical behavior.\n\n'
        + `Fibonacci weights: [${FIB.join(', ')}].  Hard cap: D${MAX_LEVEL}.\n`
        + 'Axioms: z = x·y (consistency), m = x·y·z (identity).',
      license: { name: 'MIT' },
    },
    servers: [{ url: '/v2', description: 'TetracubeDB v2 root' }],
    tags: [
      { name: 'namespace' }, { name: 'cell' }, { name: 'op' },
      { name: 'stack' }, { name: 'motion' }, { name: 'handshake' },
      { name: 'git' }, { name: 'archive' }, { name: 'meta' },
    ],
    paths: paths(VERBS),
    components: { schemas },
  };
}

module.exports = { spec, schemas, VERBS, pkg, FIB, MAX_LEVEL };

