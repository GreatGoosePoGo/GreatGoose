# Run the TypeScript website

Open PowerShell in the extracted project folder:

```powershell
npm start
```

Then open **http://localhost:8000**. Node.js is required for this local static
server. Python and `npm install` are unnecessary for the included compiled build.

After editing files in `src/` or `web/`, run:

```powershell
npm ci
npm run build
npm start
```

The future hosted website only needs the contents of `dist/`. Calculations run
in the browser, in a Web Worker.

See [README.md](README.md) for the four-module map, engine examples, saved battle
behavior, and verification commands. The former Python launch notes are in
[README_PYTHON_REFERENCE.md](README_PYTHON_REFERENCE.md).
