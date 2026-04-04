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
  JobProfileV2Record,
  JobProfilesV2ListParams,
  JobProfilesV2ListResponse,
} from "@career/contracts/types";

import type { AppEnv } from "../../shared/config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { buildAutoCareerGraph } from "./jobs-intelligence.graph.js";
import { generateAgentJobProfile } from "./jobs-intelligence.llm.js";
import {
  buildCanonicalRoleProfile,
  extractPostingProfileFacts,
  groupPostingFactsByRole,
} from "./jobs-intelligence.profile.js";
import type { JobsIntelligenceGraphRepository } from "./jobs-intelligence.repository.neo4j.js";
import type { JobsIntelligenceRepository } from "./jobs-intelligence.repository.js";

const PIPELINE_PROGRESS_FLUSH_INTERVAL = 50;

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

export interface JobsIntelligenceService {
  runPipeline(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  runPipelineNow(input: { mode: JobPipelineMode }): Promise<JobPipelineTaskRecord>;
  getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord>;
  listJobProfiles(params: JobProfilesV2ListParams): Promise<JobProfilesV2ListResponse>;
  listJobFacts(params: JobFactsListParams): Promise<JobFactsListResponse>;
  getJobFact(jobId: number): Promise<JobFactRecord>;
  listCanonicalRoles(params: CanonicalRolesListParams): Promise<CanonicalRolesListResponse>;
  getCanonicalRole(roleKey: string): Promise<CanonicalRoleRecord>;
  getJobProfile(jobId: number): Promise<JobProfileV2Record>;
  getCareerPathGraph(jobId: number, depth: number): Promise<CareerPathV2GraphResponse>;
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
      let successProfiles = 0;
      let failedProfiles = 0;
      let agentProfiles = 0;
      let normalizedHintHits = 0;
      let authFailed = false;

      for (const job of jobs) {
        if (authFailed) {
          break;
        }

        try {
          const latest = await repository.getLatestProfileByJobId(job.id);
          const version = latest ? latest.profile_version + 1 : 1;
          const normalizationHint = {
            normalized_title_hint: job.normalized_title_hint,
            normalized_job_family_hint: job.normalized_job_family_hint,
            normalization_confidence_hint: job.normalization_confidence_hint,
          };
          if (normalizationHint.normalized_job_family_hint) {
            normalizedHintHits += 1;
          }

          const postingFacts = extractPostingProfileFacts(job, normalizationHint);
          await repository.createJobFacts(postingFacts);

          const draft = await generateAgentJobProfile(job, env, normalizationHint);

          await repository.createJobProfile({
            ...draft,
            profile_version: version,
          });

          agentProfiles += 1;
          successProfiles += 1;
        } catch (error) {
          failedProfiles += 1;
          const reason = error instanceof Error ? error.message : String(error);
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
              success_profiles: successProfiles,
              failed_profiles: failedProfiles,
              message: `已处理 ${processed}/${jobs.length}（agent_success=${agentProfiles}, normalized_hint=${normalizedHintHits}, failed=${failedProfiles}）`,
            });
            console.info(
              `[jobs:pipeline] progress task_id=${taskId} processed=${processed}/${jobs.length} agent_success=${agentProfiles} normalized_hint=${normalizedHintHits} failed=${failedProfiles}`,
            );
          }
        }
      }

      const latestFacts = await repository.listLatestJobFactsForCanonical();
      const groupedFacts = groupPostingFactsByRole(latestFacts);
      let canonicalRoleCount = 0;
      for (const factsGroup of groupedFacts.values()) {
        if (factsGroup.length === 0) {
          continue;
        }
        await repository.upsertCanonicalRoleProfile(buildCanonicalRoleProfile(factsGroup));
        canonicalRoleCount += 1;
      }

      console.info(`[jobs:pipeline] canonical_roles_upserted=${canonicalRoleCount}`);

      const latestProfiles = await repository.listLatestProfilesForGraph();
      const jobRecords = await repository.listJobsByIds(latestProfiles.map((item) => item.job_id));
      const jobTitleById = new Map(jobRecords.map((item) => [item.id, item.title]));
      const graphDraft = buildAutoCareerGraph(latestProfiles, jobTitleById);
      const graphSyncResult = await graphRepository.syncGraph(graphDraft);
      const familyCount = new Set(latestProfiles.map((item) => item.job_family)).size;
      const hasAgentFailure = failedProfiles > 0;
      const hasEnoughFamilies = familyCount >= 10;
      const hasEnoughCanonicalRoles = canonicalRoleCount >= 10;
      const isSucceeded = hasEnoughFamilies && hasEnoughCanonicalRoles && !hasAgentFailure;
      const message = isSucceeded
        ? `流水线完成：画像 ${successProfiles} 条（agent_success=${agentProfiles}, normalized_hint=${normalizedHintHits}, failed=${failedProfiles}），标准岗位 ${canonicalRoleCount} 个，图谱节点 ${graphSyncResult.nodes_upserted} 个`
        : authFailed
          ? `流水线失败：agent 鉴权失败，已在第 ${processed} 条处中止`
          : `流水线失败：agent_success=${agentProfiles}, normalized_hint=${normalizedHintHits}, failed=${failedProfiles}, family_count=${familyCount}, canonical_roles=${canonicalRoleCount}`;
      const errorMessage = authFailed
        ? "Agent 模型鉴权失败，请检查 KIMI_API_KEY / KIMICODE_API_KEY 或 provider 配置"
        : hasAgentFailure
          ? `存在 ${failedProfiles} 条岗位画像 Agent 生成失败`
          : hasEnoughFamilies
            ? hasEnoughCanonicalRoles
              ? null
              : "标准岗位数量不足 10"
            : "有效岗位族数量不足 10";

      console.info(
        `[jobs:pipeline] finish task_id=${taskId} status=${isSucceeded ? "succeeded" : "failed"} family_count=${familyCount} graph_nodes=${graphSyncResult.nodes_upserted} graph_edges=${graphSyncResult.edges_upserted}`,
      );

      return repository.updatePipelineTask(taskId, {
        status: isSucceeded ? "succeeded" : "failed",
        processed_jobs: processed,
        success_profiles: successProfiles,
        failed_profiles: failedProfiles,
        graph_nodes: graphSyncResult.nodes_upserted,
        graph_edges: graphSyncResult.edges_upserted,
        family_count: familyCount,
        message,
        error_message: isSucceeded ? null : errorMessage,
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

  async function getPipelineTask(taskId: number): Promise<JobPipelineTaskRecord> {
    const task = await repository.getPipelineTask(taskId);
    if (!task) {
      throw new HttpError(404, "PIPELINE_TASK_NOT_FOUND", "流水线任务不存在");
    }
    return task;
  }

  async function listJobProfiles(
    params: JobProfilesV2ListParams,
  ): Promise<JobProfilesV2ListResponse> {
    return repository.listLatestProfiles(params);
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

  async function getJobProfile(jobId: number): Promise<JobProfileV2Record> {
    const profile = await repository.getLatestProfileByJobId(jobId);
    if (!profile) {
      throw new HttpError(404, "JOB_PROFILE_NOT_FOUND", "目标岗位画像不存在");
    }
    return profile;
  }

  async function getCareerPathGraph(
    jobId: number,
    depth: number,
  ): Promise<CareerPathV2GraphResponse> {
    const snapshot = await graphRepository.getSubgraphByJobId(jobId, depth);
    if (snapshot.nodes.length === 0) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位尚未生成图谱数据");
    }

    const targetNode = findTargetNode(snapshot.nodes, jobId);
    if (!targetNode) {
      throw new HttpError(404, "CAREER_PATH_NOT_FOUND", "目标岗位不在当前图谱节点中");
    }

    const edges: CareerPathV2GraphResponse["edges"] = snapshot.edges.map((edge) => ({
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
    return {
      job_id: jobId,
      job_title: targetJob?.title || targetNode.title,
      depth,
      target_node_id: targetNode.id,
      nodes,
      edges,
      promotion_routes: promotionRoutes,
      transition_routes: transitionRoutes,
    };
  }

  return {
    runPipeline,
    runPipelineNow,
    getPipelineTask,
    listJobProfiles,
    listJobFacts,
    getJobFact,
    listCanonicalRoles,
    getCanonicalRole,
    getJobProfile,
    getCareerPathGraph,
  };
}
