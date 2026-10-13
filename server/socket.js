import { GameError, equalSecret } from './game.js';

export function wireSockets(io, store, { hostKey = '', logger = console } = {}) {
  const connections = new Map();
  const attempts = new Map();
  io.use((socket, next) => {
    const ip = socket.handshake.address, now = Date.now();
    let bucket = attempts.get(ip);
    if (!bucket || now - bucket.at > 60_000) {
      if (!bucket && attempts.size >= 10_000) return next(new Error('Server busy. Try again shortly.'));
      bucket = { at: now, joins: 0, creates: 0 }; attempts.set(ip, bucket);
    }
    if (++bucket.joins > 240) return next(new Error('Too many connections. Wait a minute.'));
    next();
  });
  const publish = room => {
    io.to(room.code).emit('room:state', store.publicState(room));
    for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit('player:state', store.privateState(room, p));
  };
  io.on('connection', socket => {
    const ip = socket.handshake.address;
    const count = connections.get(ip) ?? 0;
    if (count >= 60 || io.engine.clientsCount > 5000) { socket.disconnect(true); return; }
    connections.set(ip, count + 1);
    let allowance = 25, last = Date.now();
    function bind(room, role, player) {
      if (socket.data.code) throw new GameError('Leave your current arena before joining another.');
      socket.data = { code: room.code, role, playerId: player?.id };
      socket.join(room.code);
      const old = role === 'host' ? room.hostSocket : player.socketId;
      if (role === 'host') room.hostSocket = socket.id;
      else { player.socketId = socket.id; player.connected = true; }
      if (old && old !== socket.id) { io.to(old).emit('session:replaced'); io.sockets.sockets.get(old)?.disconnect(true); }
      room.updatedAt = store.now();
    }
    function session(role) {
      const room = store.get(socket.data.code);
      if (socket.data.role !== role) throw new GameError('This action is not available for your role.');
      if (role === 'host' && room.hostSocket !== socket.id) throw new GameError('Host session expired.');
      const player = room.players.get(socket.data.playerId);
      if (role === 'player' && player?.socketId !== socket.id) throw new GameError('Player session expired.');
      return { room, player };
    }
    function on(event, handler) {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const time = Date.now(); allowance = Math.min(25, allowance + (time - last) / 400); last = time;
        if (allowance < 1) { reply({ ok: false, error: 'Too many actions. Slow down a little.' }); return; }
        allowance--;
        try {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new GameError('Invalid request.');
          reply({ ok: true, ...handler(payload) });
        } catch (error) {
          if (!(error instanceof GameError)) logger.error('Socket action failed', event, error);
          reply({ ok: false, error: error instanceof GameError ? error.message : 'Something went wrong. Please try again.' });
        }
      });
    }
    on('host:create', payload => {
      const bucket = attempts.get(ip);
      if (Date.now() - bucket.at > 60_000) { bucket.at = Date.now(); bucket.creates = 0; bucket.joins = 0; }
      if (++bucket.creates > 10) throw new GameError('Too many host attempts. Wait a minute.');
      if (socket.data.code) throw new GameError('Leave your current arena first.');
      if (hostKey && !equalSecret(hostKey, payload.hostKey)) throw new GameError('The teacher access key is incorrect.');
      const room = store.create(payload); bind(room, 'host'); publish(room);
      return { session: { role: 'host', code: room.code, token: room.hostToken } };
    });
    on('host:resume', ({ code, token }) => {
      const room = store.get(code);
      if (!equalSecret(room.hostToken, token)) throw new GameError('Invalid host recovery token.');
      bind(room, 'host'); publish(room);
      return { session: { role: 'host', code, token } };
    });
    on('player:join', ({ code, nickname, token }) => {
      if (socket.data.code) throw new GameError('Leave your current arena first.');
      const room = store.get(code), player = store.join(room, nickname, token);
      bind(room, 'player', player); publish(room);
      return { session: { role: 'player', code, nickname: player.nickname, token: player.token } };
    });
    on('host:control', ({ action }) => {
      const { room } = session('host'); store.control(room, action); publish(room); return {};
    });
    on('player:answer', payload => {
      const { room, player } = session('player');
      const feedback = store.answer(room, player, payload); publish(room); return { feedback };
    });
    on('player:buy', payload => {
      const { room, player } = session('player');
      const result = store.purchase(room, player, payload);
      if (result.targetId) {
        const target = room.players.get(result.targetId);
        io.to(target.socketId).emit('player:attack', { itemId: result.itemId, blocked: result.blocked, from: player.nickname });
      }
      publish(room); return result;
    });
    function detach() {
      const room = store.rooms.get(socket.data.code);
      if (room) {
        if (socket.data.role === 'host' && room.hostSocket === socket.id) {
          room.hostSocket = null;
          if (room.status === 'playing') { store.control(room, 'pause'); room.pausedByDisconnect = true; store.note(room, 'Host disconnected. The timer is safely paused.'); }
        } else {
          const player = room.players.get(socket.data.playerId);
          if (player?.socketId === socket.id) { player.connected = false; player.socketId = null; store.note(room, `${player.nickname} disconnected. Their progress is saved.`); }
        }
        publish(room);
      }
      socket.leave(socket.data.code ?? ''); socket.data = {};
    }
    on('session:leave', () => { detach(); return {}; });
    socket.on('disconnect', () => {
      const n = connections.get(ip) ?? 1; if (n <= 1) connections.delete(ip); else connections.set(ip, n - 1);
      detach();
    });
  });
  const timer = setInterval(() => {
    for (const [ip, bucket] of attempts) if (Date.now() - bucket.at > 60_000 && !connections.has(ip)) attempts.delete(ip);
    for (const code of store.tick()) { io.to(code).emit('room:expired'); io.in(code).disconnectSockets(true); }
    for (const room of store.rooms.values()) if (room.status === 'playing') publish(room);
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
