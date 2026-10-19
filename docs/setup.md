# Toolchain setup

resumectl needs **Bun ≥ 1.3** and one TeX engine. When both XeLaTeX and Tectonic are installed, it uses XeLaTeX. Set `RESUMECTL_ENGINE=tectonic` or `RESUMECTL_ENGINE=xelatex` to choose one explicitly.

## Tectonic (recommended)

[Tectonic](https://tectonic-typesetting.github.io) is a single 16 MB program built on XeTeX. It downloads only the TeX packages a document needs.

```bash
brew install tectonic                                                       # macOS
curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh  # Linux and others
```

The first build downloads about 45 MB of packages and takes a couple of minutes. `build` says so on stderr. Later builds take seconds and work offline.

Tectonic ships an older LaTeX format (2021). `resume.cls` backports the two newer features it relies on, so both styles render identically to XeLaTeX. The test suite checks this whenever both engines are installed.

## XeLaTeX

Use this if you already have TeX Live or MacTeX, or prefer a full distribution. [TinyTeX-1](https://github.com/rstudio/tinytex-releases#installation) is the lightest option, at about 287 MiB with the packages below:

```bash
tlmgr update --self
tlmgr install titlesec enumitem pgf tex-gyre
```

TinyTeX-1 already includes `fontspec`, `kvoptions`, `geometry`, `hyperref`, `url` and `tools` (which supplies `tabularx`). `pgf` supplies TikZ, and `tex-gyre` supplies the serif font. Inter ships with resumectl. Neither style requires installing fonts in the operating system.

## Check

Run `bunx resumectl doctor` (or `bun run resumectl doctor` in this repository). It reports a missing Bun, TeX engine, TeX package or bundled asset without installing anything. A passing doctor confirms availability; `build` is the end-to-end check.
