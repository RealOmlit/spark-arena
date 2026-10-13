import test from 'node:test';
import assert from 'node:assert/strict';
import { SoloGame } from '../static/engine.js';
const quiz = { id: 'test', questions: [{ prompt: 'Two plus two?', answers: ['4', '2', '3', '5'], correctIndex: 0, explanation: '2 + 2 = 4.' }] };
test('solo scoring rejects double submissions, applies streaks and caps wrong penalties', () => {
  const game = new SoloGame(quiz);
  assert.equal(game.answer(0).delta, 30); assert.equal(game.answer(0), false);
  game.nextQuestion(); assert.equal(game.answer(0).delta, 36);
  game.nextQuestion(); assert.equal(game.answer(2).delta, -10); assert.equal(game.streak, 0);
  assert.equal(game.missed.length, 1); assert.equal(game.answered, 3);
});
test('solo purchases are atomic and pause freezes countdown and effects', () => {
  const game = new SoloGame(quiz, { random: () => 0.5 }); game.points = 250;
  game.buy('boost'); assert.equal(game.boost, 1); assert.equal(game.points, 150);
  assert.throws(() => game.buy('boost')); assert.equal(game.points, 150);
  game.buy('freeze', 0); game.status = 'paused'; game.tick(10); assert.equal(game.elapsed, 0);
  game.status = 'playing'; game.tick(4); assert.equal(game.rivals[0].points, 0);
  game.buy('shield'); assert.equal(game.shield, true);
});
test('solo timer ends game and denies answers and purchases afterwards', () => {
  const game = new SoloGame(quiz, { duration: 2 }); game.tick(3);
  assert.equal(game.status, 'ended'); assert.equal(game.remaining, 0);
  assert.equal(game.answer(0), false); assert.throws(() => game.buy('shield'));
});
test('shield blocks computer attack and focus mode prevents offensive purchases', () => {
  const game = new SoloGame(quiz, { random: () => 0 }); game.points = 100; game.buy('shield'); game.tick(35);
  assert.equal(game.shield, false); assert.equal(game.frozenUntil, 0);
  const focused = new SoloGame(quiz, { sabotage: false }); focused.points = 500;
  assert.throws(() => focused.buy('freeze', 0)); assert.equal(focused.points, 500);
});
