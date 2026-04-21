# MySQL Read-Only MCP Server

MySQL Read-Only MCP Server is a Model Context Protocol (MCP) server that provides secure, read-only access to a single MySQL database. It is designed for MCP-compatible clients that need to inspect schema details, preview table data, and run analytical queries without allowing data or schema changes.

## Overview

- Read-only query execution for MySQL
- Single database configuration per server instance
- Built-in query validation and row limits
- Schema inspection and relationship discovery tools
- Compatible with MCP clients such as Claude Desktop and editor integrations

## Installation

### Run with npx

```bash
npx -y mysql-readonly-mcp
```

Prefer `npx` or a globally installed binary in MCP client configuration. Do not point MCP clients to a cloned repository checkout such as `.../mysql-readonly-mcp/dist/index.js`, because some clients and agents may treat that checkout as part of the active workspace.

### Global installation

```bash
npm install -g mysql-readonly-mcp
mysql-readonly-mcp
```

## Configuration

The server reads its connection settings from environment variables.

| Variable | Description | Default |
| --- | --- | --- |
| `MYSQL_HOST` | MySQL host | `localhost` |
| `MYSQL_PORT` | MySQL port | `3306` |
| `MYSQL_USER` | MySQL user | `root` |
| `MYSQL_PASSWORD` | MySQL password | empty |
| `MYSQL_DATABASE` | Database name | `mysql` |
| `MYSQL_QUERY_TIMEOUT_MS` | Query execution timeout in milliseconds (minimum `1000`) | `30000` |

Each server instance connects to one database. To work with multiple databases, configure multiple MCP server entries and point each one to a different `MYSQL_DATABASE` value.

## Client setup

### Claude Desktop

Configuration file locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mysql-production": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "production_db"
      }
    }
  }
}
```

### Generic MCP configuration

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "password",
        "MYSQL_DATABASE": "app_db"
      }
    }
  }
}
```

This is the recommended setup for editor and assistant clients because it keeps the MCP server isolated from the repository source tree.

### Multiple database connections

Use separate MCP server entries when you need access to more than one database.

```json
{
  "mcpServers": {
    "mysql-production": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "prod-db.example.com",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "production"
      }
    },
    "mysql-staging": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "staging-db.example.com",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "staging"
      }
    }
  }
}
```

## Available tools

| Tool | Purpose | Parameters |
| --- | --- | --- |
| `list_tables` | List tables and views with metadata | None |
| `describe_table` | Describe table columns, keys, and indexes | `table` |
| `preview_data` | Preview rows from a table | `table`, `columns`, `limit`, `where` |
| `run_query` | Execute validated read-only SQL | `query`, `limit` |
| `show_relations` | Show incoming and outgoing foreign key relations | `table` |
| `db_stats` | Summarize database size and largest tables | None |
| `db_info` | Show which database this server instance is connected to | None |

### Tool details

#### `list_tables`

Returns table name, table type, row count estimate, and storage engine for the configured database.

#### `describe_table`

Returns:

- Column definitions
- Primary key columns
- Foreign key relationships
- Index information

#### `preview_data`

Parameters:

- `table` (required)
- `columns` (optional)
- `limit` (optional, default `10`, max `100`)
- `where` (optional basic filter expression, without the `WHERE` keyword)

For complex filtering, joins, unions, or advanced SQL expressions, use `run_query` instead of `preview_data`.

#### `run_query`

Accepted statements:

- `SELECT`
- `SHOW`
- `DESCRIBE`
- `EXPLAIN`

Rejected statements include data modification, schema modification, and permission-changing queries such as `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, and `LOCK`.

#### `show_relations`

Returns:

- Tables that reference the target table
- Tables referenced by the target table
- Relationship type when it can be inferred

#### `db_stats`

Returns:

- Total table count
- Estimated total row count
- Total database size
- Largest tables by row count
- Largest tables by size

#### `db_info`

Returns the connection details for this server instance: database name, host, port, user, and active query timeout. Useful when multiple MCP server instances are configured and you need to confirm which one you are addressing. The password is never included in the output.

## Prompts

The server exposes a `connection_info` prompt for MCP clients that support prompts. When retrieved, it provides a summary of the database this server connects to and a reminder that the server is scoped to that single database. This helps LLM clients avoid routing queries to the wrong server instance.

## Security model

The server is intended for inspection and analysis, not for write operations.

- Query validation blocks non-read-only statements
- Preview queries are capped at 100 rows
- Custom queries are capped at 5000 rows
- Query execution timeout defaults to 30 seconds and is configurable via `MYSQL_QUERY_TIMEOUT_MS`
- Sensitive credentials are sanitized in error messages

## Troubleshooting

### Connection refused

- Confirm that MySQL is running
- Confirm that `MYSQL_HOST` and `MYSQL_PORT` are correct
- Confirm that network access to the MySQL server is allowed

### Access denied

- Confirm that `MYSQL_USER` and `MYSQL_PASSWORD` are correct
- Confirm that the user has read access to the configured database
- Confirm that the MySQL user is allowed to connect from the current host

### Query rejected

- Confirm that the query is read-only
- Use only `SELECT`, `SHOW`, `DESCRIBE`, or `EXPLAIN`

## License

MIT. See `LICENSE` for details.

## Links

- npm: https://www.npmjs.com/package/mysql-readonly-mcp
- Repository: https://github.com/beydemirfurkan/mysql-readonly-mcp
- Issues: https://github.com/beydemirfurkan/mysql-readonly-mcp/issues
