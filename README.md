# resumectl

**A harness for agent-written résumés.**

Paste in a job description and your background. Your coding agent (Claude Code, Codex, Cursor and similar) writes a tailored one-page résumé in LaTeX, renders it, and keeps revising until the PDF passes every check: it fits the page, has no ragged last lines, and parses cleanly in an ATS. Every claim comes from facts you gave it, so it can't invent metrics.

| Sans (recommended) | Serif |
|---|---|
| ![Sans example](docs/sans.png) | ![Serif example](docs/serif.png) |

<sub>Example people, schools and companies are fictional.</sub>

## Why

- **LaTeX, not Word.** Typesetting is far better, and you never fight Word's interface.
- **LaTeX suits agents, with a harness to keep them in line.** A `.tex` file is plain text, so an agent can edit it precisely. Left alone, though, it overflows the page and pads bullets. resumectl measures the rendered PDF and makes the build fail until the content fits.
- **Plain by design.** No icons, colour bars or two-column gimmicks. There are two typefaces with carefully tuned sizes and weights. I prefer the sans because it's easier to read on screen, where résumés are actually read. Both styles are single-column, real text and ATS-friendly.

## Get started

You need [Bun](https://bun.sh) ≥ 1.3. Everything else is set up by your agent.

**1. Install the skill:**

```bash
npx skills add nickhuo/resumectl
```

It works with Claude Code, Codex, Cursor, Copilot and [other agents](https://skills.sh).

**2. Ask your agent:**

> Make me a résumé for this job.
>
> Job description: *(paste)*
>
> My background: *(paste your old résumé, LinkedIn, notes, project write-ups)*

On the first run the agent checks your setup. If you have no TeX installed, it asks before installing [Tectonic](https://tectonic-typesetting.github.io), a 16 MB typesetter. The first build then downloads about 45 MB of packages, which takes a couple of minutes; later builds take seconds.

The agent then maps the job's requirements to your evidence and asks about gaps instead of guessing. It writes the résumé, builds the PDF, and revises until every check passes.

## What the build checks

| Check | Default |
|---|---|
| Page budget | 1 page |
| Entry length | Up to 2 lines per bullet, last line at least 80% full, no overflow |
| Copyable text | Text copied out of the PDF matches the page (phone numbers, names, brackets) |

You can change any limit per section in `resume.config.yaml`, and mark sections such as Education as off-limits to the agent. See [configuration](docs/configuration.md).

## Editing by hand

```bash
bunx resumectl init ./my-resume --style sans  # starter resume.tex + config
bunx resumectl build ./my-resume/resume.tex   # PDF in my-resume/output/, all checks
```

Fonts, sizes, margins and LaTeX commands are documented in [rendering](docs/rendering.md).

## License

[MIT](LICENSE). Inter is bundled under the [SIL Open Font License](template/fonts/OFL-Inter.txt). TeX Gyre Termes comes from your TeX distribution.
