import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as client } from 'socket.io-client';
import { createApp } from '../server/index.js';

test('Render production origin works and rejects cross-origin connections', async t => {
  const saved = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL };
  process.env.NODE_ENV = 'production';
  delete process.env.APP_ORIGIN;
  process.env.RENDER_EXTERNAL_URL = 'https://spark-arena-test.onrender.com';
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  assert.throws(() => createApp({ hostKey: '' }), /Production requires/);
  assert.throws(() => createApp({ hostKey: 'long-teacher-test-key', origin: 'https://example.com/path' }), /without a path/);
  const runtime = createApp({ hostKey: 'long-teacher-test-key' });
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await runtime.close(); });
  runtime.http.listen(0, '127.0.0.1'); await once(runtime.http, 'listening');
  const url = `http://127.0.0.1:${runtime.http.address().port}`;
  const config = await (await fetch(`${url}/api/config`)).json();
  assert.equal(config.hostKeyRequired, true);
  assert.equal(config.hostKey, undefined);
  const allowed = client(url, { forceNew: true, reconnection: false, extraHeaders: { Origin: process.env.RENDER_EXTERNAL_URL } });
  sockets.push(allowed); await once(allowed, 'connect');
  const denied = client(url, { forceNew: true, reconnection: false, extraHeaders: { Origin: 'https://untrusted.example' } });
  sockets.push(denied); await once(denied, 'connect_error');
  assert.equal(denied.connected, false);
});
