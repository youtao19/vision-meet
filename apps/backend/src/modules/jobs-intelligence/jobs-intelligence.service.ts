/**
 * 文件作用：承载岗位智能处理域核心业务逻辑（批处理、画像查询、图谱查询）。
 * 设计边界：service 负责业务编排和容错，具体读写由 repository adapter 完成。
 */

import type {
  CareerGraphSnapshot,
  CanonicalRoleRecord,
  CanonicalRolesListParams,
  CanonicalRolesListResponse,
  CareerPathNode,
  CareerPathV2GraphResponse,
  CareerRouteRecommendation,
  CareerRouteStep,
  JobPipelineMode,
  JobPipelineTaskRecord,
  JobFactsListParams,
  JobFactsListResponse,
  JobFactRecord,
  JobPipelineFailureListResponse,
  JobPipelineRetryProcessResult,
  JobPipelineRetryQueueListResponse,
  ManualJobPortraitRecord,
  PostingProfileFacts,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  CANONICAL_MIN_CONFIDENCE,
  buildCanonicalRoleProfile,
  extractPostingProfileFacts,
  groupPostingFactsByRole,
  isPostingFactEligibleForCanonical,
} from "./jobs-intelligence.profile.js";
import type { JobsIntelligenceGraphRepository } from "./jobs-intelligence.repository.neo4j.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

const PIPELINE_PROGRESS_FLUSH_INTERVAL = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504")
  );
}

function computeBackoffDelay(params: {
  attempt: number;
  baseMs: number;
  maxMs: number;
}): number {
  const exp = params.baseMs * 2 ** Math.max(0, params.attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(params.maxMs, exp + jitter);
}

function scaledMinimum(total: number, ratio: number, floor: number): number {
  return Math.max(floor, Math.ceil(total * ratio));
}

type CareerPathQueryOptions = {
  depth: number;
  relation_type: "promotion" | "transition" | "all";
  min_score: number;
};

function isAuthenticationFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("401 invalid authentication") ||
    (normalized.includes("401") && normalized.includes("authentication")) ||
    normalized.includes("invalid api key") ||
    normalized.includes("unauthorized")
  );
}

function uniqueSkills(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

type CanonicalEligibilityDiagnostics = {
  totalLatestFacts: number;
  eligibleFacts: number;
  rejectedLowConfidence: number;
  rejectedMissingEvidence: number;
  rejectedBoth: number;
};

type CanonicalGroupingDiagnostics = {
  groupCount: number;
  singleSampleGroupCount: number;
  maxGroupSize: number;
  p50GroupSize: number;
  p90GroupSize: number;
  topGroups: Array<{ roleKey: string; sampleSize: number }>;
};

/**
 * 作用：统计 canonical 聚合前的事实漏斗，便于快速定位“为什么画像数量偏少”。
 * 注意：低置信度与无证据是两类可叠加原因，分别统计并额外给出交集数量。
 */
function analyzeCanonicalEligibility(
  factsList: PostingProfileFacts[],
): CanonicalEligibilityDiagnostics {
  let eligibleFacts = 0;
  let rejectedLowConfidence = 0;
  let rejectedMissingEvidence = 0;
  let rejectedBoth = 0;

  for (const item of factsList) {
    const lowConfidence = item.confidence < CANONICAL_MIN_CONFIDENCE;
    const missingEvidence = item.evidence.length === 0;

    if (isPostingFactEligibleForCanonical(item)) {
      eligibleFacts += 1;
      continue;
    }

    if (lowConfidence) {
      rejectedLowConfidence += 1;
    }
    if (missingEvidence) {
      rejectedMissingEvidence += 1;
    }
    if (lowConfidence && missingEvidence) {
      rejectedBoth += 1;
    }
  }

  return {
    totalLatestFacts: factsList.length,
    eligibleFacts,
    rejectedLowConfidence,
    rejectedMissingEvidence,
    rejectedBoth,
  };
}

function pickPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const normalized = Math.min(1, Math.max(0, percentile));
  const index = Math.max(0, Math.ceil(sortedValues.length * normalized) - 1);
  return sortedValues[index] ?? 0;
}

/**
 * 作用：统计 canonical 分组结果分布，用于判断是否被过度归并到少数 role_key。
 */
function analyzeCanonicalGrouping(
  groupedFacts: Map<string, PostingProfileFacts[]>,
): CanonicalGroupingDiagnostics {
  const groups = Array.from(groupedFacts.entries()).map(([roleKey, items]) => ({
    roleKey,
    sampleSize: items.length,
  }));
  const sortedBySample = [...groups].sort((left, right) => right.sampleSize - left.sampleSize);
  const sortedSampleSizes = sortedBySample.map((item) => item.sampleSize).sort((a, b) => a - b);

  return {
    groupCount: groups.length,
    singleSampleGroupCount: groups.filter((item) => item.sampleSize === 1).length,
    maxGroupSize: sortedBySample[0]?.sampleSize ?? 0,
    p50GroupSize: pickPercentile(sortedSampleSizes, 0.5),
    p90GroupSize: pickPercentile(sortedSampleSizes, 0.9),
    topGroups: sortedBySample.slice(0, 10),
  };
}

function findTargetNode(nodes: CareerGraphSnapshot["nodes"], jobId: number): CareerPathNode | null {
  const target = nodes.find((node) => node.job_id === jobId);
  if (!target) {
    return null;
  }

  return {
    id: target.id,
    job_id: target.job_id,
    role_key: target.id,
    title: target.title,
    description: target.summary,
    family: target.family,
    level: target.level,
    aliases: [],
    typical_skills: target.skills,
    category: "target",
    is_target: true,
  };
}

function buildRouteRecommendations(params: {
  targetNodeId: string;
  relationType: "promotion" | "transition";
  edges: CareerPathV2GraphResponse["edges"];
}): CareerRouteRecommendation[] {
  const outgoing = params.edges
    .filter(
      (edge) => edge.source === params.targetNodeId && edge.relation_type === params.relationType,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return outgoing.map((firstEdge) => {
    const follow = params.edges
      .filter(
        (edge) =>
          edge.source === firstEdge.target &&
          edge.relation_type === params.relationType &&
          edge.target !== params.targetNodeId,
      )
      .sort((left, right) => right.score - left.score)[0];

    const pathEdges = follow ? [firstEdge, follow] : [firstEdge];
    const steps: CareerRouteStep[] = [];

    for (const [index, edge] of pathEdges.entries()) {
      if (index === 0) {
        steps.push({
          node_id: edge.source,
          role_key: edge.source,
          title: edge.source,
          relation_type: null,
          reason: null,
          required_skills: [],
          transition_cost: null,
          gap_skills: [],
        });
      }

      steps.push({
        node_id: edge.target,
        role_key: edge.target,
        title: edge.target,
        relation_type: edge.relation_type,
        reason: edge.reason,
        required_skills: edge.required_skills,
        transition_cost: edge.transition_cost,
        gap_skills: edge.gap_skills,
      });
    }

    const missingSkills = uniqueSkills(pathEdges.flatMap((edge) => edge.gap_skills));
    const score = Math.round(
      pathEdges.reduce((sum, edge) => sum + edge.score, 0) / Math.max(pathEdges.length, 1),
    );

    return {
      route_id: pathEdges.map((edge) => edge.id).join("__"),
      route_type: params.relationType,
      title:
        params.relationType === "promotion"
          ? `晋升路径：${pathEdges.map((edge) => `${edge.source} -> ${edge.target}`).join(" -> ")}`
          : `换岗路径：${pathEdges.map((edge) => `${edge.source} -> ${edge.target}`).join(" -> ")}`,
      summary:
        params.relationType === "promotion"
          ? "同岗位族职级递进路径，强调技能加深与复杂度提升。"
          : "跨岗位族可迁移路径，强调可复用技能与补齐差距技能。",
      suitability_score: score,
      missing_skills: missingSkills,
      steps,
    };
  });
}

function computeGraphQuality(snapshot: CareerGraphSnapshot): {
  coveredJobs: number;
  isolatedNodeRatio: number;
} {
  if (snapshot.nodes.length === 0) {
    return { coveredJobs: 0, isolatedNodeRatio: 1 };
  }

  const nodeIds = new Set(snapshot.nodes.map((item) => item.id));
  const activeNodeIds = new Set<string>();
  for (const edge of snapshot.edges) {
    if (nodeIds.has(edge.source)) {
      activeNodeIds.add(edge.source);
    }
    if (nodeIds.has(edge.target)) {
      activeNodeIds.add(edge.target);
    }
  }

  const isolatedNodeCount = snapshot.nodes.length - activeNodeIds.size;
  return {
    coveredJobs: activeNodeIds.size,
    isolatedNodeRatio: Number((isolatedNodeCount / snapshot.nodes.length).toFixed(2)),
  };
}

function normalizeCareerPathQuery(
  optionsOrDepth: CareerPathQueryOptions | number,
): CareerPathQueryOptions {
  if (typeof optionsOrDepth === "number") {
    return {
      depth: optionsOrDepth,
      relation_type: "all",
      min_score: 0,
    };
  }
  return optionsOrDepth;
}

export interface JobsIntelligenceService {
  runPipeline(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  runPipelineNow(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  retryPipelineTask(taskId: number): Promise<JobPipelineTaskRecord>;
  getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord>;
  listPipelineFailures(
    taskId: number,
    params: { offset: number; limit: number },
  ): Promise<JobPipelineFailureListResponse>;
  listPipelineRetryQueue(params: {
    task_id?: number;
    status?: "pending" | "processing" | "done" | "failed";
    offset: number;
    limit: number;
  }): Promise<JobPipelineRetryQueueListResponse>;
  processPipelineRetryQueue(input: { limit: number }): Promise<JobPipelineRetryProcessResult>;
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getJobFact(jobId: number): Promise<JobFactRecord>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord>;
  listManualJobPortraits(): Promise<ManualJobPortraitRecord[]>;
  getCareerPathGraph(jobId: number, options: CareerPathQueryOptions | number): Promise<CareerPathV2GraphResponse>;
}

export function createJobsIntelligenceService(
  repository: JobsIntelligenceRepository,
  graphRepository: JobsIntelligenceGraphRepository,
  env: AppEnv,
): JobsIntelligenceService {
  const runningTaskIds = new Set<number>();

  async function runPipelineTask(
    taskId: number,
    mode: JobPipelineMode,
  ): Promise<JobPipelineTaskRecord> {
    if (runningTaskIds.has(taskId)) {
      const existing = await repository.getPipelineTask(taskId);
      if (!existing) {
        throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
      }
      return existing;
    }
    runningTaskIds.add(taskId);

    try {
      const jobs = await repository.listPipelineJobs(mode);
      console.info(
        `[jobs:pipeline] start task_id=${taskId} mode=${mode} total_jobs=${jobs.length} agent_model=${env.AGENT_MODEL || "unset"}`,
      );
      await repository.updatePipelineTask(taskId, {
        status: "running",
        started_at: new Date().toISOString(),
        total_jobs: jobs.length,
        message: `开始处理 ${jobs.length} 条岗位数据`,
      });

      let processed = 0;
      let failedProfiles = 0;
      let normalizedHintHits = 0;
      let authFailed = false;
      let retryCount = 0;

      const concurrency = Math.max(1, env.JOBS_PIPELINE_CONCURRENCY ?? 3);
      const maxAttempts = Math.max(1, env.JOBS_PIPELINE_RETRY_MAX_ATTEMPTS ?? 3);
      const retryBaseMs = Math.max(100, env.JOBS_PIPELINE_RETRY_BASE_MS ?? 500);
      const retryMaxMs = Math.max(retryBaseMs, env.JOBS_PIPELINE_RETRY_MAX_MS ?? 8000);

      /**
       * 关键逻辑：单条岗位处理，失败时按可重试错误做指数退避重试。
       * 注意：鉴权失败属于硬失败，会立刻中断后续任务领取。
       */
      async function processSingleJob(job: (typeof jobs)[number]): Promise<void> {
        const normalizationHint = {
          normalized_title_hint: job.normalized_title_hint,
          normalized_job_family_hint: job.normalized_job_family_hint,
          normalization_confidence_hint: job.normalization_confidence_hint,
        };
        if (normalizationHint.normalized_job_family_hint) {
          normalizedHintHits += 1;
        }

        let attempt = 1;
        while (attempt <= maxAttempts) {
          try {
            const postingFacts = extractPostingProfileFacts(job, normalizationHint);
            await repository.createJobFacts(postingFacts);
            return;
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);

            if (isAuthenticationFailure(reason)) {
              authFailed = true;
              throw error;
            }

            const canRetry = isRetryableFailure(reason) && attempt < maxAttempts;
            if (!canRetry) {
              throw error;
            }

            retryCount += 1;
            const delay = computeBackoffDelay({
              attempt,
              baseMs: retryBaseMs,
              maxMs: retryMaxMs,
            });
            console.warn(
              `[jobs:pipeline] retry task_id=${taskId} job_id=${job.id} attempt=${attempt}/${maxAttempts} delay_ms=${delay}`,
            );
            await sleep(delay);
            attempt += 1;
          }
        }
      }

      let cursor = 0;

      async function runWorker(): Promise<void> {
        while (true) {
          if (authFailed) {
            return;
          }

          const index = cursor;
          cursor += 1;
          if (index >= jobs.length) {
            return;
          }

          const job = jobs[index];
          try {
            await processSingleJob(job);
          } catch (error) {
            failedProfiles += 1;
            const reason = error instanceof Error ? error.message : String(error);
            const retryable = isRetryableFailure(reason) && !isAuthenticationFailure(reason);
            const attempts = retryable ? maxAttempts : 1;

            if (typeof repository.createPipelineFailure === "function") {
              await repository.createPipelineFailure({
                task_id: taskId,
                job_id: job.id,
                stage: "extract_posting_facts",
                error_code: retryable ? "RETRYABLE_FAILURE" : "NON_RETRYABLE_FAILURE",
                error_message: reason.slice(0, 500),
                attempts,
                retryable,
              });
            }

            if (retryable && typeof repository.enqueuePipelineRetry === "function") {
              const nextRunAt = new Date(Date.now() + retryBaseMs).toISOString();
              await repository.enqueuePipelineRetry({
                task_id: taskId,
                job_id: job.id,
                stage: "extract_posting_facts",
                attempts,
                next_run_at: nextRunAt,
                last_error: reason.slice(0, 500),
              });
            }

            console.error(
              `[jobs:pipeline] job_failed task_id=${taskId} job_id=${job.id} reason=${reason.slice(0, 280)}`,
            );
            if (isAuthenticationFailure(reason)) {
              authFailed = true;
              console.error(
                `[jobs:pipeline] abort task_id=${taskId} reason=authentication_failed job_id=${job.id}`,
              );
            }
          } finally {
            processed += 1;
            if (processed % PIPELINE_PROGRESS_FLUSH_INTERVAL === 0) {
              await repository.updatePipelineTask(taskId, {
                processed_jobs: processed,
                success_profiles: 0,
                failed_profiles: failedProfiles,
                message: `已处理 ${processed}/${jobs.length}（normalized_hint=${normalizedHintHits}, retry=${retryCount}, failed=${failedProfiles}）`,
              });
              console.info(
                `[jobs:pipeline] progress task_id=${taskId} processed=${processed}/${jobs.length} normalized_hint=${normalizedHintHits} retry=${retryCount} failed=${failedProfiles}`,
              );
            }
          }
        }
      }
      const workerCount = Math.min(concurrency, Math.max(1, jobs.length));
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      const latestFacts = await repository.listLatestJobFactsForCanonical();
      const eligibilityDiagnostics = analyzeCanonicalEligibility(latestFacts);
      const groupedFacts = groupPostingFactsByRole(latestFacts);
      const groupingDiagnostics = analyzeCanonicalGrouping(groupedFacts);

      const funnelSummary =
        `latest=${eligibilityDiagnostics.totalLatestFacts}, ` +
        `eligible=${eligibilityDiagnostics.eligibleFacts}, ` +
        `low_conf=${eligibilityDiagnostics.rejectedLowConfidence}, ` +
        `missing_evidence=${eligibilityDiagnostics.rejectedMissingEvidence}, ` +
        `low_conf_and_missing=${eligibilityDiagnostics.rejectedBoth}`;
      const groupingSummary =
        `groups=${groupingDiagnostics.groupCount}, ` +
        `singleton_groups=${groupingDiagnostics.singleSampleGroupCount}, ` +
        `p50=${groupingDiagnostics.p50GroupSize}, ` +
        `p90=${groupingDiagnostics.p90GroupSize}, ` +
        `max=${groupingDiagnostics.maxGroupSize}`;

      console.info(`[jobs:pipeline] canonical_funnel task_id=${taskId} ${funnelSummary}`);
      console.info(`[jobs:pipeline] canonical_groups task_id=${taskId} ${groupingSummary}`);
      if (groupingDiagnostics.topGroups.length > 0) {
        const topGroupsText = groupingDiagnostics.topGroups
          .map((item) => `${item.roleKey}:${item.sampleSize}`)
          .join(", ");
        console.info(`[jobs:pipeline] canonical_top_groups task_id=${taskId} ${topGroupsText}`);
      }

      // 先清理历史残留分组，确保本次 canonical 结果与列表展示严格一致。
      if (typeof repository.deleteCanonicalRolesNotInKeys === "function") {
        await repository.deleteCanonicalRolesNotInKeys(Array.from(groupedFacts.keys()));
      }

      let canonicalRoleCount = 0;
      for (const factsGroup of groupedFacts.values()) {
        if (factsGroup.length === 0) {
          continue;
        }
        await repository.upsertCanonicalRoleProfile(buildCanonicalRoleProfile(factsGroup));
        canonicalRoleCount += 1;
      }

      console.info(`[jobs:pipeline] canonical_roles_upserted=${canonicalRoleCount}`);

      const failureRate = processed > 0 ? failedProfiles / processed : 1;
      const canonicalRoleMin = scaledMinimum(processed, 0.001, 8);
      const maxFailureRate = 0.15;

      const hasEnoughCanonicalRoles = canonicalRoleCount >= canonicalRoleMin;
      const hasHealthyFailureRate = failureRate <= maxFailureRate;

      const hardFailure = authFailed || processed === 0 || failureRate > 0.3;
      const qualityPassed = hasEnoughCanonicalRoles && hasHealthyFailureRate;

      const finalStatus: JobPipelineTaskRecord["status"] = hardFailure
        ? "failed"
        : qualityPassed
          ? "success"
          : "degraded";

      const message =
        finalStatus === "success"
          ? `流水线完成（facts/canonical）：processed=${processed}，eligible=${eligibilityDiagnostics.eligibleFacts}/${eligibilityDiagnostics.totalLatestFacts}，canonical_groups=${canonicalRoleCount}，normalized_hint=${normalizedHintHits}，retry=${retryCount}，failed=${failedProfiles}`
          : finalStatus === "failed"
            ? authFailed
              ? `流水线失败：agent 鉴权失败，已在第 ${processed} 条处中止`
              : `流水线失败：processed=${processed}, failed=${failedProfiles}, failure_rate=${failureRate.toFixed(3)}, eligible=${eligibilityDiagnostics.eligibleFacts}/${eligibilityDiagnostics.totalLatestFacts}`
            : `流水线降级完成：processed=${processed}, retry=${retryCount}, failed=${failedProfiles}, eligible=${eligibilityDiagnostics.eligibleFacts}/${eligibilityDiagnostics.totalLatestFacts}, canonical_roles=${canonicalRoleCount}/${canonicalRoleMin}`;

      const errorMessage =
        finalStatus === "success"
          ? null
          : authFailed
            ? "Agent 模型鉴权失败，请检查 KIMI_API_KEY / KIMICODE_API_KEY 或 provider 配置"
            : finalStatus === "failed"
              ? `流水线硬失败：failure_rate=${failureRate.toFixed(3)}（阈值 0.3）`
              : [
                  !hasEnoughCanonicalRoles
                    ? `标准岗位数量不足（${canonicalRoleCount}/${canonicalRoleMin}；eligible=${eligibilityDiagnostics.eligibleFacts}/${eligibilityDiagnostics.totalLatestFacts}；low_conf=${eligibilityDiagnostics.rejectedLowConfidence}；missing_evidence=${eligibilityDiagnostics.rejectedMissingEvidence}）`
                    : null,
                  !hasHealthyFailureRate
                    ? `失败率偏高（${failureRate.toFixed(3)} > ${maxFailureRate}）`
                    : null,
                ]
                  .filter(Boolean)
                  .join("；");

      console.info(
        `[jobs:pipeline] finish task_id=${taskId} status=${finalStatus} canonical_roles=${canonicalRoleCount}`,
      );

      return repository.updatePipelineTask(taskId, {
        status: finalStatus,
        processed_jobs: processed,
        success_profiles: 0,
        failed_profiles: failedProfiles,
        graph_nodes: 0,
        graph_edges: 0,
        graph_covered_jobs: 0,
        graph_isolated_ratio: 0,
        family_count: canonicalRoleCount,
        message,
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "流水线执行失败";
      return repository.updatePipelineTask(taskId, {
        status: "failed",
        error_message: message,
        finished_at: new Date().toISOString(),
      });
    } finally {
      runningTaskIds.delete(taskId);
    }
  }

  async function runPipeline(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord> {
    const task = await repository.createPipelineTask(input.mode);
    void runPipelineTask(task.id, input.mode);
    return task;
  }

  async function runPipelineNow(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord> {
    const task = await repository.createPipelineTask(input.mode);
    return runPipelineTask(task.id, input.mode);
  }

  /**
   * 作用：基于历史任务模式发起一次受控重跑。
   * 参数：taskId 为历史流水线任务 ID。
   * 返回：新的流水线任务记录（重跑任务）。
   * 注意：重跑不会复用旧任务 ID，避免覆盖历史审计信息。
   */
  async function retryPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
    const existing = await repository.getPipelineTask(taskId);
    if (!existing) {
      throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
    }

    const retryTask = await runPipelineNow({ mode: existing.mode });
    await repository.updatePipelineTask(retryTask.id, {
      message: `重跑来源任务：${taskId}`,
    });
    const latest = await repository.getPipelineTask(retryTask.id);
    return latest ?? retryTask;
  }

  async function getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
    const task = await repository.getPipelineTask(taskId);
    if (!task) {
      throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
    }
    return task;
  }

  async function listPipelineFailures(
    taskId: number,
    params: { offset: number; limit: number },
  ): Promise<JobPipelineFailureListResponse> {
    if (typeof repository.listPipelineFailures !== "function") {
      return { total: 0, items: [] };
    }
    return repository.listPipelineFailures(taskId, params);
  }

  async function listPipelineRetryQueue(params: {
    task_id?: number;
    status?: "pending" | "processing" | "done" | "failed";
    offset: number;
    limit: number;
  }): Promise<JobPipelineRetryQueueListResponse> {
    if (typeof repository.listPipelineRetryQueue !== "function") {
      return {
        total: 0,
        items: [],
        summary: { pending: 0, processing: 0, done: 0, failed: 0, latest_errors: [] },
      };
    }
    return repository.listPipelineRetryQueue(params);
  }

  /**
   * 作用：消费重试队列，将可重试任务从 pending 领取到 processing 并执行一次重放。
   * 参数：limit 为本次最多处理数量。
   * 返回：本次领取、成功、失败、重新排队数量统计。
   */
  async function processPipelineRetryQueue(input: { limit: number }): Promise<JobPipelineRetryProcessResult> {
    if (
      typeof repository.claimPipelineRetryQueue !== "function" ||
      typeof repository.updatePipelineRetryQueueStatus !== "function"
    ) {
      return { claimed: 0, done: 0, failed: 0, rescheduled: 0 };
    }

    const maxAttempts = Math.max(1, env.JOBS_PIPELINE_RETRY_MAX_ATTEMPTS ?? 3);
    const retryBaseMs = Math.max(100, env.JOBS_PIPELINE_RETRY_BASE_MS ?? 500);
    const retryMaxMs = Math.max(retryBaseMs, env.JOBS_PIPELINE_RETRY_MAX_MS ?? 8000);

    const claimedItems = await repository.claimPipelineRetryQueue(input.limit);
    let done = 0;
    let failed = 0;
    let rescheduled = 0;

    for (const item of claimedItems) {
      const job =
        typeof repository.getPipelineJobById === "function"
          ? await repository.getPipelineJobById(item.job_id)
          : null;

      if (!job) {
        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "failed",
          last_error: `JOB_NOT_FOUND:${item.job_id}`,
        });
        failed += 1;
        continue;
      }

      const normalizationHint = {
        normalized_title_hint: job.normalized_title_hint,
        normalized_job_family_hint: job.normalized_job_family_hint,
        normalization_confidence_hint: job.normalization_confidence_hint,
      };

      try {
        const postingFacts = extractPostingProfileFacts(job, normalizationHint);
        await repository.createJobFacts(postingFacts);
        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "done",
          last_error: null,
        });
        done += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const retryable = isRetryableFailure(reason) && !isAuthenticationFailure(reason);
        const nextAttempts = item.attempts + 1;

        if (retryable && nextAttempts <= maxAttempts) {
          const delay = computeBackoffDelay({
            attempt: nextAttempts,
            baseMs: retryBaseMs,
            maxMs: retryMaxMs,
          });
          await repository.updatePipelineRetryQueueStatus({
            id: item.id,
            status: "pending",
            attempts: nextAttempts,
            next_run_at: new Date(Date.now() + delay).toISOString(),
            last_error: reason.slice(0, 500),
          });
          rescheduled += 1;
          continue;
        }

        await repository.updatePipelineRetryQueueStatus({
          id: item.id,
          status: "failed",
          attempts: nextAttempts,
          last_error: reason.slice(0, 500),
        });
        failed += 1;
      }
    }

    return {
      claimed: claimedItems.length,
      done,
      failed,
      rescheduled,
    };
  }

  async function listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse> {
    return repository.listJobFacts(params);
  }

  async function getJobFact(jobId: number): Promise<JobFactRecord> {
    const fact = await repository.getLatestJobFactByJobId(jobId);
    if (!fact) {
      throw new HttpError(404, "JOB_FACT_NOT_FOUND", "目标岗位事实不存在");
    }
    return fact;
  }

  async function listCanonicalRoles(
    params: CanonicalRolesListParams,
  ): Promise<CanonicalRolesListResponse> {
    return repository.listCanonicalRoles(params);
  }

  async function getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord> {
    const role = await repository.getCanonicalRoleByKey(roleKey);
    if (!role) {
      throw new HttpError(404, "CANONICAL_ROLE_NOT_FOUND", "目标标准岗位不存在");
    }
    return role;
  }

  async function listManualJobPortraits(): Promise<ManualJobPortraitRecord[]> {
    if (typeof repository.listManualJobPortraits !== "function") {
      throw new HttpError(501, "MANUAL_JOB_PORTRAITS_UNSUPPORTED", "当前仓储未实现人工岗位画像查询");
    }
    return repository.listManualJobPortraits();
  }

  async function getCareerPathGraph(
    jobId: number,
    optionsOrDepth: CareerPathQueryOptions | number,
  ): Promise<CareerPathV2GraphResponse> {
    const query = normalizeCareerPathQuery(optionsOrDepth);
    const depth = query.depth;
    const snapshot = await graphRepository.getSubgraphByJobId(jobId, depth);
    if (snapshot.nodes.length === 0) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位尚未生成图谱数据");
    }

    const targetNode = findTargetNode(snapshot.nodes, jobId);
    if (!targetNode) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位不在当前图谱节点中");
    }

    const edges: CareerPathV2GraphResponse["edges"] = snapshot.edges
      .filter((edge) => {
        if (query.relation_type !== "all" && edge.relation_type !== query.relation_type) {
          return false;
        }
        return edge.score >= query.min_score;
      })
      .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation_type: edge.relation_type,
      reason: edge.reason,
      required_skills: edge.required_skills,
      gap_skills: edge.gap_skills,
      transition_cost: edge.transition_cost,
      direction_label: edge.direction_label,
      score: edge.score,
    }));

    const promotionRoutes = buildRouteRecommendations({
      targetNodeId: targetNode.id,
      relationType: "promotion",
      edges,
    });
    const transitionRoutes = buildRouteRecommendations({
      targetNodeId: targetNode.id,
      relationType: "transition",
      edges,
    });

    const promotedNodeIds = new Set(
      promotionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );
    const transitionNodeIds = new Set(
      transitionRoutes.flatMap((route) => route.steps.map((step) => step.node_id)),
    );

    const nodes: CareerPathV2GraphResponse["nodes"] = snapshot.nodes.map((node) => ({
      id: node.id,
      job_id: node.job_id,
      role_key: node.id,
      title: node.title,
      description: node.summary,
      family: node.family,
      level: node.level,
      aliases: [],
      typical_skills: node.skills,
      category:
        node.id === targetNode.id
          ? "target"
          : promotedNodeIds.has(node.id)
            ? "promotion"
            : transitionNodeIds.has(node.id)
              ? "transition"
              : "transition",
      is_target: node.id === targetNode.id,
    }));

    const targetJob = (await repository.listJobsByIds([jobId]))[0];
    const promotionEdgeCount = edges.filter((item) => item.relation_type === "promotion").length;
    const transitionEdgeCount = edges.filter((item) => item.relation_type === "transition").length;
    const graphQuality = computeGraphQuality({ ...snapshot, edges });
    return {
      job_id: jobId,
      job_title: targetJob?.title || targetNode.title,
      depth,
      target_node_id: targetNode.id,
      graph_version: snapshot.graph_version,
      graph_generated_at: snapshot.generated_at,
      graph_stats: {
        node_count: snapshot.nodes.length,
        edge_count: edges.length,
        promotion_edge_count: promotionEdgeCount,
        transition_edge_count: transitionEdgeCount,
        isolated_node_count: Math.max(0, snapshot.nodes.length - graphQuality.coveredJobs),
        isolated_node_ratio: graphQuality.isolatedNodeRatio,
      },
      nodes,
      edges,
      promotion_routes: promotionRoutes,
      transition_routes: transitionRoutes,
    };
  }

  return {
    runPipeline,
    runPipelineNow,
    retryPipelineTask,
    getPipelineTask,
    listPipelineFailures,
    listPipelineRetryQueue,
    processPipelineRetryQueue,
    listJobFacts,
    getJobFact,
    listCanonicalRoles,
    getCanonicalRole,
    listManualJobPortraits,
    getCareerPathGraph,
  };
}
