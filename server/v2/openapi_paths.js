/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — OPENAPI PATHS
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Route-by-route description for the /v2 surface.  Consumed by openapi.js.
 * Every path here must correspond to a handler registered in index.js.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const errResp = {
  400: { description: 'strict (client) fault', content: json(ref('StrictError')) },
  500: { description: 'non-strict (server) fault', content: json(ref('StrictError')) },
};
const okRef = (name) => ({ 200: { description: 'ok', content: json(ref(name)) } });
const okArr = (name) => ({
  200: { description: 'ok', content: json({ type: 'array', items: ref(name) }) },
});
const okAny = (schema) => ({ 200: { description: 'ok', content: json(schema) } });

const cellParams = [
  { name: 'ns', in: 'path', required: true, schema: { type: 'string' } },
  { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
  { name: 'row', in: 'path', required: true, schema: { type: 'string' } },
  { name: 'col', in: 'path', required: true, schema: { type: 'string' } },
];

module.exports = function paths(VERBS) {
  return {
    '/namespace/init': {
      post: {
        tags: ['namespace'], summary: 'Bootstrap a namespace (D0 → D1 seed)',
        description: 'Idempotent; returns bootstrapped:false when the namespace already exists.',
        requestBody: {
          required: true, content: json({
            type: 'object', required: ['namespace'],
            properties: { namespace: { type: 'string' } },
          }),
        },
        responses: { ...okRef('BootstrapResult'), ...errResp },
      },
    },
    '/namespaces': {
      get: {
        tags: ['namespace'], summary: 'List namespaces',
        responses: { ...okArr('Namespace'), ...errResp },
      },
    },
    '/cell/{ns}/{table}/{row}/{col}': {
      parameters: cellParams,
      get: {
        tags: ['cell'], summary: 'Read cell (void envelope on miss)',
        description: 'Returns a D0 Void envelope at unwritten coords; never 404s.',
        responses: {
          200: {
            description: 'cell or void envelope',
            content: json({ oneOf: [ref('Cell'), ref('Void')] }),
          },
          ...errResp,
        },
      },
      delete: {
        tags: ['cell'], summary: 'Tombstone cell (soft delete)',
        description: 'Flips value_kind to "tombstone" and pushes a {_tombstone:true} '
          + 'frame onto the z-stack. Prior state remains in history.',
        requestBody: {
          required: false, content: json({
            type: 'object',
            properties: { reason: { type: 'string', nullable: true } },
          }),
        },
        responses: { ...okRef('TombstoneResult'), ...errResp },
      },
    },
    '/op/{verb}': {
      parameters: [{
        name: 'verb', in: 'path', required: true,
        schema: { type: 'string', enum: VERBS },
        description: 'Dimension-typed write verb. The verb\'s level must match the '
          + 'operation mode (point/add/mul) of its canonical dimension.',
      }],
      post: {
        tags: ['op'], summary: 'Dispatch a dimensional verb',
        requestBody: { required: true, content: json(ref('OpRequest')) },
        responses: { ...okRef('OpResult'), ...errResp },
      },
    },
    '/stack/push': {
      post: {
        tags: ['stack'], summary: 'D5 pushDelta (hash-gated)',
        requestBody: {
          required: true, content: json({
            type: 'object', required: ['addr_hash', 'delta'],
            properties: {
              addr_hash: { type: 'string' },
              delta: { description: 'any JSON payload; no-op if hash matches top frame' },
            },
          }),
        },
        responses: {
          ...okAny({
            type: 'object',
            properties: {
              addr_hash: { type: 'string' },
              pushed: { type: 'boolean' },
              frame: ref('StackFrame'),
            },
          }),
          ...errResp,
        },
      },
    },
    '/stack/{ns}/{table}/{row}/{col}': {
      parameters: [
        ...cellParams,
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      get: {
        tags: ['stack'], summary: 'Read z-stack (hot + cold merged)',
        responses: {
          ...okAny({
            type: 'object',
            properties: {
              addr_hash: { type: 'string' },
              frames: { type: 'array', items: ref('StackFrame') },
              state: { type: 'string', enum: ['void'] },
            },
          }),
          ...errResp,
        },
      },
    },
    '/neighbors/{addr}': {
      parameters: [{ name: 'addr', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['motion'], summary: 'List 6-cardinal edges for a cell',
        responses: { ...okArr('Neighbor'), ...errResp },
      },
    },
    '/motion/lateral': {
      post: {
        tags: ['motion'], summary: 'Step one edge inside the current namespace',
        requestBody: {
          required: true, content: json({
            type: 'object', required: ['addr_hash', 'direction'],
            properties: {
              addr_hash: { type: 'string' },
              direction: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-', 'z+', 'z-'] },
            },
          }),
        },
        responses: {
          ...okAny({ oneOf: [ref('Cell'), ref('Void')] }), ...errResp,
        },
      },
    },
    '/directives/register': {
      post: {
        tags: ['directive'], summary: 'Register/update a manifold directive',
        requestBody: {
          required: true, content: json(ref('DirectiveRegisterRequest')),
        },
        responses: { ...okRef('DirectiveRegisterResult'), ...errResp },
      },
    },
    '/directives/{namespace}/{directive_id}': {
      parameters: [
        { name: 'namespace', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'directive_id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      get: {
        tags: ['directive'], summary: 'Fetch a directive by namespace/id',
        responses: { ...okRef('Cell'), ...errResp },
      },
    },
    '/directives/{namespace}': {
      parameters: [
        { name: 'namespace', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 200 } },
      ],
      get: {
        tags: ['directive'], summary: 'List directives within a namespace',
        responses: { ...okArr('Directive'), ...errResp },
      },
    },
    '/directives/pointer/ingest': {
      post: {
        tags: ['directive'], summary: 'Ingest an external pointer for a directive',
        requestBody: {
          required: true, content: json(ref('DirectivePointerRequest')),
        },
        responses: { ...okRef('DirectivePointerResult'), ...errResp },
      },
    },

    // ── Lens: geometric extraction (dimensionOS) ────────────────────────────
    '/lens/surface': {
      get: {
        tags: ['lens'], summary: 'Raw gyroid surface profile at (gx, gy)',
        description: 'Returns the geometric truth at a manifold coordinate — '
          + 'no namespace, no stored data.  The surface equation '
          + 'F(x,y,z) = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0 is '
          + 'the sole authority.',
        parameters: [
          { name: 'gx', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'gy', in: 'query', required: true, schema: { type: 'number' } },
          {
            name: 'gz', in: 'query', required: false, schema: { type: 'number' },
            description: 'Optional z seed; Newton-Raphson finds the surface root near this value'
          },
        ],
        responses: { ...okRef('SurfaceProfile'), ...errResp },
      },
    },
    '/lens/scan': {
      get: {
        tags: ['lens'], summary: 'Scan a region of the gyroid surface',
        description: 'Returns a grid of surface profiles across a (gx, gy) range. '
          + 'Like running your hand across a guitar neck — all harmonics in a range.',
        parameters: [
          { name: 'gxMin', in: 'query', schema: { type: 'number', default: 0 } },
          { name: 'gxMax', in: 'query', schema: { type: 'number', default: 6.2832 } },
          { name: 'gyMin', in: 'query', schema: { type: 'number', default: 0 } },
          { name: 'gyMax', in: 'query', schema: { type: 'number', default: 6.2832 } },
          { name: 'steps', in: 'query', schema: { type: 'integer', default: 8, minimum: 2, maximum: 32 } },
        ],
        responses: {
          200: {
            description: 'grid of surface profiles',
            content: json({ type: 'array', items: ref('SurfaceProfile') })
          },
          ...errResp,
        },
      },
    },
    '/lens/{namespace}/{table}/{rowKey}/{colKey}': {
      parameters: [
        { name: 'namespace', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'rowKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'colKey', in: 'path', required: true, schema: { type: 'string' } },
      ],
      get: {
        tags: ['lens'], summary: 'Extract geometric profile of a manifold coordinate',
        description: 'Returns the geometric truth at this address (always present) '
          + 'plus any stored cell as an overlay annotation.  The geometry IS the data; '
          + 'the stored value, if any, is a human-injected annotation on top.',
        parameters: [
          { name: 'level', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 7, default: 1 } },
        ],
        responses: { ...okRef('LensExtraction'), ...errResp },
      },
    },

    // ── dimensionOS: manifold identity + substrate registry ─────────────────
    '/dimensionos/identity': {
      get: {
        tags: ['dimensionos'], summary: 'Read the D7 root identity of this dimensionOS instance',
        description: 'The D7 M-cell that is the whole-object identity of this manifold. '
          + 'All substrates, namespaces, and pointers unfold from this root.',
        responses: { ...okRef('DimensionOSIdentity'), ...errResp },
      },
    },
    '/dimensionos/substrates': {
      get: {
        tags: ['dimensionos'], summary: 'List registered substrates',
        responses: {
          200: {
            description: 'list of substrates',
            content: json({ type: 'array', items: ref('Substrate') })
          },
          ...errResp,
        },
      },
      post: {
        tags: ['dimensionos'], summary: 'Register a substrate',
        description: 'A substrate is a named data surface that domains and URLs resolve to. '
          + 'When a URL points to a substrate, the response is extracted from geometry, '
          + 'not served from disk.',
        requestBody: { required: true, content: json(ref('SubstrateRequest')) },
        responses: { ...okRef('Substrate'), ...errResp },
      },
    },
  };
};
