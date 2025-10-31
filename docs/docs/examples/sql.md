# SQL Database Example

This example demonstrates how to use Aurora DSQL with Nimbus, including schema-based isolation, IAM authentication, and automatic environment variable injection.

## Overview

The SQL database example shows:
- Aurora DSQL cluster creation
- Schema-based isolation
- IAM authentication with database roles
- PostgreSQL-compatible operations
- Automatic environment variable injection

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'sql-demo',
  region: 'us-east-1',
});

// Create SQL database - automatically injected into all functions
const db = app.SQL({
  name: 'main-db',
  schema: 'myapp', // Schema name for this application
  deletionProtection: false,
});

// Create an API with routes that use the SQL database
const api = app.API({
  name: 'sql-api',
  stage: 'dev'
});

// Database info endpoint
api.route('GET', '/info', () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'SQL Database Info',
      endpoint: process.env.SQL_MAIN_DB_ENDPOINT,
      identifier: process.env.SQL_MAIN_DB_IDENTIFIER,
      schema: process.env.SQL_MAIN_DB_SCHEMA,
      dbRole: process.env.SQL_MAIN_DB_DB_ROLE,
      arn: process.env.SQL_MAIN_DB_ARN,
      note: 'Lambdas connect using IAM role mapped to database role with permissions on the schema',
    }),
  };
});

// Initialize database tables
api.route('POST', '/init', async () => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  try {
    // Generate auth token for Lambda's IAM role
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole,
    });
    const token = await signer.getDbConnectAuthToken();
    
    // Connect to DSQL using Lambda's database role
    const client = new Client({
      host: endpoint,
      port: 5432,
      user: dbRole,
      password: token,
      database: 'postgres',
      ssl: {
        rejectUnauthorized: true,
      },
    });
    
    await client.connect();
    
    // Set search path to our schema
    await client.query(`SET search_path = ${schema}`);
    
    // Create tables in our schema
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
      body: JSON.stringify({
        message: 'Database initialized successfully',
        schema: schema,
        tables: ['users', 'posts'],
      }),
    };
  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        note: 'Make sure pg and @aws-sdk/dsql-signer are installed',
      }),
    };
  }
});

// Create a user
api.route('POST', '/users', async (event) => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email } = body;
    
    if (!name || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Name and email are required' }),
      };
    }
    
    // Generate auth token
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole,
    });
    const token = await signer.getDbConnectAuthToken();
    
    // Connect and insert
    const client = new Client({
      host: endpoint,
      port: 5432,
      user: dbRole,
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: true },
    });
    
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    
    await client.end();
    
    return {
      statusCode: 201,
      body: JSON.stringify(result.rows[0]),
    };
  } catch (error) {
    console.error('Database error:', error);
    
    if (error.code === '23505') { // Unique violation
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Email already exists' }),
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
});

// Get all users
api.route('GET', '/users', async () => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  try {
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole,
    });
    const token = await signer.getDbConnectAuthToken();
    
    const client = new Client({
      host: endpoint,
      port: 5432,
      user: dbRole,
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: true },
    });
    
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query('SELECT * FROM users ORDER BY created_at DESC');
    
    await client.end();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        count: result.rows.length,
        users: result.rows,
      }),
    };
  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
});

// Get user count
api.route('GET', '/users/count', async () => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  try {
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole,
    });
    const token = await signer.getDbConnectAuthToken();
    
    const client = new Client({
      host: endpoint,
      port: 5432,
      user: dbRole,
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: true },
    });
    
    await client.connect();
    await client.query(`SET search_path = ${schema}`);
    
    const result = await client.query('SELECT COUNT(*) as count FROM users');
    
    await client.end();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        count: parseInt(result.rows[0].count)
      }),
    };
  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
});

// Export for CLI deployment
export default app;
    process.exit(0);
  })
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir sql-example
   cd sql-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus @aws-sdk/dsql-signer pg
   npm install -D @types/node @types/pg tsx typescript
   ```

3. **Initialize Nimbus state:**
   ```bash
   npx nimbus init
   ```

4. **Create the application file:**
   Save the code above as `index.ts`

5. **Add package.json scripts:**
   ```json
   {
     "scripts": {
       "deploy": "npx nimbus deploy",
       "destroy": "npx nimbus destroy --project sql-demo --region us-east-1 --force"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will:
1. Create an Aurora DSQL cluster
2. Set up a schema named "myapp"
3. Create a database role for your Lambda functions
4. Deploy an API with database operations

## Test the API

### Get Database Info

```bash
curl https://YOUR_API_URL/info
```

**Response:**
```json
{
  "message": "SQL Database Info",
  "endpoint": "your-cluster.dsql.us-east-1.on.aws",
  "identifier": "your-cluster-id",
  "schema": "myapp",
  "dbRole": "lambda_myapp",
  "arn": "arn:aws:dsql:us-east-1:123456789012:cluster/your-cluster-id"
}
```

### Initialize Database

```bash
curl -X POST https://YOUR_API_URL/init
```

**Response:**
```json
{
  "message": "Database initialized successfully",
  "schema": "myapp",
  "tables": ["users", "posts"]
}
```

### Create a User

```bash
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Alice",
  "email": "alice@example.com",
  "created_at": "2024-12-01T12:00:00.000Z"
}
```

### Get All Users

```bash
curl https://YOUR_API_URL/users
```

**Response:**
```json
{
  "count": 1,
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Alice",
      "email": "alice@example.com",
      "created_at": "2024-12-01T12:00:00.000Z"
    }
  ]
}
```

### Get User Count

```bash
curl https://YOUR_API_URL/users/count
```

**Response:**
```json
{
  "count": 1
}
```

## Key Features Demonstrated

### 1. Schema Isolation
- Each application gets its own schema (`myapp`)
- Database roles have permissions only on their schema
- Multiple applications can share the same cluster safely

### 2. IAM Authentication
- No database passwords to manage
- Lambda functions use IAM roles mapped to database roles
- Secure, credential-free database access

### 3. Environment Variables
Automatically injected:
- `SQL_MAIN_DB_ENDPOINT` - Database endpoint
- `SQL_MAIN_DB_IDENTIFIER` - Cluster identifier
- `SQL_MAIN_DB_SCHEMA` - Schema name (myapp)
- `SQL_MAIN_DB_DB_ROLE` - Database role name (lambda_myapp)
- `SQL_MAIN_DB_ARN` - Cluster ARN

### 4. PostgreSQL Compatibility
- Standard PostgreSQL syntax and features
- UUID primary keys with `gen_random_uuid()`
- Foreign key relationships
- Timestamps with defaults

## Advanced Usage

### Complex Queries with Joins

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
    username: dbRole,
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true },
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
        p.created_at as post_created_at
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
          created_at: row.post_created_at
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

### Transactions

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
    username: dbRole,
  });
  const token = await signer.getDbConnectAuthToken();
  
  const client = new Client({
    host: endpoint,
    port: 5432,
    user: dbRole,
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true },
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

## How It Works

### During Deploy
1. Nimbus connects as admin to create the Aurora DSQL cluster
2. Creates the schema (`myapp`)
3. Creates a database role for Lambda functions (`lambda_myapp`)
4. Maps your Lambda IAM role to the database role
5. Grants permissions on the schema to the database role

### During Runtime
1. Lambda functions use `DsqlSigner` to generate IAM auth tokens
2. Connect as the mapped database role (not admin)
3. Execute queries within their schema
4. All operations are isolated to the application's schema

## Architecture

```
Lambda Function
    ↓
IAM Role → Database Role Mapping
    ↓
Aurora DSQL Cluster
    ↓
Application Schema (myapp)
    ↓
Tables (users, posts, etc.)
```

## Clean Up

To destroy all resources including the database:

```bash
npm run destroy
```

The `--force` flag is required to delete the Aurora DSQL cluster.

## Next Steps

- Try the [Authentication example](./auth-api) to add user authentication
- Explore [Queue example](./queue) for async processing
- Learn about [Timer example](./timer) for scheduled tasks

## Troubleshooting

### Common Issues

**"Connection failed"**
- Make sure the deployment completed successfully
- Check that all environment variables are set
- Verify IAM permissions are correct

**"Schema not found"**
- Ensure the database initialization (`POST /init`) was successful
- Check that the schema name matches the configuration

**"Permission denied"**
- Verify the Lambda IAM role is mapped to the database role
- Check that the database role has permissions on the schema

**"SSL connection required"**
- Aurora DSQL requires SSL connections
- Ensure `ssl: { rejectUnauthorized: true }` is set