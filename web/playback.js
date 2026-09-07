/* Playback displays calculated battle states. Damage and energy rules stay in the engine. */
(() => {
  function healthColour(hp, maximum) {
    const ratio = maximum > 0 ? hp / maximum : 0;
    return ratio > 0.5 ? "green" : ratio >= 0.25 ? "yellow" : "red";
  }
  function stateAt(frames, tick) {
    let low = 0;
    let high = frames.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (frames[middle].tick <= tick) low = middle + 1;
      else high = middle;
    }
    return frames[Math.max(0, low - 1)];
  }
  function clockText(ticks) { return `${(Math.max(0, ticks) / 2).toFixed(1)}s`; }
  globalThis.ReplayMath = { healthColour, stateAt, clockText };
  if (typeof document === "undefined") return;

  const panel = document.querySelector("#playback-panel");
  const play = document.querySelector("#playback-play");
  const restart = document.querySelector("#playback-restart");
  const step = document.querySelector("#playback-step");
  const numbers = document.querySelector("#playback-numbers");
  const speed = document.querySelector("#playback-speed");
  const seek = document.querySelector("#playback-seek");
  const clock = document.querySelector("#playback-clock");
  const elapsed = document.querySelector("#playback-elapsed");
  const outcome = document.querySelector("#playback-outcome");
  const bossHost = document.querySelector("#playback-boss");
  const playerHost = document.querySelector("#playback-players");
  let data = null;
  let position = 0;
  let playing = false;
  let lastRealTime = 0;
  let animation = null;
  let lastTick = -1;
  let cards = new Map();
  let messages = new Map();
  let visualStates = new Map();
  let numbersVisible = true;

  function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function combatantCard(target, label, host) {
    const card = element("article", "combatant-card");
    const caption = element("p", "combatant-caption", label);
    const spriteArea = element("div", "sprite-area");
    const floating = element("span", "effectiveness-message");
    const sprite = element("div", "pokemon-circle", "?");
    sprite.setAttribute("aria-hidden", "true");
    spriteArea.append(floating, sprite);
    const heading = element("div", "combatant-heading");
    const name = element("h3", "combatant-name");
    const types = element("div", "combatant-types");
    heading.append(name, types);
    const action = element("p", "combatant-action");
    const health = element("div", "health-track");
    health.setAttribute("role", "progressbar");
    health.setAttribute("aria-label", `${label} HP`);
    health.setAttribute("aria-valuemin", "0");
    const fill = element("div", "health-fill");
    health.append(fill);
    const hp = element("p", "combatant-hp");
    const energyTrack = element("div", "energy-track");
    energyTrack.setAttribute("role", "progressbar");
    energyTrack.setAttribute("aria-label", `${label} energy`);
    energyTrack.setAttribute("aria-valuemin", "0");
    const energyFill = element("div", "energy-fill");
    energyTrack.append(energyFill);
    const energy = element("p", "combatant-energy");
    const partyPower = element("p", "combatant-party-power");
    const state = element("p", "combatant-state");
    const team = element("div", "replay-team");
    card.append(caption, spriteArea, heading, action, health, hp, energyTrack, energy, partyPower, state, team);
    host.append(card);
    const refs = { card, name, types, typeKey: "", floating, sprite, action, health, fill, hp,
      energyTrack, energyFill, energy, partyPower, state, team, slot: null };
    cards.set(target, refs);
    return refs;
  }

  function meter(refs, hp, maxHp, energy, maxEnergy) {
    refs.fill.style.width = `${Math.max(0, Math.min(100, hp / maxHp * 100))}%`;
    refs.fill.dataset.colour = healthColour(hp, maxHp);
    refs.hp.textContent = `${hp.toLocaleString()} / ${maxHp.toLocaleString()} HP`;
    refs.health.setAttribute("aria-valuemax", String(maxHp));
    refs.health.setAttribute("aria-valuenow", String(hp));
    refs.energyFill.style.width = `${Math.min(100, energy / maxEnergy * 100)}%`;
    refs.energy.textContent = `Energy ${Number(energy.toFixed(1))} / ${maxEnergy}`;
    refs.energyTrack.setAttribute("aria-valuemax", String(maxEnergy));
    refs.energyTrack.setAttribute("aria-valuenow", String(energy));
  }

  function renderTypes(refs, pokemonTypes = []) {
    const normalized = pokemonTypes.map(type => String(type).toLowerCase());
    const key = normalized.join("|");
    if (refs.typeKey === key) return;
    refs.typeKey = key;
    refs.types.replaceChildren(...normalized.map(type => {
      const icon = element("span", `type-icon type-${type}`);
      icon.title = type[0].toUpperCase() + type.slice(1);
      icon.setAttribute("aria-label", icon.title);
      return icon;
    }));
  }

  function animateSprite(refs, transition) {
    if (!transition) return;
    refs.sprite.classList.remove("sprite-entering", "sprite-leaving", "sprite-swapping");
    // Restart the keyframe even when seeking quickly through several transitions.
    void refs.sprite.offsetWidth;
    refs.sprite.classList.add(`sprite-${transition}`);
  }

  function render() {
    if (!data) return;
    const tick = Math.min(data.duration_ticks, Math.floor(position + 1e-7));
    const frame = stateAt(data.frames, tick);
    if (tick !== lastTick) {
      lastTick = tick;
      clock.textContent = clockText(data.raid_ticks - tick);
      elapsed.textContent = `Elapsed ${clockText(tick)} / ${clockText(data.duration_ticks)}`;
      seek.value = String(tick);
      seek.setAttribute("aria-valuetext", `${clockText(tick)} elapsed, ${clockText(data.raid_ticks - tick)} remaining`);
      const boss = cards.get("boss");
      boss.name.textContent = data.boss.name;
      renderTypes(boss, data.boss.types);
      meter(boss, frame.boss_hp, data.boss.max_hp, frame.boss_energy, data.boss.max_energy);
      const bossVisible = frame.boss_hp > 0;
      const previousBoss = visualStates.get("boss");
      animateSprite(boss, previousBoss === undefined && bossVisible ? "entering" :
        previousBoss && !bossVisible ? "leaving" : null);
      visualStates.set("boss", bossVisible);
      boss.card.classList.toggle("fainted", frame.boss_hp <= 0);
      boss.state.textContent = frame.boss_hp <= 0 ? "Defeated" : frame.enraged ? "Enraged" : "";
      for (let i = 0; i < frame.players.length; i++) {
        const player = frame.players[i];
        const metadata = data.players[i];
        const pokemon = metadata.team[player.slot - 1];
        const refs = cards.get(`p${player.id}`);
        const visualKey = `p${player.id}`;
        const previous = visualStates.get(visualKey);
        const visible = player.on_field && player.hp > 0;
        refs.slot = player.slot;
        refs.name.textContent = pokemon.name;
        renderTypes(refs, pokemon.types);
        meter(refs, player.hp, pokemon.max_hp, player.energy, 100);
        refs.partyPower.textContent = player.party_power_threshold > 0
          ? `Party Power ${player.party_power_progress}/${player.party_power_threshold}`
            + (player.party_power ? " · Next charged damage ×2" : "")
          : "";
        animateSprite(refs, previous === undefined && visible ? "entering" :
          previous?.visible && !visible ? "leaving" :
          !previous?.visible && visible ? "entering" :
          previous?.visible && visible && previous.slot !== player.slot ? "swapping" : null);
        visualStates.set(visualKey, { visible, slot: player.slot });
        refs.card.classList.toggle("off-field", !player.on_field);
        refs.card.classList.toggle("fainted", player.hp <= 0);
        refs.state.textContent = !player.on_field ? "In lobby" : player.hp <= 0 ? "Fainted" :
          `Slot ${player.slot} · Level ${pokemon.level}`
          + (player.party_power ? " · Next charged damage ×2" : "");
        [...refs.team.children].forEach((slot, n) => {
          const member = metadata.team[n];
          const state = player.team[n];
          slot.classList.toggle("active", player.on_field && n === player.slot - 1);
          slot.classList.toggle("fainted", state.hp <= 0);
          slot.dataset.colour = healthColour(state.hp, member.max_hp);
          slot.title = `Slot ${n + 1}: ${member.name} — ${state.hp}/${member.max_hp} HP, ${state.energy} energy`;
          slot.setAttribute("aria-label", slot.title);
        });
      }
      outcome.textContent = tick === data.duration_ticks ?
        (data.result.won ? `Victory at ${clockText(tick)}` :
          tick >= data.raid_ticks ? "Time expired" : "End of recorded timeline") : "";
    }
    for (const [target, refs] of cards) {
      const recent = messages.get(target) || [];
      let effect = null;
      let action = null;
      for (let i = recent.length - 1; i >= 0; i--) {
        const message = recent[i];
        if (message.tick > position) continue;
        if (position - message.tick >= 4) break;
        if (message.kind === "super" || message.kind === "resisted") {
          if (!effect && (message.slot === null || message.slot === refs.slot)) effect = message;
        } else if (!action || (message.kind === "faint" && action.kind !== "faint")) {
          action = message;
        }
      }
      refs.floating.textContent = effect ? effect.text : "";
      refs.floating.dataset.kind = effect ? effect.kind : "";
      const opacity = effect ? Math.max(0, Math.min(1, (4 - (position - effect.tick)) / 2)) : 0;
      refs.floating.style.opacity = String(opacity);
      refs.floating.style.transform = `translateY(${-10 * (1 - opacity)}px)`;
      refs.action.textContent = action ? action.text : "";
      refs.sprite.classList.toggle("acting", !!action && action.kind === "action" && position - action.tick < 1);
    }
  }

  function pause() {
    playing = false;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }

  function setNumbersVisible(visible) {
    numbersVisible = visible;
    panel.classList.toggle("numbers-hidden", !visible);
    numbers.textContent = visible ? "Hide HP & energy numbers" : "Show HP & energy numbers";
    numbers.setAttribute("aria-pressed", String(!visible));
  }

  function animate(now) {
    if (!playing) return;
    position = Math.min(data.duration_ticks, position + (now - lastRealTime) / 1000 * 2 * Number(speed.value));
    lastRealTime = now;
    render();
    if (position >= data.duration_ticks) pause();
    else animation = requestAnimationFrame(animate);
  }

  function start() {
    if (!data) return;
    if (playing) return;
    if (position >= data.duration_ticks) { position = 0; lastTick = -1; }
    playing = true;
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    lastRealTime = performance.now();
    animation = requestAnimationFrame(animate);
  }
  play.addEventListener("click", () => {
    if (playing) pause();
    else start();
  });
  restart.addEventListener("click", () => { pause(); position = 0; lastTick = -1; render(); });
  step.addEventListener("click", () => {
    if (!data) return;
    pause(); position = Math.min(data.duration_ticks, Math.floor(position) + 1); render();
  });
  numbers.addEventListener("click", () => setNumbersVisible(!numbersVisible));
  seek.addEventListener("input", () => { pause(); position = Number(seek.value); lastTick = -1; render(); });
  speed.addEventListener("change", () => { lastRealTime = performance.now(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  globalThis.BattlePlayback = {
    pause,
    start,
    clear() { pause(); data = null; panel.hidden = true; },
    load(playback) {
      pause(); data = playback; position = 0; lastTick = -1;
      cards = new Map(); messages = new Map(); visualStates = new Map();
      bossHost.replaceChildren(); playerHost.replaceChildren();
      combatantCard("boss", "Raid boss", bossHost);
      for (const player of data.players) {
        const refs = combatantCard(`p${player.id}`, `Player ${player.id}`, playerHost);
        player.team.forEach((member, index) => {
          const slot = element("span", "replay-team-slot", "?");
          slot.append(element("small", "replay-slot-number", String(index + 1)));
          refs.team.append(slot);
        });
      }
      data.messages.forEach(message => {
        if (!messages.has(message.target)) messages.set(message.target, []);
        messages.get(message.target).push(message);
      });
      seek.max = String(data.duration_ticks);
      panel.hidden = false;
      render();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };
  setNumbersVisible(true);
})();
