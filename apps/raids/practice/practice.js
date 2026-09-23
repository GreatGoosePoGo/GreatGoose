import {BattleFeedback} from './feedback.js';
import {PracticeController, installBattleGestures} from './controller.js';
const at = id => document.getElementById(`practice-${id}`);
const experimental = location.pathname.replace(/\/+$/, '').endsWith('/practice/experimental');
document.body.dataset.inputMode = experimental ? 'experimental' : 'stable';
at('version-title').textContent = experimental ? 'Experimental controls' : 'Stable controls';
at('version-description').textContent = experimental
  ? 'Short input buffering and dodges that can be wasted.'
  : 'The original raid-practice input handling.';
at('version-link').textContent = experimental ? '← Return to stable controls' : 'Try experimental controls →';
at('version-link').href = experimental ? 'practice/' : 'practice/experimental/';
at('input-rules').textContent = experimental
  ? 'Experimental inputs start on the next half-second turn, after hits due on that turn. During recovery, only your latest input is buffered for 250 milliseconds of battle time; earlier taps expire. Every dodge takes one second, even with no incoming attack or if you already dodged that attack. A dodge does not protect against an attack announced later. These are experimental controls for comparison, not a claim of exact game timing. Training mode pauses when switching tabs. Realistic mode keeps the clock running and disables pauses, slow motion and automatic fast attacks. Export a replay before leaving or reloading to keep your attempt.'
  : 'Stable controls keep one action queued until your Pokémon is ready. Dodge is available while a boss attack is incoming. Training mode pauses when switching tabs. Realistic mode keeps the clock running and disables pauses, slow motion and automatic fast attacks. Export a replay before leaving or reloading to keep your attempt.';
const glitchNames = {phantom_relobby:'Phantom relobby', rejoin_snipe:'Rejoin snipe',
  energy_resolve:'Energy resolve bug', switch_charge_freeze:'Charge move freeze on switch', remote_lag:'Remote lag'};
function readGlitches() {
  const chance = at('glitch-phantom_chance');
  if (at('glitch-phantom_relobby').checked && (!chance.value || !chance.checkValidity())) {
    chance.reportValidity(); throw new Error('Phantom relobby chance must be between 0 and 1.');
  }
  return {...Object.fromEntries(Object.keys(glitchNames).map(key => [key, at(`glitch-${key}`).checked])),
    phantom_chance: chance.value && chance.validity.valid ? Number(chance.value) : 0.25};
}
at('glitch-phantom_relobby').addEventListener('change', () => {
  at('glitch-phantom_chance').disabled = !at('glitch-phantom_relobby').checked;
});
const feedback = new BattleFeedback();
const feedbackSettings = document.querySelector('[data-feedback-settings]');
at('feedback-options').append(feedbackSettings.cloneNode(true));
function syncFeedback(event) {
  const kind = event?.target.dataset.feedback;
  if (kind) {
    const value = kind === 'volume' ? Number(event.target.value) / 100 : event.target.checked;
    feedback.configure({[kind]: value});
  }
  document.querySelectorAll('[data-feedback]').forEach(input => {
    const key = input.dataset.feedback;
    if (key === 'volume') input.value = String(feedback.volume * 100);
    else input.checked = key === 'sound' ? feedback.sound : feedback.haptics;
  });
  feedback.unlock();
}
for (const input of document.querySelectorAll('[data-feedback]')) input.addEventListener('input', syncFeedback);
for (const button of document.querySelectorAll('[data-feedback-test]')) button.addEventListener('click', () => {
  feedback.unlock(); setTimeout(() => feedback.play('charged'), 60);
});
if (!navigator.vibrate) {
  document.querySelectorAll('[data-feedback="haptics"]').forEach(input => { input.disabled = true; });
  document.querySelectorAll('[data-vibration-note]').forEach(el => { el.textContent = 'Vibration is unavailable in this browser.'; });
}
for (const event of ['pointerdown','keydown']) document.addEventListener(event, () => feedback.unlock(), {capture:true});
const healthLabel = member => member.hp <= 0 ? 'Fainted' : member.hp / member.max_hp > .5 ? 'Healthy' : member.hp / member.max_hp > .2 ? 'Hurt' : 'Low health';
let resumeAfterOptions = false;
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
  if (controller.realistic) {
    host.setAttribute('role', 'img'); host.removeAttribute('aria-valuenow'); host.removeAttribute('aria-valuemax'); host.removeAttribute('aria-valuemin');
    host.setAttribute('aria-label', `${id === 'boss-hp' ? 'Boss' : 'Your Pokémon'}: ${healthLabel({hp:value,max_hp:maximum})}`);
  } else {
    host.setAttribute('role', 'progressbar'); host.setAttribute('aria-valuemin','0');
    host.setAttribute('aria-valuenow', String(value)); host.setAttribute('aria-valuemax', String(maximum));
    host.setAttribute('aria-label', id === 'boss-hp' ? 'Boss HP' : 'Your Pokémon HP');
  }
  host.firstElementChild.style.width = `${percent}%`;
  if (health) host.firstElementChild.style.background = percent > 50 ? '#67dbac' : percent > 20 ? '#f4bd59' : '#ff7a85';
}
const controller = new PracticeController({
  request: async (method, payload) => {
    const endpoint = experimental && method.startsWith('practice/')
      ? method.replace('practice/', 'practice-experimental/')
      : method;
    const result = await globalThis.RaidClient.request(endpoint, payload);
    feedback.observe(result, payload?.action, controller.catchingUp);
    return result;
  },
  change: render,
  error: error => status(error.message, true),
  experimental,
});
function render() {
  const battle = controller.battle;
  document.querySelector('#simulate').disabled = !ready || controller.busy;
  if (!battle) return;
  const {boss, player, available} = battle;
  const live = battle.status === 'in_progress';
  const realistic = controller.realistic;
  const lobbyPhase = live ? player.lobby_phase : null;
  document.body.classList.toggle('practice-realistic', realistic);
  at('arena').classList.toggle('in-lobby', !!lobbyPhase);
  at('arena').classList.toggle('defeated', lobbyPhase === 'defeated');
  at('lobby').hidden = !lobbyPhase;
  text('lobby-eyebrow', lobbyPhase === 'defeated' ? 'TEAM DOWN' : 'RAID LOBBY');
  text('lobby-title', lobbyPhase === 'defeated' ? 'All your Pokémon have fainted' : 'Raid lobby');
  text('lobby-description', lobbyPhase === 'defeated' ? 'Returning to the lobby…' : player.lobby_reason === 'phantom' ? 'Your healed team is ready for another rejoin attempt.' : 'Get ready to return with the same team.');
  text('lobby-wait', lobbyPhase === 'defeated' ? '' : available.rejoin ? 'Ready to rejoin' : realistic ? 'Preparing your team…' : `Ready in ${Math.max(0,player.rejoin_at-battle.elapsed).toFixed(1)}s`);
  at('auto').disabled = realistic; at('speed').disabled = realistic;
  if (realistic) { at('auto').checked = false; at('speed').value = '1'; }
  text('mode-note', realistic ? 'Realistic mode · The clock continues while settings are open.' : 'Training mode · Opening settings pauses the raid.');
  at('log-details').hidden = realistic;
  at('export').disabled = realistic && live;
  at('pause').hidden = realistic;
  const active = controller.running && live && !editing;
  text('state', !live ? battle.status === 'victory' ? 'VICTORY' : battle.status === 'time_expired' ? 'TIME EXPIRED' : 'ATTEMPT ENDED' : controller.running ? realistic ? 'REALISTIC RAID' : 'LIVE PRACTICE' : 'PAUSED');
  text('time', battle.remaining.toFixed(1));
  at('time').parentElement.classList.toggle('urgent', battle.remaining <= 30);
  text('seed', `Seed ${battle.seed}`);
  text('boss-name', boss.name + (boss.enraged ? ' · Enraged' : boss.subdued ? ' · Subdued' : ''));
  types('boss-types', boss.types); meter('boss-hp', boss.hp, boss.max_hp, true);
  text('boss-numbers', realistic ? '' : `${boss.hp.toLocaleString()} / ${boss.max_hp.toLocaleString()} HP`);
  const key = `${battle.session_id}:${boss.incoming}:${boss.hits_at}`;
  if (key !== incomingKey) { incomingKey = key; incomingStart = battle.elapsed; }
  const untilHit = boss.incoming ? Math.max(0, boss.hits_at - battle.elapsed) : 0;
  text('incoming', boss.incoming ? `${boss.incoming} incoming` : live ? 'Boss is between moves' : 'Battle finished');
  text('hit-time', !realistic && boss.incoming ? `Hits in ${untilHit.toFixed(1)}s` : '');
  at('warning').classList.toggle('imminent', !realistic && live && !!boss.incoming && untilHit <= 1);
  at('windup').style.width = boss.incoming ? `${100 * (1 - untilHit / Math.max(.5, boss.hits_at - incomingStart))}%` : '0%';
  text('player-name', `${player.slot}. ${player.name}`); types('player-types', player.types);
  meter('player-hp', player.hp, player.max_hp, true);
  text('player-numbers', realistic ? '' : `${player.hp} / ${player.max_hp} HP`);
  const lagged = player.lag_until > battle.elapsed;
  const chargeFrozen = player.charged_blocked_until > battle.elapsed;
  const chargeReady = player.energy >= player.charged_energy;
  at('charged').style.setProperty('--charge', `${Math.min(100, 100 * player.energy / player.charged_energy)}%`);
  at('charged').classList.toggle('ready', chargeReady);
  at('charged').setAttribute('aria-label', realistic ? `${player.charged}${chargeReady ? ', ready' : ', charging'}` : `${player.charged}: ${player.energy} energy, needs ${player.charged_energy}${chargeReady ? ', ready' : ''}`);
  text('energy-label', realistic ? '' : `${player.energy} / ${player.charged_energy}`);
  text('action', !live ? 'Attempt complete' : player.in_lobby ? `In lobby · ${available.rejoin ? 'ready to rejoin' : `ready in ${Math.max(0, player.rejoin_at - battle.elapsed).toFixed(1)}s`}` : !player.on_field ? `Fainted · ${player.next_slot ? `slot ${player.next_slot} enters` : 'entering lobby'} in ${Math.max(0, (player.fainting_until ?? battle.elapsed) - battle.elapsed).toFixed(1)}s` : player.busy_until > battle.elapsed ? `${player.current_action} · ${(player.busy_until - battle.elapsed).toFixed(1)}s remaining` : 'Ready');
  text('fast-name', player.fast); text('charged-name', player.charged);
  if (player.lobby_message && player.in_lobby) text('action', `${player.lobby_message} · Phantom relobby · ${available.rejoin ? 'ready to rejoin' : `${Math.max(0, player.rejoin_at - battle.elapsed).toFixed(1)}s to rejoin`}`);
  else if (lagged) text('action', `Rejoin snipe · frozen until impact (${(player.lag_until - battle.elapsed).toFixed(1)}s)`);
  else if (chargeFrozen && player.on_field && player.busy_until <= battle.elapsed) text('action', 'Switch glitch · charged move frozen this turn');
  if (realistic) text('action', !live ? 'Attempt complete' : lagged ? 'Rejoin snipe · controls frozen' : !player.on_field ? 'Sending out your next Pokémon…' : chargeFrozen ? 'Charged move frozen' : player.busy_until > battle.elapsed ? player.current_action : 'Ready');
  at('charged').disabled = !active || !player.on_field || lagged || chargeFrozen || player.energy < player.charged_energy;
  at('quit').disabled = !live || !available.quit;
  at('rejoin').hidden = lobbyPhase !== 'lobby';
  at('charged').hidden = !!lobbyPhase;
  at('rejoin').disabled = !active || !available.rejoin;
  at('pause').disabled = !live || controller.busy;
  text('pause', controller.running ? 'Pause (P)' : 'Resume (P)');
  at('retry').disabled = controller.busy;
  at('edit').disabled = controller.busy;
  at('end').disabled = !live || controller.busy;
  const enabledGlitches = Object.entries(glitchNames).filter(([key]) => battle.glitches?.[key])
    .map(([key, name]) => key === 'phantom_relobby' ? `${name} (${Math.round(battle.glitches.phantom_chance * 100)}%)` : name);
  text('glitches-active', `Current glitches: ${enabledGlitches.join(' · ') || 'off'}`);
  const pending = controller.pending;
  text('queued', pending ? `Queued: ${pending.action === 'switch' ? `switch to slot ${pending.slot}` : pending.action}${experimental ? ' · next turn only' : ''}` : battle.input_result?.outcome === 'wasted' ? 'Dodge used · no new hit avoided' : battle.input_result?.outcome === 'unavailable' ? 'Input missed · Pokémon was unavailable' : controller.repeatFast && active ? 'Repeating fast attacks when ready' : '');
  if (battle.tick !== lastTick || battle.session_id !== lastSession) {
    text('feedback', realistic ? '' : battle.log.at(-1) || '');
    text('log', realistic ? '' : battle.log.join('\n')); lastTick = battle.tick; lastSession = battle.session_id;
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
    button.lastElementChild.textContent = realistic ? healthLabel(member) : member.hp <= 0 ? 'Fainted' : `${member.hp}/${member.max_hp} HP`;
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !active || lagged || selected || member.hp <= 0 || player.in_lobby || !player.on_field;
    button.title = realistic ? `${member.slot}. ${member.name} · ${healthLabel(member)}` : `${member.slot}. ${member.name} · ${member.hp}/${member.max_hp} HP · ${member.energy} energy`;
    button.setAttribute('aria-label', button.title);
  });
  at('result').hidden = live;
  if (!live) {
    text('result-title', battle.status === 'victory' ? 'Victory!' : battle.status === 'time_expired' ? 'Time expired' : 'Attempt ended');
    text('result-stats', `${battle.elapsed.toFixed(1)}s elapsed · ${realistic ? '' : `${(100 * (1 - boss.hp / boss.max_hp)).toFixed(1)}% damage dealt · `}${player.faints} faints · ${player.rejoins} rejoins`);
  }
}
async function edit() {
  if (controller.realistic && controller.battle?.status === 'in_progress') await controller.end();
  closeOptions(); document.body.classList.remove('practice-playing');
  controller.pause(true); feedback.silence(); heldFast = false; syncRepeat(); editing = true;
  document.querySelector('#simulator-view').hidden = false;
  at('intro').hidden = false; at('battle').hidden = true;
  document.querySelector('#simulate').textContent = 'Start practice';
  status('Choose your boss and team, then start practice.');
}
async function start(payload) {
  if (!ready || controller.busy) return;
  try {
    const request = payload || {...globalThis.RaidSetup.read({singlePlayer: true}), practice_glitches: readGlitches(), realistic: at('realistic').checked};
    feedback.unlock();
    closeOptions(); status('Starting raid…');
    heldFast = false; syncRepeat();
    if (await controller.start(request)) {
      editing = false; document.body.classList.add('practice-playing'); document.querySelector('#simulator-view').hidden = true;
      at('intro').hidden = true; at('battle').hidden = false;
      if (document.hidden) controller.pause();
      render(); status(''); at('battle').scrollIntoView({block: 'start', behavior: 'instant'});
      (controller.realistic ? at('options-open') : at('pause')).focus({preventScroll: true});
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
function syncRepeat() { controller.repeatFast = !controller.realistic && (heldFast || at('auto').checked); render(); }
for (const action of ['charged', 'rejoin']) at(action).addEventListener('click', () => controller.queue(action));
at('auto').addEventListener('change', syncRepeat);
at('speed').addEventListener('change', () => controller.setSpeed(Number(at('speed').value)));
function togglePause() {
  if (controller.realistic) return;
  feedback.silence();
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
  if (confirm('End this attempt? You can still export its replay.')) { await controller.end(); closeOptions(); }
  else if (running) controller.resume();
});
at('export').addEventListener('click', () => {
  if (!controller.battle) return;
  const url = URL.createObjectURL(new Blob([controller.battle.replay_text], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `raid-practice-${controller.battle.seed}.txt`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('keydown', event => {
  if (editing || at('options').open || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable || event.ctrlKey || event.altKey || event.metaKey) return;
  const action = {KeyF: 'fast', Space: 'fast', KeyC: 'charged', KeyD: 'dodge'}[event.code];
  if (!action && event.code !== 'KeyP' && !/^Digit[1-6]$/.test(event.code)) return;
  event.preventDefault(); if (event.repeat) return;
  if (event.code === 'KeyP') { togglePause(); return; }
  if (!controller.running) return;
  if (/^Digit/.test(event.code)) {
    const slot = Number(event.code.slice(-1)), member = controller.battle.team[slot - 1];
    if (member?.hp > 0 && controller.battle.player.on_field && !controller.battle.player.in_lobby && (slot !== controller.battle.player.slot || !controller.battle.player.on_field)) controller.queue('switch', slot);
  } else if (canAct(action)) {
    if (action === 'fast' && !controller.realistic) { heldFast = true; syncRepeat(); }
    controller.queue(action);
  }
});
window.addEventListener('keyup', event => { if (['KeyF', 'Space'].includes(event.code)) { heldFast = false; syncRepeat(); } });
window.addEventListener('blur', () => { heldFast = false; controller.pending = null; syncRepeat(); controller.pause(); feedback.silence(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { heldFast = false; controller.pending = null; syncRepeat(); controller.pause(); feedback.silence(); } });
window.addEventListener('pagehide', () => controller.pause());

function canAct(action) {
  const b = controller.battle;
  if (editing || at('options').open || !controller.running || !b?.player.on_field || b.player.in_lobby) return false;
  if (b.player.lag_until > b.elapsed) return false;
  if (action === 'charged') return !(b.player.charged_blocked_until > b.elapsed) && b.player.energy >= b.player.charged_energy;
  if (action === 'dodge') return experimental || !!b.boss.incoming;
  return true;
}
installBattleGestures(document.body, {
  enabled: () => !editing && !at('options').open && controller.running,
  tap: () => { if (canAct('fast')) controller.queue('fast'); },
  swipe: () => { if (canAct('dodge')) controller.queue('dodge'); },
});
function closeOptions() { resumeAfterOptions = false; if (at('options').open) at('options').close(); }
at('options-open').addEventListener('click', () => {
  resumeAfterOptions = controller.running && !controller.realistic;
  heldFast = false; controller.pending = null; syncRepeat(); controller.pause(); feedback.silence();
  at('options').showModal();
});
at('options-close').addEventListener('click', () => at('options').close());
at('options').addEventListener('close', () => {
  if (resumeAfterOptions && !editing) controller.resume();
  resumeAfterOptions = false;
});
at('quit').addEventListener('click', () => {
  closeOptions(); controller.resume(); controller.queue('quit');
});
