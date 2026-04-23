/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TETRACUBEDB v2 — ARCHIVE (cold-tier gzip)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   z_max    = hot frame, uncompressed, the authoritative "now".
 *   z < z_max = cold frames — pure historical deltas, safe to gzip.
 *
 * This module migrates frames from the hot tier into the cold tier via
 * adapter primitives (getHotFrames / putColdFrame / deleteHotFrame /
 * listHotAddrsWithCount).  No raw SQL — adapter-portable by construction.
 * ═════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const zlib = require('zlib');
const store = require('./store');

/**
 * Archive all but the top `keepHot` frames of a cell's hot stack into the
 * cold tier.  Returns { archived, kept }.
 */
function archiveCell(addr_hash, { keepHot = 1 } = {}) {
  store.initSchemaV2();
  const a = store.getAdapter();
  // getHotFrames returns newest-first (seq DESC).  Pull a generous slice.
  const all = a.getHotFrames(addr_hash, 1_000_000);
  if (all.length <= keepHot) return { archived: 0, kept: all.length };
  const toArchive = all.slice(keepHot);

  for (const f of toArchive) {
    const delta_gz = zlib.gzipSync(Buffer.from(f.delta_json, 'utf8'));
    a.putColdFrame({
      addr_hash, seq: f.seq, delta_gz,
      hash: f.hash, recorded_at: f.recorded_at,
    });
    a.deleteHotFrame(addr_hash, f.seq);
  }
  return { archived: toArchive.length, kept: keepHot };
}

/**
 * Archive every cell with more than `keepHot` hot frames.  Bounded cross-dim
 * scan (AGENTS.md §3.14): intended for background jobs, not request path.
 */
function archiveAll({ keepHot = 1 } = {}) {
  store.initSchemaV2();
  const rows = store.getAdapter().listHotAddrsWithCount()
    .filter((r) => r.n > keepHot);
  let total = 0;
  for (const r of rows) {
    const { archived } = archiveCell(r.addr_hash, { keepHot });
    total += archived;
  }
  return { cells_processed: rows.length, frames_archived: total };
}

/**
 * Read the full stack for a cell (hot + inflated cold), newest first.
 */
function readStack(addr_hash, { limit = 50 } = {}) {
  store.initSchemaV2();
  const a = store.getAdapter();
  const hot = a.getHotFrames(addr_hash, limit).map((r) => ({
    seq: r.seq, delta: JSON.parse(r.delta_json),
    hash: r.hash, recorded_at: r.recorded_at, tier: 'hot',
  }));
  const remaining = Math.max(0, limit - hot.length);
  const cold = remaining === 0 ? [] : a.getColdFrames(addr_hash, remaining).map((r) => {
    const raw = r.delta_gz || (r.delta_gz_b64 ? Buffer.from(r.delta_gz_b64, 'base64') : null);
    return {
      seq: r.seq,
      delta: raw ? JSON.parse(zlib.gunzipSync(raw).toString('utf8')) : null,
      hash: r.hash, recorded_at: r.recorded_at, tier: 'cold',
    };
  });
  return hot.concat(cold).slice(0, limit);
}

module.exports = { archiveCell, archiveAll, readStack };
