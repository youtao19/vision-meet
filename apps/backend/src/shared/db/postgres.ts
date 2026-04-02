/**
 * 文件作用：提供后端统一的 PostgreSQL 连接配置与公共工具。
 * 职责边界：这里只负责连接池创建、连接信息格式化等基础能力；
 * 具体建表与查询逻辑必须下沉到各领域 repository 中。
 */

import { Pool, type PoolConfig } from "pg";

export type PgConnectionOptions = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

/**
 * 创建应用级 PostgreSQL 连接池。
 * 注意：调用方应在应用生命周期内复用同一个 pool，避免模块各自创建过多连接。
 */
export function createAppPgPool(options: PgConnectionOptions): Pool {
  const poolConfig: PoolConfig = {
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
  };

  return new Pool(poolConfig);
}

/**
 * 输出用于健康检查和日志的数据库连接摘要。
 * 这里故意不包含密码，避免在接口响应中泄露敏感信息。
 */
export function formatPgConnectionLabel(options: Omit<PgConnectionOptions, "password">): string {
  return `postgres://${options.user}@${options.host}:${options.port}/${options.database}`;
}
