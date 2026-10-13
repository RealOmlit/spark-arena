const socket = io({ autoConnect: false });
const root = document.querySelector('#app');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => Number(value).toLocaleString();
let page = 'library', catalog = [], config = {}, room = null, me = null, current = null, feedback = null, targetId = '', busy = false, recovered = false;
let toastTimer;
function read(key, fallback = null) { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Recovery remains available until this page closes. */ } }
current = read('spark-session');
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4500); }
function request(event, data) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new Error('You are offline. Wait for reconnection.')); return; }
    socket.timeout(5000).emit(event, data, (error, result) => {
      if (error) reject(new Error('No response received. The action may have completed; check the arena before retrying.'));
      else if (!result?.ok) reject(new Error(result?.error ?? 'Request failed.'));
      else resolve(result);
    });
  });
}
function remember(session) {
  current = session; save('spark-session', session);
  const keys = read('spark-recovery', {}); keys[`${session.code}:${session.nickname ?? 'host'}`] = session.token; save('spark-recovery', keys);
}
function brand() { return '<div class="brand"><span class="brand-mark" aria-hidden="true">ϟ</span>Spark<span class="muted">arena</span></div>'; }
function layout(content) {
  const focus = document.activeElement;
  const focusedId = focus?.id;
  const focusedAction = focus?.dataset?.action;
  const focusedItem = focus?.dataset?.id;
  const previousTarget = document.querySelector('#target');
  root.innerHTML = `<div class="shell"><aside class="sidebar">${brand()}<nav aria-label="Main navigation"><button class="nav-item ${page === 'library' && !room ? 'active' : ''}" data-action="library"><span aria-hidden="true">▦</span> Quiz library</button><button class="nav-item ${page === 'join' && !room ? 'active' : ''}" data-action="join"><span aria-hidden="true">↗</span> Join a game</button><div class="nav-extra mt-8"><div class="eyebrow mb-3">THE GAME PLAN</div><p class="muted text-xs leading-7">01 &nbsp; Answer & earn<br>02 &nbsp; Build your streak<br>03 &nbsp; Power up & climb</p></div></nav><div class="sidebar-tip"><span class="text-xl" aria-hidden="true">✦</span><p class="text-white font-semibold mt-2 mb-1">Small sparks. Big ideas.</p>Every answer is a chance to learn something new.</div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">CLASSROOMS, SUPERCHARGED</div><p class="font-semibold mt-1 text-sm">${room ? escape(room.title) : 'Your next great lesson starts here.'}</p></div><div class="flex items-center gap-4"><span class="connection"><i class="dot ${socket.connected ? '' : 'offline'}"></i>${socket.connected ? 'Connected' : 'Reconnecting'}</span>${room ? '<button class="btn btn-secondary" data-action="leave">Leave</button>' : '<span class="badge nav-extra">PLAY TO LEARN</span>'}</div></header>${content}<footer class="muted text-xs mt-8 flex justify-between gap-3"><span>Made for curious minds.</span><span>Learn. Earn. Level up. &nbsp;ϟ</span></footer></main></div>`;
  // Keep the native rival picker mounted across realtime updates.
  const nextTarget = document.querySelector('#target');
  if (previousTarget && nextTarget) {
    if (previousTarget.innerHTML !== nextTarget.innerHTML) previousTarget.innerHTML = nextTarget.innerHTML;
    previousTarget.disabled = nextTarget.disabled;
    nextTarget.replaceWith(previousTarget);
  }
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  else if (focusedAction) [...document.querySelectorAll('[data-action]')].find(el => el.dataset.action === focusedAction && el.dataset.id === focusedItem)?.focus({ preventScroll: true });
}
function library() {
  layout(`<section class="hero"><span class="badge text-[#d3bcf8]">A LITTLE COMPETITION. A LOT OF DISCOVERY.</span><h1>Make knowledge<br>your <span class="text-[#bdff68]">superpower.</span></h1><p>Turn your classroom into a live arena. Answer questions, collect sparks, and make your next move.</p><button class="btn btn-primary mt-5" data-action="join">Join an arena <span aria-hidden="true">↗</span></button><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit second"></div><div class="bolt">ϟ</div><div class="float-card one">+60 sparks ✦</div><div class="float-card two">3× ON FIRE</div></div></section><div class="flex items-end justify-between mt-9 mb-5"><div><p class="eyebrow mb-2">PICK YOUR NEXT CHALLENGE</p><h2 class="section-heading">The quiz library<span class="muted text-sm ml-3 font-normal">${catalog.length} sets</span></h2></div><span class="muted text-xs nav-extra">Ready for your classroom</span></div><section class="quiz-grid" aria-label="Quiz sets">${catalog.map((q, i) => `<article class="quiz-card"><div class="quiz-art ${['science','math','geo'][i % 3]}" aria-hidden="true"><span class="quiz-symbol">${['⚛','π','◎'][i % 3]}</span></div><div class="quiz-body"><span class="eyebrow">${escape(q.subject)}</span><h3>${escape(q.title)}</h3><p>${escape(q.description)}</p><div class="flex items-center justify-between mt-5"><span class="muted text-xs">${q.questionCount} questions</span><button class="btn btn-secondary" data-action="setup" data-id="${escape(q.id)}">Host game ↗</button></div></div></article>`).join('')}</section><div class="grid md:grid-cols-3 gap-4 mt-7"><div class="panel text-sm"><span class="text-[#bdff68]">ϟ &nbsp; Learn at your pace</span><p class="muted text-xs mt-2 leading-5">Your own questions. One shared countdown.</p></div><div class="panel text-sm"><span class="text-[#b69cff]">↗ &nbsp; Make a smart move</span><p class="muted text-xs mt-2 leading-5">Save your sparks or invest in a power-up.</p></div><div class="panel text-sm"><span class="text-[#ffbf82]">◇ &nbsp; Everyone stays in</span><p class="muted text-xs mt-2 leading-5">Miss an answer? Learn why, then keep going.</p></div></div>`);
}
function setup(quizId) {
  page = 'setup';
  const q = catalog.find(q => q.id === quizId);
  if (!q) return;
  layout(`<button class="muted text-sm mb-6" data-action="library">← Back to library</button><div class="max-w-xl mx-auto panel fade-in"><p class="eyebrow">TEACHER CONTROL ROOM</p><h1 class="section-heading mt-3">Launch ${escape(q.title)}</h1><p class="muted text-sm mt-2 mb-7">Set the pace. We'll handle the sparks.</p><form id="host-form" data-quiz="${escape(quizId)}"><label for="duration">Arena duration</label><select id="duration" name="duration"><option value="180">3 minutes · quick spark</option><option value="300">5 minutes · classroom classic</option><option value="600">10 minutes · deep dive</option></select><label class="flex items-center gap-3 mt-6"><input class="w-4" type="checkbox" name="sabotage" checked> Enable friendly sabotage</label><p class="muted text-xs mb-6">Turn this off for a focused quiz with upgrades and shields.</p>${config.hostKeyRequired ? '<label for="host-key">Teacher access key</label><input id="host-key" name="hostKey" type="password" autocomplete="current-password" required>' : '<p class="muted text-xs">Teacher access is open on this development server.</p>'}<button type="submit" class="btn btn-primary w-full mt-7">Create arena ↗</button></form></div>`);
}
function join() {
  page = 'join';
  layout(`<div class="max-w-lg mx-auto panel mt-12 fade-in"><div class="text-5xl text-[#bdff68] mb-5" aria-hidden="true">ϟ</div><p class="eyebrow">YOUR ARENA AWAITS</p><h1 class="text-3xl font-bold mt-3 mb-2">Ready to spark?</h1><p class="muted text-sm mb-7">Grab the six-digit code from your teacher.</p><form id="join-form"><label for="code">Room code</label><input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required autocomplete="off" class="text-2xl tracking-[.3em]"><label for="nickname" class="mt-5">Your nickname</label><input id="nickname" name="nickname" minlength="2" maxlength="18" placeholder="e.g. Cosmic Kiwi" autocomplete="off" required><button class="btn btn-primary w-full mt-6" type="submit">Enter the arena ↗</button><p class="muted text-xs mt-4 leading-5">Already played here? Your progress reconnects in this same browser tab.</p></form></div>`);
}
function leaderboard() {
  return `<section class="panel"><div class="flex items-center justify-between mb-3"><h2 class="font-semibold">Leaderboard</h2><span class="badge text-[#bdff68]">${room.status === 'ended' ? 'FINAL' : 'LIVE'}</span></div>${room.players.length ? room.players.map(p => `<div class="leader-row ${p.id === me?.id ? 'me' : ''}"><span class="rank">${p.rank === 1 ? '♛' : p.rank}</span><span class="avatar">${escape(p.nickname.slice(0,1))}</span><div class="min-w-0 flex-1"><p class="text-sm font-semibold truncate">${escape(p.nickname)}${p.id === me?.id ? ' <span class="muted text-xs">you</span>' : ''}</p><p class="muted text-[10px]">${p.connected ? `${p.correct} correct · ${p.streak} streak` : 'Reconnecting…'}</p></div><strong class="text-sm">${fmt(p.points)} <span class="text-[#bdff68]">ϟ</span></strong></div>`).join('') : '<div class="empty">The stage is set.<br>Your players will appear here.</div>'}</section>`;
}
function activity() { return `<section class="panel mt-5"><h2 class="font-semibold mb-2">Arena feed <span class="text-[#b69cff]">✦</span></h2>${room.log.map(entry => `<p class="activity">${escape(entry.message)}</p>`).join('')}</section>`; }
function timer() { const s = Math.ceil(room.remainingMs / 1000); return `<span class="timer">${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}</span>`; }
function lobby() {
  const host = current?.role === 'host';
  return `<section class="panel text-center py-10"><span class="badge text-[#b69cff]">${host ? 'YOUR ARENA IS READY' : 'YOU’RE IN!'}</span><h1 class="section-heading mt-5">${host ? 'Let’s get everyone together.' : 'Get ready to make your move.'}</h1><p class="muted text-sm mt-3">${host ? 'Ask your class to open this website and enter the code.' : 'Your teacher will start the arena soon.'}</p><p class="eyebrow mt-8">ROOM CODE</p><div class="room-code">${escape(room.code)}</div><button class="muted text-xs mt-2" data-action="copy">Copy code ↗</button><div class="flex flex-wrap justify-center gap-3 mt-8">${room.players.map(p => `<span class="badge text-sm tracking-normal ${p.connected ? 'text-white' : 'muted'}">${escape(p.nickname)} ${p.connected ? '✦' : '…'}</span>`).join('')}</div><p class="muted text-xs mt-5">${room.players.filter(p => p.connected).length} connected · ${room.sabotage ? 'Friendly sabotage on' : 'Focused mode'}</p>${host ? '<button class="btn btn-primary mt-7" data-action="control" data-id="start">Start the arena ▷</button>' : ''}</section>`;
}
function shop() {
  const targets = room.players.filter(p => p.id !== me.id && p.connected);
  if (!targets.some(p => p.id === targetId)) targetId = targets[0]?.id ?? '';
  return `<section class="panel mt-5"><div class="flex flex-wrap items-center justify-between gap-4 mb-5"><div><p class="eyebrow mb-2">SPEND SMART. PLAY BIG.</p><h2 class="section-heading">Power-up shop</h2></div>${room.sabotage ? `<div><label for="target" class="text-xs">Choose your rival</label><select id="target" class="text-xs py-2" ${targets.length ? '' : 'disabled'}>${targets.length ? targets.map(p => `<option value="${escape(p.id)}" ${p.id === targetId ? 'selected' : ''}>${escape(p.nickname)} · ${fmt(p.points)} ϟ</option>`).join('') : '<option>No connected rivals</option>'}</select></div>` : '<span class="badge">FOCUSED MODE</span>'}</div><div class="shop-grid">${me.shop.map(item => { const maxed = item.type === 'upgrade' && item.level >= 3; const disabled = busy || !socket.connected || room.status !== 'playing' || me.frozenMs > 0 || me.buyCooldownMs > 0 || me.points < item.price || maxed || (item.id === 'shield' && me.shield) || (item.type === 'attack' && !targetId); return `<article class="shop-item"><span class="shop-icon" aria-hidden="true">${escape(item.icon)}</span><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p>${item.type === 'upgrade' ? `<span class="muted text-[10px]">LEVEL ${item.level} / 3</span>` : `<span class="muted text-[10px]">${escape(item.type.toUpperCase())}</span>`}<button class="btn btn-secondary" data-action="buy" data-id="${item.id}" ${disabled ? 'disabled' : ''}>${maxed ? 'Max level' : item.id === 'shield' && me.shield ? 'Shield active' : `${fmt(item.price)} ϟ · Buy`}</button></article>`; }).join('')}</div><p class="muted text-[11px] mt-4">Purchases reduce your leaderboard balance. Upgrades last for this game.</p></section>`;
}
function question() {
  if (room.status === 'paused') return `<section class="panel empty py-16"><div class="text-4xl text-[#b69cff] mb-5" aria-hidden="true">Ⅱ</div><h1 class="section-heading text-white">A quick breather.</h1><p class="mt-3">${room.pausedByDisconnect ? 'The host disconnected. Your progress and timer are saved.' : 'Your teacher paused the arena. Hang tight!'}</p></section>`;
  if (!me?.question) return '<div class="panel empty">Getting your question ready…</div>';
  return `<section class="panel question"><div class="flex justify-between"><span class="eyebrow">${feedback ? 'A LITTLE KNOWLEDGE GAINED' : 'THINK FAST. THINK BRIGHT.'}</span><span class="text-xs muted">+30 base sparks</span></div>${feedback ? `<div class="feedback ${feedback.correct ? '' : 'wrong'} mt-6" role="status"><p class="text-xl font-bold ${feedback.correct ? 'text-[#bdff68]' : 'text-[#ffaca3]'}">${feedback.correct ? 'Brilliant!' : 'Keep that spark alive.'} <span class="text-sm ml-2">${feedback.delta >= 0 ? '+' : ''}${feedback.delta} ϟ</span></p><p class="mt-4 font-semibold text-sm">${escape(feedback.correctAnswer)}</p><p class="muted text-sm mt-2 leading-6">${escape(feedback.explanation)}</p><button class="btn btn-primary mt-5" data-action="next" ${me.cooldownMs > 0 ? 'disabled' : ''}>${me.cooldownMs > 0 ? 'Next question in a moment…' : 'Next question →'}</button></div>` : `<h2>${escape(me.question.prompt)}</h2><div class="answers">${me.question.choices.map((choice, i) => `<button class="answer" data-action="answer" data-id="${choice.id}" ${busy || !socket.connected || me.cooldownMs > 0 || me.frozenMs > 0 ? 'disabled' : ''}><span class="answer-key">${'ABCD'[i]}</span>${escape(choice.text)}</button>`).join('')}</div>`}${me.frozenMs > 0 ? `<div class="freeze-overlay" role="status"><span class="text-4xl mb-2">❄</span><strong>${Math.ceil(me.frozenMs / 1000)}s</strong><p class="mt-2 text-sm">Ice pulse! You’ll be back in a flash.</p></div>` : ''}</section>`;
}
function results() {
  const winner = room.players[0], mine = room.players.find(p => p.id === me?.id);
  return `<section class="panel podium"><span class="badge text-[#bdff68]">ARENA COMPLETE</span><div class="text-6xl text-[#bdff68] my-6" aria-hidden="true">♛</div><h1>${winner ? escape(winner.nickname) + ' takes the crown.' : 'That’s a wrap.'}</h1><p class="muted mt-3">${winner ? fmt(winner.points) + ' sparks. A whole lot of learning.' : 'Ready for the next round?'}</p>${mine ? `<div class="stat-grid mt-7"><div class="stat"><strong>#${mine.rank}</strong><span class="muted text-xs">Your rank</span></div><div class="stat"><strong>${mine.answered ? Math.round(mine.correct / mine.answered * 100) : 0}%</strong><span class="muted text-xs">Accuracy</span></div><div class="stat"><strong>${mine.bestStreak}</strong><span class="muted text-xs">Best streak</span></div></div>` : ''}<button class="btn btn-primary mt-8" data-action="leave">Back to the library ↗</button></section>`;
}
function arena() {
  if (!room || !current) return;
  const host = current.role === 'host';
  let content;
  if (room.status === 'lobby') content = lobby();
  else if (room.status === 'ended') content = results();
  else if (host) content = `<section class="panel"><p class="eyebrow">TEACHER CONTROL ROOM · ${escape(room.code)}</p><div class="flex justify-between items-end my-5"><h1 class="section-heading">${room.status === 'playing' ? 'Your classroom is on fire.' : 'The arena is paused.'}</h1>${timer()}</div><progress class="progress-track" aria-label="Time remaining" max="${room.durationMs}" value="${room.remainingMs}"></progress><div class="stat-grid mt-7"><div class="stat"><strong>${room.players.filter(p => p.connected).length}</strong><span class="muted text-xs">Connected players</span></div><div class="stat"><strong>${room.players.reduce((n,p) => n + p.correct,0)}</strong><span class="muted text-xs">Correct answers</span></div><div class="stat"><strong>${room.players.reduce((n,p) => n + p.answered,0)}</strong><span class="muted text-xs">Questions answered</span></div></div><div class="flex gap-3 mt-7"><button class="btn btn-primary" data-action="control" data-id="${room.status === 'playing' ? 'pause' : 'resume'}">${room.status === 'playing' ? 'Ⅱ Pause game' : '▷ Resume game'}</button><button class="btn btn-danger" data-action="control" data-id="end">End arena</button></div><p class="muted text-xs mt-5">Rankings use current Spark Points. Investing in upgrades is part of the strategy.</p></section>`;
  else if (!me) content = '<div class="panel empty">Syncing your progress…</div>';
  else content = `<div class="flex justify-between mb-4 items-center"><span class="badge">${escape(room.code)} · ${room.status.toUpperCase()}</span>${timer()}</div><div class="stat-grid mb-5"><div class="stat"><strong class="text-[#bdff68]">${fmt(me.points)} ϟ</strong><span class="muted text-xs">Spark balance</span></div><div class="stat"><strong>${me.streak} <span class="text-[#ffbf82]">✦</span></strong><span class="muted text-xs">${me.multiplier.toFixed(1)}× streak multiplier</span></div><div class="stat"><strong class="text-[#b69cff]">${me.shield ? '◇ On' : '◇ Off'}</strong><span class="muted text-xs">Energy shield</span></div></div>${question()}${shop()}`;
  layout(`<div class="arena-grid"><div>${!socket.connected ? '<p class="panel text-[#ffbf82] mb-5" role="status">Connection lost. Reconnecting automatically…</p>' : ''}${content}</div><aside class="arena-aside">${leaderboard()}${activity()}</aside></div>`);
}
function render() { if (room && current) arena(); else if (page === 'join') join(); else if (page === 'library') library(); }
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; render(); });
}
socket.on('connect', async () => {
  if (current && !recovered) {
    recovered = true;
    try { await request(current.role === 'host' ? 'host:resume' : 'player:join', current.role === 'host' ? { code: current.code, token: current.token } : current); }
    catch (error) { current = null; room = me = null; save('spark-session', null); page = 'library'; toast(error.message); }
  }
  render();
});
socket.on('disconnect', () => { recovered = false; if (room) render(); });
socket.on('room:state', state => { room = state; if (state.status === 'ended') feedback = null; scheduleRender(); });
socket.on('player:state', state => { me = state; scheduleRender(); });
socket.on('player:attack', data => toast(data.blocked ? `Your shield blocked ${data.from}’s attack!` : `${data.from} used ${data.itemId} on you!`));
socket.on('session:replaced', () => { current = null; room = me = null; save('spark-session', null); page = 'library'; render(); toast('This session was opened in another connection.'); });
socket.on('room:expired', () => { current = null; room = me = null; save('spark-session', null); page = 'library'; render(); toast('This arena has expired. Create or join a new game.'); });

root.addEventListener('change', e => { if (e.target.id === 'target') targetId = e.target.value; });
root.addEventListener('click', async e => {
  const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'copy') { try { await navigator.clipboard.writeText(room.code); toast('Room code copied.'); } catch { toast(`Room code: ${room.code}`); } return; }
  if (['library','join','setup'].includes(action)) { if (current && room) { toast('Leave your current arena to open another.'); return; } if (action === 'setup') setup(id); else { page = action; render(); } return; }
  if (action === 'next') { feedback = null; render(); return; }
  if (busy) return;
  busy = true; button.disabled = true;
  try {
    if (action === 'leave') { await request('session:leave', {}); current = null; room = me = feedback = null; targetId = ''; save('spark-session', null); page = 'library'; }
    if (action === 'control') await request('host:control', { action: id });
    if (action === 'answer') {
      const result = await request('player:answer', { questionId: me.question.id, choiceId: id }); feedback = result.feedback;
      if (feedback.correct && feedback.streak % 3 === 0) { root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); toast(`${feedback.streak} in a row! Keep that streak alive. ✦`); }
    }
    if (action === 'buy') { const result = await request('player:buy', { itemId: id, targetId }); toast(result.message); }
  } catch (error) { toast(error.message); }
  finally { busy = false; render(); }
});
root.addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  const form = e.target, data = new FormData(form); busy = true;
  const button = form.querySelector('button[type="submit"]') ?? form.querySelector('button'); button.disabled = true;
  try {
    let result;
    if (form.id === 'host-form') result = await request('host:create', { quizId: form.dataset.quiz, duration: Number(data.get('duration')), sabotage: data.has('sabotage'), hostKey: data.get('hostKey') ?? '' });
    else if (form.id === 'join-form') {
      const code = data.get('code').trim(), nickname = data.get('nickname').normalize('NFKC').trim();
      const token = read('spark-recovery', {})[`${code}:${nickname}`];
      result = await request('player:join', { code, nickname, token });
    }
    if (result) { remember(result.session); recovered = true; feedback = null; render(); }
  } catch (error) { toast(error.message); }
  finally { busy = false; button.disabled = false; if (room && current) render(); }
});
try {
  const responses = await Promise.all([fetch('/api/quizzes'), fetch('/api/config')]);
  if (responses.some(r => !r.ok)) throw new Error('Unable to load the quiz library. Refresh to try again.');
  [catalog, config] = await Promise.all(responses.map(r => r.json()));
  render(); socket.connect();
} catch (error) { layout('<div class="panel empty">Unable to load the arena. Check your connection and refresh the page.</div>'); toast(error.message); }
