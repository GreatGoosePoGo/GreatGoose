let catalog = [];
const byId = new Map();

const bossInput = document.querySelector("#boss");
const bossFastSelect = document.querySelector("#boss-fast-move");
const bossChargedSelect = document.querySelector("#boss-charged-move");
const teamElement = document.querySelector("#team");
const addButton = document.querySelector("#add-pokemon");
const form = document.querySelector("#simulator-form");
const simulateButton = document.querySelector("#simulate");
const simulateAgainButton = document.querySelector("#simulate-again");
const movesetModeSelect = document.querySelector("#boss-moveset-mode");
const simulationCountInput = document.querySelector("#simulation-count");
const playerStrategySelect = document.querySelector("#player-strategy");
const codeDialog = document.querySelector("#pokemon-code-dialog");
const codeDialogTitle = document.querySelector("#pokemon-code-title");
const codeHelp = document.querySelector("#pokemon-code-help");
const codeInput = document.querySelector("#pokemon-code");
const codeStatus = document.querySelector("#pokemon-code-status");
const codeAction = document.querySelector("#pokemon-code-action");
let codeDialogMode = "export";
let codeDialogRow = null;

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
  const selectedFast = fastSelect.value;
  const selectedCharged = chargedSelect.value;
  const hasMegaChargedMove = pokemon.mega_charged_moves.length > 0;
  megaLevelField.hidden = !hasMegaChargedMove;
  if (!hasMegaChargedMove) megaLevelSelect.value = "1";

  fillSelect(fastSelect, pokemon.fast_moves, selectedFast);
  fillSelect(
    chargedSelect,
    pokemon.charged_moves,
    selectedCharged,
    moveName => pokemon.mega_charged_moves.includes(moveName)
      ? poweredMoveName(moveName, Number(megaLevelSelect.value))
      : moveName,
  );
}

function renumberTeam() {
  [...teamElement.children].forEach((row, index) => {
    row.querySelector(".slot-number").textContent = index + 1;
  });
  addButton.disabled = teamElement.children.length >= 6;
  [...teamElement.querySelectorAll(".remove")].forEach(button => {
    button.disabled = teamElement.children.length === 1;
  });
}

function updatePlayerStrategy() {
  const isCatchTank = playerStrategySelect.value === "catch_tank";
  document.querySelector("#strategy-description").textContent =
    strategyDescriptions[playerStrategySelect.value];
  [...teamElement.querySelectorAll(".catch-tank-field")].forEach(field => {
    field.hidden = !isCatchTank;
  });
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
  const pokemon = byId.get(decoded.formId);
  if (!pokemon) {
    throw new Error(`Pokémon form "${decoded.formId}" is not in this calculator.`);
  }

  const fastMoveName = moveNameForId(pokemon.fast_move_data, decoded.fastMoveId);
  const chargedMoveName = moveNameForId(
    pokemon.charged_move_data,
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

async function copyCode() {
  try {
    await navigator.clipboard.writeText(codeInput.value);
    codeStatus.textContent = "Copied to clipboard.";
  } catch {
    codeInput.focus();
    codeInput.select();
    codeStatus.textContent = "Press Ctrl+C to copy the selected code.";
  }
}

function openCodeDialog(row, mode) {
  codeDialogRow = row;
  codeDialogMode = mode;
  codeStatus.textContent = "";

  if (mode === "export") {
    codeDialogTitle.textContent = "Export Pokémon";
    codeHelp.textContent =
      "This code contains the exact form, level, IVs, moves, Mega Level, Shadow status, and catch-tank setting.";
    codeInput.value = PokemonCode.encode(codeConfigForRow(row));
    codeInput.readOnly = true;
    codeAction.textContent = "Copy code";
  } else {
    codeDialogTitle.textContent = "Import Pokémon";
    codeHelp.textContent =
      "Paste a Great Goose Pokémon code to replace the Pokémon in this slot.";
    codeInput.value = "";
    codeInput.readOnly = false;
    codeAction.textContent = "Import into slot";
  }

  codeDialog.showModal();
  codeInput.focus();
  if (mode === "export") {
    codeInput.select();
    copyCode();
  }
}

function closeCodeDialog() {
  codeDialog.close();
  codeDialogRow = null;
}

function addPokemon(defaultId = "MEWTWO") {
  if (teamElement.children.length >= 6) return;
  const row = document.createElement("div");
  row.className = "pokemon-row";
  const rowId = `pokemon-matches-${crypto.randomUUID()}`;
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
      <button class="small-button import-pokemon" type="button">Import</button>
      <button class="small-button export-pokemon" type="button">Export</button>
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
  search.selectById(byId.has(defaultId) ? defaultId : catalog[0].form_id);
  row.querySelector(".shadow").addEventListener("change", event => {
    const pokemon = pokemonForInput(pokemonInput);
    if (!pokemon) return;
    pokemonInput.value = `${event.target.checked ? "Shadow " : ""}${labelForPokemon(pokemon)}`;
  });
  row.querySelector(".mega-level").addEventListener("change", () => {
    updateTeamMoves(row);
  });
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    renumberTeam();
  });
  row.querySelector(".import-pokemon").addEventListener("click", () => {
    openCodeDialog(row, "import");
  });
  row.querySelector(".export-pokemon").addEventListener("click", () => {
    try {
      openCodeDialog(row, "export");
    } catch (error) {
      alert(error.message);
    }
  });
  teamElement.append(row);
  updateTeamMoves(row);
  renumberTeam();
  updatePlayerStrategy();
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
  bossSearch.selectById(byId.has("KYOGRE") ? "KYOGRE" : catalog[0].form_id);
  addPokemon("GROUDON_PRIMAL");
}

function teamPayload() {
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

function battlePayload() {
  const randomSeed = document.querySelector("#random-seed").value.trim();
  const adventureEffect = document.querySelector("#adventure-effect").value;
  return {
    raid_difficulty: document.querySelector("#raid-difficulty").value,
    boss: pokemonForInput(bossInput).form_id,
    boss_fast_move: bossFastSelect.value,
    boss_charged_move: bossChargedSelect.value,
    boss_moveset_mode: movesetModeSelect.value,
    simulation_count: Number(simulationCountInput.value),
    team: teamPayload(),
    dodge_strategy: document.querySelector("#dodge-strategy").value,
    player_strategy: playerStrategySelect.value,
    weather: document.querySelector("#weather").value,
    friendship: Number(document.querySelector("#friendship").value),
    zacian_adventure_effect: adventureEffect === "behemoth_blade",
    behemoth_bash_adventure_effect: adventureEffect === "behemoth_bash",
    dynamic_punch_adventure_effect: adventureEffect === "dynamic_punch",
    battle_log_mode: document.querySelector("#battle-log-mode").value,
    random_seed: randomSeed || null,
  };
}

globalThis.RaidSetup = {
  read() {
    if (!bossInput.pokemonSearch || !teamElement.children.length) throw new Error("Pokémon data is still loading.");
    if (!bossInput.pokemonSearch.requireSelection()
        || ![...teamElement.children].every(row => row.pokemonSearch.requireSelection())
        || !form.checkValidity()) {
      globalThis.ReplayUI?.showView("simulator-view");
      form.reportValidity();
      throw new Error("Check the boss, team and settings in the Raid simulator tab first.");
    }
    return battlePayload();
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
  const teamRows = [...teamElement.children];
  const selectionsAreValid = bossInput.pokemonSearch.requireSelection()
    && teamRows.every(row => row.pokemonSearch.requireSelection());
  if (!selectionsAreValid) return;

  simulateButton.disabled = true;
  simulateAgainButton.disabled = true;
  simulateButton.textContent = "Simulating…";
  try {
    const result = await globalThis.RaidClient.request("simulate", battlePayload());
    showResult(result);
  } catch (error) {
    alert(error.message);
  } finally {
    simulateButton.disabled = false;
    simulateAgainButton.disabled = false;
    updateSimulationScope();
  }
});

addButton.addEventListener("click", () => addPokemon());
simulateAgainButton.addEventListener("click", () => form.requestSubmit());
playerStrategySelect.addEventListener("change", updatePlayerStrategy);
movesetModeSelect.addEventListener("change", updateSimulationScope);
simulationCountInput.addEventListener("input", updateSimulationScope);
document.querySelector("#close-code-dialog").addEventListener("click", closeCodeDialog);
document.querySelector("#cancel-code-dialog").addEventListener("click", closeCodeDialog);
codeDialog.addEventListener("click", event => {
  if (event.target === codeDialog) closeCodeDialog();
});
codeAction.addEventListener("click", async () => {
  if (codeDialogMode === "export") {
    await copyCode();
    return;
  }
  try {
    applyPokemonCode(codeDialogRow, codeInput.value);
    closeCodeDialog();
  } catch (error) {
    codeStatus.textContent = error.message;
  }
});
updatePlayerStrategy();
initialize().catch(error => alert(error.message));
