# MySQL Read-Only MCP Server

[![npm version](https://badge.fury.io/js/mysql-readonly-mcp.svg)](https://www.npmjs.com/package/mysql-readonly-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that provides secure read-only access to MySQL databases. Perfect for AI assistants like Claude, GPT, and other MCP-compatible tools to explore database schemas, preview data, and run analytical queries safely.

## Features

- 🔒 **Secure Read-Only Access** - Only SELECT, SHOW, DESCRIBE, EXPLAIN allowed
- 🚀 **Zero Configuration** - Works instantly with npx
- 🗄️ **Multiple Databases** - Run separate instances for different databases
- ⚡ **Query Validation** - Blocks any data modification attempts
- 📊 **Rich Tools** - 6 powerful tools for database exploration

## Quick Start

### Using npx (Recommended)

No installation needed! Configure your MCP client with:

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

### Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### VS Code with MCP Extension

If using an MCP extension for VS Code, add to your MCP settings:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "password",
        "MYSQL_DATABASE": "mydb"
      }
    }
  }
}
```

### Multiple Databases

Connect to multiple databases by creating separate entries:

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

**Returns:** Table name, type (BASE TABLE/VIEW), row count estimate, storage engine

**Example output:**
```
Tables in database:
- users (BASE TABLE, ~15,000 rows, InnoDB)
- orders (BASE TABLE, ~250,000 rows, InnoDB)
- products (BASE TABLE, ~5,000 rows, InnoDB)
```

---

### describe_table

Returns detailed schema information for a table.

**Parameters:**
- `table` (required): Table name

**Returns:** Columns (name, type, nullable, default), primary key, foreign keys, indexes

**Example output:**
```
Table: users

Columns:
- id (int, NOT NULL, auto_increment) - PRIMARY KEY
- email (varchar(255), NOT NULL)
- name (varchar(100), NULL)
- created_at (datetime, DEFAULT CURRENT_TIMESTAMP)

Foreign Keys:
- fk_users_company: company_id -> companies.id

Indexes:
- PRIMARY (id) - unique
- idx_email (email) - unique
```

---

### preview_data

Previews table data with optional filtering.

**Parameters:**
- `table` (required): Table name
- `columns` (optional): Array of columns to return
- `limit` (optional): Max rows (default: 10, max: 100)
- `where` (optional): Filter condition (without WHERE keyword)

**Examples:**
```
preview_data table=users
preview_data table=users columns=["id","name","email"] limit=20
preview_data table=orders where="status = 'pending'"
```

---

### run_query

Executes custom SELECT queries with validation.

**Parameters:**
- `query` (required): SQL query
- `limit` (optional): Max rows (default: 1000, max: 5000)

**Allowed:** SELECT, SHOW, DESCRIBE, EXPLAIN

**Blocked:** INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, LOCK

**Examples:**
```sql
SELECT COUNT(*) FROM orders WHERE status = 'completed'

SELECT u.name, COUNT(o.id) as order_count 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
GROUP BY u.id 
ORDER BY order_count DESC 
LIMIT 10

EXPLAIN SELECT * FROM users WHERE email = 'test@example.com'
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

**Example output:**
```
Table: orders

Referenced By:
- order_items.order_id -> orders.id (one-to-many)
- payments.order_id -> orders.id (one-to-many)

References:
- orders.user_id -> users.id
- orders.product_id -> products.id
```

---

### db_stats

Returns database statistics and overview.

**Returns:**
- Total table count
- Total estimated row count
- Database size
- Top 10 largest tables by row count
- Top 10 largest tables by data size

**Example output:**
```
Database Statistics:
- Total Tables: 45
- Total Rows: ~2,500,000
- Database Size: 1.2 GB

Largest Tables (by rows):
1. logs - 1,200,000 rows
2. events - 500,000 rows
3. orders - 250,000 rows
```

## Security

### Read-Only Enforcement

All queries are validated before execution. The server rejects any query containing:
- Data modification: INSERT, UPDATE, DELETE
- Schema modification: DROP, ALTER, CREATE, TRUNCATE
- Permissions: GRANT, REVOKE
- Locking: LOCK, UNLOCK

### Query Limits

- **Preview data**: Max 100 rows
- **Custom queries**: Max 5000 rows
- **Timeout**: 30 seconds per query

### Credential Protection

- Passwords never exposed in error messages
- Connection errors mask credentials
- Query logs are sanitized

## Use Cases

**Database Documentation**
```
List all tables and describe each one to document the schema
```

**Data Analysis**
```
How many orders were placed last month?
What's the average order value by customer segment?
```

**Debugging**
```
Show me the last 10 error logs
Find users who signed up but never made a purchase
```

**Schema Exploration**
```
What tables reference the users table?
Show me all indexes on the orders table
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
export MYSQL_HOST=localhost
export MYSQL_USER=root
export MYSQL_PASSWORD=password
export MYSQL_DATABASE=mydb

npm start
```

## Troubleshooting

### Connection Refused
- Verify MySQL is running
- Check host and port are correct
- Ensure firewall allows the connection

### Access Denied
- Verify username and password
- Check user has SELECT privileges
- For remote connections, ensure user is allowed from your IP

### Query Rejected
- The query contains forbidden keywords
- Use only SELECT, SHOW, DESCRIBE, EXPLAIN statements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [npm Package](https://www.npmjs.com/package/mysql-readonly-mcp)
- [GitHub Repository](https://github.com/beydemirfurkan/mysql-readonly-mcp)
- [Report Issues](https://github.com/beydemirfurkan/mysql-readonly-mcp/issues)
