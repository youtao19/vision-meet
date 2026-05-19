/**
 * 文件作用：验证简历生成运行时的本地兜底输出。
 * 职责边界：只覆盖纯函数 HTML 生成规则，不创建真实 Agent 会话，也不依赖外部模型。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalResumeHtml } from "../runtime/ai-resume.runtime.js";

test("buildLocalResumeHtml: Agent 超时时仍应生成可打印简历 HTML", () => {
  const html = buildLocalResumeHtml({
    basic: {
      name: "张三",
      phone: "13800000000",
      email: "zhangsan@example.com",
      target_position: "Java 后端开发实习生",
    },
    summary: "熟悉 Java 与 Spring Boot，有课程项目经验。",
    educations: [
      {
        school: "XXX 大学",
        major: "计算机科学与技术",
        degree: "本科",
        period: "2022.09-2026.06",
      },
    ],
    experiences: [
      {
        organization: "校园招聘系统",
        role: "后端开发",
        period: "2025.03-2025.06",
        responsibilities: "负责用户模块接口开发\n设计岗位匹配数据结构",
        achievements: "完成简历画像与岗位匹配闭环\n支持本地演示部署",
      },
    ],
    skills: "Java\nSpring Boot\nPostgreSQL",
  });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /张三/);
  assert.match(html, /Java 后端开发实习生/);
  assert.match(html, /XXX 大学/);
  assert.match(html, /Spring Boot/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /@media print/);
});
