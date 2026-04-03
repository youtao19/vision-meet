/**
 * 文件作用：封装岗位图谱查询、规范岗位归一和个性化路径推荐逻辑。
 * 依赖边界：service 负责业务解释、个性化差距和推荐排序，底层图数据读写通过 repository 抽象完成。
 */

import type {
  CareerPathEdge,
  CareerPathGraphResponse,
  CareerPathNode,
  CareerRouteRecommendation,
  CareerRouteStep,
  CareerPathTransitionCost,
  StudentProfileRecord,
} from "@career/contracts/types";

import type { JobsRepository } from "../jobs/jobs.repository.js";
import type { ProfileRepository } from "../profile/profile.repository.js";
import {
  isNeo4jUnavailableError,
} from "../../shared/db/neo4j.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type {
  CareerPathGraphSnapshot,
  CareerPathRepository,
} from "./career-path.repository.js";
import {
  CANONICAL_CAREER_EDGES,
  CANONICAL_CAREER_ROLES,
  getCanonicalCareerRole,
  getOutgoingCareerEdges,
  resolveCanonicalCareerRoleByTitle,
  type CanonicalCareerEdge,
  type CanonicalCareerRole,
} from "./career-path.seed.js";

const MAX_ROUTE_COUNT = 3;
const TRANSITION_COST_PENALTY: Record<CareerPathTransitionCost, number> = {
  low: 10,
  medium: 20,
  high: 32,
};

export type GetCareerPathGraphInput = {
  job_id: number;
  student_profile_id?: number;
  depth?: number;
};

export interface CareerPathService {
  getCareerPathGraph(input: GetCareerPathGraphInput): Promise<CareerPathGraphResponse>;
  syncSeedGraph(): Promise<{ nodes_upserted: number; edges_upserted: number }>;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSkillSet(profile?: StudentProfileRecord | null): Set<string> {
  if (!profile) {
    return new Set();
  }

  return new Set(profile.skills.map((skill) => skill.trim().toLowerCase()));
}

function resolveMissingSkills(requiredSkills: string[], skillSet: Set<string>): string[] {
  return requiredSkills.filter((skill) => !skillSet.has(skill.trim().toLowerCase()));
}

function getRouteTitle(routeType: "promotion" | "transition", steps: CareerRouteStep[]): string {
  const titles = steps.map((step) => step.title);
  return routeType === "promotion"
    ? `晋升路径：${titles.join(" -> ")}`
    : `转岗路径：${titles.join(" -> ")}`;
}

function getRouteSummary(routeType: "promotion" | "transition", steps: CareerRouteStep[]): string {
  const lastStep = steps[steps.length - 1];
  const missingSkills = Array.from(new Set(steps.flatMap((step) => step.gap_skills)));
  const missingSkillText =
    missingSkills.length > 0 ? `当前仍需重点补齐：${missingSkills.join("、")}。` : "当前技能结构已具备较好迁移基础。";

  return routeType === "promotion"
    ? `建议以【${lastStep.title}】作为下一阶段目标岗位，沿当前技术主线持续进阶。${missingSkillText}`
    : `可将【${lastStep.title}】作为可选换岗方向，优先补齐关键迁移技能后再发起转岗。${missingSkillText}`;
}

function buildRouteRecommendation(params: {
  routeType: "promotion" | "transition";
  roleSteps: CanonicalCareerRole[];
  edgeSteps: CanonicalCareerEdge[];
  profile?: StudentProfileRecord | null;
}): CareerRouteRecommendation {
  const skillSet = toSkillSet(params.profile);
  const steps: CareerRouteStep[] = params.roleSteps.map((role, index) => {
    const edge = index === 0 ? null : params.edgeSteps[index - 1];
    return {
      node_id: role.key,
      role_key: role.key,
      title: role.title,
      relation_type: edge?.relation_type ?? null,
      reason: edge?.reason ?? null,
      required_skills: edge?.required_skills ?? [],
      transition_cost: edge?.transition_cost ?? null,
      gap_skills: edge ? resolveMissingSkills(edge.required_skills, skillSet) : [],
    };
  });

  const missingSkills = Array.from(new Set(steps.flatMap((step) => step.gap_skills)));
  const totalPenalty =
    params.edgeSteps.reduce((sum, edge) => {
      return sum + TRANSITION_COST_PENALTY[edge.transition_cost];
    }, 0) +
    missingSkills.length * 8;

  return {
    route_id: params.edgeSteps.map((edge) => edge.route_key).join("__"),
    route_type: params.routeType,
    title: getRouteTitle(params.routeType, steps),
    summary: getRouteSummary(params.routeType, steps),
    suitability_score: clampScore(100 - totalPenalty),
    missing_skills: missingSkills,
    steps,
  };
}

function buildPromotionEdgePaths(roleKey: string, maxEdges: number): CanonicalCareerEdge[][] {
  const results: CanonicalCareerEdge[][] = [];

  function dfs(currentRoleKey: string, edges: CanonicalCareerEdge[], visited: Set<string>): void {
    const nextEdges = getOutgoingCareerEdges(currentRoleKey, "promotion");
    if (edges.length > 0 && (nextEdges.length === 0 || edges.length >= maxEdges)) {
      results.push(edges);
      return;
    }

    for (const edge of nextEdges) {
      if (visited.has(edge.target)) {
        continue;
      }

      dfs(edge.target, [...edges, edge], new Set([...visited, edge.target]));
    }
  }

  dfs(roleKey, [], new Set([roleKey]));
  return results;
}

function buildTransitionEdgePaths(roleKey: string, maxEdges: number): CanonicalCareerEdge[][] {
  return getOutgoingCareerEdges(roleKey, "transition").map((edge) => {
    if (maxEdges <= 1) {
      return [edge];
    }

    const followUpPaths = buildPromotionEdgePaths(edge.target, maxEdges - 1);
    if (followUpPaths.length === 0) {
      return [edge];
    }

    const longestFollowUp = [...followUpPaths].sort((left, right) => right.length - left.length)[0];
    return [edge, ...longestFollowUp];
  });
}

function mapEdgePathToRoute(
  routeType: "promotion" | "transition",
  sourceRoleKey: string,
  edgePath: CanonicalCareerEdge[],
  profile?: StudentProfileRecord | null,
): CareerRouteRecommendation | null {
  const sourceRole = getCanonicalCareerRole(sourceRoleKey);
  if (!sourceRole) {
    return null;
  }

  const roles = [sourceRole];
  for (const edge of edgePath) {
    const role = getCanonicalCareerRole(edge.target);
    if (!role) {
      return null;
    }
    roles.push(role);
  }

  return buildRouteRecommendation({
    routeType,
    roleSteps: roles,
    edgeSteps: edgePath,
    profile,
  });
}

function buildRouteRecommendations(params: {
  targetRoleKey: string;
  depth: number;
  profile?: StudentProfileRecord | null;
}): {
  promotionRoutes: CareerRouteRecommendation[];
  transitionRoutes: CareerRouteRecommendation[];
} {
  const maxEdges = Math.max(1, Math.min(3, params.depth));
  const promotionRoutes = buildPromotionEdgePaths(params.targetRoleKey, Math.min(2, maxEdges))
    .map((edgePath) => mapEdgePathToRoute("promotion", params.targetRoleKey, edgePath, params.profile))
    .filter((item): item is CareerRouteRecommendation => item !== null)
    .sort((left, right) => right.suitability_score - left.suitability_score)
    .slice(0, MAX_ROUTE_COUNT);

  const transitionRoutes = buildTransitionEdgePaths(params.targetRoleKey, Math.min(2, maxEdges))
    .map((edgePath) => mapEdgePathToRoute("transition", params.targetRoleKey, edgePath, params.profile))
    .filter((item): item is CareerRouteRecommendation => item !== null)
    .sort((left, right) => {
      if (right.suitability_score !== left.suitability_score) {
        return right.suitability_score - left.suitability_score;
      }
      return left.missing_skills.length - right.missing_skills.length;
    })
    .slice(0, MAX_ROUTE_COUNT);

  return {
    promotionRoutes,
    transitionRoutes,
  };
}

function buildCategoryMap(params: {
  targetRoleKey: string;
  promotionRoutes: CareerRouteRecommendation[];
  transitionRoutes: CareerRouteRecommendation[];
}): Map<string, CareerPathNode["category"]> {
  const map = new Map<string, CareerPathNode["category"]>([[params.targetRoleKey, "target"]]);

  for (const route of params.transitionRoutes) {
    for (const step of route.steps.slice(1)) {
      if (!map.has(step.role_key)) {
        map.set(step.role_key, "transition");
      }
    }
  }

  for (const route of params.promotionRoutes) {
    for (const step of route.steps.slice(1)) {
      map.set(step.role_key, "promotion");
    }
  }

  return map;
}

function buildResponseNodes(params: {
  snapshot: CareerPathGraphSnapshot;
  targetRoleKey: string;
  categoryMap: Map<string, CareerPathNode["category"]>;
}): CareerPathNode[] {
  return params.snapshot.nodes.map((node) => ({
    id: node.key,
    job_id: null,
    role_key: node.key,
    title: node.title,
    description: node.description,
    family: node.family,
    level: node.level,
    aliases: node.aliases,
    typical_skills: node.typical_skills,
    category: params.categoryMap.get(node.key) ?? "transition",
    is_target: node.key === params.targetRoleKey,
  }));
}

function buildResponseEdges(snapshot: CareerPathGraphSnapshot): CareerPathEdge[] {
  return snapshot.edges.map((edge) => ({
    id: edge.route_key,
    source: edge.source,
    target: edge.target,
    relation_type: edge.relation_type,
    reason: edge.reason,
    required_skills: edge.required_skills,
    gap_skills: [],
    transition_cost: edge.transition_cost,
    direction_label: edge.direction_label,
    score: edge.transition_cost === "low" ? 82 : edge.transition_cost === "medium" ? 68 : 55,
  }));
}

export function createCareerPathService(
  jobsRepository: JobsRepository,
  profileRepository: ProfileRepository,
  repository: CareerPathRepository,
): CareerPathService {
  let syncPromise: Promise<{ nodes_upserted: number; edges_upserted: number }> | null = null;

  async function syncSeedGraph(): Promise<{ nodes_upserted: number; edges_upserted: number }> {
    if (!syncPromise) {
      syncPromise = repository
        .syncSeedGraph({
          roles: CANONICAL_CAREER_ROLES,
          edges: CANONICAL_CAREER_EDGES,
        })
        .catch((error) => {
          syncPromise = null;
          throw error;
        });
    }

    return syncPromise;
  }

  async function getCareerPathGraph(input: GetCareerPathGraphInput): Promise<CareerPathGraphResponse> {
    const depth = Math.max(1, Math.min(3, input.depth ?? 2));
    const job = await jobsRepository.getJobById(input.job_id);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "目标岗位不存在");
    }

    let profile: StudentProfileRecord | null = null;
    if (input.student_profile_id !== undefined) {
      profile = await profileRepository.getStudentProfileById(input.student_profile_id);
      if (!profile) {
        throw new HttpError(404, "STUDENT_PROFILE_NOT_FOUND", "学生画像不存在");
      }
    }

    const targetRole = resolveCanonicalCareerRoleByTitle(job.title);
    if (!targetRole) {
      throw new HttpError(404, "CAREER_PATH_ROLE_NOT_MAPPED", "当前岗位尚未映射到首批规范岗位图谱");
    }

    try {
      await syncSeedGraph();
      const snapshot = await repository.getSubgraph(targetRole.key, depth);
      if (snapshot.nodes.length === 0) {
        throw new HttpError(404, "CAREER_PATH_ROLE_NOT_SYNCED", "目标岗位尚未同步到图谱数据库");
      }

      const { promotionRoutes, transitionRoutes } = buildRouteRecommendations({
        targetRoleKey: targetRole.key,
        depth,
        profile,
      });
      const categoryMap = buildCategoryMap({
        targetRoleKey: targetRole.key,
        promotionRoutes,
        transitionRoutes,
      });

      return {
        job_id: job.id,
        job_title: job.title,
        student_profile_id: profile?.id ?? null,
        depth,
        canonical_role_key: targetRole.key,
        canonical_role_title: targetRole.title,
        target_node_id: targetRole.key,
        nodes: buildResponseNodes({
          snapshot,
          targetRoleKey: targetRole.key,
          categoryMap,
        }),
        edges: buildResponseEdges(snapshot),
        promotion_routes: promotionRoutes,
        transition_routes: transitionRoutes,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (isNeo4jUnavailableError(error)) {
        throw new HttpError(503, "CAREER_PATH_GRAPH_UNAVAILABLE", "职业路径图谱服务暂不可用");
      }

      throw error;
    }
  }

  return {
    getCareerPathGraph,
    syncSeedGraph,
  };
}
