import fs from "node:fs";
import path from "node:path";

/**
 * 文件作用：解析 monorepo 根目录路径。
 * 设计原因：知识库索引脚本和 API 都依赖相对路径输入，统一在这里做仓库根目录探测，
 * 避免从不同工作目录运行脚本时把相对路径解析到错误位置。
 */
export function resolveRepositoryRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const agentsPath = path.join(current, "AGENTS.md");
    const appsPath = path.join(current, "apps");
    const packagesPath = path.join(current, "packages");

    if (
      fs.existsSync(packageJsonPath) &&
      fs.existsSync(agentsPath) &&
      fs.existsSync(appsPath) &&
      fs.existsSync(packagesPath)
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("无法定位仓库根目录，请确认命令在 career-agent 仓库内执行。");
    }
    current = parent;
  }
}
