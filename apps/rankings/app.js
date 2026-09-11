/* UI adapter only; ranking calculations live in the TypeScript worker. */
(() => {
  "use strict";

  const TYPES = [
    "normal", "fire", "water", "electric", "grass", "ice", "fighting",
    "poison", "ground", "flying", "psychic", "bug", "rock", "ghost",
    "dragon", "dark", "steel", "fairy",
  ];
  const BOSS_ATTACK_LEVELS = ["low", "medium", "high"];
  const BOSS_MOVE_TYPES = ["typeless", ...TYPES];
  const MEGA_LEVELS = [1, 2, 3, 4];
  const LEVELS = [20, 25, 30, 35, 40, 45, 50];
  const PARTY_POWER_PLAYERS = [1, 2, 3, 4];
  const PARTY_SIZES = [1, 2, 3, 4, 5, 6];
  const STRATEGY_WARNING_KEY = "greatgoose.rankings.strategy-warning.dismissed.v1";
  const worker = new Worker("engine/rankings_worker.js", {type: "module"});
  const cache = new Map();
  const pending = new Map();
  let requestId = 0;
  let selectedType = initialType();
  let rankingMode = new URL(location.href).searchParams.get("mode") === "anti" ? "anti" : "attack";
  document.documentElement.dataset.rankingMode = rankingMode;
  let includeMegas = initialFlag("megas");
  let includeShadows = initialFlag("shadows");
  let includeLegendaries = initialFlag("legendaries");
  let bossAttack = initialBossAttack();
  let bossMoveType = initialBossMoveType();
  let megaLevel = initialMegaLevel();
  let level = initialNumber("level", LEVELS, 40);
  let partyPowerPlayers = initialNumber("partyPower", PARTY_POWER_PLAYERS, 1);
  let partySize = initialNumber("partySize", PARTY_SIZES, 6);
  let relobbySeconds = initialRelobby();
  let searchQuery = initialSearch();
  let sortMetric = initialSort();
  let currentResult = null;

  const elements = {
    types: document.querySelector("#types"),
    mode: document.querySelector("#anti-type"),
    typeHeading: document.querySelector("#type-heading"),
    typeDescription: document.querySelector("#type-description"),
    sort: document.querySelector("#sort"),
    megas: document.querySelector("#include-megas"),
    shadows: document.querySelector("#include-shadows"),
    legendaries: document.querySelector("#include-legendaries"),
    bossAttack: document.querySelector("#boss-attack"),
    bossMoveType: document.querySelector("#boss-move-type"),
    megaLevel: document.querySelector("#mega-level"),
    level: document.querySelector("#ranking-level"),
    partyPower: document.querySelector("#ranking-party-power"),
    partySize: document.querySelector("#ranking-party-size"),
    relobby: document.querySelector("#ranking-relobby"),
    search: document.querySelector("#pokemon-search"),
    section: document.querySelector(".results"),
    selectedType: document.querySelector("#selected-type"),
    title: document.querySelector("#results-title"),
    summary: document.querySelector("#summary"),
    body: document.querySelector("#ranking-body"),
    error: document.querySelector("#error"),
    strategyWarning: document.querySelector("#strategy-warning"),
    dismissStrategyWarning: document.querySelector("#strategy-warning-dismiss"),
    acknowledgeStrategyWarning: document.querySelector("#strategy-warning-acknowledge"),
  };

  function warningWasDismissed() {
    try {
      return localStorage.getItem(STRATEGY_WARNING_KEY) === "1";
    } catch {
      return false;
    }
  }

  function rememberWarningPreference() {
    if (!elements.dismissStrategyWarning.checked) return;
    try {
      localStorage.setItem(STRATEGY_WARNING_KEY, "1");
    } catch {
      // The warning can still close when storage is blocked or unavailable.
    }
  }

  function showStrategyWarning() {
    if (warningWasDismissed()) return;
    elements.dismissStrategyWarning.checked = false;
    if (typeof elements.strategyWarning.showModal === "function") {
      elements.strategyWarning.showModal();
    } else {
      elements.strategyWarning.setAttribute("open", "");
    }
  }

  function initialType() {
    const requested = new URL(location.href).searchParams.get("type")?.toLowerCase();
    return TYPES.includes(requested) ? requested : "dragon";
  }

  function initialFlag(name) {
    return new URL(location.href).searchParams.get(name) !== "0";
  }

  function initialSearch() {
    return new URL(location.href).searchParams.get("q")?.trim() ?? "";
  }

  function initialBossAttack() {
    const requested = new URL(location.href).searchParams.get("boss")?.toLowerCase();
    return BOSS_ATTACK_LEVELS.includes(requested) ? requested : "medium";
  }

  function initialBossMoveType() {
    const requested = new URL(location.href).searchParams.get("bossType")?.toLowerCase();
    return BOSS_MOVE_TYPES.includes(requested) ? requested : "typeless";
  }

  function initialMegaLevel() {
    const requested = Number(new URL(location.href).searchParams.get("megaLevel"));
    return MEGA_LEVELS.includes(requested) ? requested : 1;
  }

  function initialNumber(name, allowed, fallback) {
    const requested = Number(new URL(location.href).searchParams.get(name));
    return allowed.includes(requested) ? requested : fallback;
  }

  function initialRelobby() {
    const raw = new URL(location.href).searchParams.get("relobby");
    if (raw === null || raw.trim() === "") return 10;
    const requested = Number(raw);
    return Number.isFinite(requested) && requested >= 0 && Number.isInteger(requested * 2)
      ? requested
      : 10;
  }

  function initialSort() {
    const requested = new URL(location.href).searchParams.get("sort");
    return ["idealDps", "simpleDps", "effectiveDps"].includes(requested)
      ? requested
      : "effectiveDps";
  }

  function label(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set("type", selectedType);
    url.searchParams.set("mode", rankingMode);
    url.searchParams.set("megas", includeMegas ? "1" : "0");
    url.searchParams.set("shadows", includeShadows ? "1" : "0");
    url.searchParams.set("legendaries", includeLegendaries ? "1" : "0");
    url.searchParams.set("boss", bossAttack);
    url.searchParams.set("bossType", bossMoveType);
    url.searchParams.set("megaLevel", String(megaLevel));
    url.searchParams.set("level", String(level));
    url.searchParams.set("partyPower", String(partyPowerPlayers));
    url.searchParams.set("partySize", String(partySize));
    url.searchParams.set("relobby", String(relobbySeconds));
    url.searchParams.set("sort", sortMetric);
    if (searchQuery) url.searchParams.set("q", searchQuery);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }

  function typeButtons() {
    for (const type of TYPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "type-button";
      button.textContent = type;
      button.dataset.type = type;
      button.setAttribute("aria-pressed", String(type === selectedType));
      button.addEventListener("click", () => selectType(type));
      elements.types.append(button);
    }
  }

  function setLoading() {
    elements.section.setAttribute("aria-busy", "true");
    elements.error.hidden = true;
    elements.selectedType.textContent = rankingMode === "anti" ? `Attackers against ${label(selectedType)}` : `${label(selectedType)} attackers`;
    elements.title.textContent = "Calculating rankings…";
    elements.summary.textContent = "";
    elements.body.innerHTML = `<tr class="loading-row"><td colspan="7">Checking every eligible Level ${level} moveset…</td></tr>`;
  }

  function cacheKey(type) {
    return [rankingMode, type, includeMegas, includeShadows, includeLegendaries,
      bossAttack, bossMoveType, megaLevel, level, partyPowerPlayers, partySize, relobbySeconds]
      .map(value => typeof value === "boolean" ? Number(value) : value)
      .join(":");
  }

  function request(type) {
    const key = cacheKey(type);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject, key});
      worker.postMessage({
        id,
        attackType: type,
        mode: rankingMode,
        includeMegas,
        includeShadows,
        includeLegendaries,
        bossAttack,
        bossMoveType,
        megaLevel,
        level,
        partyPowerPlayers,
        partySize,
        relobbySeconds,
      });
    });
  }

  worker.addEventListener("message", event => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.error) job.reject(new Error(event.data.error));
    else {
      cache.set(job.key, event.data.result);
      job.resolve(event.data.result);
    }
  });

  worker.addEventListener("error", event => {
    for (const job of pending.values()) job.reject(new Error(event.message || "Ranking worker failed."));
    pending.clear();
  });

  async function selectType(type) {
    selectedType = type;
    currentResult = null;
    document.documentElement.dataset.rankingMode = rankingMode;
    elements.mode.setAttribute("aria-checked", String(rankingMode === "anti"));
    elements.typeHeading.textContent = rankingMode === "anti" ? "Anti type" : "Attack type";
    elements.types.setAttribute("aria-label", rankingMode === "anti" ? "Defending type" : "Attack type");
    elements.typeDescription.textContent = rankingMode === "anti"
      ? "All movesets against a single defending type, including weaknesses and resistances. Boss Move Type controls incoming damage separately."
      : "Only movesets with a charged attack of this type are ranked.";
    const requestedKey = cacheKey(type);
    updateUrl();
    document.querySelectorAll(".type-button").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.type === type));
    });
    setLoading();
    try {
      const result = await request(type);
      if (selectedType !== type || cacheKey(type) !== requestedKey) return;
      currentResult = result;
      render();
    } catch (error) {
      if (selectedType !== type || cacheKey(type) !== requestedKey) return;
      elements.section.setAttribute("aria-busy", "false");
      elements.title.textContent = "Rankings unavailable";
      elements.error.textContent = error instanceof Error ? error.message : String(error);
      elements.error.hidden = false;
      elements.body.innerHTML = "";
    }
  }

  function moveCell(name, type, elite) {
    const cell = document.createElement("td");
    cell.className = "move";

    const icon = document.createElement("span");
    icon.className = `type-icon type-${type}`;
    icon.setAttribute("aria-hidden", "true");
    cell.append(icon);
    cell.append(document.createTextNode(name));
    if (elite) {
      const marker = document.createElement("sup");
      marker.className = "elite-star";
      marker.textContent = "*";
      marker.title = "Elite or legacy move";
      marker.setAttribute("aria-label", "Elite or legacy move");
      cell.append(marker);
    }
    return cell;
  }

  function metricCell(value, primary) {
    const cell = document.createElement("td");
    cell.className = `metric${primary ? " primary" : ""}`;
    cell.textContent = value.toFixed(2);
    return cell;
  }

  function appendPokemonName(cell, row) {
    if (row.shadow) {
      const shadow = document.createElement("span");
      shadow.className = "shadow-word";
      shadow.textContent = "Shadow";
      cell.append(shadow, document.createTextNode(" "));
    }

    const megaPrefix = row.mega && row.name.match(/^(Mega|Primal)\s+/i);
    if (megaPrefix) {
      const mega = document.createElement("span");
      mega.className = "mega-word";
      mega.textContent = megaPrefix[1];
      cell.append(mega, document.createTextNode(` ${row.name.slice(megaPrefix[0].length)}`));
    } else {
      cell.append(document.createTextNode(row.name));
    }
  }

  function matchesSearch(row) {
    const query = searchQuery.toLocaleLowerCase();
    if (!query) return true;
    const name = `${row.shadow ? "shadow " : ""}${row.name} ${row.formId} ${row.dexNumber}`
      .toLocaleLowerCase();
    return name.includes(query);
  }

  function render() {
    const sort = sortMetric;
    const rankedRows = [...currentResult.rows].sort((a, b) =>
      b[sort] - a[sort] || b.idealDps - a.idealDps || a.dexNumber - b.dexNumber);
    const visibleRows = rankedRows
      .map((row, index) => ({row, rank: index + 1}))
      .filter(({row}) => matchesSearch(row));
    const fragment = document.createDocumentFragment();

    visibleRows.forEach(({row, rank: trueRank}) => {
      const tr = document.createElement("tr");
      const rank = document.createElement("td");
      rank.className = "rank";
      rank.textContent = String(trueRank);
      const pokemon = document.createElement("td");
      pokemon.className = "pokemon";
      appendPokemonName(pokemon, row);
      const detail = document.createElement("span");
      detail.className = "dex";
      detail.textContent = `#${row.dexNumber} · ${row.pokemonTypes.join(" / ")}`;
      pokemon.append(detail);
      tr.append(
        rank,
        pokemon,
        moveCell(row.fastMove, row.fastMoveType, row.eliteFast),
        moveCell(row.chargedMove, row.chargedMoveType, row.eliteCharged),
        metricCell(row.idealDps, sort === "idealDps"),
        metricCell(row.simpleDps, sort === "simpleDps"),
        metricCell(row.effectiveDps, sort === "effectiveDps"),
      );
      fragment.append(tr);
    });

    if (visibleRows.length === 0) {
      const empty = document.createElement("tr");
      empty.className = "loading-row";
      empty.innerHTML = '<td colspan="7">No ranked Pokémon match this search.</td>';
      fragment.append(empty);
    }

    elements.body.replaceChildren(fragment);
    elements.section.setAttribute("aria-busy", "false");
    elements.selectedType.textContent = currentResult.mode === "anti" ? `Attackers against ${label(currentResult.attackType)}` : `${label(currentResult.attackType)} attackers`;
    elements.title.textContent = searchQuery
      ? `${visibleRows.length.toLocaleString()} of ${rankedRows.length.toLocaleString()} ranked Pokémon`
      : `${rankedRows.length.toLocaleString()} ranked Pokémon`;
    const shadowSummary = currentResult.includeShadows
      ? ` · ${currentResult.shadowRows.toLocaleString()} Shadow variants`
      : "";
    const partyPowerSummary = currentResult.partyPowerPlayers === 1
      ? "Party Power off"
      : `${currentResult.partyPowerPlayers}-player Party Power`;
    elements.summary.textContent = `Level ${currentResult.level} · ${partyPowerSummary} · ${currentResult.partySize} Pokémon · ${currentResult.relobbySeconds}s relobby · ${label(currentResult.bossAttack)} boss Attack · ${label(currentResult.bossMoveType)} boss moves · Mega Level ${currentResult.megaLevel} · ${currentResult.candidateMovesets.toLocaleString()} movesets checked${shadowSummary} · ${currentResult.excludedLowQuality.toLocaleString()} excluded below the 10% first-charged cutoff`;
  }

  elements.mode.addEventListener("click", () => {
    rankingMode = rankingMode === "anti" ? "attack" : "anti";
    selectType(selectedType);
  });
  elements.sort.value = sortMetric;
  elements.sort.addEventListener("change", () => {
    sortMetric = elements.sort.value;
    updateUrl();
    if (currentResult) render();
  });
  elements.bossAttack.value = bossAttack;
  elements.bossAttack.addEventListener("change", () => {
    bossAttack = elements.bossAttack.value;
    selectType(selectedType);
  });
  elements.bossMoveType.value = bossMoveType;
  elements.bossMoveType.addEventListener("change", () => {
    bossMoveType = elements.bossMoveType.value;
    selectType(selectedType);
  });
  elements.megaLevel.value = String(megaLevel);
  elements.megaLevel.addEventListener("change", () => {
    megaLevel = Number(elements.megaLevel.value);
    selectType(selectedType);
  });
  elements.level.value = String(level);
  elements.level.addEventListener("change", () => {
    level = Number(elements.level.value);
    selectType(selectedType);
  });
  elements.partyPower.value = String(partyPowerPlayers);
  elements.partyPower.addEventListener("change", () => {
    partyPowerPlayers = Number(elements.partyPower.value);
    selectType(selectedType);
  });
  elements.partySize.value = String(partySize);
  elements.partySize.addEventListener("change", () => {
    partySize = Number(elements.partySize.value);
    selectType(selectedType);
  });
  elements.relobby.value = String(relobbySeconds);
  elements.relobby.addEventListener("change", () => {
    const requested = Number(elements.relobby.value);
    if (!Number.isFinite(requested) || requested < 0 || !Number.isInteger(requested * 2)) {
      elements.relobby.setCustomValidity("Use a non-negative time in 0.5-second increments.");
      elements.relobby.reportValidity();
      elements.relobby.value = String(relobbySeconds);
      return;
    }
    elements.relobby.setCustomValidity("");
    relobbySeconds = requested;
    selectType(selectedType);
  });
  const filters = [
    [elements.megas, () => includeMegas, value => { includeMegas = value; }],
    [elements.shadows, () => includeShadows, value => { includeShadows = value; }],
    [elements.legendaries, () => includeLegendaries, value => { includeLegendaries = value; }],
  ];
  for (const [button, read, write] of filters) {
    button.setAttribute("aria-pressed", String(read()));
    button.addEventListener("click", () => {
      write(!read());
      button.setAttribute("aria-pressed", String(read()));
      selectType(selectedType);
    });
  }
  elements.search.value = searchQuery;
  elements.search.addEventListener("input", () => {
    searchQuery = elements.search.value.trim();
    updateUrl();
    if (currentResult) render();
  });
  elements.acknowledgeStrategyWarning.addEventListener("click", () => {
    rememberWarningPreference();
    elements.strategyWarning.close();
  });
  typeButtons();
  selectType(selectedType);
  showStrategyWarning();
})();
