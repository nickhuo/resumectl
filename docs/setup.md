# Toolchain setup

Requirements:
- **XeLaTeX.** [TinyTeX-1](https://github.com/rstudio/tinytex-releases#installation) is the recommended lightweight distribution. BasicTeX, TeX Live and MacTeX also work with the required packages installed.
- **Bun ≥ 1.3.** YAML parsing uses Bun’s built-in `Bun.YAML`; no YAML package is required.

After installing TinyTeX-1, add the template dependencies:

```bash
tlmgr update --self
tlmgr install titlesec enumitem pgf tex-gyre
```

TinyTeX-1 already includes `fontspec`, `kvoptions`, `geometry`, `hyperref`, `url` and `tools` (which supplies `tabularx`). `pgf` supplies TikZ, and `tex-gyre` supplies the serif font, loaded by filename from the active TeX distribution. Inter is included in this repository. Neither style requires installing fonts in the operating system.

Verified on macOS arm64 with TinyTeX-1 **v2026.10**: both styles compile through the existing CLI and pass all three quality gates, without loading files from another TeX installation. The TeX directory occupies about **287 MiB** after adding the packages above.

Run `bun run resume doctor` from the repository (or `bunx resumectl doctor` after installation) to inspect Bun, XeLaTeX, TeX dependencies and bundled assets. It reports missing dependencies without installing anything. A passing doctor checks availability; build remains the end-to-end compilation check.
