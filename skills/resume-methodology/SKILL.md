---
name: resume-methodology
description: Write, rewrite, tailor, score, or review résumé/CV bullets, summaries, sections, or a complete résumé against a target role or job description. Use with ResumeMode to turn verified career evidence into concise LaTeX content and validate the rendered PDF.
---

# Resume Methodology — 光叔 / 课代表立正沉淀版

## 来源与适配

从本地 Career 项目的 `.agents/skills/resume-methodology/SKILL.md` 迁入并适配。
原方法整理自《看了才知道，简历竟然应该这么改？》：

- 原视频：https://www.youtube.com/watch?v=4eYzTGxZazw
- 原 skill 使用的镜像摘要：https://lz.stevew.blog/article/resume-improvement-guide

原 skill 说明视频未开放字幕；这是方法提炼，不是逐字转录。本版沿用其目标岗位分析、证据筛选、bullet 结构、summary 叙事与评分方法，去掉个人履历、旧项目路径和固定字符数门槛，使用 ResumeMode 的实际排版测量。原文件保留在本地 Career 项目中。

## 输入与事实边界

先取得目标岗位/JD、候选人的经历材料，以及要修改的 `.tex` 路径。已有信息直接使用；缺少 JD 时可做通用审阅，但明确尚未针对岗位定制。

- 经历、雇主、职责、所有权、技术栈和指标必须能追溯到用户材料。
- 用户未提供的指标不要猜。优先使用真实的规模或可观察结果；关键事实缺失时向用户询问。
- `[N endpoints]`、`[latency %]` 等占位符只能用于待确认草稿，最终简历必须替换或删除。
- 本 skill 中的示例仅展示表达结构，不能当作候选人的事实。
- 以用户指定的 `.tex` 及其 `\input` 文件为内容来源，避免维护第二份不同步的 Markdown 简历。

## 写作流程

### 1. 提取岗位要求

把 JD 整理成四类，并为每项要求找到候选人的对应证据：

| 类别 | 提取内容 |
|---|---|
| 必备能力 | 技术栈、系统能力、领域知识 |
| 业务问题 | 成本、可靠性、延迟、自动化、用户体验 |
| 证明要求 | 上线、规模、个人所有权、客户影响 |
| 面试切入点 | 能解释设计选择、权衡和结果的项目 |

记录 `JD 要求 → 已有证据 → 缺口`。无证据的要求保留为缺口，不写成已有能力。

### 2. 选择证据

以“这条内容是否帮助招聘方在 30 秒内判断岗位匹配”为标准：

- 把最相关、最能证明贡献的成果放在前面。
- 删除只描述参与、职责或工具清单的句子；有成果的改为成果。
- 两条证明同一能力时保留更强的一条。
- 课程和普通项目只在补足目标岗位证据时保留。
- 不为了凑满一页加入低价值内容。

按岗位选择叙事角度，不改变事实：AI Engineer 强调 agents、RAG、evals 与生产可靠性；SWE 强调后端、系统设计、性能与工程质量；Data 强调管道、实验、数据质量与决策影响。

### 3. 写成可验证的 bullet

默认结构：**动作 + 技术机制 + 结果 + 业务/用户影响**。也可将 STAR 压缩为背景、行动、结果。

- 用具体动作动词开头：Built、Designed、Shipped、Optimized、Automated、Reduced、Migrated、Instrumented。
- 已完成的成果使用过去时，明确个人贡献；团队结果不能暗示全部由个人完成。
- 避免 Responsible for、Participated in、Helped、Worked on 等仅表示职责的开头。
- 使用与 JD 一致且真实的技术词；自然时放在前五个词中，不堆砌关键词。
- 描述技术选择或机制，而不只列工具名称。
- 用真实指标、规模或可观察结果支撑影响；没有数字不等于必须编一个数字。

表达结构示例（数字仅为示例）：

> Built REST API caching across 12 endpoints, reducing p95 latency 38% and improving checkout reliability.

压缩顺序：保留动作、机制、结果 → 删除空泛形容词和重复背景 → 使用清晰的技术简称 → 只保留一个影响分句。只有确实证明不同能力时才拆成两条。

**排版目标是实际渲染后的 1–2 行，且末行足够饱满。** 不使用字符数或 Times 字宽估算替代 PDF 测量。共享默认是最多 2 行、末行至少 80%；具体阈值以有效配置为准。不要为了凑满末行加入无证据的范围、指标或空话。

### 4. 写岗位对应的 summary

用户需要 summary 时，按 **Identity → Proof → Target/Vision** 写：

1. 我是谁：与 JD 对应的角色定位。
2. 做过什么：最相关的一项成果或证据。
3. 要继续做什么：与岗位业务目标对应的方向。

模板：`[Role identity] with [relevant strengths]; shipped [verified proof]; focused on [JD-aligned goal].`

用 1–2 句，删除 passionate、fast learner、results-driven 等泛化标签。summary 需要提供正文之外的定位价值；没有这种价值时可以建议省略。用户明确要求字符数时才按字符数检查；否则由 SUMMARY 的行数与末行阈值、整页预算判断。不要把固定字符数等同于固定行数。

### 5. 审阅与反馈

逐条按以下维度打 0–2 分：

| 维度 | 0 | 1 | 2 |
|---|---|---|---|
| 岗位相关性 | 泛化 | 部分相关 | 直接对应 JD |
| 所有权 | 不清楚 | 部分明确 | 个人行动明确 |
| 技术机制 | 无 | 只有工具名 | 解释设计或实现 |
| 结果证据 | 无 | 模糊 | 数字或可观察结果 |
| 影响 | 无 | 隐含 | 用户/业务/团队收益清楚 |

8–10 分优先保留；7 分检查最弱维度；低于 7 分优先改写或删除。评分只帮助筛选，不能替代事实核验或渲染检查。

## ResumeMode 工作流

在此仓库中使用 `bun run resume`；安装包后使用 `bunx resume-mode`。下面的命令从仓库根目录执行，替换为实际源文件路径。

```bash
bun run resume doctor
bun run resume config show path/to/resume.tex --json
bun run resume build path/to/resume.tex --json
bun run resume check path/to/resume.tex --json
```

新项目先运行 `bun run resume init path/to/new-resume --style sans`，再替换占位内容。`init` 不覆盖已有简历或配置。

修改前读取 `config show`：

- `sections.<title>.editable: true`：可以改写正文，但必须保留事实。
- `false` 或未配置：没有来自配置的修改授权；只有用户明确授权时才能改写。
- `checks: false` 只关闭该节长度检查，不等于授予修改权限。
- 不为让检查通过而擅自降低阈值、改小字体或改页数预算。

列表条目自动测量；独立段落和 `tabularx` 的 X 列描述用 `\resumeentry{...}` 包裹。不要重复包裹 `\item`，也不要嵌套列表/条目。

每次内容或布局修改后重新 `build`，并根据失败条目的 `section`、`index`、`lines`、`lastLineFill`、`status` 修订：

1. 行数过多：按压缩顺序删冗余，保留最有力证据。
2. 末行过空：先尝试压成一行；也可补入已有材料中的机制或结果，不能添加虚构内容。
3. 溢出或超页：缩减低价值内容，检查长链接、不可断行文本和表格；不能靠压缩到难以阅读来通过。
4. 私用字符映射：检查字体或模板，不能忽略文本复制问题。
5. 测量缺失/哈希不符：重新构建，不手改 `.resume-mode.json`。

三项质量门必须全部通过：真实渲染的内容长度与溢出、页数、PDF 私用字符映射。`check` 使用现有 PDF 及同名 `.resume-mode.json`；内容或布局变了就必须重建。仅改检查阈值可以直接重查。

## 交付检查

- 岗位重点有真实证据支持，未确认事实已明确列出。
- 每条 bullet 有动作、机制和结果，强证据出现在前面。
- 日期、职位、学校等事实没有被为了排版擅自修改。
- 最终文件中没有草稿占位符。
- 新构建返回 exit 0，三个 gate 均为 PASS；记录 PDF 路径和验证结果。
- 实际查看 PDF，确认层级、间距、阅读顺序和 1–2 行 bullet 的末行饱满度；没有查看时明确说明尚未做视觉检查。
- 向用户交付主要改动、事实缺口和生成文件；不把质量门通过当作 ATS 一定录用或完整兼容的保证。
