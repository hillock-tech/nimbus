import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: API with DynamoDB KV store
 */
const nimbus = new Nimbus({
  region: 'us-east-1',
  projectName: 'kv-app',
});

// Create a KV store (DynamoDB table)
const usersKV = nimbus.KV({
  name: 'users',
  primaryKey: 'userId',
});

// Create an API
const api = nimbus.API({
  name: 'users-api',
  description: 'User management API with DynamoDB',
  stage: 'prod',
});

// GET /users/{id} - Retrieve a user
api.route('GET', '/users/{id}', async (event: any) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

  const userId = event.pathParameters?.id;
  const tableName = process.env.KV_USERS; // Auto-set by Nimbus

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  try {
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { userId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.Item),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
}, { cors: true });

// POST /users - Create a user
api.route('POST', '/users', async (event: any) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
  const { nanoid } = require('nanoid');

  const body = JSON.parse(event.body || '{}');
  const tableName = process.env.KV_USERS; // Auto-set by Nimbus

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const userId = nanoid();
  const user = {
    userId,
    name: body.name,
    email: body.email,
    createdAt: new Date().toISOString(),
  };

  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: user,
    }));

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
}, { cors: true });

// DELETE /users/{id} - Delete a user
api.route('DELETE', '/users/{id}', async (event: any) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

  const userId = event.pathParameters?.id;
  const tableName = process.env.KV_USERS; // Auto-set by Nimbus

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  try {
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { userId },
    }));

    return {
      statusCode: 204,
      body: '',
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
}, { cors: true });

// Export the nimbus instance for CLI to deploy
export default nimbus;
