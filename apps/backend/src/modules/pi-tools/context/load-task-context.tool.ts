/**
 * 文件作用：提供“加载任务上下文”业务工具。
 * 设计边界：该工具只暴露当前任务已绑定的学生画像和岗位信息，不负责执行任何推理。
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import type { PiToolFactoryContext } from "../pi-tool-context.js";

export function createLoadTaskContextTool(context: PiToolFactoryContext): ToolDefinition {
  return {
    name: "load_task_context",
    label: "加载任务上下文",
    description: "读取当前任务绑定的学生画像和目标岗位信息。建议在任务开始时先调用。",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              profile: {
                id: context.state.profile.id,
                name: context.state.profile.name,
                target_role: context.state.profile.target_role,
                skills: context.state.profile.skills,
                summary: context.state.profile.summary,
              },
              job: {
                id: context.state.job.id,
                title: context.state.job.title,
                company_name: context.state.job.company_name,
                location: context.state.job.location,
                job_description: context.state.job.job_description,
              },
            },
            null,
            2,
          ),
        },
      ],
      details: {
        profile: context.state.profile,
        job: context.state.job,
      },
    }),
  };
}
