# SQL Database

The SQL class represents an Aurora DSQL database with automatic IAM authentication and schema management.

## Creation

```typescript
const db = app.SQL(config: SQLConfig)
```

### SQLConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Database name |
| `schema` | `string` | ✅ | Schema name for your application |
| `deletionProtection` | `boolean` | ❌ | Enable deletion protection (default: true) |
| `backupRetention` | `number` | ❌ | Backup retention in days |

### Example

```typescript
const database = app.SQL({
  name: 'main-db',
  schema: 'myapp',
  deletionProtection: true
});
```

## Environment Variables

SQL databases automatically inject environment variables:

- `SQL_{NAME}_ENDPOINT` - Database endpoint
- `SQL_{NAME}_IDENTIFIER` - Cluster identifier  
- `SQL_{NAME}_SCHEMA` - Schema name
- `SQL_{NAME}_DB_ROLE` - Database role name
- `SQL_{NAME}_ARN` - Cluster ARN

## Usage in Lambda Functions

### Basic Connection

```typescript
api.route('GET', '/users', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  // Generate IAM auth token
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  // Connect to database
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  await client.connect();
  await client.query(`SET search_path = ${schema}`);
  
  // Query data
  const result = await client.query('SELECT * FROM users');
  
  await client.end();
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      users: result.rows,
      count: result.rows.length
    })
  };
});
```

### Create Tables

```typescript
api.route('POST', '/init', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  await client.connect();
  await client.query(`SET search_path = ${schema}`);
  
  // Create tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      title VARCHAR(200) NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.end();
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Database initialized' })
  };
});
```

### Insert Data

```typescript
api.route('POST', '/users', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const { name, email } = JSON.parse(event.body || '{}');
  
  if (!name || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Name and email required' })
    };
  }
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  try {
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    
    return {
      statusCode: 201,
      body: JSON.stringify(result.rows[0])
    };
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Email already exists' })
      };
    }
    throw error;
  } finally {
    await client.end();
  }
});
```

### Update Data

```typescript
api.route('PUT', '/users/{id}', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const userId = event.pathParameters?.id;
  const { name, email } = JSON.parse(event.body || '{}');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  try {
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
      [name, email, userId]
    );
    
    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(result.rows[0])
    };
  } finally {
    await client.end();
  }
});
```

### Complex Queries

```typescript
api.route('GET', '/users/{id}/posts', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const userId = event.pathParameters?.id;
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  try {
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.email,
        p.id as post_id,
        p.title,
        p.content,
        p.created_at
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      WHERE u.id = $1
      ORDER BY p.created_at DESC
    `, [userId]);
    
    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    // Transform the result
    const user = {
      id: result.rows[0].user_id,
      name: result.rows[0].user_name,
      email: result.rows[0].email,
      posts: result.rows
        .filter(row => row.post_id)
        .map(row => ({
          id: row.post_id,
          title: row.title,
          content: row.content,
          created_at: row.created_at
        }))
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify(user)
    };
  } finally {
    await client.end();
  }
});
```

## Transactions

```typescript
api.route('POST', '/users/{id}/posts', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const userId = event.pathParameters?.id;
  const { title, content } = JSON.parse(event.body || '{}');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION;
  
  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    username: dbRole
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true }
  });
  
  try {
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    // Start transaction
    await client.query('BEGIN');
    
    // Check if user exists
    const userResult = await client.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    // Create post
    const postResult = await client.query(
      'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [userId, title, content]
    );
    
    // Update user's post count (example)
    await client.query(
      'UPDATE users SET post_count = COALESCE(post_count, 0) + 1 WHERE id = $1',
      [userId]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    return {
      statusCode: 201,
      body: JSON.stringify(postResult.rows[0])
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
});
```

## Connection Pooling

For high-traffic applications, consider connection pooling:

```typescript
// Create a connection pool (outside the handler)
const { Pool } = require('pg');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');

let pool;

async function getPool() {
  if (!pool) {
    const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
    const schema = process.env.SQL_MAIN_DB_SCHEMA;
    const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
    const region = process.env.AWS_REGION;
    
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole
    });
    const token = await signer.getDbConnectAuthToken();
    
    pool = new Pool({
      host: endpoint,
      port: 5432,
      user: dbRole,
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: true },
      max: 10, // Maximum connections
      idleTimeoutMillis: 30000
    });
    
    // Set search path for all connections
    pool.on('connect', async (client) => {
      await client.query(`SET search_path = ${schema}`);
    });
  }
  
  return pool;
}

api.route('GET', '/users', async (event) => {
  const pool = await getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query('SELECT * FROM users');
    return {
      statusCode: 200,
      body: JSON.stringify(result.rows)
    };
  } finally {
    client.release();
  }
});
```

## Error Handling

```typescript
api.route('POST', '/users', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  try {
    // Database connection and query code...
  } catch (error) {
    console.error('Database error:', error);
    
    // Handle specific PostgreSQL errors
    switch (error.code) {
      case '23505': // Unique violation
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Email already exists' })
        };
      case '23503': // Foreign key violation
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid reference' })
        };
      case '23502': // Not null violation
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Required field missing' })
        };
      default:
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Database error' })
        };
    }
  }
});
```

## Best Practices

1. **Connection Management**: Always close connections or use pooling
2. **Schema Isolation**: Use dedicated schemas per application
3. **Parameterized Queries**: Always use parameterized queries to prevent SQL injection
4. **Transactions**: Use transactions for multi-step operations
5. **Error Handling**: Handle PostgreSQL-specific error codes
6. **IAM Authentication**: Leverage IAM for secure, credential-free access
7. **Connection Pooling**: Use connection pooling for high-traffic applications
8. **Monitoring**: Monitor connection counts and query performance