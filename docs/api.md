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

`runMatch` is the same diagnostic as `resumectl match`. It does not claim an ATS score. See [match](match.md).

```ts
import { runMatch, formatMatchReport } from "resumectl";

const report = await runMatch({
  texPath: "resume.tex",
  jd: "jd/acme-role/jd.requirements.yaml",
  profilePath: "facts.yaml",
  decider: "none",
});
console.log(formatMatchReport(report));
```

Pass `decide` only to substitute the decider in tests. `decider: "openai"` (the default) calls `POST /v1/decisions` with model `gpt-6-luna` and reads `OPENAI_API_KEY`. `decider: "jev"` calls TypeSafe `POST /v1/systemone` with pinned model `jev-1.14.0` and reads `TYPESAFE_API_KEY`.

The package root (`src/index.ts`) is the public API. Internal files are grouped by domain and are not stable deep-import paths. Existing root exports remain supported; project setup also exposes `initProject`, `initConfig` and `doctor`.
