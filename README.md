# ResumeMode

**Give your coding agent a resume mode.**

ResumeMode combines résumé writing guidance, two LaTeX styles, and PDF quality checks. Provide a job description and career evidence; use the [resume-methodology skill](skills/resume-methodology/SKILL.md) to select and write content, then build and revise against actual rendered results.

The repository includes the reusable skill and Bun CLI. There is no automatic installer for agent-specific skill directories; copy `skills/resume-methodology/` into the skill directory used by your agent, or ask the agent to read its `SKILL.md` directly.

| Serif — `\documentclass{resume}` | Sans — `\documentclass[style=sans]{resume}` |
|---|---|
| ![Serif example](docs/serif.png) | ![Sans example](docs/sans.png) |

The people, schools, companies and links in the examples are fictional.

## Start a résumé

Requirements: **Bun ≥ 1.3** and **XeLaTeX** with the required packages. See [toolchain setup](docs/setup.md).

From this repository:

```bash
bun install
bun run resume doctor
bun run resume init ./my-resume --style sans
# Replace placeholders in my-resume/resume.tex with your verified career facts.
bun run resume config show ./my-resume/resume.tex --json
bun run resume build ./my-resume/resume.tex
```

The PDF and matching measurement manifest go to `my-resume/output/`. Keep both files together to run `check` later. `init` refuses to overwrite existing source or configuration. Its placeholder content is a starting template, not a finished résumé.

To use the package in another project:

```bash
bun add github:nickhuo/latex-resume-kit
bunx resume-mode doctor
bunx resume-mode init ./my-resume --style sans
bunx resume-mode build ./my-resume/resume.tex
```

To use LaTeX alone, copy `template/resume.cls`, `template/resume-measure.tex` and `template/fonts/` next to your source, then run `xelatex resume.tex`. The CLI adds measurement manifests and quality gates to compilation.

## Essential CLI commands

One executable, organized around the résumé workflow:

| Command | Purpose |
|---|---|
| `resume-mode init [directory]` | Create `resume.tex` and `resume.config.yaml`; supports `--style`, `--paper`, `--json` |
| `resume-mode doctor [--json]` | Check Bun, XeLaTeX, TeX packages, fonts and template files |
| `resume-mode config init` | Add configuration to an existing source project |
| `resume-mode config show [resume.tex] --json` | Inspect effective settings, editing policy and where each value came from |
| `resume-mode build <resume.tex> [--json]` | Compile, measure, and run every quality gate |
| `resume-mode check <resume.tex> [--json]` | Recheck an existing PDF and its matching measurement manifest |

In the repository, replace `resume-mode` with `bun run resume`; after package installation, use `bunx resume-mode`. `--help` lists all flags. Exit codes: **0** success, **1** compile/quality/dependency failure, **2** invalid input.

The three gates check rendered entry lengths and overflow, page count, and private-use Unicode mappings in the PDF. The default budget is one page, up to two lines per entry, and at least 80% fill on the final line. Per-section policies can override length limits and tell an agent which content it may edit. These checks support readable output; they do not certify every ATS parser or verify career claims.

## Domain-first organization

ResumeMode is one résumé-authoring context with four capability modules. Code lives with the capability it serves; the CLI composes them.

```text
src/
  content/       TeX source, included files, sections and visible text
  project/       configuration, project initialization, environment diagnostics
  rendering/     XeLaTeX compilation, measurements, font assets and metrics
  quality/       rendered quality gates and PDF inspection
  cli/           argument parsing and command orchestration
  cli.ts         executable entry point
  index.ts       public library API
skills/
  resume-methodology/  target analysis, writing and revision workflow
```

Tests mirror the domains in `test/`. `template/` holds distributable LaTeX/font assets, `examples/` holds fictional samples, and `scripts/` holds maintenance commands. Stable package exports and template paths are preserved.

| Reference | Scope |
|---|---|
| [Glossary](GLOSSARY.md) | Shared vocabulary: entry, section, render manifest, quality gate |
| [Domain organization ADR](docs/adr/0001-domain-first-organization.md) | Boundaries, dependency direction and CLI decisions |
| [Configuration](docs/configuration.md) | YAML, precedence, section editing policies and layout settings |
| [Rendering](docs/rendering.md) | Typography, class options and LaTeX commands |
| [Quality](docs/quality.md) | Measurement semantics, stale-output detection and checker flags |
| [Library API](docs/api.md) | Use the build and check functions from TypeScript |
| [Writing skill](skills/resume-methodology/SKILL.md) | Evidence-based writing, tailoring, scoring and render/revise loop |

## Development

```bash
bun install
bun run verify       # typecheck + unit/integration tests; requires XeLaTeX
bun run example      # rebuild both example PDFs through all quality gates
bun run gen-metrics  # regenerate legacy width estimates after a font change
```

`bun test` and `bun run typecheck` can also run independently. The quality gates use actual TeX measurements; legacy width estimates are retained only for API compatibility.

## License

The code and class are licensed under [MIT](LICENSE).

Inter is © The Inter Project Authors and licensed under the [SIL Open Font License 1.1](template/fonts/OFL-Inter.txt). TeX Gyre Termes comes with TeX Live under the GUST Font License and is not redistributed here. The writing skill records its methodology sources in its own file.
