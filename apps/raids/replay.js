const replayFileInput = document.querySelector("#replay-file");
const replayTextInput = document.querySelector("#replay-text");
const validateReplayButton = document.querySelector("#validate-replay");
const loadPlaybackButton = document.querySelector("#load-playback");
const insertReplayExampleButton = document.querySelector("#insert-replay-example");
const replayStatus = document.querySelector("#replay-status");
const replayPreview = document.querySelector("#replay-preview");
const replaySummary = document.querySelector("#replay-summary");
const replayWarnings = document.querySelector("#replay-warnings");
const replayEvents = document.querySelector("#replay-events");
const viewTabs = [...document.querySelectorAll(".view-tab")];
const appViews = [...document.querySelectorAll(".app-view")];
const openGeneratedReplayButton = document.querySelector("#open-generated-replay");
const downloadGeneratedReplayButton = document.querySelector("#download-generated-replay");
let generatedReplayText = "";
let generatedReplayFilename = "battle-replay.txt";
let replayRevision = 0;

const replayExample = `Raid: Tier 4
Boss: STARMIE_MEGA; fast=Water Gun; charged=Hydro Pump
Teams:
p1: Necrozma Dawn Wings / Shadow Claw / Moongeist Beam / L50 / 15-15-15; Armored Mewtwo / Confusion / Psystrike / L50 / 15-15-15
p2: Venusaur / Vine Whip / Frenzy Plant / L50 / 15-15-15

Friendship: p1=1.10; p2=1.10
Zacian effects: p1=false; p2=false
Behemoth Bash effects: p1=false; p2=false
Dynamic Punch+ effects: p1=false; p2=false
Weather: none
Dodge: downtime_saver
Swap: hot_swap_greedy
Purified Gems: none
Catch tanks: p1=-; p2=-
Party Power: normal; groups=p1,2
Move codes: sc=Shadow Claw; vw=Vine Whip; co=Confusion

Events:
t0p1:sc
+0p2:vw
+0b:f
+0.5p1:sc
+0p2:vw
+0.5p1:sc
+0p2:vw
+0.5p1:sc
+0p2:vw
+0.5p1:sc
+0p2:vw
+0.5p1:sc
+0p2:vw
+0.5b:f
+0p1:s2
+1p1:co
+1p2:vw
+1p1:q
+3.5p1:r
+0p1:sc`;

function showView(viewId) {
  if (viewId !== "replay-view") globalThis.BattlePlayback?.pause();
  appViews.forEach(view => {
    view.hidden = view.id !== viewId;
  });
  viewTabs.forEach(tab => {
    const active = tab.dataset.view === viewId;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setReplayStatus(message, isError = false) {
  replayStatus.textContent = message;
  replayStatus.classList.toggle("error", isError);
}

function addSummaryCard(label, value) {
  const card = document.createElement("div");
  const strong = document.createElement("strong");
  const caption = document.createElement("span");
  strong.textContent = value;
  caption.textContent = label;
  card.append(strong, caption);
  replaySummary.append(card);
}

function renderReplayPreview(replay) {
  replaySummary.replaceChildren();
  replayEvents.replaceChildren();
  replayWarnings.replaceChildren();

  addSummaryCard("Raid", replay.raid.difficulty);
  addSummaryCard("Boss", replay.boss.name || replay.boss.form_id);
  addSummaryCard("Players", String(replay.summary.player_count));
  addSummaryCard("Events", String(replay.summary.event_count));
  addSummaryCard("Last event", replay.summary.last_time_label);

  if (replay.warnings.length) {
    const title = document.createElement("strong");
    title.textContent = "Warnings";
    const list = document.createElement("ul");
    replay.warnings.forEach(warning => {
      const item = document.createElement("li");
      item.textContent = warning;
      list.append(item);
    });
    replayWarnings.append(title, list);
    replayWarnings.hidden = false;
  } else {
    replayWarnings.hidden = true;
  }

  replay.events.forEach(event => {
    const row = document.createElement("tr");
    const values = [
      event.time_label,
      String(event.tick),
      event.player_label,
      event.description,
      String(event.source_line),
    ];
    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    replayEvents.append(row);
  });

  replayPreview.hidden = false;
}

async function validateReplay() {
  const text = replayTextInput.value;
  const revision = replayRevision;
  replayPreview.hidden = true;
  validateReplayButton.disabled = true;
  validateReplayButton.textContent = "Validating…";
  setReplayStatus("");
  try {
    const result = await globalThis.RaidClient.request("replay/parse", { text });
    if (revision !== replayRevision) return;
    renderReplayPreview(result);
    setReplayStatus(
      `Valid: ${result.summary.event_count} events normalized to 0.5-second ticks.`,
    );
  } catch (error) {
    setReplayStatus(error.message, true);
  } finally {
    validateReplayButton.disabled = false;
    validateReplayButton.textContent = "Validate text";
  }
}

function invalidateReplay() {
  replayRevision += 1;
  globalThis.BattlePlayback?.clear();
  replayPreview.hidden = true;
  setReplayStatus("");
}

async function loadPlayback() {
  const revision = replayRevision;
  loadPlaybackButton.disabled = true;
  loadPlaybackButton.textContent = "Loading…";
  setReplayStatus("Calculating battle states…");
  try {
    if (!globalThis.BattlePlayback) {
      throw new Error("The replay player did not load. Extract the complete updated ZIP, run npm start, and refresh this page with Ctrl+F5.");
    }
    globalThis.BattlePlayback.clear();
    if (window.location.protocol === "file:") {
      throw new Error("Open http://localhost:8000 after running npm start. Replay calculations cannot run by opening index.html directly.");
    }
    if (!replayTextInput.value.trim()) {
      throw new Error("Open a replay .txt file, paste replay text, or select Play example.");
    }
    const result = await globalThis.RaidClient.request("replay/playback", { text: replayTextInput.value });
    if (revision !== replayRevision) return;
    renderReplayPreview({ ...result.replay, warnings: result.warnings });
    globalThis.BattlePlayback.load(result);
    globalThis.BattlePlayback.start();
    setReplayStatus("Playing the raid above. Use Pause or drag the timeline to inspect a moment.");
  } catch (error) {
    if (revision === replayRevision) setReplayStatus(
      error instanceof TypeError && /fetch/i.test(error.message)
        ? "Could not load replay data. Run npm start and open http://localhost:8000."
        : error.message, true);
  } finally {
    loadPlaybackButton.disabled = false;
    loadPlaybackButton.textContent = "Load battle replay";
  }
}

replayTextInput.addEventListener("input", invalidateReplay);
loadPlaybackButton.addEventListener("click", loadPlayback);

replayFileInput.addEventListener("change", async () => {
  const [file] = replayFileInput.files;
  if (!file) return;
  if (file.size > 1_500_000) {
    setReplayStatus("Replay files must be smaller than 1.5 MB.", true);
    replayFileInput.value = "";
    return;
  }
  try {
    invalidateReplay();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" :
      bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    replayTextInput.value = new TextDecoder(encoding).decode(bytes);
    setReplayStatus(`Loaded ${file.name}. Select Load battle replay to watch it.`);
    replayPreview.hidden = true;
  } catch {
    setReplayStatus("The selected file could not be read as text.", true);
  }
});

insertReplayExampleButton.addEventListener("click", async () => {
  invalidateReplay();
  replayTextInput.value = replayExample;
  replayPreview.hidden = true;
  await loadPlayback();
});

validateReplayButton.addEventListener("click", validateReplay);

viewTabs.forEach(tab => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

openGeneratedReplayButton.addEventListener("click", async () => {
  if (!generatedReplayText) return;
  invalidateReplay();
  replayTextInput.value = generatedReplayText;
  showView("replay-view");
  await loadPlayback();
});

downloadGeneratedReplayButton.addEventListener("click", () => {
  if (!generatedReplayText) return;
  const blob = new Blob([generatedReplayText + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = generatedReplayFilename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

globalThis.ReplayUI = {
  showView,
  setGeneratedReplay(text, { boss = "raid", seed = "" } = {}) {
    generatedReplayText = text || "";
    const safeBoss = String(boss).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-");
    generatedReplayFilename = `${safeBoss || "raid"}-${seed || "replay"}.txt`;
    openGeneratedReplayButton.disabled = !generatedReplayText;
    downloadGeneratedReplayButton.disabled = !generatedReplayText;
  },
};

setReplayStatus(globalThis.BattlePlayback
  ? "Open a replay file or select Play example to watch a raid."
  : "The replay player did not load. Restart the updated server and refresh with Ctrl+F5.",
  !globalThis.BattlePlayback);
