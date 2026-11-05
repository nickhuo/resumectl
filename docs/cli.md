# Command-line interface

Run `bunx resumectl <command>` outside this repository, or `bun run resumectl <command>` inside it. The examples below assume the `resumectl` executable is on your PATH.

## Discovery

`resumectl`, `resumectl help`, `resumectl --help` and `resumectl -h` show root help and exit 0. `resumectl config` shows group help and exits 0. Every command has its own usage, summary, applicable options and an executable example:

```bash
resumectl build --help
resumectl help build
resumectl config init -h
resumectl help config show
resumectl --version
resumectl -v
```

Help works without config, source files, build tools or network access. Recognized help skips other validation, including invalid options and missing option values. Unknown command paths still exit 2 and identify the unknown segment and the nearest valid help command. `--version` works at any depth, prints only the package version and exits 0. Help wins if both switches are present. `--` ends option parsing, so later tokens are positional values rather than help, version or JSON switches.

## Commands and options

| Command | Result | Local options (all also accept `--json`, `-h`/`--help`, `-v`/`--version`) |
|---|---|---|
| `init [directory]` | Starter source and config; refuses overwrites | `--style`, `--paper` |
| `doctor` | Dependency report; installs nothing | None |
| `config init` | Starter YAML; refuses overwrites | `--config <path>` |
| `config show [resume.tex]` | Effective config and each field's origin | All build config and checking overrides below |
| `build <resume.tex>` | Compile and run all quality gates | `--config`, `--style`, `--paper`, `--section`, `--max-lines`, `--min-last-line-fill`, `--max-pages`, `--out-dir`, `--keep-logs`, `--no-keep-logs` |
| `check <resume.tex>` | Check an existing PDF and its manifest | The same overrides except log-retention switches; also `--pdf <path>` |

Unknown or inapplicable options and extra positional arguments exit 2 before project files are read or changed. `check` rejects `--keep-logs` and `--no-keep-logs`; `build` and `config show` reject `--pdf`. `check` rejects combining `--pdf` with `--out-dir` because an explicit PDF already determines the location. Build keeps all quality overrides because it runs the gates. Check keeps layout overrides to verify that the PDF matches the expected layout. `config show` accepts overrides, including log retention, because they change the effective config it displays.

Use `resumectl <command> --help` for value syntax, [configuration](configuration.md) for precedence and [quality gates](quality.md) for thresholds.

## Streams and automation

Human stdout contains the requested result: created file paths, a readable config with field origins, or a quality/dependency report. Build progress, receipts and recovery commands go to stderr. `init` also puts its next build command on stderr. Redirect stdout to save just the answer.

With `--json`, completed operations write one JSON document and a newline to stdout. Existing success fields are preserved: `init` returns `directory`, `texPath`, `configPath`; `config init` returns `configPath`, `config`; `config show` returns `config`, optional `configPath`, `sources`; `doctor` returns `pass`, `checks`; build/check retain `pdf`, config, sources and all gate fields. No progress or first-build download notice appears on stderr in JSON mode.

An error before a report is available writes nothing to stdout and exactly one compact JSON document and newline to stderr:

```json
{"status":"action_required","reason":"missing_input","message":"build needs a .tex file. Run resumectl build --help.","retryable":false}
```

`status` is `action_required` for missing input and `error` otherwise. `reason` is a stable snake_case code from this registry:

| Reason | Exit | Meaning |
|---|---|---|
| `unknown_command` | 2 | Unknown command path |
| `unknown_option` | 2 | Unknown or inapplicable option |
| `invalid_option` | 2 | Missing or empty option value, or invalid option syntax |
| `conflicting_options` | 2 | Mutually exclusive options |
| `unexpected_argument` | 2 | Extra positional argument |
| `missing_input` | 2 | Missing required source, config, included file, PDF, manifest or directory |
| `invalid_input` | 2 | Invalid config, source, thresholds or stale render measurements |
| `dependency_missing` | 1 | No TeX engine, including a forced executable missing from PATH |
| `spawn_failed` | 1 | Compiler could not start for another reason |
| `compile_failed` | 1 | Compiler failed or did not produce usable output |
| `operation_failed` | 1 | Other filesystem or runtime failure |
| `interrupted` | 130 | Compiler work interrupted by SIGINT |

`message` explains what failed and includes a recovery command where one exists. `retryable` is conservatively `false`: there are no automatic retries, and missing dependencies or invalid inputs need correction first.

A completed quality report with `pass: false`, or a doctor report with failed checks, remains the requested answer on stdout and exits 1. JSON mode adds no error document for these reports. Human mode puts fixes on stderr. Exit 0 means success (including help/version), 1 means a quality/compile/dependency/operational failure, and 2 means invalid or missing input.

During compiler work, Ctrl+C/SIGINT is forwarded to the engine. The CLI waits for it to stop, escalates to SIGKILL after two seconds if needed, and exits 130 with no quality report. In JSON mode the error reason is `interrupted`. The CLI does not claim a valid PDF; compiler intermediates may remain and should be inspected before rebuilding. SIGTERM/SIGHUP retain runtime behavior; coordinated handling for those signals is outside this change.

## Deliberate exceptions to the Vercel guide

These choices apply the [CLI Design Guidelines](https://vercel.com/design/cli) while preserving this local tool's existing contracts.

| Guide rule | Reason for the exception | User impact |
|---|---|---|
| A JSON failure writes only an error on stderr | Failed gates and failed doctor checks are completed diagnostic results, and callers already consume their report fields | Read the stdout report even on exit 1; distinguish it from errors with empty stdout |
| Human mutations print a bare resource identifier | `init` creates both source and config; its established result names both files | Human stdout keeps the creation receipt; next steps are on stderr; use JSON for separate paths |
| JSON results use the guide's standard envelope, compact output off-TTY and explicit absent values | Existing scripts and the bundled skill depend on the current success shapes, indentation and optional fields | Success JSON remains compatible and pretty-printed; configPath can be omitted when discovery finds no config; error JSON follows the new compact contract |
| Help with `--json` exposes machine metadata; version with `--json` returns an object | This change adds offline human discovery, and requires version to print only the version | Help remains plain text even with `--json`; version remains a bare version string |
| Use canonical command and option names, including `--output` for file destinations | Renaming existing commands or `--out-dir` would break scripts and is outside this issue | Existing names remain; per-command help lists the accepted syntax |
| Coordinate cleanup for SIGINT, SIGTERM and SIGHUP | This change covers Ctrl+C during compilation, where the long-running child exists | SIGINT has bounded compiler cleanup; SIGTERM/SIGHUP use runtime defaults without a cleanup guarantee |

Auth, teams, purchases, telemetry, update notices, extensions, pagination and retry protocols do not apply to the current local, single-user tool.
