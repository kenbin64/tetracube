/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — GIT-BACKED CELL RESOLVER
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Cells with value_kind='git' store a descriptor  { repo, path, ref }
 * instead of inline data.  On read, this module fetches the raw content from
 * GitHub, treating:
 *
 *   blob SHA        = cell identity (content-addressed)
 *   commit history  = z-stack (each commit = one delta frame)
 *   HEAD ref        = z_max   (current state)
 *
 * Optional GITHUB_TOKEN enables private repo access and higher rate limits.
 * ETag responses are cached on the extern cell to avoid refetching unchanged
 * blobs.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const crypto = require('crypto');
const store = require('./store');

const GITHUB_API = 'https://api.github.com';

function _authHeaders() {
  const h = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'tetracubedb-v2',
  };
  if (process.env.GITHUB_TOKEN) {
    h['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

/**
 * Resolve the raw content at (repo, path, ref).  Returns
 *   { content, sha, etag, ref, fromCache }
 * `sha` is the blob SHA (identity).  `fromCache` is true when a 304 was
 * received.
 */
async function resolve({ repo, path: filepath, ref = 'HEAD' }) {
  if (!repo || !filepath) {
    const err = new Error('git resolver requires repo and path');
    err.code = 'INVALID_GIT_CELL';
    err.strict = true;
    throw err;
  }
  store.initSchemaV2();
  const a = store.getAdapter();
  const addr_hash = crypto.createHash('sha256')
    .update(`git:${repo}:${filepath}:${ref}`).digest('hex');

  const prior = a.getExtern(addr_hash);
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURI(filepath)}?ref=${encodeURIComponent(ref)}`;
  const headers = _authHeaders();
  if (prior && prior.etag) headers['If-None-Match'] = prior.etag;

  const resp = await fetch(url, { headers });
  if (resp.status === 304) {
    return { addr_hash, fromCache: true, ref };
  }
  if (!resp.ok) {
    const err = new Error(`git fetch failed: ${resp.status} ${resp.statusText}`);
    err.code = 'GIT_FETCH_FAILED';
    err.strict = true;
    throw err;
  }
  const body = await resp.json();
  const etag = resp.headers.get('etag');
  const sha = body.sha;
  const content = body.encoding === 'base64'
    ? Buffer.from(body.content, 'base64').toString('utf8')
    : (body.content || '');

  a.putExtern({
    addr_hash, uri: url, origin: 'github',
    last_fetch: Math.floor(Date.now() / 1000), etag,
  });

  return { addr_hash, content, sha, etag, ref, fromCache: false };
}

/**
 * Walk the commit history for (repo, path) — the z-stack of a git-backed cell.
 * Returns frames in descending seq (z_max first).  Each frame is an object
 * { seq, sha, author, date, message }.
 */
async function walkStack({ repo, path: filepath, limit = 20 }) {
  if (!repo || !filepath) {
    const err = new Error('walkStack requires repo and path');
    err.code = 'INVALID_GIT_CELL';
    err.strict = true;
    throw err;
  }
  const url = `${GITHUB_API}/repos/${repo}/commits?path=${encodeURIComponent(filepath)}&per_page=${limit}`;
  const resp = await fetch(url, { headers: _authHeaders() });
  if (!resp.ok) {
    const err = new Error(`git stack walk failed: ${resp.status}`);
    err.code = 'GIT_FETCH_FAILED';
    err.strict = true;
    throw err;
  }
  const commits = await resp.json();
  return commits.map((c, i) => ({
    seq: commits.length - 1 - i,   // z_max = highest seq
    sha: c.sha,
    author: c.commit?.author?.name || null,
    date: c.commit?.author?.date || null,
    message: c.commit?.message || '',
  }));
}

module.exports = { resolve, walkStack };
