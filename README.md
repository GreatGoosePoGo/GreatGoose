# Pokémon GO Raid Simulator — TypeScript

The website now runs simulations, replay parsing, battle playback and manual
turns in the browser. It does not run Python, use Pyodide, or send calculation
requests to a backend. Long calculations run in a Web Worker.

## Run the included website

With Node.js installed, open PowerShell in the extracted project folder and run:

```powershell
npm start
```

Open **http://localhost:8000**. The ZIP includes the compiled `dist/` folder, so
this needs neither Python nor an npm dependency install. Keep the terminal open;
press Ctrl+C to stop. Opening `index.html` directly from disk will not work,
because browsers require an HTTP origin for module workers and the data file.

For eventual deployment, upload the **complete contents of `dist/`** to a static
web host. Do not copy only the new engine directory: `npm run build` gives the
page and the whole worker module graph one matching content version. No Node or
Python process runs on the host. Paths are relative, so a subdirectory is
supported. Serve `.js` files as JavaScript and `.json` files as JSON.

## Edit and rebuild

```powershell
npm ci
npm run build
npm start
```

`npm ci` installs the pinned TypeScript compiler. Node is a development tool and
local static file server; the deployed calculations use the visitor's browser.

| Source | Responsibility |
| --- | --- |
| `src/super_mega_raid_simulator.ts` | Raid configuration, data registration, damage, strategies, event queue and aggregate results |
| `src/battle_replay.ts` | Compact and legacy replay text parsing, validation and tick normalization |
| `src/battle_playback.ts` | Seed verification and reconstruction of replay frames and messages |
| `src/turn_battle.ts` | Manual half-second turns, action availability and recording |
| `src/website_api.ts` | Catalog and form-input boundary for the existing website |
| `src/worker.ts`, `web/client.js` | Browser job transport; the worker loads the static catalog once |
| `src/turn_service.ts`, `src/recording_store.ts` | Independent turn sessions and browser autosave/restore |
| `src/random.ts` | Python-compatible seeded random generator |
| `src/compatibility.ts`, `src/text.ts` | Explicit cross-language numeric/collection semantics and safe text handling |
| `src/types.ts` | Public configuration and catalog types |
| `simulator/calculator_data.json` | Unmodified supplied species/move data; copied beside the versioned worker |
| `web/` | Existing interface, styles, replay display and controls |

Edit TypeScript in `src/`, then rebuild. `build/` and the content-addressed
`dist/engine-<version>/` directory are generated JavaScript. `dist/build-info.json`
records the matching engine directory. The four modules retain their original
function names to help trace a rule back to the Python reference. Small
compatibility helpers operate on native JavaScript values; no Python interpreter
or transpiler is needed to build or run.

## Engine use

The engine is independent of the DOM, Web Workers, storage and networking. Pass
in the data and a configuration; every engine gets its own configuration and
catalogs, and every simulation gets independent mutable battle state.

```typescript
import { createRaidEngine } from './src/super_mega_raid_simulator.js';
import type { CalculatorEntry, RaidConfig } from './src/types.js';

const catalog: CalculatorEntry[] = await fetch('calculator_data.json').then(r => r.json());
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
const engine = createRaidEngine(config, catalog);
const battle = engine.createSimulation({ detailed: true });
const result = battle.run();
const replay = engine.render_battle_replay(battle, result, engine.RANDOM_SEED);
```

The `.js` import extension is intentional for TypeScript's NodeNext output. In a
built browser module use the corresponding `engine/` path. Direct Node consumers
can import from `build/` and load the same JSON with Node's file API.

The engine supports multiple players and Party Power through `player_teams` and
`party_power_groups`. The current setup form still configures one player, as in
the supplied website. Replay files can describe multiple players.

## Seeds and recordings

Seeded attempts use CPython-compatible MT19937, including integer seeding,
`random()` and the rejection-sampling used by `choice()`. Use decimal strings for
seeds above JavaScript's safe integer range. The website accepts the original
0–9223372036854775807 range without rounding. Fresh simulations get fresh seeds;
batches retain the Python sequence of random draws within each moveset.

Manual battles are saved after every accepted turn in this browser's IndexedDB.
Use **Saved battles → Restore battle** to resume or export an earlier battle,
including after a refresh. Exporting downloads the familiar `.txt` replay. Saves
are tied to the website origin and browser profile; clearing site data removes
them, so export recordings you want to keep or transfer. Failed saves retain the
previous accepted turn. Conflicting edits from another tab require a restore.

## Verification

```powershell
npm test
npm run typecheck
```

These checks need only Node and TypeScript. The build verifies every page asset,
the versioned worker module graph, and the absence of Python or server API paths
from the static output. The tests exercise the real worker, controls, input
validation, seeded runs, replay handling, independent engines, and recording
restore/save failure behavior.

For the optional migration comparison, install Python and run:

```powershell
npm run test:parity
```

This runs the TypeScript engine against the unchanged Python source in
`simulator/`. See `PARITY_RESULTS.json` and `PORT_NOTES.md` for the checked cases.
Python is used only by this optional developer check.

## Reference and scope

The original Python modules, auxiliary tools and `local_server.py` are retained
for comparison. They are not part of the built website. The old Python setup
notes are preserved in `README_PYTHON_REFERENCE.md`; use the commands above for
the new website.

This migration preserves the supplied simulator's rules and assumptions, with
post-port correctness fixes documented in `PORT_NOTES.md`. It does not update game
data or add mechanics that were absent in the original, including Shadow enrage
and Purified Gems. Keep future custom rules separate when they start to diverge
from the vanilla simulator. A later multiplayer service can reuse the portable
TypeScript engine; no multiplayer or account service is added here.
