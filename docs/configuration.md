# Configuration

This repository includes [resume.config.yaml](../resume.config.yaml); edit it to configure both examples. Leave `layout.style` commented out to keep their individual styles.

Create a YAML configuration and inspect the effective values:

```bash
bunx resume-mode config init
bunx resume-mode config show resume.tex --json
bunx resume-mode build resume.tex
```

A complete example of `resume.config.yaml`:

```yaml
version: 1
layout:
  style: sans
  paper: a4
  scale: 0.86       # Sans only
  tracking: -1.5   # Sans only, percent of an em
  ratio: 1.125     # Sans only, type scale
  margins:
    top: 0.4in
    bottom: 0.3in
    left: 0.35in
    right: 0.35in
  bulletSpacing: 0.15em
  bulletIndent: 1.5pc
  sectionSpacing:
    before: "*2"   # Quote * multipliers in YAML; lengths such as 2ex also work
    after: "*0.8"
checks:
  bullets:
    maxLines: 2
    minLastLineFill: 0.8
  maxPages: 1
sections:
  WORK EXPERIENCE:
    editable: true
    checks:
      maxLines: 2
      minLastLineFill: 0.8
  PROJECTS:
    editable: true
    checks:
      maxLines: 2
      minLastLineFill: 0.65
  EDUCATION:
    editable: false
    checks:
      maxLines: 1
      minLastLineFill: 0
build:
  outDir: ./output
  keepLogs: false
```

Every field is optional; omit `layout.style` to preserve the style in each source. `scale`, `tracking` and `ratio` affect only the sans style. Default section spacing is `*1`/`*1` for serif and `*2`/`*0.8` for sans. Margins accept `pt`, `mm`, `cm`, `in` and `pc`; spacing also accepts `em` and `ex`. Values must be non-negative. The nominal body size remains 11pt.

Precedence is **CLI > YAML > documentclass > defaults**, merged field by field. Discovery starts beside the input source (or in the current directory for `config show` without a source) and searches upward to the repository root. Both `resume.config.yaml` and `resume.config.yml` are supported; if both exist, select one explicitly. Use `--config path/to/config.yaml` for another configuration. Relative `build.outDir` paths are based on the YAML file; CLI `--out-dir` paths are based on the current directory. Without an output setting, the PDF goes beside the source.

`config init` creates a starter file in the current directory and refuses to overwrite an existing file. It includes a YAML language-server schema comment pointing to [resume.config.schema.json](../resume.config.schema.json) for editor completion. Unknown keys, invalid types, unsupported versions and invalid lengths are rejected. `config show` outputs effective values plus the source of each field, without compiling.

`checks.bullets` supplies shared defaults. Each `sections.<title>.checks` overrides them field by field. `maxLines` is the maximum actual rendered lines **per entry**, not a total section budget. `minLastLineFill` is a fraction between 0 and 1: `0.8` means 80%, for either a single-line entry or the last line of a multi-line entry; `0` disables the minimum fill requirement. This is useful for facts such as skills and degrees, which should not be padded just to fill a line. `maxLines` and `maxPages` are positive integers.

Section keys match rendered titles, ignoring case, LaTeX formatting and repeated whitespace (`TALKS & AWARDS` matches `\section{TALKS \& AWARDS}`). Only listed sections are checked. Set `checks: false` on a section to skip its length checks; page count, text mappings and overfull-box checks still run. Without a sections map, the checker retains the original `WORK EXPERIENCE` default. The old `checks.section` selector and `--section` still work, narrowing checking to one section. CLI `--max-lines` and `--min-last-line-fill` override the selected sections' individual limits, or all configured sections when no selector is given.

`editable: true` tells the coding agent it may rewrite that section's body entries while preserving facts. `false` (the default) means leave them unchanged unless the user explicitly authorizes an edit. This policy is independent of checking: a section can be read-only and still fail its length limits. It is guidance exposed in `config show` and reports, not an enforced file lock or an automatic rewriting feature. Unlisted sections carry no editing permission. A coding agent should read `config show resume.tex --json`, revise the permitted entries, then build and use the per-section feedback. Changing thresholds or editing policy does not require rebuilding; changing content or layout does.

For a summary or table description, mark each checkable entry explicitly:

```latex
\section{SUMMARY}
\resumeentry{Your summary paragraph.}

\section{PROJECTS}
\begin{tabularx}{\textwidth}{@{} l X @{}}
\projectlink{https://example.com}{Project} & \resumeentry{Your project description.} \\
\end{tabularx}
```

Do not wrap list items in `\resumeentry`; they are already measured. Unwrapped prose and table text are not automatically checked. The repository example marks all six sections and checks 27 entries.
