let catalog = [];
const byId = new Map();

const bossInput = document.querySelector("#boss");
const bossFastSelect = document.querySelector("#boss-fast-move");
const bossChargedSelect = document.querySelector("#boss-charged-move");
const playersElement = document.querySelector("#players");
const addPlayerButton = document.querySelector("#add-player");
const clonePlayerButton = document.querySelector("#clone-player");
const form = document.querySelector("#simulator-form");
const simulateButton = document.querySelector("#simulate");
const simulateAgainButton = document.querySelector("#simulate-again");
const movesetModeSelect = document.querySelector("#boss-moveset-mode");
const simulationCountInput = document.querySelector("#simulation-count");
const raidDifficultySelect = document.querySelector("#raid-difficulty");
const purifiedGemsSelect = document.querySelector("#purified-gems");
const playerStrategySelect = document.querySelector("#player-strategy");
const copySetupLinkButton = document.querySelector("#copy-setup-link");
const copyResultLinkButton = document.querySelector("#copy-result-link");
const shareStatus = document.querySelector("#share-status");
let pokemonRowIdSequence = 0;
let lastResultShareUrl = null;

const SHARE_SELECTS = {
  dodge: "#dodge-strategy",
  strategy: "#player-strategy",
  weather: "#weather",
  seasonal: "#seasonal-friendship",
  gems: "#purified-gems",
  log: "#battle-log-mode",
};

const strategyDescriptions = {
  no_strategy: "Keep attacking until each Pokémon faints. No voluntary swaps.",
  hot_swap_greedy: "Preserve charged energy when predicted damage—or an announced boss charged move—would prevent it from being spent, then return to that Pokémon when it can finish the move.",
  hot_swap_cautious: "Energy-preserving hot swap plus a reserve equal to 10% of the boss charged move's undodged damage.",
  hot_swap_very_cautious: "Energy-preserving hot swap plus a reserve equal to 15% of the boss charged move's undodged damage.",
  catch_tank: "On each announced charged move, time the next unused marked tank to switch in as late as possible. It catches the hit, throws one charged move, then retires.",
};

function option(value, label = value) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function labelForPokemon(pokemon) {
  return pokemon.form_id === pokemon.name.toUpperCase().replaceAll(" ", "_")
    ? pokemon.name
    : `${pokemon.name} — ${pokemon.form_id}`;
}

function fillSelect(select, values, selected, labelForValue = value => value) {
  select.replaceChildren(
    ...values.map(value => option(value, labelForValue(value))),
  );
  if (selected && values.includes(selected)) select.value = selected;
}

function poweredMoveName(name, megaLevel) {
  if (!name.endsWith("+")) return name;
  return name.slice(0, -1) + "+".repeat(megaLevel);
}

function moveIdForName(moveData, name) {
  return moveData.find(move => move.name === name)?.id;
}

function moveNameForId(moveData, id) {
  return moveData.find(move => move.id === id)?.name;
}

function pokemonForInput(input) {
  return byId.get(input.dataset.pokemonId);
}

function matchingPokemon(query, allowShadow = false) {
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase()
    .replaceAll("armoured", "armored");
  if (!normalizedQuery) return [];
  const words = normalizedQuery.split(/[\s_-]+/).filter(Boolean);
  const shadowRequested = allowShadow && words.includes("shadow");
  const queryWords = shadowRequested
    ? words.filter(word => word !== "shadow")
    : words;

  return catalog
    .filter(pokemon => {
      const label = labelForPokemon(pokemon).toLocaleLowerCase();
      const searchableText = `${label} ${pokemon.form_id.replaceAll("_", " ").toLocaleLowerCase()}`;
      return queryWords.every(word => searchableText.includes(word));
    })
    .sort((a, b) => {
      const aLabel = labelForPokemon(a).toLocaleLowerCase();
      const bLabel = labelForPokemon(b).toLocaleLowerCase();
      const aStarts = aLabel.startsWith(normalizedQuery);
      const bStarts = bLabel.startsWith(normalizedQuery);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return aLabel.localeCompare(bLabel);
    })
    .slice(0, 8)
    .map(pokemon => ({ pokemon, shadow: shadowRequested }));
}

function createPokemonSearch(
  input,
  matchesElement,
  onSelect,
  { shadowCheckbox = null } = {},
) {
  let highlightedIndex = -1;
  let visibleMatches = [];

  function closeMatches() {
    matchesElement.hidden = true;
    matchesElement.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    highlightedIndex = -1;
    visibleMatches = [];
  }

  function highlight(index) {
    const options = [...matchesElement.querySelectorAll(".pokemon-match")];
    if (!options.length) return;
    highlightedIndex = (index + options.length) % options.length;
    options.forEach((element, optionIndex) => {
      element.classList.toggle("highlighted", optionIndex === highlightedIndex);
      element.setAttribute("aria-selected", String(optionIndex === highlightedIndex));
    });
    const activeOption = options[highlightedIndex];
    input.setAttribute("aria-activedescendant", activeOption.id);
    activeOption.scrollIntoView({ block: "nearest" });
  }

  function choose(selection) {
    const pokemon = selection.pokemon ?? selection;
    if (shadowCheckbox && typeof selection.shadow === "boolean") {
      shadowCheckbox.checked = selection.shadow;
    }
    const shadow = shadowCheckbox?.checked === true;
    input.value = `${shadow ? "Shadow " : ""}${labelForPokemon(pokemon)}`;
    input.dataset.pokemonId = pokemon.form_id;
    input.setCustomValidity("");
    closeMatches();
    onSelect(pokemon);
  }

  function renderMatches() {
    const query = input.value.trim();
    if (!query) {
      closeMatches();
      return;
    }

    visibleMatches = matchingPokemon(query, Boolean(shadowCheckbox));
    highlightedIndex = -1;
    matchesElement.replaceChildren();

    if (!visibleMatches.length) {
      const empty = document.createElement("span");
      empty.className = "pokemon-match-empty";
      empty.textContent = "No matching Pokémon";
      matchesElement.append(empty);
    } else {
      visibleMatches.forEach((selection, index) => {
        const { pokemon, shadow } = selection;
        const match = document.createElement("button");
        match.type = "button";
        match.id = `${matchesElement.id}-option-${index}`;
        match.className = "pokemon-match";
        match.setAttribute("role", "option");
        match.setAttribute("aria-selected", "false");
        match.textContent = `${shadow ? "Shadow " : ""}${labelForPokemon(pokemon)}`;
        match.addEventListener("mousedown", event => {
          event.preventDefault();
          choose(selection);
        });
        matchesElement.append(match);
      });
    }

    matchesElement.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("input", () => {
    delete input.dataset.pokemonId;
    input.setCustomValidity("");
    onSelect(null);
    renderMatches();
  });

  input.addEventListener("focus", () => {
    if (pokemonForInput(input)) input.select();
  });

  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" && visibleMatches.length) {
      event.preventDefault();
      highlight(highlightedIndex + 1);
    } else if (event.key === "ArrowUp" && visibleMatches.length) {
      event.preventDefault();
      highlight(highlightedIndex - 1);
    } else if (event.key === "Enter" && visibleMatches.length) {
      event.preventDefault();
      choose(visibleMatches[highlightedIndex >= 0 ? highlightedIndex : 0]);
    } else if (event.key === "Escape") {
      closeMatches();
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(closeMatches, 100);
  });

  return {
    selectById(formId, shadow = null) {
      const pokemon = byId.get(formId);
      if (shadowCheckbox && typeof shadow === "boolean") {
        shadowCheckbox.checked = shadow;
      }
      if (pokemon) choose(pokemon);
    },
    requireSelection() {
      if (pokemonForInput(input)) return true;
      input.setCustomValidity("Choose a Pokémon from the matching results.");
      input.reportValidity();
      return false;
    },
  };
}

function updateBossMoves() {
  const pokemon = pokemonForInput(bossInput);
  if (!pokemon) {
    fillSelect(bossFastSelect, []);
    fillSelect(bossChargedSelect, []);
    updateSimulationScope();
    return;
  }
  fillSelect(bossFastSelect, pokemon.boss_fast_moves);
  fillSelect(bossChargedSelect, pokemon.boss_charged_moves);
  updateSimulationScope();
}

function updateSimulationScope() {
  const pokemon = pokemonForInput(bossInput);
  const allMovesets = movesetModeSelect.value === "all";
  const combinations = pokemon && allMovesets
    ? pokemon.boss_fast_moves.length * pokemon.boss_charged_moves.length
    : 1;
  const maximum = Math.max(1, Math.min(100, Math.floor(500 / combinations)));
  simulationCountInput.max = String(maximum);
  const games = Number(simulationCountInput.value) || 0;
  simulationCountInput.setCustomValidity(games > maximum
    ? `The 500-battle limit allows at most ${maximum} game${maximum === 1 ? "" : "s"} per moveset for this boss.`
    : "");
  bossFastSelect.disabled = allMovesets;
  bossChargedSelect.disabled = allMovesets;
  const total = combinations * games;
  document.querySelector("#simulation-scope-note").textContent = pokemon
    ? `${combinations} boss moveset${combinations === 1 ? "" : "s"} × ${games || 0} game${games === 1 ? "" : "s"} = ${total} battle${total === 1 ? "" : "s"}. Maximum 500 battles per request.`
    : "Choose a boss to calculate the batch size.";
  simulateButton.textContent = allMovesets
    ? "Simulate all boss movesets"
    : games === 1 ? "Simulate one raid" : `Simulate ${games || 0} games`;
}

function updateTeamMoves(row) {
  const pokemon = pokemonForInput(row.querySelector(".pokemon"));
  const megaLevelField = row.querySelector(".mega-level-field");
  const megaLevelSelect = row.querySelector(".mega-level");
  if (!pokemon) {
    fillSelect(row.querySelector(".fast-move"), []);
    fillSelect(row.querySelector(".charged-move"), []);
    megaLevelField.hidden = true;
    return;
  }
  const fastSelect = row.querySelector(".fast-move");
  const chargedSelect = row.querySelector(".charged-move");
  const shadow = row.querySelector(".shadow").checked;
  const selectedFast = fastSelect.value;
  const selectedCharged = chargedSelect.value;
  const hasMegaChargedMove = pokemon.mega_charged_moves.length > 0;
  megaLevelField.hidden = !hasMegaChargedMove;
  if (!hasMegaChargedMove) megaLevelSelect.value = "1";

  fillSelect(fastSelect, shadow ? pokemon.shadow_fast_moves : pokemon.fast_moves, selectedFast);
  fillSelect(
    chargedSelect,
    shadow ? pokemon.shadow_charged_moves : pokemon.charged_moves,
    selectedCharged,
    moveName => pokemon.mega_charged_moves.includes(moveName)
      ? poweredMoveName(moveName, Number(megaLevelSelect.value))
      : moveName,
  );
}

function playerSections() {
  return [...playersElement.querySelectorAll(":scope > .player-section")];
}

function renumberTeam(playerSection) {
  const teamElement = playerSection.querySelector(".team");
  [...teamElement.children].forEach((row, index) => {
    row.querySelector(".slot-number").textContent = index + 1;
  });
  playerSection.querySelector(".add-pokemon").disabled = teamElement.children.length >= 6;
  [...teamElement.querySelectorAll(".remove")].forEach(button => {
    button.disabled = teamElement.children.length === 1;
  });
}

function renumberPlayers() {
  const sections = playerSections();
  sections.forEach((section, index) => {
    section.querySelector(".player-number").textContent = index + 1;
    section.querySelector(".remove-player").disabled = sections.length === 1;
    renumberTeam(section);
  });
  addPlayerButton.disabled = sections.length >= 20;
  clonePlayerButton.disabled = sections.length >= 20 || !sections.length;
}

function updatePlayerStrategy() {
  const isCatchTank = playerStrategySelect.value === "catch_tank";
  document.querySelector("#strategy-description").textContent =
    strategyDescriptions[playerStrategySelect.value];
  [...playersElement.querySelectorAll(".catch-tank-field")].forEach(field => {
    field.hidden = !isCatchTank;
  });
}

function updatePurifiedGems() {
  const isShadowRaid = raidDifficultySelect.value.endsWith(" Shadow");
  purifiedGemsSelect.disabled = !isShadowRaid;
  if (!isShadowRaid) purifiedGemsSelect.value = "none";
  document.querySelector("#purified-gems-note").textContent = isShadowRaid
    ? "Shadow boss bonuses and enrage rules are applied automatically. Each trainer uses a gem immediately after enrage and then every 5 seconds, up to 5. The boss is subdued at 8 total gems; two or more players can therefore subdue it."
    : "Purified Gems are available only in Shadow raids.";
}

function codeConfigForRow(row) {
  const pokemon = pokemonForInput(row.querySelector(".pokemon"));
  if (!pokemon) throw new Error("Choose a Pokémon before exporting.");

  const levelInput = row.querySelector(".level");
  const ivInputs = [...row.querySelectorAll(".iv")];
  if (![levelInput, ...ivInputs].every(input => input.reportValidity())) {
    throw new Error("Correct the level or IVs before exporting.");
  }

  return {
    formId: pokemon.form_id,
    level: Number(levelInput.value),
    attackIv: Number(row.querySelector(".attack-iv").value),
    defenseIv: Number(row.querySelector(".defense-iv").value),
    staminaIv: Number(row.querySelector(".stamina-iv").value),
    fastMoveId: moveIdForName(
      pokemon.fast_move_data,
      row.querySelector(".fast-move").value,
    ),
    chargedMoveId: moveIdForName(
      pokemon.charged_move_data,
      row.querySelector(".charged-move").value,
    ),
    megaLevel: Number(row.querySelector(".mega-level").value),
    shadow: row.querySelector(".shadow").checked,
    catchTank: row.querySelector(".catch-tank").checked,
  };
}

function applyPokemonCode(row, code) {
  const decoded = PokemonCode.decode(code);
  applyPokemonConfig(row, decoded);
}

function applyPokemonConfig(row, decoded) {
  const pokemon = byId.get(decoded.formId);
  if (!pokemon) {
    throw new Error(`Pokémon form "${decoded.formId}" is not in this calculator.`);
  }

  const fastMoveName = moveNameForId(
    decoded.shadow ? pokemon.shadow_fast_move_data : pokemon.fast_move_data,
    decoded.fastMoveId,
  );
  const chargedMoveName = moveNameForId(
    decoded.shadow ? pokemon.shadow_charged_move_data : pokemon.charged_move_data,
    decoded.chargedMoveId,
  );
  if (!fastMoveName) {
    throw new Error(`The imported fast move is not available to ${labelForPokemon(pokemon)}.`);
  }
  if (!chargedMoveName) {
    throw new Error(`The imported charged move is not available to ${labelForPokemon(pokemon)}.`);
  }

  row.pokemonSearch.selectById(decoded.formId, decoded.shadow);
  row.querySelector(".mega-level").value = decoded.megaLevel;
  updateTeamMoves(row);
  row.querySelector(".fast-move").value = fastMoveName;
  row.querySelector(".charged-move").value = chargedMoveName;
  row.querySelector(".level").value = decoded.level;
  row.querySelector(".attack-iv").value = decoded.attackIv;
  row.querySelector(".defense-iv").value = decoded.defenseIv;
  row.querySelector(".stamina-iv").value = decoded.staminaIv;
  row.querySelector(".shadow").checked = decoded.shadow;
  row.querySelector(".catch-tank").checked = decoded.catchTank;
}

function setCodeStatus(row, message, isError = false) {
  const status = row.querySelector(".pokemon-code-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function exportPokemonCode(row) {
  const input = row.querySelector(".pokemon-code-input");
  input.value = PokemonCode.encode(codeConfigForRow(row));
  try {
    await navigator.clipboard.writeText(input.value);
    setCodeStatus(row, "Copied to clipboard.");
  } catch {
    input.focus();
    input.select();
    setCodeStatus(row, "Clipboard access was blocked. Press Ctrl+C to copy the selected code.", true);
  }
}

function addPokemon(playerSection, defaultId = null, config = null) {
  const teamElement = playerSection.querySelector(".team");
  if (teamElement.children.length >= 6) return;
  const row = document.createElement("div");
  row.className = "pokemon-row";
  const rowId = `pokemon-matches-${++pokemonRowIdSequence}`;
  row.innerHTML = `
    <span class="slot-number"></span>
    <label class="pokemon-field">
      Pokémon
      <span class="pokemon-search">
        <input
          class="pokemon"
          type="text"
          placeholder="Type a Pokémon name"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="${rowId}"
          required
        >
        <span id="${rowId}" class="pokemon-matches" role="listbox" hidden></span>
      </span>
    </label>
    <label class="move-field">Fast move<select class="fast-move"></select></label>
    <label class="move-field">Charged move<select class="charged-move"></select></label>
    <label class="level-field">Level<input class="level" type="number" min="1" max="55" step="0.5" value="50" required></label>
    <label class="mega-level-field" hidden>
      Mega Level
      <select class="mega-level">
        <option value="1">1 (+)</option>
        <option value="2">2 (++)</option>
        <option value="3">3 (+++)</option>
        <option value="4">4 (++++)</option>
      </select>
    </label>
    <fieldset class="ivs-field">
      <legend>IVs (A / D / HP)</legend>
      <div class="iv-inputs">
        <input class="iv attack-iv" aria-label="Attack IV" type="number" min="0" max="15" step="1" value="15" required>
        <input class="iv defense-iv" aria-label="Defense IV" type="number" min="0" max="15" step="1" value="15" required>
        <input class="iv stamina-iv" aria-label="HP IV" type="number" min="0" max="15" step="1" value="15" required>
      </div>
    </fieldset>
    <label class="catch-tank-field" hidden>
      <input class="catch-tank" type="checkbox">
      Catch tank
    </label>
    <button class="remove" type="button" aria-label="Remove Pokémon">×</button>
    <div class="pokemon-code-actions">
      <label class="shadow-field">
        <input class="shadow" type="checkbox">
        Shadow <span>(1.2× dealt and taken)</span>
      </label>
      <label class="pokemon-code-field">
        Pokémon code
        <input class="pokemon-code-input" type="text" spellcheck="false" autocomplete="off" placeholder="Paste code here">
      </label>
      <button class="small-button import-pokemon" type="button">Import</button>
      <button class="small-button export-pokemon" type="button">Export to clipboard</button>
      <span class="pokemon-code-status" role="status" aria-live="polite"></span>
    </div>
  `;
  const pokemonInput = row.querySelector(".pokemon");
  const search = createPokemonSearch(
    pokemonInput,
    row.querySelector(".pokemon-matches"),
    () => updateTeamMoves(row),
    { shadowCheckbox: row.querySelector(".shadow") },
  );
  row.pokemonSearch = search;
  if (defaultId) search.selectById(defaultId);
  row.querySelector(".shadow").addEventListener("change", event => {
    const pokemon = pokemonForInput(pokemonInput);
    if (!pokemon) return;
    pokemonInput.value = `${event.target.checked ? "Shadow " : ""}${labelForPokemon(pokemon)}`;
    updateTeamMoves(row);
  });
  row.querySelector(".mega-level").addEventListener("change", () => {
    updateTeamMoves(row);
  });
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    renumberTeam(playerSection);
  });
  row.querySelector(".import-pokemon").addEventListener("click", () => {
    try {
      const code = row.querySelector(".pokemon-code-input").value.trim();
      if (!code) throw new Error("Paste a Pokémon code into the field first.");
      applyPokemonCode(row, code);
      setCodeStatus(row, "Imported into this slot.");
    } catch (error) {
      setCodeStatus(row, error.message, true);
    }
  });
  row.querySelector(".export-pokemon").addEventListener("click", async () => {
    try {
      await exportPokemonCode(row);
    } catch (error) {
      setCodeStatus(row, error.message, true);
    }
  });
  teamElement.append(row);
  if (config) applyPokemonConfig(row, config);
  updateTeamMoves(row);
  renumberTeam(playerSection);
  updatePlayerStrategy();
}

function addPlayer(configs = null, defaultId = null, settings = {}) {
  if (playerSections().length >= 20) return;
  const section = document.createElement("section");
  section.className = "player-section";
  section.innerHTML = `
    <div class="player-heading">
      <h3>Player <span class="player-number"></span></h3>
      <div class="player-actions">
        <button class="small-button add-pokemon" type="button">+ Add Pokémon</button>
        <button class="small-button remove-player" type="button">Remove player</button>
      </div>
    </div>
    <div class="field-grid settings-grid player-settings">
      <label>Friendship bonus
        <select class="player-friendship">
          <option value="1">None (+0%)</option>
          <option value="1.03">Good Friends (+3%)</option>
          <option value="1.05">Great Friends (+5%)</option>
          <option value="1.07">Ultra Friends (+7%)</option>
          <option value="1.1">Best Friends (+10%)</option>
          <option value="1.12">Forever Friends (+12%)</option>
        </select>
      </label>
      <label>Adventure Effect
        <select class="player-adventure">
          <option value="none">None</option>
          <option value="behemoth_blade">Behemoth Blade (1.1× Attack)</option>
          <option value="behemoth_bash">Behemoth Bash (1.1× Defense)</option>
          <option value="dynamic_punch">Dynamic Punch+ (1.15× Attack vs Mega)</option>
        </select>
      </label>
      <label>Party Power group
        <select class="player-party">
          <option value="0">Off</option>
          ${Array.from({length:10}, (_,i) => `<option value="${i+1}">Party ${i+1}</option>`).join("")}
        </select>
      </label>
    </div>
    <p class="setting-note">Choose this player's highest friendship with someone in the raid. Each Party Power group needs 2–4 players; powered charged attacks deal double damage automatically.</p>
    <div class="team"></div>
  `;
  for (const [key, selector, fallback] of [["f", ".player-friendship", "1"], ["a", ".player-adventure", "none"], ["p", ".player-party", "0"]]) {
    const select = section.querySelector(selector);
    const value = String(settings[key] ?? fallback);
    if (![...select.options].some(option => option.value === value)) throw new Error(`Unsupported player setting: ${key}.`);
    select.value = value;
  }
  playersElement.append(section);
  section.querySelector(".add-pokemon").addEventListener("click", () => addPokemon(section));
  section.querySelector(".remove-player").addEventListener("click", () => {
    section.remove();
    renumberPlayers();
  });
  if (configs?.length) {
    configs.forEach(config => addPokemon(section, config.formId, config));
  } else {
    addPokemon(section, defaultId);
  }
  renumberPlayers();
}

function cloneFirstPlayer() {
  const first = playerSections()[0];
  if (!first || playerSections().length >= 20) return;
  const rows = [...first.querySelectorAll(".pokemon-row")];
  if (!rows.every(row => row.pokemonSearch.requireSelection())) return;
  try {
    addPlayer(rows.map(codeConfigForRow), null, playerSettings(first));
  } catch (error) {
    alert(error.message);
  }
}

function setShareStatus(message, isError = false) {
  shareStatus.textContent = message;
  shareStatus.classList.toggle("error", isError);
}

function selectValue(selector) {
  return document.querySelector(selector).value;
}

function shareState(seedOverride = undefined) {
  const boss = pokemonForInput(bossInput);
  if (!boss) throw new Error("Choose a raid boss before sharing.");
  const players = playerSections().map(section =>
    [...section.querySelectorAll(".pokemon-row")].map(row =>
      PokemonCode.encode(codeConfigForRow(row))
    )
  );
  if (!players.length || players.some(team => !team.length)) {
    throw new Error("Every shared player needs at least one Pokémon.");
  }
  const requestedSeed = document.querySelector("#random-seed").value.trim();
  return {
    v: RaidShareCodec.VERSION,
    r: {
      d: raidDifficultySelect.value,
      p: boss.form_id,
      f: bossFastSelect.value,
      c: bossChargedSelect.value,
      m: movesetModeSelect.value,
    },
    t: players,
    p: playerSections().map(playerSettings),
    o: {
      n: Number(simulationCountInput.value),
      d: selectValue(SHARE_SELECTS.dodge),
      s: selectValue(SHARE_SELECTS.strategy),
      w: selectValue(SHARE_SELECTS.weather),
      sf: selectValue(SHARE_SELECTS.seasonal),
      g: selectValue(SHARE_SELECTS.gems),
      l: selectValue(SHARE_SELECTS.log),
      z: seedOverride === undefined ? requestedSeed : String(seedOverride),
    },
  };
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing from the shared setup.`);
  }
  return value;
}

function setSharedSelect(selector, value, label) {
  const select = document.querySelector(selector);
  const stringValue = String(value ?? "");
  if (![...select.options].some(option => option.value === stringValue)) {
    throw new Error(`The shared ${label} option is not supported.`);
  }
  select.value = stringValue;
}

function applySharedSetup(state) {
  requireObject(state, "Raid setup");
  if (state.v !== RaidShareCodec.VERSION) {
    throw new Error(`Shared setup version ${state.v ?? "unknown"} is not supported.`);
  }
  const raid = requireObject(state.r, "Raid boss");
  const options = requireObject(state.o, "Battle settings");
  if (!Array.isArray(state.t) || state.t.length < 1 || state.t.length > 20) {
    throw new Error("A shared setup must contain 1 to 20 players.");
  }
  if (state.t.some(team => !Array.isArray(team) || team.length < 1 || team.length > 6)) {
    throw new Error("Every shared player must contain 1 to 6 Pokémon.");
  }
  const decodedTeams = state.t.map(team => team.map(code => {
    if (typeof code !== "string") throw new Error("A shared Pokémon code is invalid.");
    return PokemonCode.decode(code);
  }));

  setSharedSelect("#raid-difficulty", raid.d, "raid difficulty");
  if (!byId.has(raid.p)) throw new Error(`Shared boss "${raid.p}" is not in this calculator.`);
  bossInput.pokemonSearch.selectById(raid.p);
  updateBossMoves();
  setSharedSelect("#boss-fast-move", raid.f, "boss fast move");
  setSharedSelect("#boss-charged-move", raid.c, "boss charged move");
  setSharedSelect("#boss-moveset-mode", raid.m, "boss moveset mode");

  const simulations = Number(options.n);
  if (!Number.isInteger(simulations) || simulations < 1 || simulations > 100) {
    throw new Error("Shared games per moveset must be an integer from 1 to 100.");
  }
  simulationCountInput.value = String(simulations);
  setSharedSelect(SHARE_SELECTS.dodge, options.d, "dodge strategy");
  setSharedSelect(SHARE_SELECTS.strategy, options.s, "player strategy");
  setSharedSelect(SHARE_SELECTS.weather, options.w, "weather");
  setSharedSelect(SHARE_SELECTS.seasonal, options.sf ?? "normal", "seasonal friendship");
  updatePurifiedGems();
  setSharedSelect(SHARE_SELECTS.gems, options.g, "Purified Gems");
  setSharedSelect(SHARE_SELECTS.log, options.l, "battle log");
  const seed = String(options.z ?? "");
  if (seed && (!/^\d+$/.test(seed) || BigInt(seed) > 9_223_372_036_854_775_807n)) {
    throw new Error("The shared random seed is outside the supported range.");
  }
  document.querySelector("#random-seed").value = seed;

  playersElement.replaceChildren();
  if (state.p !== undefined && (!Array.isArray(state.p) || state.p.length !== decodedTeams.length)) {
    throw new Error("Shared player settings must match the number of teams.");
  }
  decodedTeams.forEach((team, i) => addPlayer(team, null,
    state.p ? requireObject(state.p[i], "Player settings") : { f: String(Number(options.f ?? 1)), a: options.a ?? "none" }));
  updatePlayerStrategy();
  updateSimulationScope();
}

function setupFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("setup");
  if (!encoded) return { loaded: false, autoRun: false };
  if (params.get("v") !== String(RaidShareCodec.VERSION)) {
    throw new Error(`Shared link version ${params.get("v") ?? "unknown"} is not supported.`);
  }
  applySharedSetup(RaidShareCodec.decode(encoded));
  return { loaded: true, autoRun: params.get("run") === "1" };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard access was blocked by this browser.");
  }
}

async function copyShareUrl(url, label) {
  await copyText(url);
  const lengthNote = url.length > 8_000
    ? ` It is a long link (${url.length.toLocaleString()} characters), so some chat apps may shorten it.`
    : "";
  setShareStatus(`${label} copied.${lengthNote}`);
}

async function initialize() {
  const result = await globalThis.RaidClient.request("catalog");
  catalog = result.pokemon.filter(
    pokemon => pokemon.fast_moves.length && pokemon.charged_moves.length
  );
  catalog.sort((a, b) => labelForPokemon(a).localeCompare(labelForPokemon(b)));
  catalog.forEach(pokemon => byId.set(pokemon.form_id, pokemon));

  const bossSearch = createPokemonSearch(
    bossInput,
    document.querySelector("#boss-matches"),
    updateBossMoves,
  );
  bossInput.pokemonSearch = bossSearch;
  updateBossMoves();
  let shared = { loaded: false, autoRun: false };
  try {
    shared = setupFromLocation();
    if (shared.loaded) setShareStatus("Shared setup loaded from this link.");
  } catch (error) {
    setShareStatus(error.message, true);
  }
  if (!shared.loaded) { playersElement.replaceChildren(); addPlayer(); }
  addPlayerButton.disabled = false;
  clonePlayerButton.disabled = false;
  if (shared.autoRun) window.setTimeout(() => form.requestSubmit(), 0);
}

function teamPayload(playerSection) {
  const teamElement = playerSection.querySelector(".team");
  return [...teamElement.children].map(row => {
    const pokemon = pokemonForInput(row.querySelector(".pokemon"));
    return {
      name: pokemon.form_id,
      fast_move: row.querySelector(".fast-move").value,
      charged_move: row.querySelector(".charged-move").value,
      level: Number(row.querySelector(".level").value),
      attack_iv: Number(row.querySelector(".attack-iv").value),
      defense_iv: Number(row.querySelector(".defense-iv").value),
      stamina_iv: Number(row.querySelector(".stamina-iv").value),
      mega_level: Number(row.querySelector(".mega-level").value),
      shadow: row.querySelector(".shadow").checked,
      catch_tank: row.querySelector(".catch-tank").checked,
    };
  });
}

function playerSettings(section) {
  return {
    f: section.querySelector(".player-friendship").value,
    a: section.querySelector(".player-adventure").value,
    p: section.querySelector(".player-party").value,
  };
}

function playersPayload() {
  return playerSections().map(section => {
    const settings = playerSettings(section);
    return {
      team: teamPayload(section), friendship: Number(settings.f),
      zacian_adventure_effect: settings.a === "behemoth_blade",
      behemoth_bash_adventure_effect: settings.a === "behemoth_bash",
      dynamic_punch_adventure_effect: settings.a === "dynamic_punch",
      party_group: Number(settings.p),
    };
  });
}

function battlePayload() {
  const randomSeed = document.querySelector("#random-seed").value.trim();
  return {
    raid_difficulty: raidDifficultySelect.value,
    boss: pokemonForInput(bossInput).form_id,
    boss_fast_move: bossFastSelect.value,
    boss_charged_move: bossChargedSelect.value,
    boss_moveset_mode: movesetModeSelect.value,
    simulation_count: Number(simulationCountInput.value),
    players: playersPayload(),
    dodge_strategy: document.querySelector("#dodge-strategy").value,
    player_strategy: playerStrategySelect.value,
    weather: document.querySelector("#weather").value,
    seasonal_friendship: selectValue(SHARE_SELECTS.seasonal) === "double",
    use_purified_gems: purifiedGemsSelect.value === "use",
    battle_log_mode: document.querySelector("#battle-log-mode").value,
    random_seed: randomSeed || null,
  };
}

globalThis.RaidSetup = {
  read({ singlePlayer = false } = {}) {
    const rows = [...playersElement.querySelectorAll(".pokemon-row")];
    if (!bossInput.pokemonSearch || !playerSections().length || !rows.length) throw new Error("Pokémon data is still loading.");
    if (!bossInput.pokemonSearch.requireSelection()
        || !rows.every(row => row.pokemonSearch.requireSelection())
        || !form.checkValidity()) {
      globalThis.ReplayUI?.showView("simulator-view");
      form.reportValidity();
      throw new Error("Check the boss, team and settings in the Raid simulator tab first.");
    }
    const payload = battlePayload();
    if (singlePlayer) {
      payload.players = payload.players.slice(0, 1);
      payload.players[0].party_group = 0;
    }
    return payload;
  },
};

function showResult(result) {
  const panel = document.querySelector("#result");
  panel.hidden = false;
  const batch = result.mode === "batch";
  document.querySelector("#single-result-stats").hidden = batch;
  document.querySelector("#batch-result").hidden = !batch;
  document.querySelectorAll(".single-replay-action").forEach(button => { button.hidden = batch; });
  const logDetails = document.querySelector("#battle-log-details");
  if (batch) {
    panel.classList.toggle("loss", result.total_wins === 0);
    document.querySelector("#result-title").textContent = "Batch complete";
    document.querySelector("#result-time").textContent = `${result.total_battles.toLocaleString()} battles`;
    document.querySelector("#result-seed").textContent = `Base seed ${result.random_seed}`;
    document.querySelector("#batch-battles").textContent = result.total_battles.toLocaleString();
    document.querySelector("#batch-movesets").textContent = result.movesets.length.toLocaleString();
    document.querySelector("#batch-wins").textContent = result.total_wins.toLocaleString();
    document.querySelector("#batch-win-rate").textContent = `${result.win_percent.toFixed(1)}%`;
    document.querySelector("#batch-rows").replaceChildren(...result.movesets.map(row => {
      const tr = document.createElement("tr");
      const hiddenTypes = Object.entries(row.hidden_power_types || {})
        .map(([type, count]) => `${type} ${count}`).join(", ");
      const values = [
        row.fast_move + (hiddenTypes ? ` (${hiddenTypes})` : ""), row.charged_move,
        row.games.toLocaleString(), `${row.win_percent.toFixed(1)}%`,
        row.average_win_time === null ? "—" : `${row.average_win_time.toFixed(1)}s`,
        row.wins === row.games ? "—" : Math.round(row.average_boss_hp_on_loss).toLocaleString(),
      ];
      tr.append(...values.map(value => {
        const td = document.createElement("td"); td.textContent = value; return td;
      }));
      return tr;
    }));
    logDetails.hidden = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  panel.classList.toggle("loss", !result.won);
  document.querySelector("#result-title").textContent = result.won ? "Victory" : "Defeat";
  document.querySelector("#result-time").textContent = result.won
    ? `${result.finish_time.toFixed(1)} seconds`
    : "Time expired";
  document.querySelector("#boss-hp").textContent = result.boss_hp.toLocaleString();
  document.querySelector("#faints").textContent = result.faints;
  document.querySelector("#retreats").textContent = result.retreats;
  document.querySelector("#rejoins").textContent = result.rejoins;
  document.querySelector("#catch-tanks").textContent = result.catch_tanks;
  document.querySelector("#purified-gems-used").textContent = result.purified_gems_used;
  document.querySelector("#result-seed").textContent = `Seed ${result.random_seed}`
    + (result.boss_fast_type ? ` · Hidden Power: ${result.boss_fast_type}` : "");
  document.querySelector("#battle-log").textContent = result.log.join("\n");
  logDetails.hidden = result.battle_log_mode === "none";
  document.querySelector("#battle-log-summary").textContent =
    result.battle_log_mode === "full"
      ? "Show full battle log"
      : "Show move timeline";
  globalThis.ReplayUI?.setGeneratedReplay(result.replay_text, {
    boss: pokemonForInput(bossInput).form_id,
    seed: result.random_seed,
  });
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const teamRows = [...playersElement.querySelectorAll(".pokemon-row")];
  const selectionsAreValid = bossInput.pokemonSearch.requireSelection()
    && teamRows.every(row => row.pokemonSearch.requireSelection());
  if (!selectionsAreValid) return;

  simulateButton.disabled = true;
  simulateAgainButton.disabled = true;
  simulateButton.textContent = "Simulating…";
  try {
    const request = battlePayload();
    const resultState = shareState();
    const result = await globalThis.RaidClient.request("simulate", request);
    resultState.o.z = String(result.random_seed);
    lastResultShareUrl = RaidShareCodec.createUrl(window.location.href, resultState, { run: true });
    copyResultLinkButton.disabled = false;
    showResult(result);
  } catch (error) {
    alert(error.message);
  } finally {
    simulateButton.disabled = false;
    simulateAgainButton.disabled = false;
    updateSimulationScope();
  }
});

addPlayerButton.addEventListener("click", () => addPlayer());
clonePlayerButton.addEventListener("click", cloneFirstPlayer);
copySetupLinkButton.addEventListener("click", async () => {
  try {
    globalThis.RaidSetup.read();
    const url = RaidShareCodec.createUrl(window.location.href, shareState());
    await copyShareUrl(url, "Setup link");
  } catch (error) {
    setShareStatus(error.message, true);
  }
});
copyResultLinkButton.addEventListener("click", async () => {
  try {
    if (!lastResultShareUrl) throw new Error("Run a simulation before copying a result link.");
    await copyShareUrl(lastResultShareUrl, "Reproducible result link");
  } catch (error) {
    setShareStatus(error.message, true);
  }
});
simulateAgainButton.addEventListener("click", () => form.requestSubmit());
playerStrategySelect.addEventListener("change", updatePlayerStrategy);
movesetModeSelect.addEventListener("change", updateSimulationScope);
simulationCountInput.addEventListener("input", updateSimulationScope);
raidDifficultySelect.addEventListener("change", updatePurifiedGems);
updatePlayerStrategy();
updatePurifiedGems();
initialize().catch(error => alert(error.message));
