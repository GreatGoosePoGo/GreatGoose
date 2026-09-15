/* Local RPC bridge. Heavy calculations run in a dedicated module worker. */
(() => {
  let worker, sequence = 0;
  const pending = new Map();
  function failAll(message) {
    for (const {reject} of pending.values()) reject(new Error(message));
    pending.clear();worker?.terminate();worker = undefined;
  }
  function connect() {
    if (worker) return worker;
    if (location.protocol === 'file:') throw new Error('Run npm start and open http://localhost:8000 to load the website.');
    worker = new Worker(new URL('engine/worker.js', document.baseURI), {type:'module'});
    worker.onmessage = ({data}) => {
      const job = pending.get(data.id);if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    worker.onerror = () => failAll('The calculation worker stopped. Retry the calculation, or restore your saved battle.');
    worker.onmessageerror = () => failAll('The calculation worker returned unreadable data.');
    return worker;
  }
  globalThis.RaidClient = {
    request(method,payload = {}) {
      return new Promise((resolve,reject) => {
        try {
          const current = connect(), id = ++sequence;
          pending.set(id,{resolve,reject});
          try { current.postMessage({id,method,payload}); }
          catch(error) { pending.delete(id);reject(error); }
        } catch(error) { reject(error); }
      });
    },
  };
})();

/* Automatic raid timing: configurable rejoin distribution plus a fixed battle cutoff. */
(() => {
  const DEFAULT_REJOIN = '7.5:1, 8:2, 8.5:1, 11:1';
  const BATTLE_TIMES = [27, 72, 147, 180, 222, 300];
  const grid = document.querySelector('#simulator-view .settings-grid');
  const difficulty = document.querySelector('#raid-difficulty');
  if (!grid || !difficulty) return;

  const normalBattleTime = raidDifficulty =>
    ['Tier 1', 'Tier 3', 'Tier 1 Shadow', 'Tier 3 Shadow'].includes(raidDifficulty) ? 180 : 300;
  const params = new URL(location.href).searchParams;

  const rejoinLabel = document.createElement('label');
  rejoinLabel.append(document.createTextNode('Rejoin time'));
  const rejoinInput = document.createElement('input');
  rejoinInput.id = 'rejoin-time';
  rejoinInput.type = 'text';
  rejoinInput.autocomplete = 'off';
  rejoinInput.spellcheck = false;
  rejoinInput.placeholder = '7.5, 8, 8.5 or 7.5:1, 8:2, 8.5:1';
  rejoinInput.title = 'Enter one time, a comma-separated equal-probability list such as 7.5, 8, 8.5, or give every time a relative weight such as 7.5:1, 8:2, 8.5:1. Do not mix weighted and unweighted entries.';
  rejoinInput.value = params.get('rj') || DEFAULT_REJOIN;
  rejoinLabel.append(rejoinInput);

  const timeLabel = document.createElement('label');
  timeLabel.append(document.createTextNode('Battle time limit'));
  const timeSelect = document.createElement('select');
  timeSelect.id = 'battle-time-limit';
  timeSelect.title = 'Stop the battle at this elapsed time and count it as a loss if the boss is still alive.';
  timeSelect.replaceChildren(...BATTLE_TIMES.map(seconds => {
    const option = document.createElement('option');
    option.value = String(seconds);
    option.textContent = `${seconds} seconds`;
    return option;
  }));
  let previousDifficulty = difficulty.value;
  const requestedTime = Number(params.get('bt'));
  timeSelect.value = String(BATTLE_TIMES.includes(requestedTime)
    ? requestedTime
    : normalBattleTime(previousDifficulty));
  timeLabel.append(timeSelect);

  const seedLabel = document.querySelector('#random-seed')?.closest('label');
  grid.insertBefore(rejoinLabel, seedLabel ?? null);
  grid.insertBefore(timeLabel, seedLabel ?? null);

  const syncBattleTimeDefault = () => {
    if (difficulty.value === previousDifficulty) return;
    const oldDefault = normalBattleTime(previousDifficulty);
    if (Number(timeSelect.value) === oldDefault) {
      timeSelect.value = String(normalBattleTime(difficulty.value));
    }
    previousDifficulty = difficulty.value;
  };
  difficulty.addEventListener('change', syncBattleTimeDefault);

  const originalRequest = globalThis.RaidClient.request.bind(globalThis.RaidClient);
  globalThis.RaidClient.request = (method, payload = {}) => {
    syncBattleTimeDefault();
    if (method === 'simulate') {
      payload = {
        ...payload,
        rejoin_time: rejoinInput.value.trim() || DEFAULT_REJOIN,
        battle_time_limit: Number(timeSelect.value),
      };
    } else if (method === 'turn/start') {
      payload = {...payload, battle_time_limit: Number(timeSelect.value)};
    }
    return originalRequest(method, payload);
  };

  // Keep advanced timing settings on setup/result links without changing the
  // existing v1 encoded setup schema. Old links use the defaults above.
  window.addEventListener('DOMContentLoaded', () => {
    if (!globalThis.RaidShareCodec?.createUrl) return;
    const originalCreateUrl = globalThis.RaidShareCodec.createUrl.bind(globalThis.RaidShareCodec);
    globalThis.RaidShareCodec.createUrl = (...args) => {
      syncBattleTimeDefault();
      const url = new URL(originalCreateUrl(...args));
      url.searchParams.set('rj', rejoinInput.value.trim() || DEFAULT_REJOIN);
      url.searchParams.set('bt', timeSelect.value);
      return url.toString();
    };
  });
})();

/* Test-branch dodge menu: add Smart/30%/50% and retire downtime saver. */
(() => {
  const select = document.querySelector('#dodge-strategy');
  if (!select) return;
  const selected = select.value === 'downtime_saver' ? 'smart' : select.value;
  const choices = [
    ['none', 'Dodge nothing'],
    ['smart', 'Smart dodge'],
    ['damage_50', 'Dodge if damage > 50% max HP'],
    ['damage_30', 'Dodge if damage > 30% max HP'],
    ['all_survivable', 'Dodge every survivable charged move'],
    ['super_effective', 'Dodge super-effective moves'],
    ['non_resisted', 'Dodge every non-resisted move'],
    ['lethal_only', 'Dodge only lethal charged moves'],
  ];
  select.replaceChildren(...choices.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = choices.some(([value]) => value === selected) ? selected : 'none';

  const replayText = document.querySelector('#replay-text');
  if (replayText?.placeholder) {
    replayText.placeholder = replayText.placeholder.replace('Dodge: downtime_saver', 'Dodge: smart');
  }
  const insertExample = document.querySelector('#insert-replay-example');
  if (insertExample && replayText) {
    insertExample.addEventListener('click', () => queueMicrotask(() => {
      replayText.value = replayText.value.replace('Dodge: downtime_saver', 'Dodge: smart');
    }));
  }
})();

/* Keep the batch-size UI aligned with the engine's 1000-battle request cap. */
(() => {
  const BATTLE_LIMIT = 1000;
  window.addEventListener('DOMContentLoaded', () => {
    const count = document.querySelector('#simulation-count');
    const mode = document.querySelector('#boss-moveset-mode');
    const fast = document.querySelector('#boss-fast-move');
    const charged = document.querySelector('#boss-charged-move');
    const note = document.querySelector('#simulation-scope-note');
    if (!count || !mode || !fast || !charged || !note) return;

    const refresh = () => {
      const combinations = mode.value === 'all'
        ? Math.max(1, fast.options.length * charged.options.length)
        : 1;
      const maximum = Math.max(1, Math.min(BATTLE_LIMIT, Math.floor(BATTLE_LIMIT / combinations)));
      if (count.max !== String(maximum)) count.max = String(maximum);
      const games = Number(count.value) || 0;
      count.setCustomValidity(games > maximum
        ? `The ${BATTLE_LIMIT}-battle limit allows at most ${maximum} game${maximum === 1 ? '' : 's'} per moveset for this boss.`
        : '');
      const total = combinations * games;
      note.textContent = fast.options.length || charged.options.length
        ? `${combinations} boss moveset${combinations === 1 ? '' : 's'} × ${games || 0} game${games === 1 ? '' : 's'} = ${total} battle${total === 1 ? '' : 's'}. Maximum ${BATTLE_LIMIT} battles per request.`
        : 'Choose a boss to calculate the batch size.';
    };
    const refreshAfterApp = () => queueMicrotask(refresh);

    count.addEventListener('input', refreshAfterApp);
    mode.addEventListener('change', refreshAfterApp);
    const observer = new MutationObserver(refreshAfterApp);
    observer.observe(count, {attributes: true, attributeFilter: ['max']});
    observer.observe(fast, {childList: true});
    observer.observe(charged, {childList: true});
    refreshAfterApp();
  });
})();