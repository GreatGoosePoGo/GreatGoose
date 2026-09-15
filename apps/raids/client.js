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
