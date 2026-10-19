% resume.cls — a one-page résumé class with a serif and a sans-serif style.
% Compile with XeLaTeX. MIT License.
%
%   \documentclass{resume}                       % serif (TeX Gyre Termes)
%   \documentclass[style=sans]{resume}           % sans (Inter), upright only
%   \documentclass[style=sans, paper=letter, scale=0.9, tracking=-1]{resume}
%
% Options (key=value):
%   style    = serif | sans       default serif
%   paper    = a4 | letter        default a4
%   scale    = <number>           sans only: font scale vs. the 11pt body, default 0.86
%   tracking = <number>           sans only: letter spacing in % of the em, default -1.5
%   ratio    = <number>           sans only: type-scale ratio between levels, default 1.125
%
% CLI builds apply resolved config after class options and measure actual bullets.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/10/03 v1.0 One-page resume, serif and sans styles]

\RequirePackage{kvoptions}
\SetupKeyvalOptions{family=resume, prefix=resume@}
\DeclareStringOption[serif]{style}
\DeclareStringOption[a4]{paper}
\DeclareStringOption[0.86]{scale}
\DeclareStringOption[-1.5]{tracking}
\DeclareStringOption[1.125]{ratio}
\DeclareStringOption[0.4in]{marginTop}
\DeclareStringOption[0.3in]{marginBottom}
\DeclareStringOption[0.35in]{marginLeft}
\DeclareStringOption[0.35in]{marginRight}
\DeclareStringOption[0.15em]{bulletSpacing}
\DeclareStringOption[1.5pc]{bulletIndent}
\DeclareStringOption[]{sectionBefore}
\DeclareStringOption[]{sectionAfter}
\ProcessKeyvalOptions*
\ifdefined\ResumeConfigOptions
  \edef\resume@applyconfig{\noexpand\setkeys{resume}{\ResumeConfigOptions}}%
  \resume@applyconfig
\fi

\LoadClass[11pt]{article}

\setlength{\parindent}{0pt}
\pagenumbering{gobble}

\RequirePackage[colorlinks=false, hidelinks]{hyperref}
\RequirePackage{url}
\urlstyle{same}
\RequirePackage{tikz}
\RequirePackage{tabularx}

% ---------------------------------------------------------------- fonts
\RequirePackage{fontspec}
% Tectonic ships a 2021 LaTeX format. Backport what newer formats provide:
% \fpeval (kernel since 2022-06), and array's \@finalstrut, which backs up a
% line when a p-cell ends in vertical mode instead of adding an empty one.
\IfFormatAtLeastTF{2022-06-01}{}{%
  \RequirePackage{xfp}%
  \def\@finalstrut#1{%
    \unskip
    \ifhmode\nobreak\else\ifnum\lastnodetype>\m@ne\vskip-\baselineskip\fi\fi
    \vrule\@width\z@\@height\z@\@depth\dp#1}%
}
\def\resume@sans{sans}
\newif\ifresume@sansstyle
\ifx\resume@style\resume@sans\resume@sansstyletrue\fi
\ifx\resume@sectionBefore\@empty
  \ifresume@sansstyle\def\resume@sectionBefore{*2}\else\def\resume@sectionBefore{*1}\fi
\fi
\ifx\resume@sectionAfter\@empty
  \ifresume@sansstyle\def\resume@sectionAfter{*0.8}\else\def\resume@sectionAfter{*1}\fi
\fi
\ifresume@sansstyle
  % Inter at text optical size, cut into static instances because XeTeX
  % ignores variable-font axes. Sans style is upright only: \textit and
  % \emph render in the body face. Weights: body 430 (offsets the thinner
  % strokes from Scale=0.86), bold 600, name 500.
  % Font directory: \ResumeFontDir if defined (`resumectl build` passes an
  % absolute path), else ./fonts/ when compiling next to the class.
  \ifdefined\ResumeFontDir
    \defaultfontfeatures[Inter]{Path=\ResumeFontDir}
  \else
    \defaultfontfeatures[Inter]{Path=fonts/}
  \fi
  \setmainfont{Inter}[
    Extension=.ttf,
    Scale=\resume@scale,
    LetterSpace=\resume@tracking,
    % calt would swap ( ) - + next to capitals and digits for case-sensitive
    % glyphs that have no Unicode mapping: they copy out of the PDF as
    % private-use characters and break ATS parsing of e.g. phone numbers.
    Contextuals=NoAlternate,
    UprightFont=*-430,
    BoldFont=*-600,
    ItalicFont=*-430,
    BoldItalicFont=*-600,
  ]
  % Type scale: size(n) = 10.95pt x ratio^n, rendered at x scale, so n=0 is the body.
  %   n=+5 name · n=+1 organisation · n=0 body, role, dates, contact · n=-1 section label
  % Stroke darkness (size x stem width) then falls monotonically down the levels:
  %   name 500 > organisation 600 > role 600 > section label 600 > body 430.
  \newcommand{\typestep}[1]{%
    \fontsize{\fpeval{round(10.95*(\resume@ratio)^(#1),2)}}%
             {\fpeval{round(10.95*(\resume@ratio)^(#1)*1.2,2)}}\selectfont}
  % Large sizes read heavier, so the name drops to 500; all caps get +2% tracking.
  \newfontfamily\resume@namefont{Inter}[Extension=.ttf, Scale=\resume@scale, LetterSpace=2,
    Contextuals=NoAlternate, UprightFont=*-500, BoldFont=*-500]
  % Small all-caps labels need open tracking (+8%) and SemiBold to hold their level.
  \newfontfamily\resume@labelfont{Inter}[Extension=.ttf, Scale=\resume@scale, LetterSpace=8,
    Contextuals=NoAlternate, UprightFont=*-600, BoldFont=*-600]
  % Tabular figures so the right-hand date column lines up digit for digit.
  \newcommand{\resume@dates}{\normalsize\addfontfeatures{Numbers=Monospaced}}
  % Inter carries U+2197; the arrow sits in the body weight next to a bold name.
  \newcommand{\resume@arrow}{\textmd{↗}}
\else
  % Resolve files from the active TeX distribution, so a host-installed font
  % with the same family name cannot silently supply the serif face.
  \setmainfont{texgyretermes}[
    Extension=.otf,
    UprightFont=*-regular,
    BoldFont=*-bold,
    ItalicFont=*-italic,
    BoldItalicFont=*-bolditalic,
  ]
  \newcommand{\resume@dates}{}
  % Termes has no U+2197, so draw the arrow.
  \newcommand{\resume@arrow}{\tikz[baseline=-0.1ex]\draw[->, line width=0.5pt] (0,0) -- (0.5em,0.5em);}
\fi

% ---------------------------------------------------------------- page
\def\resume@letter{letter}
\ifx\resume@paper\resume@letter
  \PassOptionsToPackage{letterpaper}{geometry}
\else
  \PassOptionsToPackage{a4paper}{geometry}
\fi
\RequirePackage[
  left=\resume@marginLeft,
  right=\resume@marginRight,
  top=\resume@marginTop,
  bottom=\resume@marginBottom,
  nohead
]{geometry}

% ---------------------------------------------------------------- lists
\RequirePackage{enumitem}
\setlist{noitemsep}
\setlist[itemize]{topsep=0.25em, itemsep=\resume@bulletSpacing, leftmargin=\resume@bulletIndent, font=\scriptsize}

% ---------------------------------------------------------------- sections
\RequirePackage{titlesec}
\ifresume@sansstyle
  % Section labels: small letter-spaced caps (step -1); being small, they need
  % more room above to separate sections. Organisations step up to +1.
  \titleformat{\section}{\resume@labelfont\typestep{-1}\raggedright}{}{0em}{}[\titlerule]
  \titleformat{\subsection}{\typestep{1}\raggedright}{}{0em}{}
\else
  \titleformat{\section}{\large\raggedright}{}{0em}{}[\titlerule]
  \titleformat{\subsection}{\large\raggedright}{}{0em}{}
\fi
\titlespacing*{\section}{0cm}{\resume@sectionBefore}{\resume@sectionAfter}
\titlespacing*{\subsection}{0cm}{*1.2}{*0.6}

% ---------------------------------------------------------------- commands
% \name{<NAME>}                         centered header
\newcommand{\name}[1]{%
  \ifresume@sansstyle
    \centerline{\resume@namefont\typestep{5}#1}%
  \else
    \centerline{\huge{#1}}%
  \fi
  \vspace{1.25ex}%
}
% \basicInfo{<contact line>}            centered contact line under the name
\newcommand{\basicInfo}[1]{%
  \ifresume@sansstyle
    \centerline{#1}% supporting information: body size
  \else
    \centerline{\large{#1}}%
  \fi
  \vspace{1.5ex}%
}
% \sep                                  middle dot between contact items
\newcommand{\sep}{\ \textperiodcentered\ }
% \datedsubsection{<left>}{<dates>}     organisation / school row
\newcommand{\datedsubsection}[2]{%
  \subsection[#1]{#1 \hfill {\resume@dates #2}}%
}
% \datedline{<left>}{<right>}           role / location row
\newcommand{\datedline}[2]{%
  {\par #1 \hfill #2 \par}%
}
% \role{<title>}                        job title; italic in serif, upright in sans
\newcommand{\role}[1]{\textbf{\textit{#1}}}
% \projectlink{<url>}{<name>}           bold project name with a clickable ↗
\newcommand{\projectlink}[2]{\textbf{\href{#1}{#2\,\resume@arrow}}}
% plainlist                             label-less list for education details
\newenvironment{plainlist}
  {\begin{itemize}[label={}, labelsep=0pt, leftmargin=0pc]}
  {\end{itemize}}
% Mark one checkable prose paragraph or X-column description. No visual styling.
\NewDocumentCommand\resumeentry{+m}{\par #1\par}

\ifdefined\ResumeMeasure\input{resume-measure.tex}\fi
