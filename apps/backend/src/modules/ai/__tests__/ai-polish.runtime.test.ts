/**
 * 文件作用：验证 AI 润色运行时的输出清洗规则。
 * 职责边界：仅覆盖纯文本归一化逻辑，不创建真实 Agent 会话，也不依赖外部模型。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePolishedText } from "../runtime/ai-polish.runtime.js";

test("sanitizePolishedText: 应移除“以下是润色后的文本”前缀", () => {
  const result = sanitizePolishedText(
    ["以下是润色后的文本：", "", "---", "报告摘要", "学生当前具备基础匹配条件。"].join("\n"),
    "原文",
  );

  assert.equal(result, "报告摘要\n学生当前具备基础匹配条件。");
});

test("sanitizePolishedText: 应移除模型自述式润色说明", () => {
  const result = sanitizePolishedText(
    ["我来润色这段短期行动计划，使其更加专业清晰：", "短期内建议补齐 Java 项目经验。"].join("\n"),
    "原文",
  );

  assert.equal(result, "短期内建议补齐 Java 项目经验。");
});

test("sanitizePolishedText: 应清理包裹正文的 Markdown 代码块", () => {
  const result = sanitizePolishedText(
    [
      "以下为优化后的文本：",
      "```markdown",
      "## 能力差距",
      "建议优先补齐 Spring Boot 实战经验。",
      "```",
    ].join("\n"),
    "原文",
  );

  assert.equal(result, "## 能力差距\n建议优先补齐 Spring Boot 实战经验。");
});

test("sanitizePolishedText: 清洗后为空时应回退原文", () => {
  const result = sanitizePolishedText("以下是润色后的文本：", "保留原始报告内容");

  assert.equal(result, "保留原始报告内容");
});

test("sanitizePolishedText: 应保留正文 Markdown 并清理尾部追问", () => {
  const result = sanitizePolishedText(
    [
      "## 短期行动计划",
      "",
      "1. **完善基础信息**：补齐教育背景与相关证书信息，确保简历信息完整、专业。",
      "2. **补充实习经历**：新增 1 段可量化的实习经历，突出实际成果与岗位匹配度。",
      "3. **强化核心技能**：围绕目标岗位需求，补充 2-3 个核心技能项目，体现专业能力与竞争优势。",
      "",
      "---",
      "",
      "如需调整风格（更正式/更活泼）或补充具体岗位方向，可以告诉我。",
    ].join("\n"),
    "原文",
    "短期行动计划",
  );

  assert.equal(
    result,
    [
      "## 短期行动计划",
      "",
      "1. **完善基础信息**：补齐教育背景与相关证书信息，确保简历信息完整、专业。",
      "2. **补充实习经历**：新增 1 段可量化的实习经历，突出实际成果与岗位匹配度。",
      "3. **强化核心技能**：围绕目标岗位需求，补充 2-3 个核心技能项目，体现专业能力与竞争优势。",
    ].join("\n"),
  );
});

test("sanitizePolishedText: 应移除无需调用工具和润色后文本提示", () => {
  const result = sanitizePolishedText(
    [
      "无需调用任何工具，直接为您润色：",
      "",
      "润色后文本：",
      "",
      "未来 1-2 个阶段，建议持续聚焦职业技能与基础要求，构建长期积累。",
    ].join("\n"),
    "原文",
  );

  assert.equal(result, "未来 1-2 个阶段，建议持续聚焦职业技能与基础要求，构建长期积累。");
});
