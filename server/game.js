import { randomInt, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';

export class GameError extends Error {}
const fail = message => { throw new GameError(message); };
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const token = () => randomBytes(32).toString('hex');
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export const SHOP = Object.freeze([
  { id: 'boost', name: 'Spark reactor', type: 'upgrade', price: 100, icon: '↗', description: '+25% points per correct answer. Three levels.' },
  { id: 'streak', name: 'Streak amplifier', type: 'upgrade', price: 120, icon: 'ϟ', description: '+0.1× per streak step. Three levels.' },
  { id: 'shield', name: 'Energy shield', type: 'defense', price: 60, icon: '◇', description: 'Blocks one incoming attack. One shield at a time.' },
  { id: 'freeze', name: 'Ice pulse', type: 'attack', price: 80, icon: '❄', description: 'Freeze a rival for 5 active game seconds.' },
  { id: 'drain', name: 'Spark siphon', type: 'attack', price: 100, icon: '↓', description: 'Remove 10% of a rival’s current balance.' },
  { id: 'scramble', name: 'Mind scramble', type: 'attack', price: 70, icon: '⇄', description: 'Shuffle a rival’s current answer buttons.' }
]);

export class GameStore {
  constructor(quizzes, { maxRooms = 100, maxPlayers = 40, now = Date.now } = {}) {
    this.quizzes = quizzes; this.rooms = new Map(); this.maxRooms = maxRooms; this.maxPlayers = maxPlayers; this.now = now;
  }
  get(code) { return this.rooms.get(code) ?? fail('Room not found. Check the six-digit code.'); }
  create({ quizId, duration = 180, sabotage = true }) {
    if (this.rooms.size >= this.maxRooms) fail('All arenas are busy. Try again shortly.');
    const quiz = this.quizzes.find(q => q.id === quizId);
    if (!quiz) fail('Choose a valid quiz.');
    if (!Number.isInteger(duration) || duration < 60 || duration > 900 || typeof sabotage !== 'boolean') fail('Invalid game settings.');
    let code; do { code = String(randomInt(100000, 1000000)); } while (this.rooms.has(code));
    const room = { code, quiz, duration: duration * 1000, sabotage, hostToken: token(), hostSocket: null, players: new Map(), status: 'lobby', elapsed: 0, startedAt: 0, updatedAt: this.now(), log: [], pausedByDisconnect: false };
    this.rooms.set(code, room); return room;
  }
  time(room) { return room.elapsed + (room.status === 'playing' ? this.now() - room.startedAt : 0); }
  remaining(room) { return Math.max(0, room.duration - this.time(room)); }
  note(room, message) { room.log.unshift({ id: randomUUID(), message }); room.log = room.log.slice(0, 8); room.updatedAt = this.now(); }
  join(room, nickname, resumeToken) {
    if (typeof nickname !== 'string') fail('Enter a nickname.');
    nickname = nickname.normalize('NFKC').trim();
    if (!/^[\p{L}\p{N} _-]{2,18}$/u.test(nickname)) fail('Use 2–18 letters, numbers, spaces, _ or -.');
    const existing = [...room.players.values()].find(p => p.nickname.toLocaleLowerCase('en-US') === nickname.toLocaleLowerCase('en-US'));
    if (existing) {
      if (!equalSecret(existing.token, resumeToken)) fail('That nickname is reserved. Use your original browser to reconnect, or choose another name.');
      return existing;
    }
    if (room.status !== 'lobby') fail('This game has already started. Join the next arena.');
    if (room.players.size >= this.maxPlayers) fail('This arena is full.');
    const p = { id: randomUUID(), token: token(), nickname, socketId: null, connected: false, points: 0, earned: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0, upgrades: { boost: 0, streak: 0 }, shield: false, frozenUntil: 0, lastBuy: -Infinity, readyAt: 0, order: [], cursor: 0, question: null };
    room.players.set(p.id, p); this.nextQuestion(room, p); this.note(room, `${nickname} joined the arena.`); return p;
  }
  nextQuestion(room, p) {
    if (p.cursor >= p.order.length) { p.order = shuffle(room.quiz.questions.map((_, i) => i)); p.cursor = 0; }
    const source = room.quiz.questions[p.order[p.cursor++]];
    p.question = { id: randomUUID(), prompt: source.prompt, explanation: source.explanation, choices: shuffle(source.answers.map((text, i) => ({ id: randomUUID(), text, correct: i === source.correctIndex }))) };
  }
  control(room, action) {
    if (action === 'start' && room.status === 'lobby') {
      if (![...room.players.values()].some(p => p.connected)) fail('Wait for at least one connected player.');
      room.status = 'playing'; room.startedAt = this.now(); this.note(room, 'The arena is live!');
    } else if (action === 'pause' && room.status === 'playing') {
      room.elapsed = this.time(room); room.status = 'paused'; this.note(room, 'The teacher paused the arena.');
    } else if (action === 'resume' && room.status === 'paused') {
      room.status = 'playing'; room.startedAt = this.now(); room.pausedByDisconnect = false; this.note(room, 'Back in action!');
    } else if (action === 'end' && ['playing', 'paused', 'lobby'].includes(room.status)) {
      room.elapsed = this.time(room); room.status = 'ended'; this.note(room, 'Arena complete. Great work!');
    } else fail('That control is unavailable right now.');
  }
  active(room, p) {
    if (room.status !== 'playing' || this.remaining(room) <= 0) fail('The arena is not running.');
    if (p.frozenUntil > this.time(room)) fail('You are frozen. Wait for the ice pulse to expire.');
  }
  answer(room, p, { questionId, choiceId }) {
    this.active(room, p);
    const t = this.time(room);
    if (t < p.readyAt) fail('Take a moment to read the next question.');
    if (questionId !== p.question.id) fail('That question has already been answered.');
    const choice = p.question.choices.find(c => c.id === choiceId);
    if (!choice) fail('Choose a valid answer.');
    const correctAnswer = p.question.choices.find(c => c.correct).text;
    const explanation = p.question.explanation;
    const previous = p.points;
    p.answered++;
    if (choice.correct) {
      p.correct++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
      const multiplier = 1 + Math.min(p.streak - 1, 5) * (0.2 + 0.1 * p.upgrades.streak);
      const award = Math.round(30 * (1 + 0.25 * p.upgrades.boost) * multiplier);
      p.points += award; p.earned += award;
      if (p.streak % 3 === 0) this.note(room, `${p.nickname} is on a ${p.streak}-answer streak!`);
    } else { p.streak = 0; p.points = Math.max(0, p.points - 10); }
    p.readyAt = t + 1500;
    this.nextQuestion(room, p); room.updatedAt = this.now();
    return { correct: choice.correct, delta: p.points - previous, correctAnswer, explanation, streak: p.streak };
  }
  purchase(room, p, { itemId, targetId }) {
    this.active(room, p);
    const item = SHOP.find(i => i.id === itemId);
    if (!item) fail('Unknown shop item.');
    if (this.time(room) - p.lastBuy < 2000) fail('Shop cooling down. Wait two seconds.');
    if (item.type === 'attack' && !room.sabotage) fail('Attacks are disabled in this arena.');
    if (item.type === 'upgrade' && p.upgrades[item.id] >= 3) fail('Upgrade is at its maximum level.');
    if (item.id === 'shield' && p.shield) fail('You already have a shield.');
    const price = item.price * (item.type === 'upgrade' ? p.upgrades[item.id] + 1 : 1);
    if (p.points < price) fail('Not enough Spark Points.');
    let target;
    if (item.type === 'attack') {
      target = room.players.get(targetId);
      if (!target || target.id === p.id || !target.connected) fail('Choose a connected rival.');
      if (item.id === 'freeze' && target.frozenUntil > this.time(room)) fail('That rival is already frozen.');
    }
    p.points -= price; p.lastBuy = this.time(room); room.updatedAt = this.now();
    if (item.type === 'upgrade') p.upgrades[item.id]++;
    if (item.id === 'shield') p.shield = true;
    let blocked = false;
    if (target) {
      if (target.shield) { target.shield = false; blocked = true; }
      else if (item.id === 'freeze') target.frozenUntil = this.time(room) + 5000;
      else if (item.id === 'drain') target.points -= Math.floor(target.points * 0.1);
      else if (item.id === 'scramble') target.question.choices = shuffle(target.question.choices);
      this.note(room, blocked ? `${target.nickname} blocked ${p.nickname}'s attack!` : `${p.nickname} used ${item.name} on ${target.nickname}.`);
    } else this.note(room, `${p.nickname} bought ${item.name}.`);
    return { message: blocked ? 'Attack blocked by a shield!' : `${item.name} activated.`, targetId: target?.id, blocked, itemId };
  }
  publicState(room) {
    return { code: room.code, title: room.quiz.title, subject: room.quiz.subject, status: room.status, sabotage: room.sabotage, remainingMs: this.remaining(room), durationMs: room.duration, hostConnected: Boolean(room.hostSocket), pausedByDisconnect: room.pausedByDisconnect, players: [...room.players.values()].sort((a, b) => b.points - a.points || b.correct - a.correct || a.nickname.localeCompare(b.nickname)).map((p, i) => ({ id: p.id, nickname: p.nickname, points: p.points, streak: p.streak, correct: p.correct, answered: p.answered, bestStreak: p.bestStreak, connected: p.connected, rank: i + 1 })), log: room.log };
  }
  privateState(room, p) {
    const t = this.time(room);
    return { id: p.id, points: p.points, streak: p.streak, upgrades: p.upgrades, shield: p.shield, frozenMs: Math.max(0, p.frozenUntil - t), cooldownMs: Math.max(0, p.readyAt - t), buyCooldownMs: Math.max(0, 2000 - (t - p.lastBuy)), multiplier: 1 + Math.min(Math.max(p.streak - 1, 0), 5) * (0.2 + 0.1 * p.upgrades.streak), question: room.status === 'playing' || room.status === 'paused' ? { id: p.question.id, prompt: p.question.prompt, choices: p.question.choices.map(({ id, text }) => ({ id, text })) } : null, shop: SHOP.filter(i => room.sabotage || i.type !== 'attack').map(i => ({ ...i, price: i.price * (i.type === 'upgrade' ? p.upgrades[i.id] + 1 : 1), level: p.upgrades[i.id] ?? 0 })) };
  }
  tick() {
    const expired = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'playing' && this.remaining(room) <= 0) this.control(room, 'end');
      const ttl = room.status === 'ended' ? 30 * 60_000 : 2 * 60 * 60_000;
      if (this.now() - room.updatedAt > ttl) { this.rooms.delete(room.code); expired.push(room.code); }
    }
    return expired;
  }
}
