import { DatabaseConfig, LIMITS } from './types.js';

export function buildConnectionInfoPrompt(config: DatabaseConfig): string {
  const toolList = 'list_tables, describe_table, preview_data, run_query, show_relations, db_stats, db_info';
  return [
    `This MCP server provides READ-ONLY access to:`,
    `  Database : ${config.database}`,
    `  Host     : ${config.host}:${config.port}`,
    `  User     : ${config.user}`,
    ``,
    `IMPORTANT: This server ONLY has access to the '${config.database}' database.`,
    `Do NOT attempt to access other databases or use different credentials through this server.`,
    `Available tools: ${toolList}`
  ].join('\n');
}

export function createDbInfoOutput(config: DatabaseConfig) {
  return {
    database: config.database,
    host: config.host,
    port: config.port,
    user: config.user,
    queryTimeoutMs: config.queryTimeoutMs,
    note: `This MCP server provides READ-ONLY access to the '${config.database}' database only.`
  };
}

export const DEFAULT_TIMEOUT_MS = LIMITS.TIMEOUT_MS;
