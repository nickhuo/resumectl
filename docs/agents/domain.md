# Domain documentation

This is a single-context project. Maintain vocabulary in [`GLOSSARY.md`](../../GLOSSARY.md) and decisions in [`docs/adr/`](../adr/).

- Follow [ADR 0001](../adr/0001-domain-first-organization.md) when placing code.
- Put behavior and its tests with the owning capability. `src/cli/main.ts` composes commands; it does not own configuration, measurement or writing rules.
- Use actual rendered geometry for quality decisions. Keep legacy font-width utilities out of the gate calculation.
- Keep `.tex` as the source of résumé content and the manifest as generated evidence, not editable content.
- Keep root package exports stable when moving internal files.
- Run `bun run verify`; rendering tests require the environment described in [`setup.md`](../setup.md).

The [writing skill](../../skills/resume-methodology/SKILL.md) owns résumé-writing guidance, not the TypeScript compiler/checker implementation.
