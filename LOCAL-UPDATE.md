# Boss movesets & counter breakdowns — local preview

This is a complete clean project snapshot with a prebuilt website. It does not
change your existing Windows project, Git history, or the live website.

1. Extract this ZIP into a NEW folder beside your existing project. Do not
   extract over the project that currently contains merge-conflict markers.
2. Stop any old local server with Ctrl+C if it is already using port 8000.
3. Open PowerShell in the extracted `greatgoose-boss-movesets-v4` folder (the
   folder containing `package.json`) and run `npm start`.
4. Open http://localhost:8000/counters/ in your browser.

No dependency installation is needed just to serve the included prebuilt site.
To edit and rebuild, run `npm ci`, then `npm test`. If a command fails, stop;
do not run any push command. This archive intentionally contains no Git
repository metadata; keep your existing project and history until you decide
to integrate this version. Nothing has been pushed or deployed by this update.

## What's new

- Boss fast and charged move selectors, directly below the boss controls.
  Both All options give an equally weighted average over tested movesets.
- Expandable boss moveset difficulty comparison above the top 30 results.
- Click a counter's name/card or Matchup breakdown for on-demand diagnostic
  trials, completed charged cycles, cycle frequencies, and incoming hit limits.
- Damage per complete team outing and first outing, with partial runs identified.
- A separate, explicitly approximate binomial survival calculation. Actual
  cycle results still come from the full event-driven simulation.

The README and in-page methodology describe sampling, conditions, averaging,
enrage, Hidden Power, and why binomial survival is an approximation.
