import { SoloGame, ITEMS } from './engine.js';
const root = document.querySelector('#app');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let catalog = [], game = null, selected = null, target = 0, nickname = 'You', screen = 'library', lastTick = performance.now();
let toastTimer;
const brand = '<div class="brand"><span class="brand-mark" aria-hidden="true">ϟ</span>Spark<span class="muted">arena</span></div>';
function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3500); }
function best(id) { try { return Number(localStorage.getItem('spark-best:' + id)) || 0; } catch { return 0; } }
function saveBest() { try { localStorage.setItem('spark-best:' + game.quiz.id, String(Math.max(best(game.quiz.id), game.points))); } catch { /* Game remains playable with browser storage disabled. */ } }
function layout(content) {
  root.innerHTML = `<div class="shell"><aside class="sidebar">${brand}<nav aria-label="Main navigation"><button class="nav-item active" data-action="library">▦ Quiz library</button><div class="nav-extra mt-8"><p class="eyebrow mb-3">THE GAME PLAN</p><p class="muted text-xs leading-7">01 &nbsp; Answer & earn<br>02 &nbsp; Build your streak<br>03 &nbsp; Power up & climb</p></div></nav><div class="sidebar-tip">✦<p class="text-white font-semibold mt-2 mb-1">Small sparks. Big ideas.</p>Every answer is a chance to learn something new.</div></aside><main class="main"><header class="topbar"><div><p class="eyebrow">PLAY. LEARN. LEVEL UP.</p><p class="font-semibold mt-1 text-sm">${game ? escape(game.quiz.title) : 'Your next great discovery starts here.'}</p></div><span class="badge">SOLO · COMPUTER RIVALS</span></header>${content}<footer class="muted text-xs mt-8">Browser edition · Your rivals are computer players. No account needed.</footer></main></div>`;
}
function library() {
  layout(`<section class="hero"><span class="badge text-[#d3bcf8]">A LITTLE COMPETITION. A LOT OF DISCOVERY.</span><h1>Make knowledge<br>your <span class="text-[#bdff68]">superpower.</span></h1><p>Choose a quiz, collect sparks, and outsmart three computer rivals. Every answer teaches you something new.</p><button class="btn btn-primary mt-5" data-action="setup" data-id="${escape(catalog[0]?.id)}">Play now ↗</button><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit second"></div><div class="bolt">ϟ</div><div class="float-card one">+60 sparks ✦</div><div class="float-card two">3× ON FIRE</div></div></section><div class="mt-9 mb-5"><p class="eyebrow mb-2">PICK YOUR NEXT CHALLENGE</p><h2 class="section-heading">The quiz library</h2></div><section class="quiz-grid" aria-label="Quiz sets">${catalog.map((q, i) => `<article class="quiz-card"><div class="quiz-art ${['science', 'math', 'geo'][i % 3]}" aria-hidden="true"><span class="quiz-symbol">${['⚛', 'π', '◎'][i % 3]}</span></div><div class="quiz-body"><span class="eyebrow">${escape(q.subject)}</span><h3>${escape(q.title)}</h3><p>${escape(q.description)}</p><div class="flex items-center justify-between mt-5"><span class="muted text-xs">${q.questions.length} questions</span><button class="btn btn-secondary" data-action="setup" data-id="${escape(q.id)}">Play quiz ↗</button></div><p class="muted text-xs mt-4">Personal best: ${best(q.id)} ϟ</p></div></article>`).join('')}</section><section class="panel mt-7"><h2 class="font-semibold">How to win</h2><p class="muted text-sm mt-3 leading-7">Correct answers earn 30 sparks plus a streak bonus. Miss an answer? Read the explanation and keep learning. Spend sparks on upgrades, shields, or attacks. The biggest balance when the timer ends wins.</p></section>`);
}
function setup() {
  layout(`<button class="muted text-sm mb-6" data-action="library">← Back to library</button><section class="panel max-w-xl mx-auto"><p class="eyebrow">YOUR NEXT CHALLENGE</p><h1 class="section-heading mt-3">${escape(selected.title)}</h1><p class="muted text-sm mt-3 mb-6">Race three computer rivals. Learn at your own pace.</p><form id="play-form"><label for="nickname">Your nickname</label><input id="nickname" name="nickname" maxlength="18" value="${escape(nickname)}" required autocomplete="nickname"><label for="duration">Game length</label><select id="duration" name="duration"><option value="60">1 minute · Quick spark</option><option value="180" selected>3 minutes · Classic arena</option><option value="300">5 minutes · Deep dive</option></select><label class="flex gap-3 items-center mt-5"><input name="sabotage" type="checkbox" checked> Enable power-up attacks</label><p class="muted text-xs mt-3">Turn attacks off for a focused learning session.</p><button class="btn btn-primary mt-6" type="submit">Start learning ↗</button></form></section>`);
}
function ranking() { return [{ id: 'you', name: nickname, points: game.points }, ...game.rivals].sort((a, b) => b.points - a.points || (a.id === 'you' ? -1 : 1)); }
function leaderboard() {
  return `<section class="panel"><p class="eyebrow mb-3">LIVE LEADERBOARD</p>${ranking().map((p, i) => `<div class="leader-row ${p.id === 'you' ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="avatar">${escape(p.name[0])}</span><div class="flex-1"><strong class="text-sm">${escape(p.name)}</strong><p class="muted text-[10px]">${p.id === 'you' ? 'You' : 'Computer rival'}</p></div><strong>${p.points} ϟ</strong></div>`).join('')}</section><section class="panel mt-5"><p class="eyebrow mb-3">ARENA ACTIVITY</p>${game.events.map(event => `<p class="muted text-xs my-3">${escape(event)}</p>`).join('')}</section>`;
}
function question() {
  if (game.status === 'paused') return '<section class="panel empty py-16"><h1 class="section-heading">A quick breather.</h1><p class="muted mt-3">Your timer and computer rivals are paused.</p><button class="btn btn-primary mt-6" data-action="pause">Resume game ▷</button></section>';
  const frozen = game.elapsed < game.frozenUntil;
  const feedback = game.feedback;
  return `<section class="panel question"><div class="flex justify-between"><span class="eyebrow">${feedback ? 'A LITTLE KNOWLEDGE GAINED' : 'THINK FAST. THINK BRIGHT.'}</span><span class="muted text-xs">+30 base sparks</span></div>${feedback ? `<div class="feedback ${feedback.correct ? '' : 'wrong'} mt-6" role="status"><h2 class="text-xl">${feedback.correct ? 'Brilliant!' : 'Keep that spark alive.'} ${feedback.delta >= 0 ? '+' : ''}${feedback.delta} ϟ</h2><p class="font-semibold mt-4">${escape(game.question.answers[game.question.correctIndex])}</p><p class="muted text-sm mt-3 leading-6">${escape(game.question.explanation)}</p><button class="btn btn-primary mt-5" data-action="next" ${frozen ? 'disabled' : ''}>Next question →</button></div>` : `<h2>${escape(game.question.prompt)}</h2><div class="answers">${game.choices.map((choice, i) => `<button class="answer" data-action="answer" data-id="${choice.index}" ${frozen ? 'disabled' : ''}><span class="answer-key">${'ABCD'[i]}</span>${escape(choice.text)}</button>`).join('')}</div>`}${frozen ? `<div class="freeze-overlay" role="status"><span class="text-4xl">❄</span><strong>${game.frozenUntil - game.elapsed}s</strong><p>Ice pulse! You’ll be back in a flash.</p></div>` : ''}</section>`;
}
function shop() {
  const frozen = game.elapsed < game.frozenUntil;
  return `<section class="panel mt-5"><div class="flex justify-between"><h2 class="section-heading">Power-up shop</h2><span class="badge">SPEND SMART</span></div>${game.sabotage ? `<label for="target" class="muted text-xs mt-4">Choose a computer rival</label><select id="target">${game.rivals.map(p => `<option value="${p.id}" ${p.id === target ? 'selected' : ''}>${escape(p.name)} · ${p.points} sparks</option>`).join('')}</select>` : ''}<div class="shop-grid mt-5">${ITEMS.filter(item => game.sabotage || ['boost', 'streak'].includes(item.id)).map(item => { const level = item.id === 'boost' ? game.boost : item.id === 'streak' ? game.streakLevel : 0; const maxed = level >= 3 || (item.id === 'shield' && game.shield); return `<article class="shop-item"><span class="shop-icon">${item.icon}</span><h3>${item.name}</h3><p>${item.description}</p>${['boost', 'streak'].includes(item.id) ? `<p class="muted text-xs">Level ${level} / 3</p>` : ''}<button class="btn btn-secondary" data-action="buy" data-id="${item.id}" ${maxed || frozen || game.status !== 'playing' || game.points < game.price(item) ? 'disabled' : ''}>${maxed ? 'Active / maxed' : game.price(item) + ' ϟ · Buy'}</button></article>`; }).join('')}</div><p class="muted text-xs mt-4">Purchases cost leaderboard points. Upgrades last for this game.</p></section>`;
}
function results() {
  const rank = ranking().findIndex(p => p.id === 'you') + 1;
  layout(`<section class="panel podium"><span class="badge">ARENA COMPLETE</span><div class="text-6xl text-[#bdff68] my-6">♛</div><h1>${rank === 1 ? 'You take the crown!' : 'Your spark is growing.'}</h1><p class="muted mt-3">${game.points} sparks · ${game.correct} correct answers · Rank #${rank}</p><div class="stat-grid mt-7"><div class="stat"><strong>${game.answered ? Math.round(game.correct / game.answered * 100) : 0}%</strong><span class="muted text-xs">Accuracy</span></div><div class="stat"><strong>${game.bestStreak}</strong><span class="muted text-xs">Best streak</span></div><div class="stat"><strong>${best(game.quiz.id)}</strong><span class="muted text-xs">Personal best</span></div></div><div class="flex justify-center gap-3 mt-7"><button class="btn btn-primary" data-action="again">Play again ↗</button><button class="btn btn-secondary" data-action="library">Quiz library</button></div></section><div class="arena-grid mt-6"><section class="panel"><h2 class="section-heading">Keep the knowledge</h2>${game.missed.length ? game.missed.map(q => `<article class="mt-5"><h3 class="font-semibold">${escape(q.prompt)}</h3><p class="text-[#bdff68] text-sm mt-2">${escape(q.answers[q.correctIndex])}</p><p class="muted text-sm mt-2">${escape(q.explanation)}</p></article>`).join('') : '<p class="muted mt-4">No missed questions. Try another quiz to stretch your knowledge!</p>'}</section><aside>${leaderboard()}</aside></div>`);
}
function arena() {
  if (game.status === 'ended') return results();
  layout(`<div class="flex justify-between items-center mb-5"><div class="flex gap-3"><button class="btn btn-secondary" data-action="pause">${game.status === 'paused' ? '▷ Resume' : 'Ⅱ Pause'}</button><button class="btn btn-danger" data-action="end">Finish game</button></div><strong class="text-2xl text-[#bdff68]" id="timer">${Math.floor(game.remaining / 60)}:${String(game.remaining % 60).padStart(2, '0')}</strong></div><div class="arena-grid"><div><div class="stat-grid mb-5"><div class="stat"><strong class="text-[#bdff68]">${game.points} ϟ</strong><span class="muted text-xs">Spark balance</span></div><div class="stat"><strong>${game.streak} ✦</strong><span class="muted text-xs">${game.multiplier().toFixed(1)}× streak multiplier</span></div><div class="stat"><strong>${game.shield ? '◇ On' : '◇ Off'}</strong><span class="muted text-xs">Energy shield</span></div></div>${question()}${shop()}</div><aside>${leaderboard()}</aside></div>`);
}
function render() { if (screen === 'arena') arena(); else if (screen === 'setup') setup(); else library(); }
function finish() { game.status = 'ended'; saveBest(); render(); }
root.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  if (action === 'library') { if (game && game.status !== 'ended') saveBest(); game = null; screen = 'library'; }
  if (action === 'setup') { selected = catalog.find(q => q.id === id); if (!selected) return; screen = 'setup'; }
  if (action === 'again') { selected = game.quiz; game = null; screen = 'setup'; }
  if (action === 'answer') { const result = game.answer(Number(id)); if (result?.correct && game.streak >= 3) { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); } }
  if (action === 'next') game.nextQuestion();
  if (action === 'buy') { try { game.buy(id, target); toast('Power-up activated!'); } catch (error) { toast(error.message); } }
  if (action === 'pause' && game.status !== 'ended') { game.status = game.status === 'paused' ? 'playing' : 'paused'; lastTick = performance.now(); }
  if (action === 'end') { finish(); return; }
  render();
});
root.addEventListener('change', event => { if (event.target.id === 'target') target = Number(event.target.value); });
root.addEventListener('submit', event => {
  if (event.target.id !== 'play-form') return; event.preventDefault();
  const form = new FormData(event.target); nickname = String(form.get('nickname')).trim().slice(0, 18) || 'You';
  game = new SoloGame(selected, { duration: Number(form.get('duration')), sabotage: form.has('sabotage') }); target = 0; lastTick = performance.now(); screen = 'arena'; render();
});
// Active play time pauses when the page is hidden, preventing background losses.
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.status === 'playing') { game.status = 'paused'; render(); } lastTick = performance.now(); });
setInterval(() => {
  const now = performance.now(); const seconds = Math.floor((now - lastTick) / 1000);
  if (seconds < 1) return; lastTick += seconds * 1000;
  if (game?.status !== 'playing') return;
  // Preserve open select interaction and keyboard focus during live updates.
  const focused = document.activeElement; const focusAction = focused?.dataset?.action; const focusId = focused?.dataset?.id;
  game.tick(seconds); if (game.status === 'ended') saveBest();
  if (focused?.id === 'target' && game.status !== 'ended') { document.querySelector('#timer').textContent = `${Math.floor(game.remaining / 60)}:${String(game.remaining % 60).padStart(2, '0')}`; return; }
  render();
  if (focusAction) [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === focusAction && el.dataset.id === focusId)?.focus({ preventScroll: true });
}, 250);
try {
  const response = await fetch('./quizzes.json'); if (!response.ok) throw new Error('Quiz catalog could not be loaded.'); catalog = await response.json(); render();
} catch (error) { layout(`<section class="panel"><h1 class="section-heading">The arena couldn’t load.</h1><p class="muted mt-3">${escape(error.message)} Please refresh to try again.</p></section>`); }
