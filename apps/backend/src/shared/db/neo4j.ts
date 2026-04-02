/**
 * 文件作用：封装 Neo4j Driver 的创建与常用错误识别。
 * 设计边界：这里只提供连接能力和基础工具，不承载任何业务查询逻辑。
 */

import neo4j, { type Driver } from "neo4j-driver";

export type Neo4jConnectionOptions = {
  uri: string;
  username: string;
  password: string;
};

export function createNeo4jDriver(options: Neo4jConnectionOptions): Driver {
  return neo4j.driver(
    options.uri,
    neo4j.auth.basic(options.username, options.password),
  );
}

export function isNeo4jUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /ServiceUnavailable|SessionExpired|ECONNREFUSED|ENOTFOUND|Connection|network/i.test(
    `${error.name}:${error.message}`,
  );
}

export function toNeo4jNumber(value: unknown): number {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  return Number(value);
}
