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
  { name: 'ns',    in: 'path', required: true, schema: { type: 'string' } },
  { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
  { name: 'row',   in: 'path', required: true, schema: { type: 'string' } },
  { name: 'col',   in: 'path', required: true, schema: { type: 'string' } },
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
  };
};
