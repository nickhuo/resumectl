# Rendering and typography

### Typography

- **Serif — TeX Gyre Termes.** A free Times clone: traditional, compact, and familiar to every reader and parser. It keeps italics for job titles and taglines, and bold for names of organisations and roles.
- **Sans — Inter**, at its text optical size (`opsz=14`). Inter is the closest open-source match to the system UI fonts people read all day (SF Pro on macOS, which is what GitHub renders on a Mac). Three choices follow from that:
  - **Upright only.** Sans italics look slanted and nervous at résumé sizes, so `\textit` and `\emph` render upright. Hierarchy comes from size, weight and case.
  - **Body at 430, bold at 600.** Scaling to 0.86 thins the strokes, and 430 restores the colour of the text without reading as bold. For emphasis, 600 is used instead of Bold, which reads heavy at 9–10pt; 600 is also the weight GitHub uses for bold text.
  - **Scaled to 0.86 with −1.5% tracking.** Inter is much wider than Times. Without the scale the same content runs two pages; the slight negative tracking matches SF Pro's tighter text setting.
  - **Contextual alternates off.** Inter's `calt` feature swaps `( ) - +` next to capitals and digits for raised "case" glyphs. Those glyphs have no Unicode code point, so `ALEX (AJ) CHEN` or `(555) 010-0142` copied as private-use garbage. Gate 3 exists because this bug can't be seen on the page.
- **Static font instances.** XeTeX ignores variable-font axes and silently falls back to the default instance, which for some fonts is the lightest weight. `template/fonts/` therefore ships static 430, 500 and 600 files cut from Inter's variable font.

### Type scale (sans)

Every size sits on one modular scale, `size(n) = 10.95pt × ratio^n`, rendered at the `scale` factor. With the defaults (ratio 1.125, a "major second"; scale 0.86) that gives four sizes:

| Level | Step | Size | Weight | Tracking | Why |
|---|---|---|---|---|---|
| Name | +5 | 16.9pt | 500 | +2% | Large text reads heavier, so the weight drops; all caps need a little air |
| Organisation / school | +1 | 10.6pt | 600 | −1.5% | The anchor a skimming eye lands on |
| Body, role, dates, contact | 0 | 9.4pt | 430 / 600 | −1.5% | Dates use tabular figures so the right-hand column lines up |
| Section label | −1 | 8.4pt | 600 | +8% | Navigation, not content: small letter-spaced caps instead of competing on size |

Two checks keep the hierarchy honest:

- **Darkness falls monotonically down the levels.** Darkness is measured as size × stem width of `l`, which approximates how dark a line looks: name 1.82pt > organisation 1.35pt > role 1.20pt > label 1.06pt > body 0.88pt.
- **The body is big enough.** Inter's x-height is 0.546 em against Times' 0.45, so 9.4pt Inter has the same x-height as 11.4pt Times, within the 10–12pt that print body text usually uses.

The serif style keeps the classic sizes (`\huge` name, `\large` headings, 11pt body).

### Layout

- **Single column, no icons, no colour.** It prints cleanly in black and white, the PDF text layer reads in order, and ATS parsers have little to trip on.
- **Rows with dates and places on the right.** Each organisation sits in a `\datedsubsection` row with its dates flush right, followed by a `\datedline` row for the role with its location flush right.
- **Links look like links without looking like 2004.** Project names carry a small `↗` inside the link. There's no underline and no blue: the arrow reads as "clickable" on screen and as decoration on paper. Inter has the glyph; Termes doesn't, so the serif style draws the arrow with TikZ.

### Class options

```latex
\documentclass[style=sans, paper=letter, scale=0.9, tracking=-1]{resume}
```

| Option | Values | Default | Effect |
|---|---|---|---|
| `style` | `serif`, `sans` | `serif` | Termes with italics, or Inter upright-only |
| `paper` | `a4`, `letter` | `a4` | Page size; rendered line measurements follow automatically |
| `scale` | number | `0.86` | Sans only: Inter's size relative to the 11pt body |
| `tracking` | number | `-1.5` | Sans only: letter spacing in % of the em |
| `ratio` | number | `1.125` | Sans only: type-scale ratio between levels, e.g. `1.2` for a stronger hierarchy |

Class options remain supported. The CLI applies the effective layout after reading them, so YAML and command-line overrides change both the PDF and its measurements. Additional class options are `marginTop`, `marginBottom`, `marginLeft`, `marginRight`, `bulletSpacing`, `bulletIndent`, `sectionBefore` and `sectionAfter`.

### Commands

| Command | Use |
|---|---|
| `\name{NAME}` | Centered header |
| `\basicInfo{…}` | Centered contact line; separate items with `\sep` |
| `\datedsubsection{left}{dates}` | Organisation or school row, with dates flush right |
| `\datedline{left}{right}` | Role row, with location flush right |
| `\role{title}` | Bold job title. Italic in serif, upright in sans |
| `\projectlink{url}{name}` | Bold project name with a clickable `↗` |
| `plainlist` environment | Bullet-less list, used for education details |
| `\resumeentry{body}` | Checkable prose paragraph or X-column description; no visual styling |

### Swapping a font

Custom fonts require changing `template/resume.cls` and providing the corresponding font files. The layout gate measures the compiled result, so it needs no width-table regeneration. `typographicWidth` and `bun run gen-metrics` remain available as legacy estimation utilities; they are not used by the gates.
