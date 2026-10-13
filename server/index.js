import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GameStore } from './game.js';
import { quizzes, catalog } from './quizzes.js';
import { wireSockets } from './socket.js';

export function createApp(config = {}) {
  const origin = config.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const hostKey = config.hostKey ?? process.env.HOST_KEY ?? '';
  const production = process.env.NODE_ENV === 'production';
  if (production && (!process.env.APP_ORIGIN || hostKey.length < 16)) throw new Error('Production requires APP_ORIGIN and HOST_KEY (16+ characters).');
  function limit(name, fallback, max) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}.`);
    return value;
  }
  const app = express(), http = createServer(app);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'connect-src': ["'self'"], 'upgrade-insecure-requests': production ? [] : null } }, strictTransportSecurity: production ? undefined : false }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/quizzes', (_req, res) => res.json(catalog));
  app.get('/api/config', (_req, res) => res.json({ hostKeyRequired: Boolean(hostKey), maxPlayers: limit('MAX_PLAYERS', 40, 200) }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { maxAge: production ? '1h' : 0, index: 'index.html' }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const io = new Server(http, {
    maxHttpBufferSize: 16_384,
    cors: { origin, methods: ['GET', 'POST'] },
    allowRequest: (req, cb) => {
      // CLI/native clients may omit Origin; browser clients must match the deployed site.
      cb(null, !req.headers.origin || req.headers.origin === origin);
    }
  });
  const store = config.store ?? new GameStore(quizzes, { maxRooms: limit('MAX_ROOMS', 100, 1000), maxPlayers: limit('MAX_PLAYERS', 40, 200) });
  const stop = wireSockets(io, store, { hostKey });
  return { app, http, io, store, close: () => new Promise(resolve => { stop(); io.close(() => resolve()); }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runtime = createApp();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  runtime.http.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Spark Arena listening on port ${port}`));
  let stopping = false;
  async function shutdown() {
    if (stopping) return; stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10_000); timeout.unref();
    await runtime.close(); process.exit(0);
  }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
