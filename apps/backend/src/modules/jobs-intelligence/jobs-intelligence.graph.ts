/**
 * 文件作用：根据岗位画像构建自动化图谱节点与关系边。
 * 设计边界：这里只做图结构推断，不负责数据库写入。
 */

import type { JobProfileV2Record } from "@career/contracts/types";

type GraphNodeDraft = {
  id: string;
  job_id: number;
  title: string;
  family: string;
  level: number;
  skills: string[];
  summary: string;
};

type GraphEdgeDraft = {
  id: string;
  source: string;
  target: string;
  relation_type: "promotion" | "transition";
  reason: string;
  required_skills: string[];
  gap_skills: string[];
  transition_cost: "low" | "medium" | "high";
  direction_label: string;
  score: number;
};

export type AutoCareerGraphDraft = {
  nodes: GraphNodeDraft[];
  edges: GraphEdgeDraft[];
};

function normalizeSkills(skills: string[]): string[] {
  return Array.from(new Set(skills.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function skillOverlap(sourceSkills: string[], targetSkills: string[]): { overlap: string[]; jaccard: number } {
  const sourceSet = new Set(normalizeSkills(sourceSkills));
  const targetSet = new Set(normalizeSkills(targetSkills));
  const overlap = Array.from(sourceSet).filter((skill) => targetSet.has(skill));
  const union = new Set([...sourceSet, ...targetSet]).size;
  return {
    overlap,
    jaccard: union > 0 ? overlap.length / union : 0,
  };
}

function resolveTransitionCost(gapCount: number): "low" | "medium" | "high" {
  if (gapCount <= 2) {
    return "low";
  }
  if (gapCount <= 5) {
    return "medium";
  }
  return "high";
}

function topEdgeByScore<T extends { score: number }>(items: T[], limit: number): T[] {
  return [...items].sort((left, right) => right.score - left.score).slice(0, limit);
}

/**
 * 从画像列表推断岗位图谱。
 * 注意：换岗边采用“技能倒排候选”削减复杂度，避免 10K 数据 O(n^2) 全量比对。
 */
export function buildAutoCareerGraph(
  profiles: JobProfileV2Record[],
  jobTitleById: Map<number, string>,
): AutoCareerGraphDraft {
  const nodes: GraphNodeDraft[] = profiles.map((profile) => ({
    id: `job-${profile.job_id}`,
    job_id: profile.job_id,
    title: jobTitleById.get(profile.job_id) || profile.normalized_title,
    family: profile.job_family,
    level: profile.job_level,
    skills: profile.professional_skills,
    summary: profile.summary,
  }));

  const profileById = new Map(profiles.map((item) => [item.job_id, item]));
  const familyLevelMap = new Map<string, Map<number, JobProfileV2Record[]>>();
  const skillIndex = new Map<string, Set<number>>();

  for (const profile of profiles) {
    if (!familyLevelMap.has(profile.job_family)) {
      familyLevelMap.set(profile.job_family, new Map());
    }
    const levelMap = familyLevelMap.get(profile.job_family)!;
    if (!levelMap.has(profile.job_level)) {
      levelMap.set(profile.job_level, []);
    }
    levelMap.get(profile.job_level)!.push(profile);

    for (const skill of normalizeSkills(profile.professional_skills)) {
      if (!skillIndex.has(skill)) {
        skillIndex.set(skill, new Set());
      }
      skillIndex.get(skill)!.add(profile.job_id);
    }
  }

  const edges: GraphEdgeDraft[] = [];

  for (const source of profiles) {
    const sourceNodeId = `job-${source.job_id}`;

    // 垂直晋升边：同岗位族 level + 1。
    const promotionCandidates = familyLevelMap.get(source.job_family)?.get(source.job_level + 1) ?? [];
    const promotionEdges: GraphEdgeDraft[] = [];
    for (const target of promotionCandidates) {
      const similarity = skillOverlap(source.professional_skills, target.professional_skills);
      if (similarity.jaccard < 0.2) {
        continue;
      }

      const gapSkills = target.professional_skills.filter(
        (skill) => !normalizeSkills(source.professional_skills).includes(skill.toLowerCase()),
      );
      const score = Math.round(65 + similarity.jaccard * 35);
      promotionEdges.push({
        id: `promotion-${source.job_id}-${target.job_id}`,
        source: sourceNodeId,
        target: `job-${target.job_id}`,
        relation_type: "promotion",
        reason: "同岗位族职级递进，且技能重叠满足晋升阈值。",
        required_skills: target.professional_skills.slice(0, 8),
        gap_skills: gapSkills.slice(0, 8),
        transition_cost: resolveTransitionCost(gapSkills.length),
        direction_label: "晋升",
        score,
      });
    }

    edges.push(...topEdgeByScore(promotionEdges, 3));

    // 换岗边：跨岗位族技能相似 + 可迁移技能 >= 2。
    const candidateIds = new Set<number>();
    for (const skill of normalizeSkills(source.professional_skills).slice(0, 10)) {
      for (const candidateId of skillIndex.get(skill) ?? []) {
        if (candidateId !== source.job_id) {
          candidateIds.add(candidateId);
        }
      }
    }

    const transitionEdges: GraphEdgeDraft[] = [];
    for (const candidateId of candidateIds) {
      const target = profileById.get(candidateId);
      if (!target) {
        continue;
      }
      if (target.job_family === source.job_family) {
        continue;
      }
      if (target.job_level > source.job_level + 1) {
        continue;
      }

      const similarity = skillOverlap(source.professional_skills, target.professional_skills);
      if (similarity.overlap.length < 2 || similarity.jaccard < 0.18) {
        continue;
      }

      const gapSkills = target.professional_skills.filter(
        (skill) => !normalizeSkills(source.professional_skills).includes(skill.toLowerCase()),
      );
      const score = Math.round(50 + similarity.jaccard * 50);

      transitionEdges.push({
        id: `transition-${source.job_id}-${target.job_id}`,
        source: sourceNodeId,
        target: `job-${target.job_id}`,
        relation_type: "transition",
        reason: `跨岗位族可迁移，存在 ${similarity.overlap.length} 项可复用技能。`,
        required_skills: target.professional_skills.slice(0, 8),
        gap_skills: gapSkills.slice(0, 8),
        transition_cost: resolveTransitionCost(gapSkills.length),
        direction_label: "换岗",
        score,
      });
    }

    edges.push(...topEdgeByScore(transitionEdges, 3));
  }

  return { nodes, edges };
}
