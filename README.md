# MySQL Read-Only MCP Server

A Model Context Protocol (MCP) server that provides secure read-only access to MySQL databases. Connect multiple databases and explore schemas, preview data, and run custom queries safely.

## Features

- **Secure Read-Only Access**: Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries allowed
- **Multi-Database Support**: Connect to multiple MySQL databases from a single server
- **6 Powerful Tools**:
  - `list_tables` - List all tables in a database
  - `describe_table` - Get detailed table schema
  - `preview_data` - Preview table data with filtering
  - `run_query` - Execute custom SELECT queries
  - `show_relations` - View foreign key relationships
  - `db_stats` - Get database statistics

## Installation

### 1. Install Dependencies

```bash
cd mysql-readonly-mcp
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure

Environment variables are passed via MCP configuration (see below).

## MCP Configuration

Each database requires its own MCP server entry. Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "mysql-production": {
      "command": "node",
      "args": ["/path/to/mysql-readonly-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "production-host.example.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "production_db"
      },
      "disabled": false,
      "autoApprove": [
        "list_tables",
        "describe_table",
        "preview_data",
        "run_query",
        "show_relations",
        "db_stats"
      ]
    },
    "mysql-staging": {
      "command": "node",
      "args": ["/path/to/mysql-readonly-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "staging-host.example.com",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "staging_db"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_HOST` | Database host | `localhost` |
| `MYSQL_PORT` | Database port | `3306` |
| `MYSQL_USER` | Database user | - |
| `MYSQL_PASSWORD` | Database password | - |
| `MYSQL_DATABASE` | Database name | - |

> **Tip**: Create multiple entries with different names (e.g., `mysql-production`, `mysql-staging`, `mysql-analytics`) to connect to multiple databases.

## Usage

### list_tables

Lists all tables in the database with type, row count, and storage engine.

```
list_tables
```

### describe_table

Returns detailed schema information including columns, primary key, foreign keys, and indexes.

```
describe_table table=users
```

### preview_data

Previews table data with optional column selection and filtering.

```
preview_data table=users
preview_data table=users columns=["id","name","email"] limit=20
preview_data table=users where="status = 'active'"
```

**Parameters**:
- `table` (required): Table name
- `columns`: Array of columns to return
- `limit`: Max rows (default: 10, max: 100)
- `where`: Filter condition (without WHERE keyword)

### run_query

Executes custom SELECT queries with validation and limits.

```
run_query query="SELECT * FROM users WHERE created_at > '2024-01-01'"
run_query query="SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id" limit=100
```

**Parameters**:
- `query` (required): SQL query (SELECT, SHOW, DESCRIBE, EXPLAIN only)
- `limit`: Max rows (default: 1000, max: 5000)

**Security**:
- INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE etc. are rejected
- 30 second timeout enforced

### show_relations

Shows all foreign key relationships for a table.

```
show_relations table=users
```

**Output**:
- Tables that reference this table (referencedBy)
- Tables this table references (references)
- Relationship type (one-to-one / one-to-many)

### db_stats

Returns database statistics.

```
db_stats
```

**Output**:
- Total table count
- Total row count (estimated)
- Database size
- Top 10 largest tables by rows
- Top 10 largest tables by size

## Development

### Development Mode

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

### Test Coverage

```bash
npm run test:coverage
```

## Security

1. **Read-Only**: Only read operations are supported
2. **Query Validation**: All queries are validated before execution
3. **Credential Protection**: Passwords are never exposed in error messages
4. **Row Limits**: Large result sets are automatically limited
5. **Timeout**: Long-running queries are cancelled after 30 seconds

## Project Structure

```
mysql-readonly-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── mcp.json.example
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── connection-manager.ts # Database connection handling
│   ├── query-validator.ts    # SQL validation logic
│   ├── types.ts              # TypeScript type definitions
│   └── tools/
│       ├── list-tables.ts
│       ├── describe-table.ts
│       ├── preview-data.ts
│       ├── run-query.ts
│       ├── show-relations.ts
│       └── db-stats.ts
├── tests/
│   └── *.property.test.ts    # Property-based tests
└── dist/                     # Compiled output
```

## License

MIT
