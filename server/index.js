/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB — ENTRY POINT
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Mounts the v2 dimensional router and the v1 compat shim behind a minimal
 * CORS layer.  No auth (PoC).  No WebSocket (dropped with v1 notifications).
 * No .env loader (use NODE_OPTIONS=--env-file=.env or the shell).
 *
 *   GET /health           liveness
 *   /v1/...               legacy surface — thin lens over v2 (see v1_shim.js)
 *   /v2/...               dimensional paradigm (see v2/index.js)
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const express = require('express');
const http = require('http');

const v2 = require('./v2');
const { createShim } = require('./v1_shim');

const PORT = parseInt(process.env.PORT || '4747', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes('*')
    ? (origin || '*')
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '');
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

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tetracubedb', ts: Date.now() });
});

app.use(createShim());
app.use('/v2', v2.createRouter());

if (require.main === module) {
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`[tetracubedb] listening on :${PORT}`);
    console.log(`[tetracubedb] v2 router mounted at /v2`);
    console.log(`[tetracubedb] v1 shim mounted at /v1`);
  });
}

module.exports = { app };
