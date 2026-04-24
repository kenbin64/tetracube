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
  Directive: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      namespace: { type: 'string' },
      directive_id: { type: 'string' },
      name: { type: 'string' },
      substrates: { type: 'array', items: { type: 'string' } },
      dataset_pointers: { type: 'array', items: { type: 'string' } },
      api_pointers: { type: 'array', items: { type: 'string' } },
      schema_version: { type: 'string' },
      source: { type: 'string' },
      updated_at: { type: 'integer' },
    },
  },
  DirectiveRegisterRequest: {
    type: 'object',
    required: ['namespace', 'directive_id'],
    properties: {
      namespace: { type: 'string' },
      directive_id: { type: 'string' },
      name: { type: 'string' },
      substrates: { type: 'array', items: { type: 'string' } },
      dataset_pointers: { type: 'array', items: { type: 'string' } },
      api_pointers: { type: 'array', items: { type: 'string' } },
      schema_version: { type: 'string' },
      source: { type: 'string' },
    },
  },
  DirectiveRegisterResult: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      changed: { type: 'boolean' },
      identity: { type: 'string' },
      gx: { type: 'number' },
      gy: { type: 'number' },
      gz: { type: 'number' },
      level: { type: 'integer' },
      directive: { $ref: '#/components/schemas/Directive' },
    },
  },
  DirectivePointerRequest: {
    type: 'object',
    required: ['namespace', 'directive_id', 'pointer_uri'],
    properties: {
      namespace: { type: 'string' },
      directive_id: { type: 'string' },
      pointer_uri: { type: 'string' },
      pointer_kind: { type: 'string', enum: ['dataset', 'api', 'app'] },
      origin: { type: 'string' },
      etag: { type: 'string', nullable: true },
    },
  },
  DirectivePointerResult: {
    type: 'object',
    properties: {
      addr_hash: { type: 'string' },
      changed: { type: 'boolean' },
      identity: { type: 'string' },
      gx: { type: 'number' },
      gy: { type: 'number' },
      gz: { type: 'number' },
      level: { type: 'integer' },
      pointer: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          directive_id: { type: 'string' },
          pointer_id: { type: 'string' },
          pointer_kind: { type: 'string' },
          pointer_uri: { type: 'string' },
          origin: { type: 'string' },
          extern_addr: { type: 'string' },
          handshake_ref: { type: 'string' },
          ingested_at: { type: 'integer' },
        },
      },
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

  // ── Lens: geometric extraction schemas ────────────────────────────────────
  SurfaceProfile: {
    type: 'object',
    description: 'Geometric truth at a gyroid coordinate — derived from math, not storage.',
    properties: {
      gx: { type: 'number' }, gy: { type: 'number' }, gz: { type: 'number' },
      surface_f: { type: 'number', description: 'F(gx,gy,gz); 0 = on surface' },
      on_surface: { type: 'boolean' },
      residual: { type: 'number' },
      relation_surface: { type: 'number', description: 'z = gx·gy (relation surface seed)' },
      curvature: { type: 'number', description: 'Mean curvature proxy; 0 on minimal surface' },
      inflections: {
        type: 'array', items: { type: 'number' },
        description: 'Natural index anchors (∂²F/∂z² = 0 near surface)'
      },
      neighbors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            gx: { type: 'number' }, gy: { type: 'number' }, gz: { type: 'number' },
            direction: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'] },
          },
        },
      },
    },
  },
  LensExtraction: {
    type: 'object',
    description: 'Full extraction at a named manifold coordinate: geometry (always) + stored overlay (if any).',
    properties: {
      addr: {
        type: 'object',
        properties: {
          namespace: { type: 'string' }, table: { type: 'string' },
          rowKey: { type: 'string' }, colKey: { type: 'string' },
          level: { type: 'integer' },
        },
      },
      geometry: { $ref: '#/components/schemas/SurfaceProfile' },
      overlay: { description: 'Stored cell value (null if no cell written)', nullable: true },
      overlay_meta: {
        nullable: true,
        type: 'object',
        properties: {
          identity: { type: 'string' }, updated_at: { type: 'integer' },
          value_kind: { type: 'string' }, addr_hash: { type: 'string' },
        },
      },
      extraction_basis: { type: 'string', enum: ['geometry', 'overlay', 'geometry+overlay'] },
    },
  },

  // ── dimensionOS schemas ───────────────────────────────────────────────────
  DimensionOSIdentity: {
    type: 'object',
    description: 'D7 M-cell — the whole-object identity of this dimensionOS manifold instance.',
    properties: {
      os: { type: 'string' }, version: { type: 'string' }, domain: { type: 'string' },
      description: { type: 'string' }, operator: { type: 'string' },
      model: { type: 'string' },
      axioms: { type: 'array', items: { type: 'string' } },
      fibonacci: { type: 'array', items: { type: 'integer' } },
      seeded_at: { type: 'integer' },
    },
  },
  SubstrateRequest: {
    type: 'object',
    required: ['substrate_id'],
    properties: {
      substrate_id: { type: 'string' },
      origin_domain: { type: 'string', nullable: true },
      name: { type: 'string' },
      extraction_level: { type: 'integer', minimum: 1, maximum: 7, default: 4 },
      meta: { type: 'object' },
    },
  },
  Substrate: {
    type: 'object',
    properties: {
      substrate_id: { type: 'string' }, origin_domain: { type: 'string', nullable: true },
      name: { type: 'string' }, extraction_level: { type: 'integer' },
      meta: { type: 'object' }, registered_at: { type: 'integer' },
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
      { name: 'directive' }, { name: 'lens' }, { name: 'dimensionos' },
      { name: 'git' }, { name: 'archive' }, { name: 'meta' },
    ],
    paths: paths(VERBS),
    components: { schemas },
  };
}

module.exports = { spec, schemas, VERBS, pkg, FIB, MAX_LEVEL };

