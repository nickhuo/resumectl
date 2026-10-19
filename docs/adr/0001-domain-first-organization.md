# 0001 — Organize by résumé capabilities

- Status: Accepted
- Date: 2026-10-16

## Context

The project already renders LaTeX, resolves configuration, measures entries and checks PDFs. A flat `src/` obscured those responsibilities, and the writing workflow lived in a personal Career repository. The product needs a short path from career evidence to a checked résumé without introducing separate services or multiple executables.

## Decision

Keep one domain context and one package. Group code by capability:

- `content`: interpret source, included files, section keys and visible text. Depends only on shared input errors and platform APIs.
- `project`: resolve configuration, create starter projects and diagnose toolchain availability. Uses content parsing and rendering asset paths; does not compile or invoke quality gates.
- `rendering`: compile via XeLaTeX, capture actual geometry, manage manifests and own font utilities. Uses effective project configuration and source expansion.
- `quality`: evaluate rendered measurements and PDF facts. Uses content parsing, project policy validation and rendering manifests; does not invoke the compiler.
- `cli`: parse arguments, compose the capabilities, select human/JSON output and map outcomes to exit codes.

These are capability modules within one context, not separate bounded contexts. Project and rendering share configuration/asset contracts, but no cyclic file imports are required. Do not add repository/service/controller layers just for symmetry. Common errors remain at `src/errors.ts`; package consumers use `src/index.ts`.

Retain `src/cli.ts`, root API exports, `template/`, the config schema and existing command names. Move legacy width estimation to rendering; quality gates continue to use measured geometry.

Expose only the essential workflow through `resumectl`: `init`, `doctor`, `config init/show`, `build`, `check`. Add `bun run resume` for repository use and `bun run verify` for development checks. `init` refuses overwrites; `doctor` diagnoses without installing dependencies. All workflow commands support JSON. Keep font metric regeneration as a maintenance script.

Store writing instructions in `skills/resume-methodology/SKILL.md` and include `skills/` in the package. Adapt the local methodology to verified candidate facts, per-section edit policy and current rendered quality gates. Remove hard-coded personal claims and obsolete character-count gates. Do not create a second résumé data format.

## Consequences

Tests mirror capabilities; integration tests still compile both styles and check output. Documentation uses one root glossary and root ADR directory, with separate rendering, quality and configuration references. Moving internal source paths is intentional; root package exports remain the supported API.

A split into multiple packages, a generic DDD framework and independent CLIs would add coordination without a separate lifecycle or data owner, so they are deferred until an actual requirement appears.
