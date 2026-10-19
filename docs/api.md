# Library API

```ts
import { compile, runGates, formatReport, resolveConfig } from "resumectl";

const { config } = await resolveConfig({ texPath: "resume.tex" });
const { pdfPath } = await compile("resume.tex", {
  layout: config.layout, outDir: config.build.outDir,
});
const report = await runGates("resume.tex", pdfPath, {
  ...config.checks, sections: config.sections,
}, config.layout);
console.log(formatReport(report));
```

The package root (`src/index.ts`) is the public API. Internal files are grouped by domain and are not stable deep-import paths. Existing root exports remain supported; project setup also exposes `initProject`, `initConfig` and `doctor`.
