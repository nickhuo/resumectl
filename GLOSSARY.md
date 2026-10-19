# Glossary

resumectl has one domain context: authoring, rendering and checking a résumé from verified career evidence.

| Term | Meaning | Owner |
|---|---|---|
| Source | The `.tex` document and recursively included `.tex` content | `src/content/tex.ts` |
| Section | A normalized heading used to match content with its editing/checking policy | `src/content/tex.ts` |
| Entry | One measured list item, prose paragraph, or table description; may contain several paragraphs | `src/rendering/measurements.ts` |
| Bullet | A list entry; legacy API names also use `Bullet` for other measured entries | `src/rendering/measurements.ts` |
| Effective config | Values resolved in order: CLI/API overrides > YAML > documentclass > defaults | `src/project/config.ts` |
| Editing policy | A section's `editable` guidance for an agent; distinct from whether length checks run | `src/project/config.ts` |
| Layout | Style, paper, margins, spacing and font settings used for compilation | `src/project/config.ts` |
| Render manifest | `<name>.resumectl.json`: actual geometry, layout, source/PDF hashes and overflow findings | `src/rendering/measurements.ts` |
| Last-line fill | Final paragraph's rendered text width divided by its available line width | `src/rendering/measurements.ts` |
| Quality gate | A pass/fail rule for content length/overflow, page budget or PDF private-use mappings | `src/quality/gates.ts` |
| Writing evidence | User-supplied facts supporting ownership, mechanisms and outcomes; not inferred from layout scores | `skills/resumectl/SKILL.md` |

See [the architecture decision](docs/adr/0001-domain-first-organization.md) for module boundaries.
