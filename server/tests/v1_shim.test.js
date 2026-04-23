'use strict';
/**
 * TetracubeDB v1 SHIM — round-trip tests
 *
 *   H1. POST/GET/DELETE /v1/cell — identity + tombstone
 *   H2. GET /v1/row assembles columns into a record
 *   H3. GET /v1/table returns { rows, total }
 *   H4. POST/GET /v1/stack auto-creates cell and returns ascending frames
 *   H5. POST /v1/query/radius returns cells within a geodesic ball
 *   H6. PUT/GET /v1/schema persists through __tcdb__
 *   H7. GET /v1/namespaces, /v1/tables/:ns, /v1/stats
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcdb-v1-shim-'));
process.env.DATA_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const { createShim } = require('../v1_shim');

let server;
let base;

async function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(`${base}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let data = null;
        try { data = buf ? JSON.parse(buf) : null; } catch { data = buf; }
        resolve({ status: res.statusCode, data });
      });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(createShim());
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const NS = 'v1test';

describe('v1 shim — cell', () => {
  it('POST → GET round-trips the value', async () => {
    const set = await req('POST', `/v1/cell/${NS}/players/ken/score`, { value: 42 });
    assert.equal(set.status, 200);
    assert.equal(set.data.ok, true);
    assert.ok(set.data.addr_hash);

    const get = await req('GET', `/v1/cell/${NS}/players/ken/score`);
    assert.equal(get.status, 200);
    assert.equal(get.data.value, 42);
    assert.equal(get.data.namespace, NS);
    assert.equal(get.data.table_name, 'players');
  });

  it('GET on void coord returns 404', async () => {
    const res = await req('GET', `/v1/cell/${NS}/players/ghost/score`);
    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'Not found');
  });

  it('DELETE tombstones; subsequent GET returns tombstoned state', async () => {
    await req('POST', `/v1/cell/${NS}/players/ken/removable`, { value: 1 });
    const del = await req('DELETE', `/v1/cell/${NS}/players/ken/removable`);
    assert.equal(del.status, 200);
    assert.equal(del.data.ok, true);

    const got = await req('GET', `/v1/cell/${NS}/players/ken/removable`);
    assert.equal(got.status, 200);
    assert.equal(got.data.state, 'tombstoned');
  });
});

describe('v1 shim — row + table', () => {
  it('GET /v1/row assembles columns into a single record', async () => {
    await req('POST', `/v1/cell/${NS}/users/u1/name`, { value: 'Alice' });
    await req('POST', `/v1/cell/${NS}/users/u1/age`, { value: 30 });

    const row = await req('GET', `/v1/row/${NS}/users/u1`);
    assert.equal(row.status, 200);
    assert.equal(row.data.name, 'Alice');
    assert.equal(row.data.age, 30);
    assert.equal(row.data._row, 'u1');
  });

  it('GET /v1/table returns rows with total count', async () => {
    const plane = await req('GET', `/v1/table/${NS}/users?limit=10`);
    assert.equal(plane.status, 200);
    assert.equal(plane.data.namespace, NS);
    assert.equal(plane.data.table, 'users');
    assert.ok(Array.isArray(plane.data.rows));
    assert.ok(plane.data.total >= 2);
  });

  it('DELETE /v1/row tombstones every column', async () => {
    const del = await req('DELETE', `/v1/row/${NS}/users/u1`);
    assert.equal(del.status, 200);
    assert.equal(del.data.ok, true);
    assert.ok(del.data.deleted >= 2);

    const row = await req('GET', `/v1/row/${NS}/users/u1`);
    assert.equal(row.status, 404);
  });
});

describe('v1 shim — stack', () => {
  it('POST auto-creates cell + PUSH/GET round-trip ascending seq', async () => {
    const p1 = await req('POST', `/v1/stack/${NS}/audit/u1/login`, { delta: { ts: 1 } });
    assert.equal(p1.status, 200);
    assert.equal(p1.data.pushed, true);
    const p2 = await req('POST', `/v1/stack/${NS}/audit/u1/login`, { delta: { ts: 2 } });
    assert.equal(p2.data.pushed, true);

    const stk = await req('GET', `/v1/stack/${NS}/audit/u1/login`);
    assert.equal(stk.status, 200);
    assert.ok(Array.isArray(stk.data.frames));
    assert.ok(stk.data.frames.length >= 2);
    assert.ok(stk.data.frames[0].seq <= stk.data.frames[stk.data.frames.length - 1].seq);
  });
});

describe('v1 shim — schema + listing + stats', () => {
  it('PUT + GET /v1/schema persists through __tcdb__', async () => {
    const put = await req('PUT', `/v1/schema/${NS}/users`, {
      columns: [{ name: 'name', type: 'string' }],
    });
    assert.equal(put.data.ok, true);
    const got = await req('GET', `/v1/schema/${NS}/users`);
    assert.equal(got.status, 200);
    assert.equal(got.data.schema.columns[0].name, 'name');
  });

  it('GET /v1/tables + /v1/namespaces + /v1/stats', async () => {
    const tables = await req('GET', `/v1/tables/${NS}`);
    assert.equal(tables.status, 200);
    assert.ok(tables.data.some((t) => t.table_name === 'players'));

    const namespaces = await req('GET', '/v1/namespaces');
    assert.equal(namespaces.status, 200);
    assert.ok(namespaces.data.some((n) => n.namespace === NS));

    const stats = await req('GET', '/v1/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.data.cells > 0);
  });
});
