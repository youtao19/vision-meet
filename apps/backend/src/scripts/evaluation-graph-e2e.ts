/**
 * 文件作用：评测图谱链路质量（覆盖率、断链率、边类型分布）并输出 JSON/Markdown 报告。
 * 职责边界：仅做离线统计与报告生成，不修改业务数据。
 */

import fs from "node:fs";
import path from "node:path";

import { createNeo4jCareerGraphRepository } from "../modules/career-graph/career-graph.repository.neo4j.js";
import { appEnv } from "../shared/config/env.js";
import { createAppPgPool } from "../shared/db/postgres.js";
import { resolveRepositoryRoot } from "../shared/utils/repository-root.js";

type CliOptions = {
  sampleSize: number;
  depth: number;
};

type SampleJobRow = {
  portrait_id: number;
  title: string;
};

type PerJobResult = {
  portrait_id: number;
  title: string;
  node_count: number;
  edge_count: number;
  promotion_edge_count: number;
  transition_edge_count: number;
  isolated_node_ratio: number;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const pickArg = (name: string): string | null => {
    const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
    if (prefixed) {
      return prefixed.slice(name.length + 1).trim();
    }
    const index = args.findIndex((arg) => arg === name);
    if (index >= 0 && args[index + 1]) {
      return String(args[index + 1]).trim();
    }
    return null;
  };

  const sampleSize = Number(pickArg("--sample-size") || "30");
  const depth = Number(pickArg("--depth") || "2");
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) {
    throw new Error("--sample-size 必须是正整数");
  }
  if (!Number.isFinite(depth) || depth < 1 || depth > 3) {
    throw new Error("--depth 必须在 1-3 之间");
  }

  return {
    sampleSize: Math.floor(sampleSize),
    depth: Math.floor(depth),
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function buildMarkdown(params: {
  generatedAt: string;
  sampleSize: number;
  depth: number;
  sampledTotal: number;
  coveredJobs: number;
  coverageRate: number;
  avgIsolatedRatio: number;
  avgEdges: number;
  avgPromotionEdges: number;
  avgTransitionEdges: number;
  lowQualityJobs: PerJobResult[];
}): string {
  const lines: string[] = [];
  lines.push("# 图谱端到端质量评测报告");
  lines.push("");
  lines.push(`生成时间：${params.generatedAt}`);
  lines.push("");
  lines.push("## 1. 样本信息");
  lines.push("");
  lines.push(`- 抽样目标：${params.sampleSize}`);
  lines.push(`- 实际样本：${params.sampledTotal}`);
  lines.push(`- 查询深度：${params.depth}`);
  lines.push("");
  lines.push("## 2. 指标结果");
  lines.push("");
  lines.push(`- 路径覆盖岗位数：${params.coveredJobs}`);
  lines.push(`- 覆盖率：${params.coverageRate}`);
  lines.push(`- 平均边数：${params.avgEdges}`);
  lines.push(`- 平均晋升边数：${params.avgPromotionEdges}`);
  lines.push(`- 平均换岗边数：${params.avgTransitionEdges}`);
  lines.push(`- 平均孤立节点比例：${params.avgIsolatedRatio}`);
  lines.push("");
  lines.push("## 3. 低质量样本（边数=0 或 孤立率>0.7）");
  lines.push("");

  if (params.lowQualityJobs.length === 0) {
    lines.push("- 无");
  } else {
    for (const item of params.lowQualityJobs.slice(0, 20)) {
      lines.push(
        `- portrait_id=${item.portrait_id} / 岗位=${item.title} / nodes=${item.node_count} / edges=${item.edge_count} / isolated_ratio=${item.isolated_node_ratio}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const repoRoot = resolveRepositoryRoot();
  const outputDir = path.resolve(repoRoot, "data/evaluation/graph");
  const reportFile = path.resolve(repoRoot, "docs/评测结果-图谱端到端质量.md");

  const pool = createAppPgPool({
    host: appEnv.PGHOST,
    port: appEnv.PGPORT,
    database: appEnv.PGDATABASE,
    user: appEnv.PGUSER,
    password: appEnv.PGPASSWORD,
  });
  const graphRepository = createNeo4jCareerGraphRepository({
    uri: appEnv.NEO4J_URI,
    username: appEnv.NEO4J_USERNAME,
    password: appEnv.NEO4J_PASSWORD,
  });

  try {
    const sampledJobs = await pool.query<SampleJobRow>(
      `
        SELECT id AS portrait_id, job_name AS title
        FROM v2_manual_job_portraits
        ORDER BY id DESC
        LIMIT $1
      `,
      [options.sampleSize],
    );

    const results: PerJobResult[] = [];
    for (const row of sampledJobs.rows) {
      const snapshot = await graphRepository.getSubgraphByPortraitId(row.portrait_id, options.depth);
      const isolatedNodes = snapshot.nodes.filter((node) => {
        const hasAnyEdge = snapshot.edges.some(
          (edge) => edge.source === node.id || edge.target === node.id,
        );
        return !hasAnyEdge;
      }).length;

      results.push({
        portrait_id: row.portrait_id,
        title: row.title,
        node_count: snapshot.nodes.length,
        edge_count: snapshot.edges.length,
        promotion_edge_count: snapshot.edges.filter((item) => item.relation_type === "promotion")
          .length,
        transition_edge_count: snapshot.edges.filter((item) => item.relation_type === "transition")
          .length,
        isolated_node_ratio: ratio(isolatedNodes, snapshot.nodes.length),
      });
    }

    const coveredJobs = results.filter((item) => item.edge_count > 0).length;
    const coverageRate = ratio(coveredJobs, results.length);
    const avgEdges = ratio(
      results.reduce((sum, item) => sum + item.edge_count, 0),
      results.length,
    );
    const avgPromotionEdges = ratio(
      results.reduce((sum, item) => sum + item.promotion_edge_count, 0),
      results.length,
    );
    const avgTransitionEdges = ratio(
      results.reduce((sum, item) => sum + item.transition_edge_count, 0),
      results.length,
    );
    const avgIsolatedRatio = ratio(
      results.reduce((sum, item) => sum + item.isolated_node_ratio, 0),
      results.length,
    );

    const generatedAt = new Date().toISOString();
    const payload = {
      generated_at: generatedAt,
      sample_size: options.sampleSize,
      depth: options.depth,
      sampled_total: results.length,
      covered_jobs: coveredJobs,
      coverage_rate: coverageRate,
      avg_edges: avgEdges,
      avg_promotion_edges: avgPromotionEdges,
      avg_transition_edges: avgTransitionEdges,
      avg_isolated_ratio: avgIsolatedRatio,
      items: results,
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const timestamp = generatedAt.replace(/[.:]/g, "-");
    const outputFile = path.resolve(outputDir, `graph-e2e-${timestamp}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), "utf-8");
    fs.writeFileSync(
      path.resolve(outputDir, "latest.json"),
      JSON.stringify(payload, null, 2),
      "utf-8",
    );

    const lowQualityJobs = results.filter(
      (item) => item.edge_count === 0 || item.isolated_node_ratio > 0.7,
    );
    const markdown = buildMarkdown({
      generatedAt,
      sampleSize: options.sampleSize,
      depth: options.depth,
      sampledTotal: results.length,
      coveredJobs,
      coverageRate,
      avgIsolatedRatio,
      avgEdges,
      avgPromotionEdges,
      avgTransitionEdges,
      lowQualityJobs,
    });
    fs.writeFileSync(reportFile, markdown, "utf-8");

    // eslint-disable-next-line no-console
    console.log(
      `[evaluation:graph:e2e] sampled=${results.length} covered=${coveredJobs} coverage_rate=${coverageRate} report=${reportFile}`,
    );
  } finally {
    await graphRepository.close();
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[evaluation:graph:e2e] failed", error);
  process.exitCode = 1;
});
