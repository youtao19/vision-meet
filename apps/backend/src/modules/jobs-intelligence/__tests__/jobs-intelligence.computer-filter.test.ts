/**
 * 文件作用：验证岗位清洗阶段的计算机相关岗位过滤规则。
 * 职责边界：只测试纯函数，不依赖数据库、Agent 或外部服务。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isComputerRelatedCleanedJob } from "../jobs-intelligence.computer-filter.js";

function buildCleanedJob(input: {
  title: string;
  normalizedTitle?: string;
  jobFamily?: string;
  industry?: string | null;
  cleanedText?: string;
  keywords?: string[];
}) {
  return {
    title: input.title,
    normalized_title: input.normalizedTitle ?? input.title,
    job_family: input.jobFamily ?? "other",
    industry: input.industry ?? null,
    cleaned_text: input.cleanedText ?? "",
    keywords: input.keywords ?? [],
  };
}

test("isComputerRelatedCleanedJob: 明确技术岗位应保留", () => {
  const result = isComputerRelatedCleanedJob(
    buildCleanedJob({
      title: "Java后端开发工程师",
      jobFamily: "backend_engineering",
      industry: "计算机软件",
      cleanedText: "负责后端服务开发，熟悉 Java、Spring、MySQL、Redis。",
      keywords: ["java", "spring", "mysql"],
    }),
  );

  assert.equal(result, true);
});

test("isComputerRelatedCleanedJob: 互联网行业里的非技术岗位不应仅凭行业保留", () => {
  const result = isComputerRelatedCleanedJob(
    buildCleanedJob({
      title: "网络销售",
      jobFamily: "other",
      industry: "互联网",
      cleanedText: "负责客户开发、电话沟通、商务谈判和销售回款。",
      keywords: ["客户", "销售", "商务"],
    }),
  );

  assert.equal(result, false);
});

test("isComputerRelatedCleanedJob: 客户开发类销售岗位不应被开发关键词误保留", () => {
  const result = isComputerRelatedCleanedJob(
    buildCleanedJob({
      title: "客户开发销售",
      jobFamily: "other",
      industry: "互联网",
      cleanedText: "负责客户开发、渠道维护、销售转化和商务回款。",
      keywords: ["客户开发", "销售", "渠道"],
    }),
  );

  assert.equal(result, false);
});

test("isComputerRelatedCleanedJob: 标题不明显但 JD 有足够技术证据时应保留", () => {
  const result = isComputerRelatedCleanedJob(
    buildCleanedJob({
      title: "实施工程师",
      jobFamily: "implementation",
      industry: "信息技术服务",
      cleanedText: "负责客户系统部署，要求熟悉 Linux、数据库、SQL、Docker 和接口联调。",
      keywords: ["linux", "sql", "docker"],
    }),
  );

  assert.equal(result, true);
});
