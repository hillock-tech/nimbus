/**
 * SQL Example - Aurora DSQL Database
 * 
 * This example demonstrates how to create an Aurora DSQL database
 * with automatic IAM permissions and environment variables.
 * 
 * Aurora DSQL uses PostgreSQL protocol with IAM authentication.
 */

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

// Example handler - SQL environment variables are automatically available
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

// Example handler showing actual DSQL connection
api.route('POST', '/init', async () => {
  const { Client } = require('pg');
  const { DsqlSigner } = require('@aws-sdk/dsql-signer');
  
  const endpoint = process.env.SQL_MAIN_DB_ENDPOINT;
  const schema = process.env.SQL_MAIN_DB_SCHEMA;
  const dbRole = process.env.SQL_MAIN_DB_DB_ROLE;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  try {
    // Generate auth token for Lambda's IAM role (not admin)
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
      username: dbRole, // Must specify username for non-admin auth
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
    
    // Create a sample table in our schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.end();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Database initialized successfully',
        schema: schema,
        table: 'users',
      }),
    };
  } catch (error: any) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        note: 'Make sure pg and @aws-sdk/dsql-signer are installed and IAM permissions are correct',
      }),
    };
  }
});

// Create a user
api.route('POST', '/users', async (event: any) => {
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
    
    // Generate auth token for Lambda's IAM role
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
  } catch (error: any) {
    console.error('Database error:', error);
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
    // Generate auth token for Lambda's IAM role
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
  } catch (error: any) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
});

// Export the nimbus instance for CLI to deploy
export default app;
