/* Player controls only. The browser engine resolves every hit and energy change. */
(() => {
  const at = id => document.getElementById(`turn-${id}`);
  let battle = null;
  let busy = false;
  let hideNumbers = false;
  function node(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }
  function status(text, error = false) {
    at("status").textContent = text;
    at("status").classList.toggle("error", error);
  }
  function typeIcon(type) {
    const normalized = String(type || "").toLowerCase();
    const icon = node("span", "", `type-icon type-${normalized}`);
    icon.title = normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
    icon.setAttribute("aria-label", icon.title);
    return icon;
  }
  function setMoveButton(button, type, text) {
    button.replaceChildren(typeIcon(type), node("span", text));
  }
  function meters(host, state, title, description) {
    const heading = node("div", "", "turn-combatant-heading");
    heading.append(node("h3", title), ...((state.types || []).map(typeIcon)));
    const hp = node("div", "", "health-track");
    const hpFill = node("div", "", "health-fill");
    hpFill.style.width = `${Math.max(0, Math.min(100, 100*state.hp/state.max_hp))}%`;
    hpFill.dataset.colour = globalThis.ReplayMath.healthColour(state.hp, state.max_hp);
    hp.append(hpFill);
    const energy = node("div", "", "energy-track");
    const energyFill = node("div", "", "energy-fill");
    energyFill.style.width = `${Math.max(0, Math.min(100, 100*state.energy/state.max_energy))}%`;
    energy.append(energyFill);
    for (const [bar, label, value, maximum] of [[hp, "HP", state.hp, state.max_hp], [energy, "Energy", state.energy, state.max_energy]]) {
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", `${title} ${label}`);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(maximum));
      bar.setAttribute("aria-valuenow", String(value));
    }
    host.replaceChildren(heading, node("p", description), node("span", "HP", "turn-meter-label"), hp,
      node("p", `${state.hp.toLocaleString()} / ${state.max_hp.toLocaleString()} HP`, "turn-numeric"),
      node("span", "Energy", "turn-meter-label"), energy,
      node("p", `${Number(state.energy.toFixed(1))} / ${state.max_energy} energy`, "turn-numeric"));
  }
  function render() {
    if (!battle) return;
    at("battle").hidden = false;
    at("clock").textContent = `${battle.remaining.toFixed(1)}s remaining`;
    at("elapsed").textContent = `Turn ${battle.tick} · ${battle.elapsed.toFixed(1)}s elapsed`;
    const b = battle.boss, p = battle.player;
    meters(at("boss"), b, b.name, b.incoming
      ? `${b.incoming} incoming · hits at ${b.hits_at.toFixed(1)}s${b.enraged ? " · ENRAGED" : ""}`
      : b.hp <= 0 ? "Defeated" : "Between moves");
    meters(at("player"), p, `Player 1 · ${p.name}`, p.in_lobby
      ? `In lobby · rejoin available at ${p.rejoin_at.toFixed(1)}s`
      : !p.on_field ? "Fainted · choose a surviving slot"
      : p.busy_until > battle.elapsed ? `Slot ${p.slot} · ${p.current_action} · ready at ${p.busy_until.toFixed(1)}s`
      : `Slot ${p.slot} · ready`);
    setMoveButton(at("fast"), p.fast_type, `${p.fast} · ${p.fast_seconds}s · +${p.fast_energy} energy`);
    setMoveButton(at("charged"), p.charged_type, `${p.charged} · ${p.charged_seconds}s · −${p.charged_energy} energy`);
    at("dodge").textContent = b.incoming ? `Dodge ${b.incoming}` : "Dodge";
    at("switches").replaceChildren(...battle.team
      .filter(member => member.slot !== p.slot || !p.on_field)
      .map(member => {
        const button = node("button", `Switch to ${member.slot}. ${member.name}`, "secondary turn-action-button");
        button.type = "button";
        button.dataset.slot = String(member.slot);
        button.disabled = !battle.available.switch_slots.includes(member.slot);
        button.addEventListener("click", () => advance("switch", member.slot));
        return button;
      }));
    at("team").replaceChildren(...battle.team.map(member => {
      const row = node("section");
      meters(row, member, `${member.slot}. ${member.name}`, member.hp <= 0 ? "Fainted" : member.slot === p.slot && p.on_field ? "Active" : "Benched");
      return row;
    }));
    at("log").textContent = battle.log.join("\n");
    at("log").scrollTop = at("log").scrollHeight;
    at("recording").textContent = `Saved in this browser after every turn. Export the .txt to keep a separate copy or watch it in Battle replay. Seed ${battle.seed}.`;
    const descriptions = { in_progress: "Choose one action. Each click advances the battle by 0.5 seconds.", victory: "Victory! Your complete recording is ready.",
      time_expired: "Time expired. Your complete recording is ready.", stopped: "Battle ended. Your partial recording is ready." };
    status(descriptions[battle.status]);
    controls();
  }
  function controls() {
    const ended = !battle || battle.status !== "in_progress";
    const available = battle?.available || {};
    at("start").disabled = busy;
    at("restore").disabled = busy || !at("saved").value;
    at("stop").disabled = busy || ended;
    at("wait").disabled = busy || ended;
    for (const action of ["fast", "charged", "dodge", "quit", "rejoin"]) {
      at(action).disabled = busy || ended || !available[action];
    }
    for (const button of at("switches").children) {
      button.disabled = busy || ended || !available.switch_slots?.includes(Number(button.dataset.slot));
    }
    // Last successfully saved turn is always exportable, even during a request.
    at("export").disabled = !battle;
  }
  async function request(path, payload) {
    if (busy) return;
    busy = true; controls(); status("Resolving turn…");
    try {
      const result = await globalThis.RaidClient.request(`turn/${path}`, payload);
      battle = result; render();
      if (path === "start" || path === "stop") await refreshSaved();
    } catch (error) {
      status(error.message + (battle ? " Last saved recording is still available to export." : ""), true);
    } finally { busy = false; controls(); }
  }
  async function refreshSaved() {
    try {
      const records = await globalThis.RaidClient.request("turn/list");
      const selected = battle?.session_id || at("saved").value;
      const options = records.map(record => {
        const option = node("option", `${record.boss} · turn ${record.tick} · ${new Date(record.updated).toLocaleString()}`);
        option.value = record.id;
        return option;
      });
      if (!options.length) { const empty = node("option", "No saved battles"); empty.value = ""; options.push(empty); }
      at("saved").replaceChildren(...options);
      at("saved").value = records.some(record => record.id === selected) ? selected : records[0]?.id || "";
      controls();
    } catch (error) { status(error.message, true); }
  }
  at("saved").addEventListener("change", controls);
  at("restore").addEventListener("click", () => request("restore", { session_id: at("saved").value }));
  refreshSaved();
  function advance(action, slot = null) {
    if (!battle) return;
    return request("step", { session_id: battle.session_id, expected_tick: battle.tick, action, slot });
  }
  at("start").addEventListener("click", async () => {
    if (battle?.status === "in_progress" && !window.confirm("Start a new battle? The current battle stays available under Saved battles.")) return;
    try { await request("start", globalThis.RaidSetup.read()); }
    catch (error) { status(error.message, true); }
  });
  for (const action of ["fast", "charged", "dodge", "quit", "rejoin"]) {
    at(action).addEventListener("click", () => advance(action));
  }
  at("wait").addEventListener("click", () => advance("wait"));
  at("stop").addEventListener("click", () => {
    if (battle && window.confirm("End this battle now? You can still export the partial recording.")) {
      return request("stop", { session_id: battle.session_id, expected_tick: battle.tick });
    }
  });
  at("settings").addEventListener("click", () => globalThis.ReplayUI.showView("simulator-view"));
  at("numbers").addEventListener("click", () => {
    hideNumbers = !hideNumbers;
    document.getElementById("turn-view").classList.toggle("turn-hide-numbers", hideNumbers);
    at("numbers").setAttribute("aria-pressed", String(hideNumbers));
    at("numbers").textContent = hideNumbers ? "Show meter numbers" : "Hide meter numbers";
  });
  at("export").addEventListener("click", () => {
    if (!battle) return;
    const url = URL.createObjectURL(new Blob([battle.replay_text], { type: "text/plain;charset=utf-8" }));
    const link = node("a"); link.href = url; link.download = battle.filename;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  });
})();
