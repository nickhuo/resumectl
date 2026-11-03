# Match a résumé to a job

`resumectl match` reports how a résumé covers requirements you supply. It is a writing diagnostic.

It is **not an ATS score**. It does not predict whether an employer, recruiter, or applicant-tracking system will pass or reject the résumé. Those products are configured per job, and some scores are relative to the other applicants. Documented auto-rejects are mostly answers on the application form (work authorization, licenses), not a résumé similarity percentage.

Probabilities in the report are **uncalibrated** until you label your own requirement/evidence pairs and check them. Do not treat P(A) as a chance of getting hired.

## Command

```bash
resumectl match <resume.tex> --jd <url|txt|yaml> \
  [--profile facts.yaml] \
  [--decider openai|jev|none] \
  [--model <id>] \
  [--fail-under A|B|C|D] \
  [--refresh] \
  [--json]
```

| Flag | Default | Meaning |
|---|---|---|
| `--jd` | required | Posting URL, a `jd.txt` paste, a `jd.requirements.yaml` file, or a `jd/<slug>/` directory |
| `--profile` | none | Optional facts file for authorization, location, degrees, licenses, and backed claims |
| `--decider` | `openai` | Who scores each requirement |
| `--model` | `gpt-6-luna` or `jev-1.14.0` | Pin or override the decider model |
| `--fail-under` | off | Exit 1 when the letter is below this grade. Otherwise the command is advisory (exit 0) |
| `--refresh` | off | Fetch the URL again. Does not overwrite `jd.requirements.yaml` |
| `--json` | off | Same report as JSON |

Exit `2` is a usage or input error (missing file, missing requirements YAML, login-wall URL, missing API key). Exit `1` is a decider or job-board HTTP failure, or `--fail-under` not met.

Library: `runMatch()` and `formatMatchReport()`, exported from the package root. See [the API note](api.md).

## What the command does

1. **Read the résumé.** Sections, role dates, and bullets come from the `.tex` source, using the same visible-text extraction as the length gate. If a built PDF is next to the source (or in the configured output directory), match also runs the private-use text check from Gate 3. It does not OCR the page.
2. **Resolve the posting.** Greenhouse, Lever, and Ashby board URLs use their public JSON APIs. Other pages use schema.org `JobPosting` JSON-LD, then plain HTML text. LinkedIn, Workday, and Taleo URLs stop with a message to paste `jd.txt`. The cache is `jd/<slug>/source.json` (URL, fetch time, sha256), `jd.txt`, and an example requirements file. Later runs reuse the cache.
3. **Load requirements.** The CLI does not invent them. You or an agent write `jd.requirements.yaml` once, then edit it. `--decider none` works offline from that file.
4. **Retrieve evidence locally.** For each scored requirement, the top matching bullets are kept. Names, email, and phone are removed before anything is sent to a decider.
5. **Score each requirement.** The decider sees that requirement and those snippets, not the whole résumé. Levels, low to high:
   - **Missing** — no relevant quote
   - **Mentioned** — keyword, skills list, or summary only
   - **Partial** — used in a role or project bullet without scope or outcome
   - **Demonstrated** — named in a role or project bullet with scope or outcome
6. **Hard gates, in code.** Work authorization, location, license, minimum degree, and minimum years. Role dates are parsed to month precision and the end month counts, so overlapping roles are merged before the total is compared with `min_years`. A `min_years` field on a skill row adds a years gate and still lets the skill affect the grade. These gates are never averaged into the letter. "Equivalent experience" on a degree row is a local heuristic (for example four years of parsed work for a bachelor's), reported as Partial, not as a degree the résumé states.
7. **Grade, in code.** The model is not asked for A–D.
8. **Stuffing guard.** An 8-word paste from the posting, a term repeated more than six times, a required skill that appears only in the skills list, or a claimed term absent from `profile.facts` caps the letter at B. A skills-list-only hit is also capped at Mentioned, including when a model scored it higher.

## Grade

"Met" means Partial or Demonstrated. Mentioned is not met.

| Letter | Rule |
|---|---|
| D | Meets half or fewer of the required rows |
| C | Meets most required rows, but not all |
| B | Every required row is met |
| A | B, more than half of preferred rows are met, and at least 70% of required rows are Demonstrated |

If there are no required rows, preferred rows are graded on their own. If a decider returns a distribution, the report also shows P(A), P(B), P(C), and P(D) from those per-requirement probabilities. The headline letter uses the per-row level (the most probable level, ties toward the weaker level), not a holistic question.

A failed hard gate does not change the letter. It is listed under hard gates and as a `knockout` gap.

## Requirements file

```yaml
version: 1
title: Backend Engineer
company: Northstar
requirements:
  - id: python
    text: Production Python services
    kind: skill          # skill, tool, domain, title, years, education,
    priority: required   # certification, license, location,
    terms: [Python]      # work_authorization, language, soft
  - id: years
    text: At least 3 years of software engineering
    kind: years
    priority: required
    min_years: 3
  - id: degree
    text: Bachelor's degree or equivalent experience
    kind: education
    priority: required
    level: bachelor      # highschool, associate, bachelor, master, phd
```

`id` is a short token. `terms[0]` is the canonical posting term; later terms and a small built-in alias table (for example `k8s` / `kubernetes`, `postgres` / `postgresql`) count once per requirement.

Optional `facts.yaml`:

```yaml
work_authorization: US citizen
location: Austin, TX
open_to_remote: true
willing_to_relocate: false
degrees:
  - level: bachelor
    field: Computer Science
licenses: []
facts:
  - Built a Python service that cut checkout latency
```

`name`, `email`, and `phone` are ignored if present. Facts are not inferred from the résumé.

## Deciders

| Name | Call | Secret | Model |
|---|---|---|---|
| `openai` | `POST https://api.openai.com/v1/decisions` | `OPENAI_API_KEY` | `gpt-6-luna` |
| `jev` | `POST https://api.typesafe.ai/v1/systemone` | `TYPESAFE_API_KEY` | `jev-1.14.0` (not the `jev-latest` alias) |
| `none` | local exact / alias match | none | none |

OpenAI questions are `score` questions with the four levels above, batched in one request. Each question's instructions contain only that requirement and its snippets. Jev uses one request per requirement so the state stays small. A refusal, or a model score with no retrieved quote, falls back to the local match for that row. Keys are read from the environment and are not written to config or the report.

`none` marks a role or project bullet as Demonstrated only when it contains the term, an action verb, and a number, percent, or from/to result. A bullet without that result is Partial. A skills-list hit is Mentioned. This is deterministic keyword placement, not a judgment of impact.

## Gaps

| Type | Meaning |
|---|---|
| `wording` | Evidence exists under a different term. Use the posting's term only if it is accurate |
| `placement` | The term is only in a skills list or summary. Move it into a bullet that already has a mechanism or result |
| `missing evidence` | Nothing to cite, or only partial use. Ask the user. Do not invent a metric or tool |
| `parse` | Structure or PDF text-layer problem (missing contact, undated role, private-use glyphs) |
| `knockout` | A required hard gate is not met. Handle it on the application. Do not change facts to clear it |

## What this does not do

- It does not say "your ATS score" or estimate an employer's pass rate.
- It does not auto-reject, and it does not run during `build` unless you choose `--fail-under` yourself.
- It does not extract requirements from a posting. The cache stores the text; you review the YAML.
- It does not use the candidate's name in the grade. Names and contact details are stripped before a decider call.
- It does not promise that every parser will read the PDF. Gate 3 remains the private-use check. Passing `build` still does not guarantee ATS compatibility.
