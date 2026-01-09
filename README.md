# MySQL Read-Only MCP Server

[![npm version](https://badge.fury.io/js/mysql-readonly-mcp.svg)](https://www.npmjs.com/package/mysql-readonly-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that provides secure read-only access to MySQL databases. Perfect for AI assistants like Kiro, Claude, and other MCP-compatible tools to explore database schemas, preview data, and run analytical queries safely.

## Why Use This?

- **Safe Database Exploration**: Only read operations allowed - no risk of accidental data modification
- **AI-Powered Analysis**: Let your AI assistant query and analyze your database directly
- **Zero Configuration**: Works out of the box with npx - no installation required
- **Multiple Databases**: Run separate instances for different databases (production, staging, analytics)

## Quick Start

### Using npx (Recommended)

No installation needed! Just configure your MCP client:

```json
{
  "mcpServers": {
    "my-database": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "your-user",
        "MYSQL_PASSWORD": "your-password",
        "MYSQL_DATABASE": "your-database"
      }
    }
  }
}
```

### Global Installation

```bash
npm install -g mysql-readonly-mcp
mysql-readonly-mcp
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_HOST` | Database host | `localhost` |
| `MYSQL_PORT` | Database port | `3306` |
| `MYSQL_USER` | Database username | - |
| `MYSQL_PASSWORD` | Database password | - |
| `MYSQL_DATABASE` | Database name | - |

### Kiro IDE Setup

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "mysql-production": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "production.example.com",
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
    }
  }
}
```

### Multiple Databases

You can connect to multiple databases by creating separate entries:

```json
{
  "mcpServers": {
    "mysql-production": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "prod-db.example.com",
        "MYSQL_DATABASE": "production"
      }
    },
    "mysql-staging": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "staging-db.example.com",
        "MYSQL_DATABASE": "staging"
      }
    },
    "mysql-analytics": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "analytics-db.example.com",
        "MYSQL_DATABASE": "analytics"
      }
    }
  }
}
```

## Available Tools

### list_tables

Lists all tables in the database with metadata.

**Parameters:**
- None required

**Returns:**
- Table name
- Table type (BASE TABLE / VIEW)
- Estimated row count
- Storage engine

**Example:**
```
> List all tables in the database

Tables in database:
- users (BASE TABLE, ~15,000 rows, InnoDB)
- orders (BASE TABLE, ~250,000 rows, InnoDB)
- products (BASE TABLE, ~5,000 rows, InnoDB)
- user_sessions (VIEW, ~0 rows)
```

---

### describe_table

Returns detailed schema information for a table.

**Parameters:**
- `table` (required): Table name

**Returns:**
- Column details (name, type, nullable, default, extra)
- Primary key columns
- Foreign key relationships
- Index information

**Example:**
```
> Describe the users table

Table: users

Columns:
- id (int, NOT NULL, auto_increment) - PRIMARY KEY
- email (varchar(255), NOT NULL)
- name (varchar(100), NULL)
- created_at (datetime, NOT NULL, DEFAULT CURRENT_TIMESTAMP)
- status (enum('active','inactive'), NOT NULL, DEFAULT 'active')

Foreign Keys:
- fk_users_company: company_id -> companies.id

Indexes:
- PRIMARY (id) - unique
- idx_email (email) - unique
- idx_status (status)
```

---

### preview_data

Previews table data with optional filtering.

**Parameters:**
- `table` (required): Table name
- `columns` (optional): Array of columns to return
- `limit` (optional): Max rows (default: 10, max: 100)
- `where` (optional): Filter condition (without WHERE keyword)

**Returns:**
- Selected columns and rows
- Long text fields are automatically truncated (>200 chars)

**Examples:**
```
> Show me the first 5 users

> Preview orders table with only id, total, status columns

> Show products where price > 100 limit 20
```

---

### run_query

Executes custom SELECT queries with validation.

**Parameters:**
- `query` (required): SQL query (SELECT, SHOW, DESCRIBE, EXPLAIN only)
- `limit` (optional): Max rows (default: 1000, max: 5000)

**Returns:**
- Query results
- Execution time
- Truncation warning if results exceeded limit

**Allowed Statements:**
- `SELECT`
- `SHOW`
- `DESCRIBE`
- `EXPLAIN`

**Blocked Statements:**
- INSERT, UPDATE, DELETE
- DROP, ALTER, TRUNCATE
- CREATE, REPLACE
- GRANT, REVOKE
- LOCK, UNLOCK

**Examples:**
```
> SELECT COUNT(*) FROM orders WHERE status = 'completed'

> SELECT u.name, COUNT(o.id) as order_count 
  FROM users u 
  LEFT JOIN orders o ON u.id = o.user_id 
  GROUP BY u.id 
  ORDER BY order_count DESC 
  LIMIT 10

> EXPLAIN SELECT * FROM users WHERE email = 'test@example.com'
```

---

### show_relations

Shows all foreign key relationships for a table.

**Parameters:**
- `table` (required): Table name

**Returns:**
- Tables that reference this table (referencedBy)
- Tables this table references (references)
- Relationship type (one-to-one / one-to-many)

**Example:**
```
> Show relationships for the orders table

Table: orders

Referenced By (other tables pointing to this):
- order_items.order_id -> orders.id (one-to-many)
- payments.order_id -> orders.id (one-to-many)
- shipments.order_id -> orders.id (one-to-one)

References (this table points to):
- orders.user_id -> users.id (many-to-one)
- orders.product_id -> products.id (many-to-one)
```

---

### db_stats

Returns database statistics and overview.

**Parameters:**
- None required

**Returns:**
- Total table count
- Total estimated row count
- Database size
- Top 10 largest tables by row count
- Top 10 largest tables by data size

**Example:**
```
> Show database statistics

Database Statistics:
- Total Tables: 45
- Total Rows: ~2,500,000
- Database Size: 1.2 GB

Largest Tables (by rows):
1. logs - 1,200,000 rows
2. events - 500,000 rows
3. orders - 250,000 rows
...

Largest Tables (by size):
1. attachments - 450 MB
2. logs - 320 MB
3. products - 180 MB
...
```

## Security Features

### Read-Only Enforcement

All queries are validated before execution. The server will reject any query containing:
- Data modification keywords (INSERT, UPDATE, DELETE)
- Schema modification keywords (DROP, ALTER, CREATE, TRUNCATE)
- Permission keywords (GRANT, REVOKE)
- Lock keywords (LOCK, UNLOCK)

### Query Limits

- **Preview data**: Max 100 rows per request
- **Custom queries**: Max 5000 rows per request
- **Timeout**: 30 seconds per query

### Credential Protection

- Database passwords are never exposed in error messages
- Connection errors show host/database info but mask credentials
- Query logs are sanitized

## Use Cases

### Database Documentation
```
> List all tables and describe each one to document the schema
```

### Data Analysis
```
> How many orders were placed last month?
> What's the average order value by customer segment?
```

### Debugging
```
> Show me the last 10 error logs
> Find users who signed up but never made a purchase
```

### Schema Exploration
```
> What tables reference the users table?
> Show me all indexes on the orders table
```

## Development

### Building from Source

```bash
git clone https://github.com/beydemirfurkan/mysql-readonly-mcp.git
cd mysql-readonly-mcp
npm install
npm run build
```

### Running Tests

```bash
npm test
```

### Running Locally

```bash
# Set environment variables
export MYSQL_HOST=localhost
export MYSQL_USER=root
export MYSQL_PASSWORD=password
export MYSQL_DATABASE=mydb

# Run the server
npm start
```

## Troubleshooting

### Connection Refused

```
Error: Connection refused to localhost:3306
```

- Verify MySQL is running
- Check host and port are correct
- Ensure firewall allows the connection

### Access Denied

```
Error: Access denied for user 'myuser'@'localhost'
```

- Verify username and password
- Check user has SELECT privileges on the database
- For remote connections, ensure user is allowed from your IP

### Query Rejected

```
Error: Query rejected: Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed
```

- The query contains forbidden keywords
- Rephrase using only SELECT statements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [npm Package](https://www.npmjs.com/package/mysql-readonly-mcp)
- [GitHub Repository](https://github.com/beydemirfurkan/mysql-readonly-mcp)
- [Report Issues](https://github.com/beydemirfurkan/mysql-readonly-mcp/issues)
