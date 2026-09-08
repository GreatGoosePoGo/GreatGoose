# Run the TypeScript website

Open PowerShell in the extracted project folder:

```powershell
npm start
```

Then open **http://localhost:8000** for the home page or
**http://localhost:8000/raids/** for the simulator. Node.js is required for this
local static server. Python and `npm install` are unnecessary for the included
compiled build.

After editing files in `packages/raid-engine/src/` or `apps/`, run:

```powershell
npm ci
npm run build
npm start
```

The hosted website needs the complete contents of `dist/`. The root, `/raids/`,
and `/rankings/` are built together without allowing one app to clear another's
output. Calculations run in the browser, in a Web Worker.

See [README.md](README.md) for the four-module map, engine examples, saved battle
behavior, and verification commands. The former Python launch notes are in
[README_PYTHON_REFERENCE.md](README_PYTHON_REFERENCE.md).
