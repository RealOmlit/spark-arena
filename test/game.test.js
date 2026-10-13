import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../server/game.js';
import { quizzes, validateQuizzes } from '../server/quizzes.js';

function fixture(settings = {}) {
  let now = 1_000_000;
  const store = new GameStore(quizzes, { now: () => now, ...settings });
  const room = store.create({ quizId: quizzes[0].id, duration: 60 });
  const alice = store.join(room, 'Alice'), bob = store.join(room, 'Bob');
  alice.connected = bob.connected = true;
  store.control(room, 'start');
  return { store, room, alice, bob, advance: ms => { now += ms; } };
}
function answer(f, p, correct = true) {
  return f.store.answer(f.room, p, { questionId: p.question.id, choiceId: p.question.choices.find(c => c.correct === correct).id });
}
test('correct answers earn streak rewards; wrong answers reset streak without negative balances', () => {
  const f = fixture();
  assert.equal(answer(f, f.alice).delta, 30);
  f.advance(1500); assert.equal(answer(f, f.alice).delta, 36);
  f.advance(1500); assert.equal(answer(f, f.alice).delta, 42);
  f.advance(1500); assert.equal(answer(f, f.alice, false).delta, -10);
  assert.equal(f.alice.streak, 0);
  assert.equal(answer(f, f.bob, false).delta, 0);
});
test('duplicates, invalid choices, rapid answers and stale questions cannot earn points', () => {
  const f = fixture(), q = f.alice.question;
  assert.throws(() => f.store.answer(f.room, f.alice, { questionId: q.id, choiceId: 'forged' }), /valid answer/);
  answer(f, f.alice);
  assert.throws(() => answer(f, f.alice), /moment/);
  f.advance(1500);
  assert.throws(() => f.store.answer(f.room, f.alice, { questionId: q.id, choiceId: q.choices[0].id }), /already/);
  assert.equal(f.alice.points, 30);
});
test('pause stops clock, cooldowns and freeze duration; timer ends game', () => {
  const f = fixture(); f.alice.points = 100;
  f.store.purchase(f.room, f.alice, { itemId: 'freeze', targetId: f.bob.id });
  f.advance(1000); f.store.control(f.room, 'pause');
  f.advance(30_000);
  assert.equal(f.store.remaining(f.room), 59_000);
  assert.equal(f.store.privateState(f.room, f.bob).frozenMs, 4000);
  assert.throws(() => answer(f, f.alice), /not running/);
  f.store.control(f.room, 'resume'); f.advance(4000);
  assert.equal(answer(f, f.bob).delta, 30);
  f.advance(55_000); f.store.tick();
  assert.equal(f.room.status, 'ended');
  assert.throws(() => answer(f, f.alice), /not running/);
});
test('shield blocks exactly one attack; freeze prevents actions; drain removes 10 percent', () => {
  const f = fixture(); f.alice.points = f.bob.points = 1000;
  f.store.purchase(f.room, f.bob, { itemId: 'shield' });
  const result = f.store.purchase(f.room, f.alice, { itemId: 'freeze', targetId: f.bob.id });
  assert.equal(result.blocked, true); assert.equal(f.bob.shield, false); assert.equal(f.bob.frozenUntil, 0);
  f.advance(2000); f.store.purchase(f.room, f.alice, { itemId: 'freeze', targetId: f.bob.id });
  assert.throws(() => answer(f, f.bob), /frozen/);
  assert.throws(() => f.store.purchase(f.room, f.bob, { itemId: 'shield' }), /frozen/);
  f.advance(5000);
  const before = f.bob.points;
  f.store.purchase(f.room, f.alice, { itemId: 'drain', targetId: f.bob.id });
  assert.equal(f.bob.points, before - Math.floor(before * .1));
});
test('upgrade prices scale, levels cap, passive bonuses affect score and invalid purchases are atomic', () => {
  const f = fixture(); f.alice.points = 1000;
  f.store.purchase(f.room, f.alice, { itemId: 'boost' }); assert.equal(f.alice.points, 900);
  assert.equal(answer(f, f.alice).delta, 38);
  f.advance(2000); f.store.purchase(f.room, f.alice, { itemId: 'boost' });
  f.advance(2000); f.store.purchase(f.room, f.alice, { itemId: 'boost' });
  f.advance(2000); assert.throws(() => f.store.purchase(f.room, f.alice, { itemId: 'boost' }), /maximum/);
  const before = f.alice.points;
  assert.throws(() => f.store.purchase(f.room, f.alice, { itemId: 'drain', targetId: f.alice.id }), /rival/);
  assert.equal(f.alice.points, before);
  f.alice.points = 0; assert.throws(() => f.store.purchase(f.room, f.alice, { itemId: 'shield' }), /Not enough/);
});
test('scramble preserves choice IDs and correctness while hidden answers never enter snapshots', () => {
  const f = fixture(); f.alice.points = 500;
  const choices = [...f.bob.question.choices];
  f.store.purchase(f.room, f.alice, { itemId: 'scramble', targetId: f.bob.id });
  assert.deepEqual(new Set(f.bob.question.choices.map(c => c.id)), new Set(choices.map(c => c.id)));
  const state = f.store.privateState(f.room, f.bob);
  assert.equal(state.question.explanation, undefined);
  assert.ok(state.question.choices.every(c => c.correct === undefined));
  assert.equal(f.store.publicState(f.room).quiz, undefined);
  assert.equal(answer(f, f.bob).correct, true);
});
test('nickname reclamation requires the original secret; unsafe names and late joining are rejected', () => {
  const f = fixture();
  assert.throws(() => f.store.join(f.room, '<script>'), /letters/);
  assert.throws(() => f.store.join(f.room, 'alice'), /reserved/);
  assert.equal(f.store.join(f.room, 'alice', f.alice.token), f.alice);
  assert.throws(() => f.store.join(f.room, 'Charlie'), /already started/);
});
test('room limits, focused mode, disconnected targets and expiry are enforced', () => {
  const f = fixture({ maxRooms: 1 });
  assert.throws(() => f.store.create({ quizId: quizzes[0].id }), /busy/);
  f.alice.points = 1000; f.bob.connected = false;
  assert.throws(() => f.store.purchase(f.room, f.alice, { itemId: 'freeze', targetId: f.bob.id }), /connected rival/);
  f.room.sabotage = false;
  assert.throws(() => f.store.purchase(f.room, f.alice, { itemId: 'drain', targetId: f.bob.id }), /disabled/);
  assert.ok(f.store.privateState(f.room, f.alice).shop.every(i => i.type !== 'attack'));
  f.store.control(f.room, 'end'); f.advance(30 * 60_000 + 1);
  assert.deepEqual(f.store.tick(), [f.room.code]);
});
test('quiz validation rejects malformed answer keys', () => {
  const copy = structuredClone(quizzes); copy[0].questions[0].correctIndex = 4;
  assert.throws(() => validateQuizzes(copy), /Invalid question/);
});
