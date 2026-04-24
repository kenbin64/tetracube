/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB — ENTRY POINT
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Mounts the public site (lens over the manifold), the v2 dimensional router,
 * the v1 compat shim, and the auth surface behind a minimal CORS layer.
 *
 *   GET /                 landing (lens)              public
 *   GET /login            login page                  public
 *   POST /auth/login      issue session cookie        public
 *   POST /auth/logout     revoke session              public
 *   GET /health           liveness                    public
 *   /v1/... /v2/...       GETs public; writes require a valid session
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');

const v2 = require('./v2');
const { createShim } = require('./v1_shim');
const auth = require('./auth');
const site = require('./site');
const { seedSite } = require('./site_seed');
const dimensionOS = require('./dimensionOS');
const agentRoutes = require('./v2/agent_routes');
const policy = require('./v2/policy');
const store = require('./v2/store');

const PORT = parseInt(process.env.PORT || '4747', 10);
// Default allowlist: canonical operator host (dimensionos.net), the public
// field guide (tetracubedb.com) for read-only API demos, and local dev.
// Set ALLOWED_ORIGINS to override (comma-separated).  '*' is rejected when
// credentials are sent — browsers will reject it anyway.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://dimensionos.net',
  'https://tetracubedb.com',
  'http://127.0.0.1:4747',
  'http://localhost:4747',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS.slice();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const wildcard = ALLOWED_ORIGINS.includes('*');
  // With credentials we must echo a specific origin, never '*'.
  const allow = wildcard
    ? (origin || '')
    : (ALLOWED_ORIGINS.includes(origin) ? origin : '');
  if (allow) res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}

// Gate mutating verbs on the data plane; reads remain public (AGENTS.md §17).
function gateMutating(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  return auth.requireSession(req, res, next);
}

// Per-namespace read gate.  Honors the policy cell at __tcdb__/policy/<ns>/root.
// Backwards-compatible: namespaces without a policy cell remain public unless
// they match a private prefix (mem/, agent/, private/, vault/).
function gateRead(req, res, next) {
  if (req.method !== 'GET') return next();
  // Path patterns we know carry a namespace as the first segment after /v1 or /v2.
  //   /v1/cell/:ns/...  /v1/row/:ns/...  /v1/table/:ns/...  /v1/stack/:ns/...
  //   /v2/cell/:ns/...  /v2/stack/:ns/...  /v2/lens/:ns/...
  // Ignore non-namespaced reads (stats, health, namespaces list, neighbors by addr).
  const m = req.path.match(/^\/(?:cell|row|table|stack|lens)\/([^\/]+)/);
  if (!m) return next();
  const ns = decodeURIComponent(m[1]);
  // Skip the system namespace gate — internal routes manage their own access.
  if (ns === store.SYS_NS) return next();
  const user = auth.currentUser(req);
  const userId = user && user.user_id ? user.user_id : null;
  if (policy.canRead(ns, userId)) return next();
  return res.status(403).json({
    success: false, error: 'READ_FORBIDDEN',
    detail: `namespace '${ns}' is not readable by this session`,
    strict: true,
  });
}

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tetracubedb', ts: Date.now() });
});

app.post('/auth/login', auth.loginHandler);
app.post('/auth/logout', auth.logoutHandler);
app.get('/auth/logout', auth.logoutHandler);

app.use('/v1', gateRead, gateMutating);
app.use('/v2', gateRead, gateMutating);
app.use(createShim());
app.use('/v2', v2.createRouter());
app.use('/v2', agentRoutes.createRouter());

// Static UI: /agent/ — the private time-travel agent console.
app.use('/agent', express.static(path.join(__dirname, '..', 'public', 'agent')));

app.use(site.createSiteRouter());

if (require.main === module) {
  auth.bootstrap();
  seedSite();
  dimensionOS.seedIdentity();
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`[tetracubedb] listening on :${PORT}`);
    console.log(`[tetracubedb] site mounted at /`);
    console.log(`[tetracubedb] v2 router mounted at /v2`);
    console.log(`[tetracubedb] v1 shim mounted at /v1`);
  });
}

module.exports = { app };
