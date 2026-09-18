/* Advanced timing controls kept separate from the main counter UI adapter. */
(() => {
  "use strict";

  const DEFAULT_REJOIN = "7.5";
  const BATTLE_TIMES = [27, 72, 147, 180, 222, 300];
  const grid = document.querySelector("#counter-settings .condition-grid");
  const difficulty = document.querySelector("#counter-difficulty");
  if (!grid || !difficulty) return;

  const normalBattleTime = raidDifficulty =>
    ["Tier 1", "Tier 3", "Tier 1 Shadow", "Tier 3 Shadow"].includes(raidDifficulty) ? 180 : 300;
  const allowedBattleTimes = raidDifficulty =>
    BATTLE_TIMES.filter(seconds => seconds <= normalBattleTime(raidDifficulty));
  const params = new URL(location.href).searchParams;

  const rejoinLabel = document.createElement("label");
  rejoinLabel.className = "select-control";
  rejoinLabel.append(document.createTextNode("Rejoin time"));
  const rejoinInput = document.createElement("input");
  rejoinInput.id = "counter-rejoin-time";
  rejoinInput.type = "text";
  rejoinInput.autocomplete = "off";
  rejoinInput.spellcheck = false;
  rejoinInput.placeholder = "7.5, 8, 8.5 or 7.5:1, 8:2, 8.5:1";
  rejoinInput.title = "Enter one time, a comma-separated equal-probability list such as 7.5, 8, 8.5, or give every time a relative weight such as 7.5:1, 8:2, 8.5:1. Do not mix weighted and unweighted entries.";
  rejoinInput.value = params.get("rejoin") || DEFAULT_REJOIN;
  rejoinLabel.append(rejoinInput);
  grid.append(rejoinLabel);

  const timeLabel = document.createElement("label");
  timeLabel.className = "select-control";
  timeLabel.append(document.createTextNode("Battle time limit"));
  const timeSelect = document.createElement("select");
  timeSelect.id = "counter-battle-time";
  timeSelect.title = "Maximum elapsed battle time. The visible raid clock still starts at the normal 180 or 300 seconds.";
  const setBattleTimeOptions = (raidDifficulty, preferred) => {
    const allowed = allowedBattleTimes(raidDifficulty);
    timeSelect.replaceChildren(...allowed.map(seconds => new Option(`${seconds} seconds`, String(seconds))));
    timeSelect.value = String(allowed.includes(preferred)
      ? preferred
      : normalBattleTime(raidDifficulty));
  };
  let previousDifficulty = difficulty.value;
  const requestedTime = Number(params.get("battleTime"));
  setBattleTimeOptions(previousDifficulty, requestedTime);
  timeLabel.append(timeSelect);
  grid.append(timeLabel);

  const syncBattleTimeDefault = () => {
    if (difficulty.value === previousDifficulty) return;
    const previousValue = Number(timeSelect.value);
    const oldDefault = normalBattleTime(previousDifficulty);
    const nextDefault = normalBattleTime(difficulty.value);
    const preferred = previousValue === oldDefault ? nextDefault : previousValue;
    setBattleTimeOptions(difficulty.value, preferred);
    previousDifficulty = difficulty.value;
  };

  // Counter calculations are cached by the main adapter. Reloading after one
  // of these uncommon advanced settings changes guarantees a fresh cache key.
  rejoinInput.addEventListener("change", () => {
    const value = rejoinInput.value.trim() || DEFAULT_REJOIN;
    const url = new URL(location.href);
    if (value === DEFAULT_REJOIN) url.searchParams.delete("rejoin");
    else url.searchParams.set("rejoin", value);
    location.replace(url);
  });

  timeSelect.addEventListener("change", () => {
    const value = Number(timeSelect.value);
    const url = new URL(location.href);
    if (value === normalBattleTime(difficulty.value)) url.searchParams.delete("battleTime");
    else url.searchParams.set("battleTime", String(value));
    location.replace(url);
  });

  difficulty.addEventListener("change", syncBattleTimeDefault);

  // The counter worker is the only Worker on this page. Inject the current
  // values into full counter runs and on-demand breakdowns without duplicating
  // the rest of the settings adapter.
  const originalPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, ...rest) {
    syncBattleTimeDefault();
    if (message && (message.mode === "counters" || message.mode === "breakdown")) {
      message = {
        ...message,
        rejoinTime: rejoinInput.value.trim() || DEFAULT_REJOIN,
        battleTime: Number(timeSelect.value),
      };
    }
    return originalPostMessage.call(this, message, ...rest);
  };

  // Mirror the Generate button's disabled state so settings cannot change in
  // the middle of a long simulation.
  const generate = document.querySelector("#generate-counters");
  if (generate) {
    const syncDisabled = () => {
      rejoinInput.disabled = generate.disabled;
      timeSelect.disabled = generate.disabled;
    };
    new MutationObserver(syncDisabled).observe(generate, {attributes: true, attributeFilter: ["disabled"]});
    syncDisabled();
  }
})();