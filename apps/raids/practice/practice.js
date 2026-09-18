import {PracticeController} from './controller.js';
const at = id => document.getElementById(`practice-${id}`);
let ready = false, editing = true, heldFast = false, lastTick = -1, lastSession = '', incomingKey = '', incomingStart = 0;
const text = (id, value) => { const el = at(id); if (el.textContent !== value) el.textContent = value; };
function status(message, error = false) { text('status', message); at('status').classList.toggle('error', error); }
function types(id, values) {
  const host = at(id);
  if (host.dataset.types === values.join(',')) return;
  host.dataset.types = values.join(',');
  host.replaceChildren(...values.map(value => {
    const icon = document.createElement('span'); icon.className = `type-icon type-${value.toLowerCase()}`;
    icon.title = value; icon.setAttribute('aria-label', value); return icon;
  }));
}
function meter(id, value, maximum, health = false) {
  const host = at(id), percent = Math.max(0, Math.min(100, value / maximum * 100));
  host.setAttribute('aria-valuenow', String(value)); host.setAttribute('aria-valuemax', String(maximum));
  host.firstElementChild.style.width = `${percent}%`;
  if (health) host.firstElementChild.style.background = percent > 50 ? '#67dbac' : percent > 20 ? '#f4bd59' : '#ff7a85';
}
const controller = new PracticeController({
  request: (...args) => globalThis.RaidClient.request(...args),
  change: render,
  error: error => status(error.message, true),
});
function render() {
  const battle = controller.battle;
  document.querySelector('#simulate').disabled = !ready || controller.busy;
  if (!battle) return;
  const {boss, player, available} = battle;
  const live = battle.status === 'in_progress';
  const active = controller.running && live && !editing;
  text('state', !live ? battle.status === 'victory' ? 'VICTORY' : battle.status === 'time_expired' ? 'TIME EXPIRED' : 'ATTEMPT ENDED' : controller.running ? 'LIVE PRACTICE' : 'PAUSED');
  text('time', battle.remaining.toFixed(1));
  at('time').parentElement.classList.toggle('urgent', battle.remaining <= 30);
  text('seed', `Seed ${battle.seed}`);
  text('boss-name', boss.name + (boss.enraged ? ' · Enraged' : boss.subdued ? ' · Subdued' : ''));
  types('boss-types', boss.types); meter('boss-hp', boss.hp, boss.max_hp, true);
  text('boss-numbers', `${boss.hp.toLocaleString()} / ${boss.max_hp.toLocaleString()} HP`);
  const key = `${battle.session_id}:${boss.incoming}:${boss.hits_at}`;
  if (key !== incomingKey) { incomingKey = key; incomingStart = battle.elapsed; }
  const untilHit = boss.incoming ? Math.max(0, boss.hits_at - battle.elapsed) : 0;
  text('incoming', boss.incoming ? `${boss.incoming} incoming` : live ? 'Boss is between moves' : 'Battle finished');
  text('hit-time', boss.incoming ? `Hits in ${untilHit.toFixed(1)}s` : '');
  at('warning').classList.toggle('imminent', live && !!boss.incoming && untilHit <= 1);
  at('windup').style.width = boss.incoming ? `${100 * (1 - untilHit / Math.max(.5, boss.hits_at - incomingStart))}%` : '0%';
  text('player-name', `${player.slot}. ${player.name}`); types('player-types', player.types);
  meter('player-hp', player.hp, player.max_hp, true);
  text('player-numbers', `${player.hp} / ${player.max_hp} HP`);
  meter('energy', player.energy, 100);
  at('energy-cost').style.left = `calc(${player.charged_energy}% - 2px)`;
  text('energy-label', `${player.energy} / 100 energy · charged attack needs ${player.charged_energy}`);
  text('action', !live ? 'Attempt complete' : player.in_lobby ? `In lobby · ${available.rejoin ? 'ready to rejoin' : `ready in ${Math.max(0, player.rejoin_at - battle.elapsed).toFixed(1)}s`}` : !player.on_field ? 'Fainted — choose a surviving teammate' : player.busy_until > battle.elapsed ? `${player.current_action} · ${(player.busy_until - battle.elapsed).toFixed(1)}s remaining` : 'Ready');
  text('fast-name', player.fast); text('charged-name', player.charged);
  at('fast').disabled = !active || !player.on_field;
  at('charged').disabled = !active || !player.on_field || player.energy < player.charged_energy;
  at('dodge').disabled = !active || !player.on_field || !boss.incoming;
  at('quit').disabled = !active || !available.quit;
  at('rejoin').hidden = !player.in_lobby;
  at('rejoin').disabled = !active || !available.rejoin;
  at('pause').disabled = !live || controller.busy;
  text('pause', controller.running ? 'Pause (P)' : 'Resume (P)');
  at('retry').disabled = controller.busy;
  at('edit').disabled = controller.busy;
  at('end').disabled = !live || controller.busy;
  const pending = controller.pending;
  text('queued', pending ? `Queued: ${pending.action === 'switch' ? `switch to slot ${pending.slot}` : pending.action} · new input replaces it` : controller.repeatFast && active ? 'Repeating fast attacks when ready' : '');
  if (battle.tick !== lastTick || battle.session_id !== lastSession) {
    text('feedback', battle.log.at(-1) || '');
    text('log', battle.log.join('\n')); lastTick = battle.tick; lastSession = battle.session_id;
  }
  // Keep slot buttons stable so keyboard focus and pointer clicks survive each tick.
  const host = at('team');
  while (host.children.length > battle.team.length) host.lastElementChild.remove();
  battle.team.forEach((member, index) => {
    let button = host.children[index];
    if (!button) {
      button = document.createElement('button'); button.type = 'button';
      button.append(document.createElement('strong'), document.createElement('span'));
      button.addEventListener('click', () => controller.queue('switch', member.slot)); host.append(button);
    }
    const selected = member.slot === player.slot && player.on_field;
    button.firstElementChild.textContent = `${member.slot}. ${member.name}`;
    button.lastElementChild.textContent = member.hp <= 0 ? 'Fainted' : `${member.hp}/${member.max_hp} HP · ${member.energy} energy`;
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !active || selected || member.hp <= 0 || player.in_lobby;
  });
  at('result').hidden = live;
  if (!live) {
    text('result-title', battle.status === 'victory' ? 'Victory!' : battle.status === 'time_expired' ? 'Time expired' : 'Attempt ended');
    text('result-stats', `${battle.elapsed.toFixed(1)}s elapsed · ${(100 * (1 - boss.hp / boss.max_hp)).toFixed(1)}% damage dealt · ${player.faints} faints · ${player.rejoins} rejoins`);
  }
}
function edit() {
  controller.pause(); heldFast = false; syncRepeat(); editing = true;
  document.querySelector('#simulator-view').hidden = false;
  at('intro').hidden = false; at('battle').hidden = true;
  document.querySelector('#simulate').textContent = 'Start practice';
  status('Choose your boss and team, then start practice.');
}
async function start(payload) {
  if (!ready || controller.busy) return;
  try {
    const request = payload || globalThis.RaidSetup.read({singlePlayer: true});
    status('Starting raid…');
    heldFast = false; syncRepeat();
    if (await controller.start(request)) {
      editing = false; document.querySelector('#simulator-view').hidden = true;
      at('intro').hidden = true; at('battle').hidden = false;
      if (document.hidden) controller.pause();
      render(); status(''); at('battle').scrollIntoView({block: 'start', behavior: 'instant'});
      at('pause').focus({preventScroll: true});
    }
  } catch (error) { status(error.message, true); }
}
globalThis.RaidPractice = {start: () => start()};
globalThis.ReplayUI = {showView: edit};
function setupReady() {
  ready = true;
  const headings = document.querySelectorAll('#simulator-form > .panel h2');
  if (headings[1]) headings[1].textContent = '2. Build your team';
  const note = document.querySelector('#simulator-form > .panel:nth-child(2) .section-heading p');
  if (note) note.textContent = 'Bring up to six Pokémon. You choose when to attack, dodge and switch.';
  document.querySelector('#simulate').textContent = 'Start practice';
  document.querySelector('#simulate').disabled = false;
  status('Choose your boss and team, then start practice.');
}
window.addEventListener('raid-setup-ready', setupReady);
// The catalog can already be cached before this module finishes loading.
if (document.querySelector('#boss').pokemonSearch) setupReady();
else document.querySelector('#simulate').disabled = true;
function syncRepeat() { controller.repeatFast = heldFast || at('auto').checked; render(); }
for (const action of ['fast', 'charged', 'dodge', 'quit', 'rejoin']) at(action).addEventListener('click', () => controller.queue(action));
at('auto').addEventListener('change', syncRepeat);
at('speed').addEventListener('change', () => controller.setSpeed(Number(at('speed').value)));
function togglePause() {
  heldFast = false; syncRepeat();
  if (controller.running) controller.pause(); else { status(''); controller.resume(); }
}
at('pause').addEventListener('click', togglePause);
at('edit').addEventListener('click', edit);
at('retry').addEventListener('click', () => {
  const running = controller.running; controller.pause();
  if (controller.battle.status !== 'in_progress' || confirm('Restart this attempt with the same team and seed? Export first if you want to keep this recording.')) start(controller.setup);
  else if (running) controller.resume();
});
at('end').addEventListener('click', async () => {
  const running = controller.running; controller.pause();
  if (confirm('End this attempt? You can still export its replay.')) await controller.end();
  else if (running) controller.resume();
});
at('export').addEventListener('click', () => {
  if (!controller.battle) return;
  const url = URL.createObjectURL(new Blob([controller.battle.replay_text], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `raid-practice-${controller.battle.seed}.txt`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('keydown', event => {
  if (editing || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable || event.ctrlKey || event.altKey || event.metaKey) return;
  const action = {KeyF: 'fast', Space: 'fast', KeyC: 'charged', KeyD: 'dodge'}[event.code];
  if (!action && event.code !== 'KeyP' && !/^Digit[1-6]$/.test(event.code)) return;
  event.preventDefault(); if (event.repeat) return;
  if (event.code === 'KeyP') { togglePause(); return; }
  if (!controller.running) return;
  if (/^Digit/.test(event.code)) {
    const slot = Number(event.code.slice(-1)), member = controller.battle.team[slot - 1];
    if (member?.hp > 0 && !controller.battle.player.in_lobby && (slot !== controller.battle.player.slot || !controller.battle.player.on_field)) controller.queue('switch', slot);
  } else if (!at(action).disabled) {
    if (action === 'fast') { heldFast = true; syncRepeat(); }
    controller.queue(action);
  }
});
window.addEventListener('keyup', event => { if (['KeyF', 'Space'].includes(event.code)) { heldFast = false; syncRepeat(); } });
window.addEventListener('blur', () => { heldFast = false; syncRepeat(); controller.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { heldFast = false; syncRepeat(); controller.pause(); } });
window.addEventListener('pagehide', () => controller.pause());
