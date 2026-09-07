# Pokémon GO Raid Simulator — local website

Checkpoint: 2026-09-07 — scroll-free replay arena and corrected Psychic/Fairy
icons (27). This build includes
Armored Mewtwo as `MEWTWO_ARMORED`; typing either spelling finds it.

Keep these items together:

- `local_server.py`
- the `web` folder
- the `simulator` folder containing:
  - `super_mega_raid_simulator.py`
  - `calculator_data.json`

From this folder, run:

```powershell
python local_server.py
```

Then open:

```text
http://localhost:8000
```

Repeated runs use a new random seed by default. Enter a previous result's seed
to reproduce that exact battle. The battle log can be hidden, reduced to move
starts, or expanded to every simulator event.

The Raid simulator can run 1–100 games per moveset. Choose either the selected
boss moveset or every legal ordinary fast/charged combination. One request is
capped at 500 total battles; the page shows the multiplication and the allowed
games-per-moveset maximum before starting. Batch results report each moveset's
win rate, average win time, and remaining boss HP on losses. The Python engine
offers the same aggregate data through `--json-summary`.

When a raid boss uses Hidden Power, every attempt rolls one of the 16 legal
types (all types except Normal and Fairy). That type remains fixed throughout
the attempt. A new trial rerolls it; an explicit seed reproduces it. Single
results show the rolled type, and batch results show the type counts.

The battle settings include lethal-only and non-resisted dodging, plus the full
player-strategy set: no voluntary swapping, greedy/cautious/very cautious hot
swapping, and designated catch tanks. Hot swapping now recognizes an announced
boss charged move that would stop an attacker from reaching its next charged
move, preserves that attacker's HP and energy off field, and returns to it when
the stored energy can be spent. Catch-tank swaps are timed as late as possible
from the energy expected from the incoming hit and any extra fast moves needed.
Each team member can also be marked Shadow, applying the Pokémon GO 1.2×
damage-dealt and 1.2× damage-taken modifiers.
Typing a name such as `Shadow Mamoswine` in a team search automatically selects
Mamoswine and enables its Shadow setting; the checkbox can still be changed
directly.
Armored Mewtwo is a separate form with its own stats and move pool. Both the
official `Armored` spelling and the `Armoured` spelling work in search.

Player move selectors include ordinary, Elite/legacy, and special exclusive
moves. Raid-boss move selectors remain limited to ordinary non-exclusive moves.
Eligible Mega Pokémon also list their additional + move. Selecting Mega Level
1 through 4 changes both its exact tuned power and its displayed name from +
through ++++. The battle settings also expose Zacian's 1.1× Adventure Effect,
Behemoth Bash's 1.1× effective-defense bonus, and Dynamic Punch+'s 1.15×
attack bonus. Dynamic Punch+ applies only when the selected boss is an actual
Mega form in Tier 4, Mega, Mega Legendary, or Super Mega mode; Primal Groudon
and Primal Kyogre are excluded.

## Python engine: Mega Levels and + moves

The engine accepts Mega Level as the ninth value in a team member setup:

```python
[
    "MEWTWO_MEGA_X", "Psycho Cut", "Dynamic Punch+", 50,
    15, 15, 15, False, 4,
]
```

The final value must be an integer from 1 through 4. Older four-, seven-, and
eight-value setups remain valid and default to Mega Level 1. The engine stores
one move ID, such as `Dynamic Punch+`, but uses an explicit four-integer power
table and prints `Dynamic Punch+` through `Dynamic Punch++++` in battle logs.
Each + move is restricted to its corresponding Mega form.

## Single-Pokémon codes

Each team slot has Import and Export buttons. A code stores the exact Pokémon
form, level, Attack/Defense/HP IVs, fast move, charged move, Mega Level,
catch-tank setting, and Shadow setting.

Version 2 codes use:

`GGP2|FORM_ID|LEVEL_X2|IV_HEX|FAST_MOVE_ID|CHARGED_MOVE_ID|FLAGS`

Version 1 codes remain importable and default to Mega Level 1.

Form and move IDs are used instead of list positions so saved codes do not
change when the catalog is reordered.

## Battle replay text

The website has separate **Raid simulator** and **Battle replay** views. Every
completed simulation generates a replay file. Use **Open generated replay** to
load it in the replay player, or **Download replay .txt** to save it.
Running a detailed trial directly in Python also prints the replay between
`Battle replay:` and `End battle replay` markers.

You can load either the compact replay or a complete saved detailed trial.
The website accepts UTF-8 and Windows UTF-16 text files. For the default Kyogre
configuration, create an output file in PowerShell with:

```powershell
python .\simulator\super_mega_raid_simulator.py --detail "Waterfall" "Hydro Pump" > battle-replay.txt
```

Replace those move names if you configured a different boss. If loading fails,
the status next to the button reports the error. After updating the project,
stop the old server with Ctrl+C, run `python local_server.py` from the new folder,
and refresh `http://localhost:8000` with Ctrl+F5. The replay scripts now have
versioned URLs to prevent the old script from leaving the new button inactive.

In the replay view, paste text or open a plain `.txt` file, then select
**Load battle replay** to start playback, or **Play example** to try it immediately.
The viewer shows the boss and each player's
active Pokémon as question-mark circles, with HP and energy bars. HP above 50%
is green; 25% through 50% is yellow; below 25% is red. The remaining timer and
elapsed time show half-seconds. Super-effective and resisted hits display a
single-line message above the target that fades over two battle seconds. Players
in a Party Power group also show their completed-fast-move progress, such as
`7/18`, changing to `Party Power ready!` when charged.

Pause, restart, step forward by 0.5s, choose 0.5×–8× speed, or drag the seek slider
forwards and backwards. The team's smaller question-mark circles show which
slot is active; hover to see each member's stored HP and energy. Playback pauses
when leaving the replay section or hiding the browser tab.

**Validate text** also remains available for drafts without complete Pokémon
definitions. For playback, declare every move code and give each team member's
species, fast move, charged move and level. IVs default to 15/15/15. Separate
readable team members with semicolons, or use the Python lists printed by the
simulator (which also preserve Shadow and Mega Level).

Python performs the damage and energy calculations with the existing engine,
including friendship per player, weather, Shadow, Mega boosts and Party Power.
Generated replays are checked against their complete recorded action stream and
result to recover the exact original order of simultaneous engine events. If
that check does not match, the recorded timeline is reconstructed directly;
completed hits resolve before new actions on the same tick. A differing Result
preamble produces a warning instead of overwriting the calculated HP. An attack
without enough energy, an overlap, or a move from the lobby reports its line.
Missing attacks and random boss choices are never filled into a hand-written
timeline. Playback uses the current engine/data rules, including its existing
limitations when comparing with real raid footage.

The reconstruction is also callable directly from Python:

```powershell
python simulator/battle_playback.py battle.txt --output playback.json
```

Timestamps are written as readable seconds and are converted internally to
integer game ticks, where one tick is `0.5s`. Only whole- and half-second times
are valid.

In battle playback, Party Power always shows its refill progress. Once Party
Power has been activated, `Next charged damage ×2` appears beside the meter
while that meter continues filling for the following activation.

```text
Raid: Tier 4
Boss: STARMIE_MEGA; fast=Water Gun; charged=Hydro Pump
Teams:
p1: Necrozma Dawn Wings / Shadow Claw / Moongeist Beam / L50 / 15-15-15
p2: Necrozma Dawn Wings / Shadow Claw / Moongeist Beam / L50 / 15-15-15

Friendship: p1=1.10; p2=1.10
Zacian effects: p1=false; p2=false
Behemoth Bash effects: p1=false; p2=false
Dynamic Punch+ effects: p1=false; p2=false
Weather: none
Dodge: downtime_saver
Swap: hot_swap_greedy
Catch tanks: p1=-; p2=-
Party Power: normal; groups=p1,2
Move codes: sc=Shadow Claw

Events:
t0p1,2:sc
+0b:f
+0.5p1,2:sc
+0.5p1,2:sc
+1p1:q
+3.5p1:r
```

Event grammar:

- `t9p1:db` — at 9 seconds, player 1 starts move code `db`.
- `+1.5p1,2:db` — 1.5 seconds after the previous event, players 1 and 2
  start the same move.
- `+0p3:s2` — at the same time, player 3 switches to team slot 2.
- `+0b:f` / `+0b:c` — the boss starts its configured fast/charged move.
- `+0p1:d` — player 1 dodges the announced charged move.
- `t30p1:q` — player 1 voluntarily quits to the lobby.
- `+4p1:r` — player 1 rejoins with the same preamble team.

The colon is required between the player selector and action. `r2` is rejected:
party presets have not been defined. A faint without an explicit switch selects
the next living team member in order. A team wipe implies a lobby exit, but a
rejoin always needs an explicit `r` event. Rejoining restores the preamble team;
switching retains each member's HP and energy. No special extension is required;
use `.txt`.

## Turn-by-turn battles

1. Configure your boss, team, weather and bonuses in **Raid simulator**.
2. Open **Turn-by-turn** and click **Start new battle**. The battle takes a copy
   of those settings; editing the form afterward does not alter the active raid.
3. Click the button for a fast move, charged move, dodge, a specific switch,
   lobby exit, rejoin, or **Advance time (+0.5s)**. Every button resolves one
   0.5-second turn, so there is no separate selector or confirmation click.
   Advance time continues a longer animation or deliberately does nothing.
   There are no automatic player attacks or strategies.
4. Click **Export recording (.txt)** at any time, or **End battle** to stop early.

The boss follows the canonical engine's random AI. Move durations, damage,
energy, Shadow and Mega Level bonuses use that same Python engine. Hits on a
tick resolve before new actions on that tick. While a fast move, charged move,
dodge, or switch animation is active, every action except quitting is locked;
use **Advance time** until the animation ends. A dodge selects the pending
boss hit using the engine's dodge model and adds one second of recovery; it is
not a separate real-game dodge-window model.

After fainting, choose a living slot. A team wipe puts you in the lobby. The
engine's 7–8 second relobby delay must elapse before you can press Rejoin;
waiting longer is your choice. Rejoining heals the same configured team and
resets energy. Voluntary switching preserves benched HP and energy.

The interface is text-only with HP/energy meters and a Hide meter numbers button.
The complete event log still retains damage and energy information for analysis.

Every accepted turn atomically updates a UTF-8 file in `recordings/` beside
`local_server.py`. Export downloads that same saved text. It contains the compact
replay actions plus a full event log in comments. `Recording: manual; through=...`
marks the exact endpoint, so replaying a partial battle never resolves future
hits. Unlike ordinary hand-written timelines, manual recordings leave a fainted
player off field until an explicit switch or rejoin. Load exports in **Battle
replay** to animate them, including unfinished battles.

Battles stay paused unless you advance a turn. Switching tabs does not advance
them. Reloading the page or restarting the server ends interactive control, but
saved recordings remain available in `recordings/`. Up to 32 recent sessions are
kept in memory; inactive sessions are cleaned up when starting another battle
after two hours. Export before starting over if you want a separate downloaded
copy; older recording files are never deleted automatically.

The incremental Python API is `ManualSimulation.advance(action, slot=None)` in
`simulator/turn_battle.py`; it returns state plus replay text. As with the main
engine, load it in a process with `RAID_SIM_CONFIG_PATH` configured first, using
one player, `dodge_strategy: none` and `player_strategy: no_strategy`.

Press `Ctrl+C` in PowerShell to stop the server.
