/* UI adapter only; counter calculations live in the TypeScript worker. */
(() => {
  "use strict";

  const LEVELS = [30, 40, 50];
  const WEATHER = ["", "Sunny/Clear", "Rainy", "Partly Cloudy", "Cloudy", "Windy", "Snow", "Fog"];
  const FRIENDSHIP = [1, 1.03, 1.05, 1.07, 1.10, 1.12];
  const DODGE_STRATEGIES = [
    "none", "all_survivable", "super_effective", "non_resisted", "lethal_only",
  ];
  const PLAYER_STRATEGIES = [
    "no_strategy", "hot_swap_greedy", "hot_swap_cautious", "hot_swap_very_cautious",
  ];
  const MEGA_LEVELS = [1, 2, 3, 4];
  const worker = new Worker("engine-a63b7d5fe155/counters_worker.js", {type: "module"});
  const cache = new Map();
  const pending = new Map();
  let requestId = 0;
  let bosses = null;
  let bossLookup = new Map();
  let counterResult = null;
  let counterBusy = false;
  let movesetBossId = null;
  let initialMovesApplied = false;
  const initialBossFast = params().get("bossFast") || "";
  const initialBossCharged = params().get("bossCharged") || "";
  let includeMegas = initialFlag("megas");
  let includeShadows = initialFlag("shadows");
  let includeLegendaries = initialFlag("legendaries");
  let excludeLegacy = params().get("excludeLegacy") === "1";

  const elements = {
    boss: document.querySelector("#counter-boss"),
    bossOptions: document.querySelector("#counter-boss-options"),
    difficulty: document.querySelector("#counter-difficulty"),
    bossFast: document.querySelector("#counter-boss-fast"),
    bossCharged: document.querySelector("#counter-boss-charged"),
    movesetDifficulty: document.querySelector("#boss-moveset-difficulty"),
    movesetDifficultySummary: document.querySelector("#moveset-difficulty-summary"),
    movesetDifficultyBody: document.querySelector("#moveset-difficulty-body"),
    level: document.querySelector("#counter-level"),
    weather: document.querySelector("#counter-weather"),
    friendship: document.querySelector("#counter-friendship"),
    dodgeStrategy: document.querySelector("#counter-dodge-strategy"),
    playerStrategy: document.querySelector("#counter-player-strategy"),
    megaLevel: document.querySelector("#counter-mega-level"),
    megas: document.querySelector("#counter-include-megas"),
    shadows: document.querySelector("#counter-include-shadows"),
    legendaries: document.querySelector("#counter-include-legendaries"),
    legacy: document.querySelector("#counter-exclude-legacy"),
    generate: document.querySelector("#generate-counters"),
    settings: document.querySelector("#counter-settings"),
    settingsSummary: document.querySelector("#counter-settings-summary"),
    section: document.querySelector("#counter-results"),
    bossLabel: document.querySelector("#counter-boss-label"),
    bossName: document.querySelector("#counter-boss-name"),
    bossMeta: document.querySelector("#counter-boss-meta"),
    bossMark: document.querySelector("#counter-boss-mark"),
    bossTypes: document.querySelector("#counter-boss-types"),
    outcomeStatus: document.querySelector("#counter-outcome-status"),
    outcomeDetail: document.querySelector("#counter-outcome-detail"),
    bestName: document.querySelector("#counter-best-name"),
    bestDps: document.querySelector("#counter-best-dps"),
    bestDamage: document.querySelector("#counter-best-damage"),
    bestFaints: document.querySelector("#counter-best-faints"),
    title: document.querySelector("#counter-results-title"),
    summary: document.querySelector("#counter-summary"),
    body: document.querySelector("#counter-body"),
    error: document.querySelector("#counter-error"),
    progress: document.querySelector("#counter-progress"),
    progressBar: document.querySelector("#counter-progress-bar"),
    progressText: document.querySelector("#counter-progress-text"),
  };

  const settingControls = [
    elements.boss, elements.difficulty, elements.level, elements.weather,
    elements.friendship, elements.dodgeStrategy, elements.playerStrategy,
    elements.megaLevel, elements.megas, elements.shadows, elements.legendaries,
    elements.legacy, elements.bossFast, elements.bossCharged,
  ];

  function params() {
    return new URL(location.href).searchParams;
  }

  function initialFlag(name) {
    return params().get(name) !== "0";
  }

  function initialNumber(name, allowed, fallback) {
    const requested = Number(params().get(name));
    return allowed.includes(requested) ? requested : fallback;
  }

  function initialString(name, allowed, fallback) {
    const requested = params().get(name);
    return allowed.includes(requested) ? requested : fallback;
  }

  function workerRequest(payload, options = {}) {
    const key = options.cacheKey;
    if (key && cache.has(key)) return Promise.resolve(cache.get(key));
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject, key, onProgress: options.onProgress});
      worker.postMessage({id, ...payload});
    });
  }

  worker.addEventListener("message", event => {
    const job = pending.get(event.data.id);
    if (!job) return;
    if (event.data.progress) {
      job.onProgress?.(event.data.progress);
      return;
    }
    pending.delete(event.data.id);
    if (event.data.error) job.reject(new Error(event.data.error));
    else {
      if (job.key) cache.set(job.key, event.data.result);
      job.resolve(event.data.result);
    }
  });

  worker.addEventListener("error", event => {
    for (const job of pending.values()) {
      job.reject(new Error(event.message || "Raid-counter worker failed."));
    }
    pending.clear();
  });

  function bossOptionLabel(boss, nameCounts) {
    const duplicate = nameCounts.get(boss.name.toLocaleLowerCase()) > 1;
    return duplicate ? `${boss.name} (${boss.formId})` : boss.name;
  }

  async function loadBosses() {
    if (bosses) return bosses;
    const result = await workerRequest({mode: "catalog"}, {cacheKey: "boss-catalog"});
    bosses = result.bosses;
    const nameCounts = new Map();
    for (const boss of bosses) {
      const key = boss.name.toLocaleLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const fragment = document.createDocumentFragment();
    bossLookup = new Map();
    for (const boss of bosses) {
      const optionLabel = bossOptionLabel(boss, nameCounts);
      boss.optionLabel = optionLabel;
      bossLookup.set(optionLabel.toLocaleLowerCase(), boss);
      bossLookup.set(boss.formId.toLocaleLowerCase(), boss);
      if (nameCounts.get(boss.name.toLocaleLowerCase()) === 1) {
        bossLookup.set(boss.name.toLocaleLowerCase(), boss);
      }
      const option = document.createElement("option");
      option.value = optionLabel;
      option.label = `#${boss.dexNumber} · ${boss.types.join(" / ")}`;
      fragment.append(option);
    }
    elements.bossOptions.replaceChildren(fragment);
    const requestedId = params().get("raidBoss") ?? "MEWTWO";
    const requested = bossLookup.get(requestedId.toLocaleLowerCase());
    if (requested) elements.boss.value = requested.optionLabel;
    const requestedDifficulty = params().get("raidDifficulty");
    if ([...elements.difficulty.options].some(option => option.value === requestedDifficulty)) {
      elements.difficulty.value = requestedDifficulty;
    }
    syncScenarioPreview();
    return bosses;
  }

  function resolveBoss() {
    return bossLookup.get(elements.boss.value.trim().toLocaleLowerCase()) ?? null;
  }

  function syncBossMoves() {
    const boss = resolveBoss();
    if (movesetBossId === (boss?.formId ?? null)) return;
    const firstLoad = !initialMovesApplied;
    if (boss) initialMovesApplied = true;
    movesetBossId = boss?.formId ?? null;
    for (const [select, moves, label, initial] of [
      [elements.bossFast, boss?.fastMoves ?? [], "All fast moves", initialBossFast],
      [elements.bossCharged, boss?.chargedMoves ?? [], "All charged moves", initialBossCharged],
    ]) {
      select.replaceChildren(new Option(label, ""), ...moves.map(move => new Option(`${move.name} · ${move.type}`, move.id)));
      if (firstLoad && moves.some(move => move.id === initial)) select.value = initial;
    }
  }

  function typeIcon(type) {
    const normalized = String(type).trim().toLocaleLowerCase();
    const icon = document.createElement("span");
    icon.className = `type-icon type-${normalized}`;
    icon.title = normalized ? normalized[0].toLocaleUpperCase() + normalized.slice(1) : "";
    icon.setAttribute("aria-label", icon.title);
    return icon;
  }

  function bossTypeChip(type) {
    const chip = document.createElement("span");
    chip.className = "type-chip";
    chip.append(typeIcon(type), document.createTextNode(type));
    return chip;
  }

  function setHeadlineMetrics(row = null) {
    elements.bestName.textContent = row ? `${row.shadow ? "Shadow " : ""}${row.name}` : "—";
    elements.bestDps.textContent = row ? row.battleDps.toFixed(2) : "—";
    elements.bestDamage.textContent = row ? `${row.averageDamagePercent.toFixed(1)}%` : "—";
    elements.bestFaints.textContent = row ? row.averageFaints.toFixed(2) : "—";
  }

  function setOutcome(status, detail, row = null) {
    elements.outcomeStatus.textContent = status;
    elements.outcomeDetail.textContent = detail;
    setHeadlineMetrics(row);
  }

  function syncScenarioPreview() {
    syncBossMoves();
    const boss = resolveBoss();
    const level = Number(elements.level.value);
    const difficulty = elements.difficulty.value;
    elements.bossLabel.textContent = `${difficulty} raid`;
    if (boss) {
      elements.bossName.textContent = boss.name;
      elements.bossMark.textContent = boss.name.trim().charAt(0).toLocaleUpperCase() || "?";
      elements.bossMeta.textContent = `#${boss.dexNumber} · Level ${level} attackers`;
      elements.bossTypes.replaceChildren(...boss.types.map(bossTypeChip));
    } else {
      elements.bossName.textContent = elements.boss.value.trim() || "Choose a boss";
      elements.bossMark.textContent = "?";
      elements.bossMeta.textContent = `Level ${level} attackers · choose a suggested Pokémon`;
      elements.bossTypes.replaceChildren();
    }

    const weather = elements.weather.value || "No weather";
    const friendship = labelFrom(elements.friendship, elements.friendship.value)
      .replace(/ \([^)]*\)$/, "")
      .replace(/^None$/, "No friendship");
    const dodge = labelFrom(elements.dodgeStrategy, elements.dodgeStrategy.value)
      .replace(/^Dodge nothing$/, "No dodging");
    elements.settingsSummary.textContent = `Level ${level} · ${weather} · ${friendship} · ${dodge}`;
  }

  function currentSettings() {
    return {
      raidDifficulty: elements.difficulty.value,
      bossFastMoveId: elements.bossFast.value,
      bossChargedMoveId: elements.bossCharged.value,
      level: Number(elements.level.value),
      weather: elements.weather.value,
      friendshipMultiplier: Number(elements.friendship.value),
      dodgeStrategy: elements.dodgeStrategy.value,
      playerStrategy: elements.playerStrategy.value,
      megaLevel: Number(elements.megaLevel.value),
      includeMegas,
      includeShadows,
      includeLegendaries,
      excludeLegacy,
    };
  }

  function updateUrl() {
    const url = new URL(location.href);
    const boss = resolveBoss();
    if (boss) url.searchParams.set("raidBoss", boss.formId);
    else url.searchParams.delete("raidBoss");
    const settings = currentSettings();
    url.searchParams.set("raidDifficulty", settings.raidDifficulty);
    url.searchParams.set("level", String(settings.level));
    if (settings.weather) url.searchParams.set("weather", settings.weather);
    else url.searchParams.delete("weather");
    url.searchParams.set("friendship", String(settings.friendshipMultiplier));
    url.searchParams.set("dodge", settings.dodgeStrategy);
    url.searchParams.set("strategy", settings.playerStrategy);
    url.searchParams.set("megaLevel", String(settings.megaLevel));
    url.searchParams.set("megas", settings.includeMegas ? "1" : "0");
    url.searchParams.set("shadows", settings.includeShadows ? "1" : "0");
    url.searchParams.set("legendaries", settings.includeLegendaries ? "1" : "0");
    url.searchParams.set("excludeLegacy", settings.excludeLegacy ? "1" : "0");
    for (const [param, value] of [["bossFast", settings.bossFastMoveId], ["bossCharged", settings.bossChargedMoveId]]) {
      if (value) url.searchParams.set(param, value);
      else url.searchParams.delete(param);
    }
    history.replaceState(null, "", url);
  }

  function cacheKey(boss, settings) {
    return [
      "counters", boss.formId, settings.raidDifficulty, settings.level,
      settings.weather || "none", settings.friendshipMultiplier,
      settings.dodgeStrategy, settings.playerStrategy, settings.megaLevel,
      Number(settings.includeMegas), Number(settings.includeShadows),
      Number(settings.includeLegendaries), Number(settings.excludeLegacy),
      settings.bossFastMoveId || "all", settings.bossChargedMoveId || "all",
    ].join(":");
  }

  function setControlsDisabled(disabled) {
    for (const control of settingControls) control.disabled = disabled;
  }

  function setLoading(boss) {
    elements.movesetDifficulty.hidden = true;
    elements.section.setAttribute("aria-busy", "true");
    elements.error.hidden = true;
    elements.progress.hidden = false;
    elements.progressBar.value = 0;
    elements.progressText.textContent = "Preparing candidate movesets…";
    elements.title.textContent = `Simulating counters for ${boss.name}…`;
    elements.summary.textContent = "Testing the selected boss movesets.";
    elements.body.innerHTML = '<li class="empty-state">Running full raid battles in your browser…</li>';
    setOutcome("Running raid battles", "Preparing the strongest candidate movesets, then testing complete battles.");
    elements.generate.disabled = true;
    elements.generate.textContent = "Simulating…";
    setControlsDisabled(true);
    counterBusy = true;
  }

  function updateProgress(progress) {
    const percent = progress.total ? progress.completed / progress.total * 100 : 0;
    elements.progressBar.value = percent;
    elements.progressText.textContent =
      `Simulating moveset ${progress.completed.toLocaleString()} of ${progress.total.toLocaleString()}…`;
    elements.outcomeDetail.textContent = elements.progressText.textContent;
  }

  async function generateCounters() {
    if (counterBusy) return;
    try {
      await loadBosses();
      const boss = resolveBoss();
      if (!boss) throw new Error("Choose a raid boss from the suggested Pokémon list.");
      const settings = currentSettings();
      updateUrl();
      setLoading(boss);
      counterResult = await workerRequest({
        mode: "counters",
        bossFormId: boss.formId,
        ...settings,
      }, {cacheKey: cacheKey(boss, settings), onProgress: updateProgress});
      renderCounters();
    } catch (error) {
      elements.section.setAttribute("aria-busy", "false");
      elements.progress.hidden = true;
      elements.title.textContent = "Counters unavailable";
      elements.error.textContent = error instanceof Error ? error.message : String(error);
      elements.error.hidden = false;
      elements.body.innerHTML = '<li class="empty-state">No counter results are available for this scenario.</li>';
      setOutcome("Simulation unavailable", elements.error.textContent);
    } finally {
      counterBusy = false;
      elements.generate.disabled = false;
      elements.generate.textContent = "Generate top 30";
      setControlsDisabled(false);
    }
  }

  function moveLine(kind, name, type, elite) {
    const line = document.createElement("div");
    line.className = "move-line";
    const label = document.createElement("span");
    label.className = "move-kind";
    label.textContent = kind;
    const moveName = document.createElement("span");
    moveName.className = "move-name";
    moveName.textContent = name;
    if (elite) {
      const marker = document.createElement("sup");
      marker.className = "elite-star";
      marker.textContent = "*";
      marker.title = "Elite or legacy move";
      marker.setAttribute("aria-label", "Elite or legacy move");
      moveName.append(marker);
    }
    line.append(label, typeIcon(type), moveName);
    return line;
  }

  function variantTag(text, className = "") {
    const tag = document.createElement("span");
    tag.className = `variant-tag${className ? ` ${className}` : ""}`;
    tag.textContent = text;
    return tag;
  }

  function metricBlock(label, value, title = "") {
    const block = document.createElement("div");
    if (title) block.title = title;
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    block.append(term, description);
    return block;
  }

  function counterCard(row, index) {
    const card = document.createElement("li");
    card.className = "counter-card";

    const top = document.createElement("div");
    top.className = "counter-card-top";
    const rank = document.createElement("span");
    rank.className = "rank-badge";
    rank.textContent = String(index + 1);
    rank.setAttribute("aria-label", `Rank ${index + 1}`);

    const identity = document.createElement("div");
    const nameLine = document.createElement("div");
    nameLine.className = "counter-name-line";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "pokemon-name";
    name.textContent = row.name;
    nameLine.append(name);
    if (row.shadow) nameLine.append(variantTag("Shadow", "shadow"));
    if (row.mega) nameLine.append(variantTag(/^Primal\s/i.test(row.name) ? "Primal" : "Mega", "mega"));
    if (row.legendary) nameLine.append(variantTag("Legendary"));

    const meta = document.createElement("div");
    meta.className = "pokemon-meta";
    const dex = document.createElement("span");
    dex.textContent = `#${row.dexNumber}`;
    const types = document.createElement("span");
    types.className = "pokemon-types";
    types.append(...row.pokemonTypes.map(typeIcon));
    const typeNames = document.createElement("span");
    typeNames.textContent = row.pokemonTypes.join(" / ");
    meta.append(dex, types, typeNames);
    if (row.averageWinTime !== null) {
      const clearTime = document.createElement("span");
      clearTime.className = "counter-clear-time";
      clearTime.textContent = `${row.averageWinTime.toFixed(1)}s average clear`;
      meta.append(clearTime);
    }
    identity.append(nameLine, meta);
    top.append(rank, identity);

    const moves = document.createElement("div");
    moves.className = "counter-moves";
    moves.append(
      moveLine("Fast move", row.fastMove, row.fastMoveType, row.eliteFast),
      moveLine("Charged move", row.chargedMove, row.chargedMoveType, row.eliteCharged),
    );

    const metrics = document.createElement("dl");
    metrics.className = "card-metrics";
    metrics.append(
      metricBlock("Battle DPS", row.battleDps.toFixed(2), "Damage divided by battle time, including faint, switch, and relobby downtime."),
      metricBlock("Boss HP", `${row.averageDamagePercent.toFixed(1)}%`, "Average share of the boss's HP removed during one simulated battle."),
      metricBlock("Win rate", `${row.winPercent.toFixed(1)}%`, "Share of simulated boss movesets and trials this team defeated."),
      metricBlock("Faints", row.averageFaints.toFixed(2), "Average attacker faints per simulated battle."),
    );
    const disclosure = document.createElement("details");
    disclosure.className = "counter-breakdown";
    const summary = document.createElement("summary");
    summary.textContent = "Matchup breakdown";
    const panel = document.createElement("div");
    panel.className = "breakdown-body";
    disclosure.append(summary, panel);
    const snapshot = counterResult;
    let requested = false;
    disclosure.addEventListener("toggle", async () => {
      card.classList.toggle("expanded", disclosure.open);
      name.setAttribute("aria-expanded", String(disclosure.open));
      if (!disclosure.open || requested) return;
      requested = true;
      panel.setAttribute("aria-busy", "true");
      panel.textContent = "Simulating this counter’s cycles and team outings…";
      const pick = {formId: row.formId, fastMoveId: row.fastMoveId, chargedMoveId: row.chargedMoveId, shadow: row.shadow};
      try {
        const result = await workerRequest({mode: "breakdown", ...snapshot.settings, pick}, {
          cacheKey: `breakdown:${JSON.stringify(snapshot.settings)}:${JSON.stringify(pick)}`,
        });
        if (snapshot !== counterResult || !card.isConnected) return;
        renderBreakdown(panel, result);
      } catch (error) {
        panel.textContent = `Breakdown unavailable: ${error.message}. Close and reopen to retry.`;
        requested = false;
      } finally {
        panel.setAttribute("aria-busy", "false");
      }
    });
    const panelId = `counter-breakdown-${index}`;
    panel.id = panelId;
    name.setAttribute("aria-controls", panelId);
    name.setAttribute("aria-expanded", "false");
    name.addEventListener("click", () => { disclosure.open = !disclosure.open; });
    card.addEventListener("click", event => {
      if (!event.target.closest("button, details, a, select") && !window.getSelection()?.toString()) {
        disclosure.open = !disclosure.open;
      }
    });
    card.append(top, moves, metrics, disclosure);
    return card;
  }

  function labelFrom(select, value) {
    return [...select.options].find(option => option.value === String(value))?.textContent ?? String(value);
  }

  function textElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function dataTable(caption, headers, rows) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", caption);
    const table = document.createElement("table");
    table.append(textElement("caption", caption));
    const head = document.createElement("thead");
    const titles = document.createElement("tr");
    headers.forEach(title => {
      const th = textElement("th", title);
      th.scope = "col";
      titles.append(th);
    });
    head.append(titles);
    const body = document.createElement("tbody");
    rows.forEach(cells => {
      const tr = document.createElement("tr");
      cells.forEach((cell, index) => {
        const td = textElement(index ? "td" : "th", cell);
        if (!index) td.scope = "row";
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(head, body);
    wrapper.append(table);
    return wrapper;
  }

  function renderMovesetDifficulty() {
    const rows = counterResult.movesetDifficulty;
    elements.movesetDifficulty.hidden = !rows.length;
    elements.movesetDifficultySummary.textContent = rows.length > 1
      ? ` · hardest: ${rows[0].fastMove} / ${rows[0].chargedMove}` : " · one moveset selected";
    elements.movesetDifficultyBody.replaceChildren(dataTable(
      `${rows.length} tested movesets · same ${counterResult.rows.length} counters`,
      ["Hardest first", "Boss moveset", "Difficulty index", "Mean battle DPS", "Mean faints"],
      rows.map((pair, index) => [String(index + 1), `${pair.fastMove} / ${pair.chargedMove}`,
        pair.difficultyIndex.toFixed(1), pair.averageBattleDps.toFixed(2), pair.averageFaints.toFixed(2)]),
    ));
  }

  function renderBreakdown(panel, result) {
    const number = value => value === null ? "Not observed" : value.toFixed(2);
    const percentage = value => value === null ? "Not observed" : `${(100 * value).toFixed(1)}%`;
    const damage = value => value === null ? "Not observed" : `${value.toFixed(0)} HP (${(100 * value / result.bossHp).toFixed(1)}%)`;
    const range = (min, max) => min === max ? String(min) : `${min}–${max}`;
    const avg = result.average;
    const metrics = document.createElement("dl");
    metrics.className = "breakdown-metrics";
    metrics.append(
      metricBlock("Charged cycles / fainted life", number(avg.chargedCyclesPerLife)),
      metricBlock("Fast attacks / fainted life", number(avg.fastMovesPerLife)),
      metricBlock("Damage / completed team outing", damage(avg.damagePerCompletedOuting)),
      metricBlock("First team outing damage", damage(avg.firstOutingDamage)),
    );
    const completedLives = result.movesets.reduce((sum, pair) => sum + pair.completedLives, 0);
    const unfinishedLives = result.movesets.reduce((sum, pair) => sum + pair.unfinishedLives, 0);
    const completeOutings = result.movesets.reduce((sum, pair) => sum + pair.completedOutings, 0);
    const partialOutings = result.movesets.reduce((sum, pair) => sum + pair.partialOutings, 0);
    panel.replaceChildren(
      textElement("h3", "Cycles, survival & team damage"),
      textElement("p", `${result.simulatedBattles} detailed raids · ${result.trialsPerMoveset} per moveset · ${result.movesets.length} of ${result.totalBossMovesets} matching movesets tested. Averages give each tested moveset equal weight.`, "breakdown-note"),
      metrics,
      textElement("p", `A cycle is one landed charged attack, including fast attacks and energy gained from damage. ${completedLives} fainted lives measured; ${unfinishedLives} unfinished lives excluded. Hot-swap returns count toward the same life.`, "breakdown-note"),
      textElement("p", `A team outing runs from entry with six fresh Pokémon until leaving for the lobby. ${completeOutings} completed outings; ${partialOutings} partial outings. First-outing damage includes wins/timeouts. Completed-only averages can favour shorter lives or outings. “Not observed” means at least one moveset had no completed sample; it does not mean zero damage or cycles.`, "breakdown-note"),
    );
    const cyclesTable = distribution => dataTable("Charged attacks landed before fainting · simulated frequency", ["Completed charged cycles", "Probability among fainted lives"],
      distribution.filter(bin => bin.probability === null || bin.probability > 0).map(bin => [bin.cycles === 12 ? "12+" : String(bin.cycles), percentage(bin.probability)]));
    const curveTable = phase => dataTable(`${phase.phase} phase · binomial survival estimate, no dodging`, ["Boss hits received (n)", "Chance HP remains above zero"],
      phase.curve.filter(point => point.hits <= 6 || [8, 10, 12, 15, 20, 30, 40, 50, 60].includes(point.hits) || point === phase.curve.at(-1))
        .map(point => [String(point.hits), percentage(point.survivalProbability)]));
    const probabilities = document.createElement("details");
    probabilities.className = "probability-details";
    probabilities.append(textElement("summary", "Cycle probabilities & binomial survival — averaged across tested movesets"));
    probabilities.append(cyclesTable(avg.cycleDistribution));
    probabilities.append(textElement("p", "The binomial estimate treats each incoming hit as charged with probability p, fitted from the detailed raids. Real attacks depend on boss energy, so they are correlated. This is not a prediction of charged-cycle probabilities. It assumes full HP, no dodging or swapping, and a fixed normal/enraged phase; your selected strategies still apply to the simulations above.", "breakdown-note"));
    probabilities.append(textElement("p", "K ~ Binomial(n, p). Survive when (n − K) × fast damage + K × charged damage < HP. Each moveset’s probability is calculated separately, then averaged. Hidden Power is averaged over 16 types. Curves show up to 60 hits.", "breakdown-note"));
    avg.survival.forEach(phase => probabilities.append(curveTable(phase)));
    panel.append(probabilities, textElement("h4", "Breakdown by boss moveset"));
    for (const pair of result.movesets) {
      const detail = document.createElement("details");
      detail.className = "pair-breakdown";
      detail.open = result.movesets.length === 1;
      detail.append(textElement("summary", `${pair.fastMove} / ${pair.chargedMove} · ${number(pair.chargedCyclesPerLife)} charged cycles per fainted life`));
      detail.append(dataTable("Observed in detailed raids", ["Metric", "Value"], [
        ["Completed lives / unfinished lives", `${pair.completedLives} / ${pair.unfinishedLives}`],
        ["Fast hits survived before fainting (mean)", number(pair.bossFastHitsSurvived)],
        ["Charged hits survived before fainting (mean)", number(pair.bossChargedHitsSurvived)],
        ["Charged share of incoming hits (p)", percentage(pair.observedChargedProbability)],
        ["Damage per completed team outing", damage(pair.damagePerCompletedOuting)],
        ["Damage per partial team outing", damage(pair.damagePerPartialOuting)],
        ["Completed / partial team outings", `${pair.completedOutings} / ${pair.partialOutings}`],
        ["First team outing damage", damage(pair.firstOutingDamage)],
      ]));
      for (const phase of pair.survival) {
        detail.append(textElement("h4", `${phase.phase} phase · ${phase.hp} attacker HP`));
        detail.append(textElement("p", `Fast hit: ${range(phase.fastDamageMin, phase.fastDamageMax)} damage. Charged hit: ${phase.chargedDamage} damage (${phase.dodgedChargedDamage} if successfully dodged). Survives ${phase.chargedHitsSurvived} charged hits alone; the next is lethal.`, "breakdown-note"));
        detail.append(dataTable("Undodged hit limits from full HP · each row is an alternative", ["Boss charged hits", "Additional fast hits survivable"], phase.combos.map(combo => [
          String(combo.chargedHits), combo.survives ? range(combo.fastHitsMin, combo.fastHitsMax) : "KO from charged hits alone",
        ])));
        detail.append(curveTable(phase));
      }
      detail.append(cyclesTable(pair.cycleDistribution));
      panel.append(detail);
    }
  }

  function renderCounters() {
    renderMovesetDifficulty();
    const fragment = document.createDocumentFragment();
    counterResult.rows.forEach((row, index) => fragment.append(counterCard(row, index)));
    if (!counterResult.rows.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No eligible counters matched these filters.";
      fragment.append(empty);
    }
    elements.body.replaceChildren(fragment);
    elements.section.setAttribute("aria-busy", "false");
    elements.progress.hidden = true;
    const assumptions = counterResult.assumptions;
    const weather = assumptions.weather ?? "No weather";
    const friendship = labelFrom(elements.friendship, assumptions.friendshipMultiplier);
    elements.title.textContent = `Top ${counterResult.rows.length} counters for ${counterResult.bossName}`;
    const movesetSummary = counterResult.bossMovesets === counterResult.totalBossMovesets
      ? `${counterResult.bossMovesets} boss movesets`
      : `${counterResult.bossMovesets} of ${counterResult.totalBossMovesets} boss movesets sampled`;
    const legacySummary = assumptions.excludeLegacyMoves ? "legacy excluded" : "legacy included";
    elements.summary.textContent =
      `${movesetSummary} · ${counterResult.simulatedBattles.toLocaleString()} simulated battles · ${legacySummary}`;

    syncScenarioPreview();
    elements.bossMeta.textContent =
      `#${counterResult.bossDexNumber} · Level ${assumptions.level} attackers · ${weather} · ${friendship}`;
    const best = counterResult.rows[0] ?? null;
    if (!best) {
      setOutcome("No eligible counters", "Change the attacker filters or move availability and try again.");
    } else if (best.winPercent >= 99.95) {
      const bestName = `${best.shadow ? "Shadow " : ""}${best.name}`;
      const clearTime = best.averageWinTime === null ? "" : ` in ${best.averageWinTime.toFixed(1)} seconds on average`;
      setOutcome("Solo clear found", `${bestName} won every simulated battle${clearTime}.`, best);
    } else if (best.winPercent > 0) {
      const bestName = `${best.shadow ? "Shadow " : ""}${best.name}`;
      setOutcome(
        `${best.winPercent.toFixed(1)}% solo win rate`,
        `${bestName} dealt ${best.averageDamagePercent.toFixed(1)}% of the boss's HP on average.`,
        best,
      );
    } else {
      const bestName = `${best.shadow ? "Shadow " : ""}${best.name}`;
      setOutcome(
        "Additional trainers needed",
        `${bestName} dealt ${best.averageDamagePercent.toFixed(1)}% of the boss's HP on average.`,
        best,
      );
    }
    elements.settings.open = false;
  }

  function syncFilterButtons() {
    elements.megas.setAttribute("aria-pressed", String(includeMegas));
    elements.shadows.setAttribute("aria-pressed", String(includeShadows));
    elements.legendaries.setAttribute("aria-pressed", String(includeLegendaries));
    elements.legacy.setAttribute("aria-pressed", String(excludeLegacy));
  }

  function settingsChanged() {
    syncBossMoves();
    updateUrl();
    syncScenarioPreview();
    if (counterResult) {
      counterResult = null;
      elements.movesetDifficulty.hidden = true;
      elements.body.innerHTML = '<li class="empty-state">Settings changed. Generate again to update counters and breakdowns.</li>';
      elements.summary.textContent = "Settings changed. Generate again to update these counters.";
      setOutcome("Settings changed", "Generate the rankings again to update the outcome and headline metrics.");
    }
  }

  function bindFilter(button, read, write) {
    button.addEventListener("click", () => {
      write(!read());
      syncFilterButtons();
      settingsChanged();
    });
  }

  elements.level.value = String(initialNumber("level", LEVELS, 40));
  elements.weather.value = initialString("weather", WEATHER, "");
  elements.friendship.value = String(initialNumber("friendship", FRIENDSHIP, 1));
  elements.dodgeStrategy.value = initialString("dodge", DODGE_STRATEGIES, "none");
  elements.playerStrategy.value = initialString("strategy", PLAYER_STRATEGIES, "no_strategy");
  elements.megaLevel.value = String(initialNumber("megaLevel", MEGA_LEVELS, 1));
  syncFilterButtons();
  syncScenarioPreview();

  bindFilter(elements.megas, () => includeMegas, value => { includeMegas = value; });
  bindFilter(elements.shadows, () => includeShadows, value => { includeShadows = value; });
  bindFilter(elements.legendaries, () => includeLegendaries, value => { includeLegendaries = value; });
  bindFilter(elements.legacy, () => excludeLegacy, value => { excludeLegacy = value; });
  for (const select of [
    elements.difficulty, elements.level, elements.weather, elements.friendship,
    elements.dodgeStrategy, elements.playerStrategy, elements.megaLevel, elements.bossFast, elements.bossCharged,
  ]) {
    select.addEventListener("change", settingsChanged);
  }
  elements.boss.addEventListener("input", syncScenarioPreview);
  elements.boss.addEventListener("change", settingsChanged);
  elements.boss.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      generateCounters();
    }
  });
  elements.generate.addEventListener("click", generateCounters);
  loadBosses().catch(error => {
    elements.title.textContent = "Counters unavailable";
    elements.error.textContent = error instanceof Error ? error.message : String(error);
    elements.error.hidden = false;
    setOutcome("Counter catalog unavailable", elements.error.textContent);
  });
})();
