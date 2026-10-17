// Errors in what the user handed us (a missing file, a section with no bullets), as
// opposed to a failed compile. The CLI maps these to exit code 2.
export class InputError extends Error {}
