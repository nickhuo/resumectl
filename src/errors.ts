// Errors in what the user handed us (a missing file, a section with no bullets), as
// opposed to a failed compile. The CLI maps these to exit code 2.
export class InputError extends Error {
  readonly reason: string;
  constructor(message?: string, reasonOrOptions: string | ErrorOptions = "invalid_input") {
    super(message, typeof reasonOrOptions === "string" ? undefined : reasonOrOptions);
    this.reason = typeof reasonOrOptions === "string" ? reasonOrOptions : "invalid_input";
  }
}

export class InterruptedError extends Error {
  constructor() { super("build interrupted (SIGINT); no quality report is available. Inspect the output directory before rebuilding."); }
}
