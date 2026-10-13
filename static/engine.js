export const ITEMS = [
  { id: 'boost', name: 'Spark reactor', icon: 'ϟ', price: 100, description: '+25% sparks per answer. Three upgrade levels.' },
  { id: 'streak', name: 'Streak amplifier', icon: '✦', price: 120, description: 'Increase your streak bonus. Three upgrade levels.' },
  { id: 'shield', name: 'Energy shield', icon: '◇', price: 60, description: 'Block the next computer rival attack.' },
  { id: 'freeze', name: 'Ice pulse', icon: '❄', price: 80, description: 'Freeze a computer rival for five seconds.' },
  { id: 'drain', name: 'Spark siphon', icon: '↘', price: 100, description: 'Remove 10% of a computer rival’s sparks.' },
  { id: 'scramble', name: 'Mind scramble', icon: '⤨', price: 70, description: 'Delay a computer rival’s next move by five seconds.' },
];
export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export class SoloGame {
  constructor(quiz, { duration = 180, sabotage = true, random = Math.random } = {}) {
    this.quiz = quiz; this.random = random; this.duration = duration; this.remaining = duration; this.sabotage = sabotage;
    this.status = 'playing'; this.elapsed = 0; this.points = 0; this.streak = 0; this.bestStreak = 0; this.correct = 0; this.answered = 0;
    this.boost = 0; this.streakLevel = 0; this.shield = false; this.frozenUntil = 0; this.feedback = null; this.missed = [];
    this.rivals = ['Nova', 'Orbit', 'Pixel'].map((name, id) => ({ id, name, points: 0, frozenUntil: 0, nextMove: 5 + id * 2 }));
    this.events = ['The arena is live. Good luck!']; this.deck = []; this.nextQuestion();
  }
  log(message) { this.events.unshift(message); this.events = this.events.slice(0, 6); }
  multiplier() { return 1 + Math.max(0, Math.min(this.streak - 1, 5)) * (0.2 + 0.1 * this.streakLevel); }
  nextQuestion() {
    if (this.status !== 'playing' || this.elapsed < this.frozenUntil) return false;
    if (!this.deck.length) this.deck = shuffle(this.quiz.questions, this.random);
    this.question = this.deck.pop(); this.choices = shuffle(this.question.answers.map((text, index) => ({ text, index })), this.random); this.feedback = null;
    return true;
  }
  answer(index) {
    if (this.status !== 'playing' || this.feedback || this.elapsed < this.frozenUntil || !Number.isInteger(index) || index < 0 || index > 3) return false;
    const correct = index === this.question.correctIndex; this.answered++;
    let delta;
    if (correct) { this.correct++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); delta = Math.round(30 * (1 + this.boost * 0.25) * this.multiplier()); }
    else { this.streak = 0; delta = -Math.min(this.points, 10); if (!this.missed.includes(this.question)) this.missed.push(this.question); }
    this.points += delta; this.feedback = { correct, delta }; return this.feedback;
  }
  price(item) { return item.price * (item.id === 'boost' ? this.boost + 1 : item.id === 'streak' ? this.streakLevel + 1 : 1); }
  buy(id, targetId) {
    const item = ITEMS.find(item => item.id === id); const target = this.rivals.find(rival => rival.id === targetId);
    const offensive = ['freeze', 'drain', 'scramble'].includes(id);
    if (!item || this.status !== 'playing' || this.elapsed < this.frozenUntil) throw new Error('Wait until the arena is active.');
    if (offensive && (!this.sabotage || !target)) throw new Error('Choose a computer rival first.');
    if ((id === 'boost' && this.boost >= 3) || (id === 'streak' && this.streakLevel >= 3)) throw new Error('This upgrade is at its maximum level.');
    if (id === 'shield' && this.shield) throw new Error('Your shield is already active.');
    const price = this.price(item); if (this.points < price) throw new Error('Answer more questions to earn enough sparks.');
    this.points -= price;
    if (id === 'boost') this.boost++;
    if (id === 'streak') this.streakLevel++;
    if (id === 'shield') this.shield = true;
    if (id === 'freeze') target.frozenUntil = Math.max(target.frozenUntil, this.elapsed + 5);
    if (id === 'drain') target.points -= Math.floor(target.points * 0.1);
    if (id === 'scramble') target.nextMove += 5;
    this.log(`${item.name} activated${offensive ? ' against ' + target.name : ''}.`); return true;
  }
  tick(seconds) {
    if (this.status !== 'playing') return;
    // Run one-second steps so computer moves are independent of rendering frequency.
    for (let i = 0; i < seconds && this.remaining > 0; i++) {
      this.elapsed++; this.remaining--;
      for (const rival of this.rivals) {
        if (this.elapsed < rival.frozenUntil || this.elapsed < rival.nextMove) continue;
        rival.nextMove = this.elapsed + 6 + Math.floor(this.random() * 5);
        rival.points += this.random() < 0.78 ? 30 + Math.floor(this.random() * 15) : -Math.min(10, rival.points);
      }
      if (this.sabotage && this.elapsed % 35 === 0) {
        const rival = this.rivals[Math.floor(this.random() * this.rivals.length)];
        if (rival.points >= 80 && this.elapsed >= rival.frozenUntil) {
          rival.points -= 80;
          if (this.shield) { this.shield = false; this.log(`Your shield blocked ${rival.name}’s attack!`); }
          else { this.frozenUntil = this.elapsed + 5; this.log(`${rival.name} used Ice pulse. Frozen for five seconds!`); }
        }
      }
    }
    if (this.remaining === 0) this.status = 'ended';
  }
}
