# 0002 — Match is a diagnostic, not an ATS score

- Status: Accepted
- Date: 2026-11-03

## Context

Agents already map a job description to evidence and gaps while editing a résumé. That step was prose in the writing skill. Recruiter products (Greenhouse Talent Matching, Workday HiredScore, Taleo ACE, Textkernel) score criteria a person configures. They do not publish one portable "ATS score," and several auto-reject only on application answers such as work authorization. A single similarity percentage would over-claim.

OpenAI Decisions (`gpt-6-luna`) and TypeSafe Jev (`jev-1.14.0`) return probabilities over a small ordered scale. They are a poor fit for arithmetic (years, dates) and for a holistic letter grade. Their probabilities are not calibrated on this task until someone labels examples.

## Decision

Add `resumectl match` and `runMatch()` under `src/match/`. The command reads visible text from the `.tex` source with the same extraction the length gate uses, and reads a built PDF only for the existing private-use check.

Requirements live in `jd.requirements.yaml`, written once by a person or an agent and then reused. A job URL is fetched when it is a public Greenhouse, Lever, or Ashby post, else schema.org `JobPosting`, else HTML text, and cached under `jd/<slug>/`. LinkedIn and Workday URLs are refused.

A pluggable decider (`openai`, `jev`, or `none`) may score one requirement against its top evidence snippets on four levels: Missing, Mentioned, Partial, Demonstrated. The default is `openai`. `none` is exact and alias matching with no network. Years, degrees, and the other hard gates are computed in code and are not averaged into the grade.

The letter A–D is computed in code from those levels. Stuffing (posting paste, repeated terms, skills with no role evidence, terms absent from a facts file) caps the grade at B. The command is advisory (exit 0) unless `--fail-under` is set. Reports say the result is not an ATS score and that probabilities are uncalibrated.

## Consequences

Match does not replace `build` / `check`. It does not invent requirements or evidence. Deep imports under `src/match/` are not a stable API; callers use `runMatch` and `formatMatchReport`. Calibration against labeled pairs is future work and must not be implied by the current probabilities.
