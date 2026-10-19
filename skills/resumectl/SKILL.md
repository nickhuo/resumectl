---
name: resumectl
description: Write, rewrite, tailor, score, or review résumé/CV bullets, summaries, sections, or a complete résumé against a target role or job description. Use with resumectl to turn verified career evidence into concise LaTeX content and validate the rendered PDF.
---

# Resume Methodology

## Inputs and evidence

Identify the target role or job description (JD), the candidate's career evidence, and the `.tex` file to edit. Use information already provided. If the JD is missing, proceed with a general review and state that the résumé has not yet been tailored to a specific role.

- Every employer, responsibility, ownership claim, technology and metric must be traceable to the user's materials.
- Never guess a metric. Use verified scope or observable outcomes; ask the user when an essential fact is missing.
- Placeholders such as `[N endpoints]` and `[latency %]` belong only in drafts awaiting confirmation. Replace or remove them before delivery.
- Examples in this skill illustrate writing structure. They are not facts about the candidate.
- Treat the user-designated `.tex` file and its `\input` files as the content source. Do not maintain a separate Markdown résumé that can drift out of sync.

## Writing workflow

### 1. Map the role requirements

Group the JD into four categories and identify the candidate's evidence for each requirement:

| Category | Extract |
|---|---|
| Required capabilities | Technologies, systems skills and domain knowledge |
| Business problems | Cost, reliability, latency, automation and user experience |
| Expected proof | Production delivery, scale, personal ownership and customer impact |
| Interview opportunities | Projects with design decisions, tradeoffs and results the candidate can explain |

Record `JD requirement → available evidence → gap`. Keep unsupported requirements as gaps; do not present them as demonstrated abilities.

### 2. Select the strongest evidence

Evaluate each item by whether it helps a recruiter judge the candidate's fit within 30 seconds:

- Lead with the most relevant accomplishments and clearest evidence of contribution.
- Remove statements that only describe participation, duties or tools. Rewrite them around outcomes when evidence supports doing so.
- When two bullets prove the same capability, keep the stronger one.
- Keep coursework and routine projects only when they fill a gap in evidence for the target role.
- Do not add weak content just to fill a page.

Choose the emphasis for the role without changing the facts: AI Engineer roles prioritize agents, RAG, evaluations and production reliability; SWE roles prioritize backend systems, system design, performance and engineering quality; Data roles prioritize pipelines, experiments, data quality and decision impact.

### 3. Write verifiable bullets

Default structure: **Action + technical mechanism + result + business or user impact**. Alternatively, compress STAR into context, action and result.

- Start with a concrete action verb: Built, Designed, Shipped, Optimized, Automated, Reduced, Migrated or Instrumented.
- Use past tense for completed accomplishments. Make personal contributions explicit without implying sole ownership of a team's result.
- Avoid openings that describe only duties, such as Responsible for, Participated in, Helped or Worked on.
- Use the JD's terminology when it accurately describes the work. Place relevant keywords in the first five words when natural, without keyword stuffing.
- Explain the technical choice or mechanism instead of merely listing tools.
- Support impact with verified metrics, scope or observable results. A missing number is not a reason to invent one.

Example structure, with illustrative numbers:

> Built REST API caching across 12 endpoints, reducing p95 latency 38% and improving checkout reliability.

Compress in this order: preserve the action, mechanism and result → remove empty adjectives and repeated context → use clear technical abbreviations → keep one impact clause. Split a bullet only when the resulting bullets prove distinct capabilities.

**Target 1–2 rendered lines with a sufficiently full final line.** Do not substitute character counts or estimated Times font widths for PDF measurements. Shared defaults allow at most two lines and require at least 80% final-line fill; use the effective configuration for the actual thresholds. Never add unsupported scope, metrics or filler to fill a line.

### 4. Write a role-specific summary

When the user needs a summary, use **Identity → Proof → Target/Vision**:

1. Identity: a role description aligned with the JD.
2. Proof: the strongest relevant accomplishment or evidence.
3. Target: the work the candidate wants to continue doing, aligned with the role's business goals.

Template: `[Role identity] with [relevant strengths]; shipped [verified proof]; focused on [JD-aligned goal].`

Use one or two sentences. Remove generic labels such as passionate, fast learner and results-driven. The summary should establish positioning beyond what the experience section already says; suggest omitting it when it adds no such value. Enforce a character limit only when the user requests one. Otherwise, check the SUMMARY section's line and fill limits and the document's page budget. A fixed character count does not imply a fixed rendered length.

### 5. Review and score

Score each bullet from 0 to 2 on each dimension:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Role relevance | Generic | Partly relevant | Directly maps to the JD |
| Ownership | Unclear | Partly explicit | Personal action is explicit |
| Technical mechanism | Missing | Tool named | Design or implementation explained |
| Result evidence | Missing | Vague | Concrete number or observable result |
| Impact | Missing | Implied | Clear user, business or team benefit |

Prioritize bullets scoring 8–10. For a score of 7, address the weakest dimension. Rewrite or remove bullets below 7. Scores help select content; they do not replace fact checking or rendered validation.

## resumectl workflow

Run the CLI as `bunx resumectl@0.1.0 <command>`. Bun downloads it on first use, so nothing needs cloning. Inside the resumectl repository, `bun run resumectl <command>` is equivalent.

### Set up once

Run `bunx resumectl@0.1.0 doctor` before writing anything, and fix failures with the user:

- **`bunx` not found, or Bun below 1.3:** ask the user to install Bun (`curl -fsSL https://bun.sh/install | bash`) or run `bun upgrade`.
- **`TeX engine` missing:** recommend Tectonic, a ~16 MB program that downloads only the TeX packages it needs. Install it with `brew install tectonic` on macOS, or `curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh` elsewhere ([other options](https://tectonic-typesetting.github.io/install.html)). Ask before installing anything.
- **`TeX dependencies` missing:** the user already has TeX Live or TinyTeX. Run `tlmgr install titlesec enumitem pgf tex-gyre` with their approval.

Repeat `doctor` until it passes. With Tectonic, the first build needs network access and can take a few minutes while packages download; run it with a timeout of at least 5 minutes. Later builds take seconds.

### Build and revise

For a new résumé, run `bunx resumectl@0.1.0 init <directory> --style sans`, then replace the placeholder content. `init` refuses to overwrite existing résumé source or configuration. Use `--style serif` only if the user asks for it.

```bash
bunx resumectl@0.1.0 config show path/to/resume.tex --json
bunx resumectl@0.1.0 build path/to/resume.tex --json
bunx resumectl@0.1.0 check path/to/resume.tex --json
```

Read `config show` before editing:

- `sections.<title>.editable: true` permits rewriting that section's body while preserving facts.
- `false` or an unlisted section provides no editing permission through configuration. Edit it only when the user explicitly authorizes the change.
- `checks: false` disables that section's length checks; it does not grant editing permission.
- Do not lower thresholds, shrink fonts or change the page budget merely to make checks pass without the user's authorization.

List items are measured automatically. Wrap standalone paragraphs and `tabularx` X-column descriptions in `\resumeentry{...}`. Do not wrap `\item` again or nest lists or entries.

Rebuild after every content or layout change. Use each failing entry's `section`, `index`, `lines`, `lastLineFill` and `status` to guide revision:

1. Too many lines: follow the compression order and preserve the strongest evidence.
2. Sparse final line: first try compressing to one line. Alternatively, add a mechanism or result already supported by the user's materials; never invent content.
3. Overflow or excess pages: remove weaker content and inspect long links, unbreakable text and tables. Do not make the résumé difficult to read just to pass.
4. Private-use character mappings: inspect the font or template; do not ignore broken text copying.
5. Missing measurements or mismatched hashes: rebuild rather than editing `.resumectl.json` by hand.

All three quality gates must pass: actual rendered content length and overflow, page count, and PDF private-use character mappings. `check` uses the existing PDF and its matching `.resumectl.json` manifest. Content or layout changes require a rebuild; changes only to checking thresholds can be rechecked directly.

## Delivery checks

- Support the role's priorities with real evidence and list any unresolved factual gaps.
- Give each bullet an action, mechanism and result, with the strongest evidence first.
- Do not alter dates, job titles, schools or other facts to make the layout fit.
- Remove all draft placeholders from the final file.
- Require a fresh build with exit code 0 and all three gates reporting PASS. Record the PDF path and verification result.
- Inspect the actual PDF for hierarchy, spacing, reading order, and the final-line fill of one- or two-line bullets. If no visual inspection was performed, state that explicitly.
- Deliver the main changes, factual gaps and generated files. Passing the gates does not guarantee acceptance or compatibility with every ATS parser.

[Source](https://www.youtube.com/watch?v=4eYzTGxZazw)
