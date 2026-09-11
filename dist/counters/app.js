/* UI adapter only; counter calculations live in the TypeScript worker. */
(() => {
  "use strict";

  const LEVELS = [20, 25, 30, 35, 40, 45, 50];
  const WEATHER = ["", "Sunny/Clear", "Rainy", "Partly Cloudy", "Cloudy", "Windy", "Snow", "Fog"];
  const FRIENDSHIP = [1, 1.03, 1.05, 1.07, 1.10, 1.12];
  const DODGE_STRATEGIES = [
    "none", "all_survivable", "super_effective", "non_resisted", "lethal_only",
  ];
  const PLAYER_STRATEGIES = [
    "no_strategy", "hot_swap_greedy", "hot_swap_cautious", "hot_swap_very_cautious",
  ];
  const MEGA_LEVELS = [1, 2, 3, 4];
  const worker = new Worker("engine-2df9d23c3087/counters_worker.js", {type: "module"});
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
    elements.bossLabel.textContent = difficulty.endsWith("Shadow")
      ? `${difficulty} raid · Shadow boss active`
      : `${difficulty} raid`;
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
    summary.textContent = "Performance details";
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
      panel.textContent = "Measuring field time, survival, and damage…";
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
    const number = value => value === null ? "Raid ends first" : value.toFixed(2);
    const seconds = value => value === null ? "Raid ends first" : `${value.toFixed(1)}s`;
    const range = (min, max) => min === max ? String(min) : `${min}–${max}`;
    const avg = result.average;
    const hitAssistedValue = avg.hitAssistedDps === null
      ? "Not survivable"
      : `${avg.hitAssistedDps.toFixed(2)}${avg.hitAssistedReachableMovesets < result.movesets.length
        ? ` (${avg.hitAssistedReachableMovesets}/${result.movesets.length} sets)` : ""}`;
    const metrics = document.createElement("dl");
    metrics.className = "breakdown-metrics player-metrics";
    metrics.append(
      metricBlock("Time on the field", seconds(avg.fieldSecondsPerLife), "Average active time before one attacker faints. Time spent waiting on the bench after a hot swap is excluded."),
      metricBlock("Average on-field DPS", number(avg.averageOnFieldDps), "Damage per second while this Pokémon is active. Switch and relobby time are excluded."),
      metricBlock("Peak DPS", hitAssistedValue, "Start at zero energy, take an immediate undodged boss charged hit, and keep attacking while the boss repeats it. This is your DPS through your first charged move."),
      metricBlock("Your charged moves", number(avg.chargedCyclesPerLife), "Average charged attacks landed by one attacker before it faints."),
    );
    const hitSummary = avg.bossFastHitsSurvived === null || avg.bossChargedHitsSurvived === null
      ? "This raid ended before enough attackers fainted to estimate a typical life."
      : `A typical life survives about ${avg.bossFastHitsSurvived.toFixed(1)} boss fast hits + ${avg.bossChargedHitsSurvived.toFixed(1)} boss charged hits before the final KO.`;
    const scope = result.movesets.length === 1
      ? `${result.movesets[0].fastMove} + ${result.movesets[0].chargedMove}`
      : `Average across ${result.movesets.length} possible boss movesets`;
    panel.replaceChildren(
      textElement("h3", "How this Pokémon performs"),
      textElement("p", scope, "breakdown-scope"),
      metrics,
      textElement("p", hitSummary, "hit-summary"),
      textElement("p", "Peak DPS starts at 0 energy immediately before an undodged boss charged hit. You keep using fast moves while the boss repeats that charged move back-to-back. We count your total damage and time through your first charged move; if you faint first, it is unavailable.", "breakdown-note"),
    );
    panel.append(textElement("h4", result.movesets.length === 1 ? "Boss attacks" : "By boss moveset · hardest first"));
    for (const [pairIndex, pair] of result.movesets.entries()) {
      const detail = document.createElement("details");
      detail.className = "pair-breakdown";
      detail.open = result.movesets.length === 1;
      const order = result.movesets.length === 1 ? "" : `${pairIndex + 1}. `;
      detail.append(textElement("summary", `${order}${pair.fastMove} + ${pair.chargedMove} · ${seconds(pair.fieldSecondsPerLife)} on field · ${number(pair.averageOnFieldDps)} DPS`));
      const pairMetrics = document.createElement("dl");
      pairMetrics.className = "pair-metrics";
      pairMetrics.append(
        metricBlock("Time on field", seconds(pair.fieldSecondsPerLife)),
        metricBlock("Average DPS", number(pair.averageOnFieldDps)),
        metricBlock(pair.survival.length > 1 ? "Peak DPS (normal)" : "Peak DPS",
          pair.hitAssistedDps === null ? "Not survivable" : pair.hitAssistedDps.toFixed(2)),
        metricBlock("Your charged moves", number(pair.chargedCyclesPerLife)),
      );
      detail.append(pairMetrics);
      const pairHits = pair.bossFastHitsSurvived === null || pair.bossChargedHitsSurvived === null
        ? "The raid ended before a typical fainted life could be measured."
        : `Usually survives about ${pair.bossFastHitsSurvived.toFixed(1)} × ${pair.fastMove} + ${pair.bossChargedHitsSurvived.toFixed(1)} × ${pair.chargedMove} before the final KO.`;
      detail.append(textElement("p", pairHits, "hit-summary compact"));
      for (const phase of pair.survival) {
        const fastOnly = phase.combos[0];
        const phaseName = pair.survival.length > 1 ? `${phase.phase} phase: ` : "";
        detail.append(textElement("p", `${phaseName}From full HP with no dodge, survives ${range(fastOnly.fastHitsMin, fastOnly.fastHitsMax)} ${pair.fastMove} hits alone or ${phase.chargedHitsSurvived} ${pair.chargedMove} hits alone.`, "solo-hit-limit"));
        const boost = phase.hitAssistedCharge;
        const boostText = boost.reachable
          ? `${phaseName}Starting at 0 energy: after ${boost.bossHits} × ${pair.chargedMove} and ${boost.fastMoves} × ${result.attackerFastMove}, ${result.attackerChargedMove} lands in ${boost.seconds.toFixed(1)}s — ${boost.dps.toFixed(2)} DPS.`
          : `${phaseName}Starting at 0 energy, this attacker faints on boss charged hit ${boost.bossHits}, before ${result.attackerChargedMove} can land.`;
        detail.append(textElement("p", boostText, `hit-assisted-result${boost.reachable ? "" : " unavailable"}`));
        detail.append(textElement("p", `Damage per hit: ${range(phase.fastDamageMin, phase.fastDamageMax)} fast · ${phase.chargedDamage} charged${phase.dodgedChargedDamage !== phase.chargedDamage ? ` · ${phase.dodgedChargedDamage} when dodged` : ""}.`, "breakdown-note compact"));
      }
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
