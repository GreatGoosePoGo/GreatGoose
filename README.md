# Great Goose Pokémon GO — TypeScript

Great Goose is a single static website with independently developed applications:

- `/` — home page
- `/raids/` — raid simulator, replay player and manual battles
- `/rankings/` — rankings application workspace

Simulations run entirely in the visitor's browser, with long calculations in a
Web Worker. The deployed site does not run Python, use Pyodide, or call a
simulation backend.

## Run the included website

With Node.js installed, open PowerShell in the extracted project folder and run:

```powershell
npm start
```

Open **http://localhost:8000** for the home page or
**http://localhost:8000/raids/** for the simulator. The ZIP includes the compiled
`dist/` folder, so running the included build requires neither Python nor an npm
dependency install. Keep the terminal open and press Ctrl+C to stop.

Opening an HTML file directly from disk will not work because browsers require
an HTTP origin for module workers and the static catalog.

## Repository architecture

| Source | Responsibility |
| --- | --- |
| `apps/home/` | Great Goose landing page built at `/` |
| `apps/raids/` | Raid UI, replay controls, manual battle controls and share links built at `/raids/` |
| `apps/rankings/` | Independent rankings application workspace built at `/rankings/` |
| `packages/raid-engine/src/super_mega_raid_simulator.ts` | Raid configuration, damage, strategies, event queue and aggregate results |
| `packages/raid-engine/src/battle_replay.ts` | Compact and legacy replay parsing, validation and tick normalization |
| `packages/raid-engine/src/battle_playback.ts` | Seed verification and reconstruction of replay frames and messages |
| `packages/raid-engine/src/turn_battle.ts` | Manual half-second turns, action availability and recording |
| `packages/raid-engine/src/website_api.ts` | Catalog and validated form-input boundary |
| `packages/raid-engine/src/worker.ts`, `apps/raids/client.js` | Browser job transport and static catalog loading |
| `simulator/` | Python reference implementation, auxiliary tools and shared catalog |

The top-level build is the only process allowed to clear `dist/`. It copies the
three applications into their matching routes and places the complete compiled
worker graph in `dist/raids/engine-<version>/`. This prevents a rankings build
from overwriting the raid application.

## Edit and rebuild

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
