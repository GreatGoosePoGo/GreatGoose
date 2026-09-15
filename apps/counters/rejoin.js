/* Rejoin-time control kept separate from the main counter UI adapter. */
(() => {
  "use strict";

  const DEFAULT_REJOIN = "7.5";
  const grid = document.querySelector("#counter-settings .condition-grid");
  if (!grid) return;

  const label = document.createElement("label");
  label.className = "select-control";
  label.append(document.createTextNode("Rejoin time"));
  const input = document.createElement("input");
  input.id = "counter-rejoin-time";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "7.5 or 7.5:1, 8:2, 8.5:1";
  input.title = "Enter one rejoin time in seconds, or relative weights such as 7.5:1, 8:2, 8.5:1. Weights do not need to add to 1.";
  input.value = new URL(location.href).searchParams.get("rejoin") || DEFAULT_REJOIN;
  label.append(input);
  grid.append(label);

  // Counter calculations are cached by the main adapter. Reloading when this
  // uncommon advanced setting changes keeps that cache keyed to one rejoin model.
  input.addEventListener("change", () => {
    const value = input.value.trim() || DEFAULT_REJOIN;
    const url = new URL(location.href);
    if (value === DEFAULT_REJOIN) url.searchParams.delete("rejoin");
    else url.searchParams.set("rejoin", value);
    location.replace(url);
  });

  // The counter worker is the only Worker on this page. Inject the current
  // value into full counter runs and on-demand breakdowns without duplicating
  // the rest of the settings adapter.
  const originalPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, ...rest) {
    if (message && (message.mode === "counters" || message.mode === "breakdown")) {
      message = {...message, rejoinTime: input.value.trim() || DEFAULT_REJOIN};
    }
    return originalPostMessage.call(this, message, ...rest);
  };

  // Mirror the Generate button's disabled state so the setting cannot change
  // in the middle of a long simulation.
  const generate = document.querySelector("#generate-counters");
  if (generate) {
    const syncDisabled = () => { input.disabled = generate.disabled; };
    new MutationObserver(syncDisabled).observe(generate, {attributes: true, attributeFilter: ["disabled"]});
    syncDisabled();
  }
})();
