# Quality gates

### The checker

**Gate 1 — rendered content length.** During compilation, the class records TeX’s actual paragraph line counts, available line widths, and the positions of each paragraph’s start and end. For each configured section, the checker sums the lines in each entry and divides the final paragraph’s rendered end position minus its left edge by its available width. Both single-line and multi-line entries must meet that section's final-line fill threshold. Reports include the section, entry number, text, measured length, effective limits and AI editing policy. Overfull horizontal or vertical boxes also fail this gate, including overflow on earlier lines and in sections with length checking disabled.

Measurements are saved next to the PDF as `<name>.resume-mode.json`, together with the effective layout and hashes of the source (including `\input` files) and PDF. Keep this file with the PDF for `check`; it survives log cleanup. Missing or mismatched measurements require a rebuild. Flat `itemize` and `plainlist` items are measured automatically. Wrap standalone prose and each `tabularx` X-column description in `\resumeentry{...}` to measure them, using the column's actual available width. Inline formatting, links, manual breaks and multiple paragraphs are supported; nested lists and nested entries are not. Headings, job titles, dates, locations and table labels are not measured as body entries. A configured, enabled section with no measured entries is an input error rather than a silent pass.

**Gate 2 — page count.** The checker reads the page count from the PDF itself and inflates compressed object streams to find the page tree. If that fails, it falls back to the xelatex log.

**Gate 3 — copyable text.** The checker parses every ToUnicode CMap in the PDF and fails if any glyph maps to a private-use code point (U+E000–U+F8FF or the supplementary private-use planes). That is how OpenType alternates without a Unicode mapping show up. The report names the code points.

### Checker options

```
resume-mode build <resume.tex> [options]   compile with xelatex, then run the gates
resume-mode check <resume.tex> [options]   run the gates on an existing PDF
```

| Flag | Default | Meaning |
|---|---|---|
| `--config <path>` | discovered YAML | Configuration file |
| `--section <name>` | all configured sections; otherwise `WORK EXPERIENCE` | Check only this section |
| `--max-lines <n>` | per-section config, shared default `2` | Override maximum rendered lines per entry in selected sections |
| `--min-last-line-fill <0–1>` | per-section config, shared default `0.8` | Override minimum fraction occupied on the last line |
| `--max-pages <n>` | `1` | Page limit |
| `--style <serif\|sans>` | from YAML or class | Override the rendered font style |
| `--paper <a4\|letter>` | from YAML or class | Override paper size |
| `--pdf <path>` | PDF in the effective output directory | Existing PDF to check |
| `--out-dir <dir>` | from YAML, otherwise beside source | Output directory |
| `--keep-logs` / `--no-keep-logs` | from YAML, otherwise off | Keep or remove compiler intermediates after a passing build |
| `--json` | off | Report with effective config, parameter sources and per-bullet measurements |

The old `--min-chars` and `--max-width` flags are replaced by the line-count and fill controls. `check` requires a PDF built with the current CLI and its matching `.resume-mode.json` file. Use the same layout config/overrides as the build; changing layout or source requires rebuilding. Checking thresholds can change without a rebuild.

Exit codes: `0` means every gate passed. `1` means a gate failed, the compile failed, or doctor found a missing dependency. `2` means a usage or input error.
