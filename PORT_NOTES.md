# TypeScript migration notes

## What changed

The four website-facing Python modules have native TypeScript counterparts.
`createRaidEngine(config, catalog)` replaces process-wide configuration and
subprocess isolation with per-engine closures. The kernel has no browser,
network, file, or storage dependencies. Each simulation retains its own event
queue, Pokémon state and RNG. Browser adapters use a module worker and IndexedDB;
they are separate from the combat rules.

The manual-turn module is a direct, typed TypeScript implementation rather than
generated compatibility syntax. It keeps the Python event priorities, half-second
ticks, dodge collision behavior, lobby timing and recording format explicit so
future rules work can be reviewed in the browser code itself.

The existing website's catalog, simulation, replay and turn controls now call
`RaidClient.request(...)`. Only the catalog JSON and static assets are fetched.
There are no `/api/` simulation endpoints in the built website. The supplied
calculator data, raid balance, strategies, icons and replay layout were retained.
Each build puts the complete worker module graph and calculator data in a
content-addressed engine directory and versions the page assets, preventing
mixed old/new releases in browser or CDN caches.

The four original Python files remain unchanged as a regression reference.
Auxiliary Python collection, CP/IV and raid-manager tools remain as supplied;
they were outside the four requested website modules.

## Behavioral compatibility

The parity gate compares battle outcomes, complete action ordering and full
text event logs for 84 scenarios. It covers all 30 dodge/swap combinations,
all 12 raid difficulties, eight weather settings, four Hidden Power seed cases,
13 Mega + moves at Mega Levels 1 and 4, and four Mega/Primal ally configurations.

The same gate checks six integer RNG seeds (including negative and very large
seeds), generated playback frames/messages, a 96-game all-moveset batch, six
manual-turn checkpoints and manual recording playback. There are 98 named
checks in `PARITY_RESULTS.json`; individual scenario checks include several
assertions. Replay documents are compared using the same input text. Seed
integers beyond 53 bits cross the JSON test bridge as decimal strings.

The release's Node tests also run the actual compiled worker with a fetch stub
that allows only the static catalog. They check the existing replay and turn
controls, illegal inputs, engine isolation, queued results, recording restoration
and rollback after a failed save. These are programmatic tests, not a visual
browser inspection.

## Intentional boundary changes

- Large replay seed values are JSON-safe decimal strings; small seed values may
  remain numbers. Internally the engine retains the exact seed with `bigint`.
- Replay export uses list literals for team data; the parser continues accepting
  the original Python tuple/list syntax and readable team descriptions. Numeric
  formatting can omit unnecessary `.0` endings without changing battle values.
- Legacy literals are parsed as data with a bounded parser; they are never
  evaluated as JavaScript or Python. Quarter-tick times remain invalid.
- Manual recordings are saved to the browser, with restore and download controls,
  replacing the former server-side `recordings/` directory.
- The web input boundary additionally verifies each attack belongs to the chosen
  Pokémon and rejects non-finite numeric inputs before invoking the engine.
- The detailed Node/Python CLI report is replaced by structured TypeScript return
  values. `aggregate_summary`, replay text and the website's result fields remain
  available. `local_server.py` is retained only as a Python reference/test helper.

## Existing model limits

Parity means agreement with the supplied ZIP, not independent verification of
current Pokémon GO behavior. Shadow raid modes still do not model Shadow enrage
or Purified Gems. The bundled data, Adventure Effect assumptions, timings and
strategy heuristics are intentionally preserved. Future rules updates belong in
the engine/data, with matching regression cases.
