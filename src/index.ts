export { compile, cleanIntermediates, BuildError, TEMPLATE_DIR, FONT_DIR, type BuildResult, type BuildOptions } from "./rendering/compile.ts";
export { resolveConfig, validateConfig, DEFAULT_CHECKS, DEFAULT_LAYOUT, type ResumeConfig, type ConfigInput, type LayoutOptions, type CheckOptions, type BulletOptions, type SectionOptions, type SectionInput, type ResolvedConfig } from "./project/config.ts";
export {
  runGates,
  checkBullets,
  formatReport,
  parseLogPageCount,
  DEFAULT_GATE_OPTIONS,
  type GateOptions,
  type GateOverrides,
  type GateReport,
  type BulletResult,
  type SectionResult,
} from "./quality/gates.ts";
export { InputError } from "./errors.ts";
export { type RenderedBullet, type BuildManifest } from "./rendering/measurements.ts";
export { countPdfPages } from "./quality/pdf.ts";
export { readClassOptions, extractSectionItems, extractSectionEntries, stripToVisible, resolveInputs, type ClassOptions, type Style } from "./content/tex.ts";

export { typographicWidth } from "./rendering/font-width.ts";
export { initConfig, initProject } from "./project/init.ts";
export { doctor, formatDoctor, type DoctorReport, type Diagnostic } from "./project/doctor.ts";
