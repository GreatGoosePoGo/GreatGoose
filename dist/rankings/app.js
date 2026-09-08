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
  const worker = new Worker("engine-206e3810fef2/rankings_worker.js", {type: "module"});
  const cache = new Map();
  const pending = new Map();
  let requestId = 0;
  let selectedType = initialType();
  let includeMegas = initialFlag("megas");
  let includeShadows = initialFlag("shadows");
  let includeLegendaries = initialFlag("legendaries");
  let bossAttack = initialBossAttack();
  let bossMoveType = initialBossMoveType();
  let megaLevel = initialMegaLevel();
  let searchQuery = initialSearch();
  let sortMetric = initialSort();
  let currentResult = null;

  const elements = {
    types: document.querySelector("#types"),
    sort: document.querySelector("#sort"),
    megas: document.querySelector("#include-megas"),
    shadows: document.querySelector("#include-shadows"),
    legendaries: document.querySelector("#include-legendaries"),
    bossAttack: document.querySelector("#boss-attack"),
    bossMoveType: document.querySelector("#boss-move-type"),
    megaLevel: document.querySelector("#mega-level"),
    search: document.querySelector("#pokemon-search"),
    section: document.querySelector(".results"),
    selectedType: document.querySelector("#selected-type"),
    title: document.querySelector("#results-title"),
    summary: document.querySelector("#summary"),
    body: document.querySelector("#ranking-body"),
    error: document.querySelector("#error"),
  };

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
    url.searchParams.set("megas", includeMegas ? "1" : "0");
    url.searchParams.set("shadows", includeShadows ? "1" : "0");
    url.searchParams.set("legendaries", includeLegendaries ? "1" : "0");
    url.searchParams.set("boss", bossAttack);
    url.searchParams.set("bossType", bossMoveType);
    url.searchParams.set("megaLevel", String(megaLevel));
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
    elements.selectedType.textContent = `${label(selectedType)} attackers`;
    elements.title.textContent = "Calculating rankings…";
    elements.summary.textContent = "";
    elements.body.innerHTML = '<tr class="loading-row"><td colspan="7">Checking every eligible Level 40 moveset…</td></tr>';
  }

  function cacheKey(type) {
    return [type, includeMegas, includeShadows, includeLegendaries, bossAttack, bossMoveType, megaLevel]
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
        includeMegas,
        includeShadows,
        includeLegendaries,
        bossAttack,
        bossMoveType,
        megaLevel,
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
    elements.selectedType.textContent = `${label(currentResult.attackType)} attackers`;
    elements.title.textContent = searchQuery
      ? `${visibleRows.length.toLocaleString()} of ${rankedRows.length.toLocaleString()} ranked Pokémon`
      : `${rankedRows.length.toLocaleString()} ranked Pokémon`;
    const shadowSummary = currentResult.includeShadows
      ? ` · ${currentResult.shadowRows.toLocaleString()} Shadow variants`
      : "";
    elements.summary.textContent = `${label(currentResult.bossAttack)} boss Attack · ${label(currentResult.bossMoveType)} boss moves · Mega Level ${currentResult.megaLevel} · ${currentResult.candidateMovesets.toLocaleString()} movesets checked${shadowSummary} · ${currentResult.excludedLowQuality.toLocaleString()} excluded below the 10% first-charged cutoff`;
  }

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
  typeButtons();
  selectType(selectedType);
})();
