# Great Goose Pokémon GO — TypeScript

Great Goose is a single static website with independently developed applications:

- `/` — home page
- `/raids/` — raid simulator, replay player and manual battles
- `/counters/` — simulation-backed rankings against a specific raid boss
- `/rankings/` — Level 40 general attacker rankings by attack type

Simulations run entirely in the visitor's browser, with long calculations in a
Web Worker. The deployed site does not run Python, use Pyodide, or call a
simulation backend.

## Run the included website

With Node.js installed, open PowerShell in the extracted project folder and run:

```powershell
npm start
```

Open **http://localhost:8000** for the home page,
**http://localhost:8000/raids/** for the simulator, or
**http://localhost:8000/counters/** for raid counters. The ZIP includes the compiled
`dist/` folder, so running the included build requires neither Python nor an npm
dependency install. Keep the terminal open and press Ctrl+C to stop.

Opening an HTML file directly from disk will not work because browsers require
an HTTP origin for module workers and the static catalog.

## Repository architecture

| Source | Responsibility |
| --- | --- |
| `apps/home/` | Great Goose landing page built at `/` |
| `apps/raids/` | Raid UI, replay controls, manual battle controls and share links built at `/raids/` |
| `apps/counters/` | Specific-boss counter UI and worker client built at `/counters/` |
| `apps/rankings/` | Rankings UI and worker client built at `/rankings/` |
| `packages/raid-engine/src/rankings.ts` | Deterministic Level 40 ideal, simple-cycle and effective DPS calculations |
| `packages/raid-engine/src/raid_counters.ts` | Specific-boss counter prefilter and full event-driven raid simulations |
| `simulator/ranking_categories.json` | Version-pinned broad Legendary/Mythical/Ultra Beast classification |
| `simulator/shadow_availability.json` | Version-pinned snapshot of forms released as Shadows, mapped to the local catalog |
| `packages/raid-engine/src/super_mega_raid_simulator.ts` | Raid configuration, damage, strategies, event queue and aggregate results |
| `packages/raid-engine/src/battle_replay.ts` | Compact and legacy replay parsing, validation and tick normalization |
| `packages/raid-engine/src/battle_playback.ts` | Seed verification and reconstruction of replay frames and messages |
| `packages/raid-engine/src/turn_battle.ts` | Manual half-second turns, action availability and recording |
| `packages/raid-engine/src/website_api.ts` | Catalog and validated form-input boundary |
| `packages/raid-engine/src/worker.ts`, `apps/raids/client.js` | Browser job transport and static catalog loading |
| `simulator/` | Python reference implementation, auxiliary tools and shared catalog |

The top-level build is the only process allowed to clear `dist/`. It copies the
four application surfaces into their matching routes and gives all three calculation apps a
matching versioned worker directory. This prevents one application build from
overwriting or mixing versions with another.

## Rankings v1

Rankings are calculated locally for Level 40 Pokémon with fixed 15/15/15 IVs.
For each attack type, the engine evaluates every legal fast move paired with a
charged move of that type, then displays the best moveset per form. Exact rounded
move damage is calculated against synthetic boss Defense values 160, 180, 200,
220 and 240, then averaged. **Simple DPS** has no incoming damage.

**Ideal DPS** averages 32 deterministic pulse schedules with 3–4 second
intervals, varied phase and varied pulse size. The Boss Attack control selects a
smoothed coefficient of 675, 900 or 1125. Boss Move Type can keep that damage
typeless or apply any of the 18 Pokémon GO types against the attacker's defensive
typing. After each charged move, the attacker
continues only if 32 fixed continuation samples give its next charged move at
least a 10% chance to land; otherwise the model switches it out. Movesets below
the same 10% cutoff for their first charged attack are omitted. **Effective DPS**
uses the resulting expected damage and field time, adding five one-second
transitions and a ten-second relobby to a six-attacker cycle.

The chosen attack type is super effective; other fast-move types are neutral.
Released Shadow variants use their normal form's movepool with the standard
outgoing/incoming modifiers. Released Super Max–eligible Megas receive their
additional charged move at all four Mega Levels. Its power scales by
×1.0/×1.1/×1.2/×1.3; Mega Level 4 also applies the temporary two-level combat
boost to those eligible forms. The selected Mega Level is stored in the URL.

## Raid Counters

The dedicated **Raid Counters** application accepts a boss form and raid
difficulty. It first
uses a deterministic DPS/bulk estimate to retain the strongest moveset
candidates, then runs every retained candidate through the full raid engine
against up to 12 evenly sampled ordinary boss fast/charged combinations three
times. Bosses with 12 or fewer combinations use all of them. The displayed
Battle DPS, damage share and faints come only from those battles.

Each benchmark uses one trainer and six identical 15/15/15 attackers. The user
can choose Level 20 through 50 in five-level increments; weather; friendship; five dodge policies; and
the no-swap or three hot-swap strategies. Downtime-saver dodging is deliberately
excluded. Catch tanks are not meaningful for identical-attacker teams and are
also unavailable. The legacy filter removes moves marked Elite or legacy while
retaining currently available signature and special-form moves. Party Power,
Adventure Effects, and Purified Gems remain off. Six-copy Mega teams are a
standardized ranking abstraction, not a legal party recommendation.

Selecting a Shadow raid tier automatically makes the boss Shadow: its Attack is
multiplied by 1.2 and its effective Defense by 5/6 both before and during enrage. The same
selection also enables the tier's Shadow CPM, enrage thresholds, and enrage
bonuses; no separate Shadow-boss switch is required.

## Edit and rebuild

### Boss movesets and counter breakdowns

The Counters page has independent boss fast/charged selectors. Leaving a
selector on All averages its matching ordinary moves, using the same bounded
12-combination sample for large movepools. Boss difficulty appears just above
the counter cards after generating: hardest first by mean battle DPS against
the fixed displayed lineup, with the easiest tested moveset indexed to 100.
It changes with the lineup/settings and is not an absolute boss rating.

Click a counter name, card, or Performance details to run 32 diagnostic trials
per tested moveset, cached for the current page session. The player-facing panel
focuses on time on the field, average active DPS, charged moves landed, typical
boss hits survived, and the full-HP limit against either boss attack alone.
Movesets are sorted hardest first for the selected counter, using its simulated
battle DPS; the lowest DPS matchup appears first.

Peak DPS models the useful burst created by damage energy. It starts at
zero energy immediately before an undodged boss charged hit. The attacker keeps
using fast moves while the boss chains that charged move back-to-back, and the
metric divides all attacker damage through its first charged move by the elapsed
time. A scenario is unavailable if the attacker faints before that move lands.
The normal phase is used for the summary on raids that can enrage, with the
enraged result shown separately. Hidden Power hit limits preserve the possible
type range rather than averaging damage first.

All diagnostics run on demand in the existing worker; no server or deployment
changes are required. General rankings and the battle simulator are unchanged.

```powershell
npm ci
npm run build
npm test
npm start
```

Edit engine TypeScript in `packages/raid-engine/src/` and application files in
`apps/`. `build/` and `dist/` are generated. Deploy the **complete contents of
`dist/`**, never just one app or engine directory.

## Share links

The raid calculator supports two client-side share actions:

- **Copy setup link** creates a versioned `?v=1&setup=...` URL that fills the
  complete boss, player teams and battle settings without running.
- **Copy result link** is enabled after a simulation. It also pins the returned
  random seed and adds `run=1`, causing the recipient's browser to reproduce the
  calculation automatically.

The setup uses bounded, UTF-8-safe base64url data and is validated through the
same Pokémon, move and option boundaries as manually entered data. Nothing is
uploaded to a server. Large 20-player configurations can produce long URLs, so
the interface warns when messaging applications may shorten them.

## Engine use

The engine is independent of the DOM, Web Workers, storage and networking. Its
compiled modules remain available in `build/` after `npm run build`:

```typescript
import { createRaidEngine } from './build/super_mega_raid_simulator.js';
import type { CalculatorEntry, RaidConfig } from './build/types.js';

const config: RaidConfig = {
  trials: 1,
  random_seed: '42',
  raid_difficulty: 'Tier 5',
  boss_form_id: 'KYOGRE',
  boss_fast_move_names: ['Waterfall'],
  boss_charged_move_names: ['Hydro Pump'],
  player_teams: [[['GROUDON_PRIMAL', 'Mud Shot', 'Precipice Blades', 50]]],
  friendship_multipliers: [1],
  zacian_adventure_effect: [false],
  catch_tank_team_indices: [[]],
  party_power_groups: [],
  dodge_strategy: 'lethal_only',
  player_strategy: 'no_strategy',
};

const engine = createRaidEngine(config, catalog as CalculatorEntry[]);
const battle = engine.createSimulation({ detailed: true });
const result = battle.run();
```

The engine supports multiple players, Party Power, Shadow raids, automatic
Purified Gems and all existing dodge/swap strategies. The calculator can
configure up to 20 players with six Pokémon each. Turn-by-turn mode intentionally
uses Player 1 only.

Each Pokémon row has an inline Great Goose Pokémon code field. **Import** applies
the pasted code to that slot; **Export to clipboard** fills the field and copies
it without opening a dialog.

## Seeds, recordings and verification

Seeds use the original 0–9223372036854775807 range without JavaScript rounding.
Fresh simulations get fresh seeds; a result share link pins the actual returned
seed. Manual battles are stored in this browser's IndexedDB after each accepted
turn and can be restored or exported as replay text.

```powershell
npm test
npm run typecheck
npm run test:parity
```

The Node tests exercise the actual compiled worker, controls, share codec,
validation, deterministic battles, replays and saved manual battles. The optional
parity command also needs Python and compares the TypeScript engine against the
reference modules in `simulator/`.

See `PORT_NOTES.md` for behavioral boundaries and `README_PYTHON_REFERENCE.md`
for the retained Python instructions.

### Per-player raid settings

New raids start with an empty boss and one empty Pokémon slot. Choose each
Pokémon from the search results; its legal moves then become available.
Each player chooses their highest friendship bonus with another raid participant,
one Adventure Effect, and an optional Party Power group. Forever Friends gives
+12%. The raid-wide seasonal switch doubles only the friendship bonus (for example,
Best Friends +10% becomes +20%); it is off by default.

Assign 2–4 players to the same numbered party to enable automatic Party Power.
Separate parties are supported. The existing engine charges each member's meter
from their own fast attacks and doubles powered charged attacks. The turn-by-turn
mode uses only player 1 and disables Party Power because it is a solo encounter.
Setup/result links retain individual settings, and older links with global
friendship and Adventure Effects still load. Cloning player 1 copies their settings.

### Attack type and Anti type rankings

The general rankings switch selects either charged-attack type rankings or
rankings against a pure defending type. Anti type evaluates all legal movesets,
applying the type chart to both attacks before damage rounding. It retains the
same synthetic Defense ensemble and incoming-damage model; Boss Move Type remains
an independent setting. Hidden Power uses its best legal type for the matchup,
shown beside its name. Each form/Shadow variant retains one best moveset under
the existing Ideal DPS selection rule. The mode is preserved in the page URL and
cached separately. The type buttons occupy one horizontally scrollable row.
