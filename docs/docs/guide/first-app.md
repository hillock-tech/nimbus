# Your First App

Let's build a complete todo application to demonstrate Nimbus capabilities. This tutorial covers APIs, databases, authentication, and deployment.

## What We'll Build

A todo API with:
- User authentication (JWT)
- CRUD operations for todos
- User-specific todo lists
- Real database integration

## Step 1: Project Setup

```bash
mkdir nimbus-todo-app
cd nimbus-todo-app
npm init -y
npm install nimbus jose nanoid
npm install -D @types/node tsx typescript
```

::: tip
Always install Nimbus locally in your project rather than globally to avoid version conflicts and ensure consistent deployments across different environments.
:::

## Step 2: Database Schema

Create `index.ts`:

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'todo-app',
  region: 'us-east-1'
});

// Users table
const users = app.KV({
  name: 'users',
  primaryKey: 'email'
});

// Todos table
const todos = app.KV({
  name: 'todos',
  primaryKey: 'id'
});

const api = app.API({
  name: 'todo-api',
  stage: 'v1'
});
```

## Step 3: Authentication

Add JWT authentication:

```typescript
// JWT Authorizer
api.authorizer({
  name: 'jwt-auth',
  type: 'REQUEST',
  handler: async (event) => {
    const jose = require('jose');
    
    try {
      const token = event.headers?.Authorization?.replace('Bearer ', '');
      if (!token) throw new Error('No token provided');

      const secret = new TextEncoder().encode('your-secret-key');
      const { payload } = await jose.jwtVerify(token, secret);

      return {
        principalId: payload.email,
        policyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn.split('/').slice(0, 2).join('/') + '/*'
          }]
        },
        context: {
          email: payload.email,
          userId: payload.sub
        }
      };
    } catch (error) {
      throw new Error('Unauthorized');
    }
  }
});
```

## Step 4: User Registration

```typescript
// Register new user
api.route('POST', '/auth/register', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
  const { nanoid } = require('nanoid');
  const jose = require('jose');
  
  const { email, password, name } = JSON.parse(event.body || '{}');
  
  if (!email || !password || !name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email, password, and name are required' })
    };
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const usersTable = process.env.KV_USERS;

  try {
    // Check if user already exists
    const existingUser = await docClient.send(new GetCommand({
      TableName: usersTable,
      Key: { email }
    }));

    if (existingUser.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'User already exists' })
      };
    }

    // Create user
    const userId = nanoid();
    const user = {
      email,
      password, // In production, hash this!
      name,
      id: userId,
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: usersTable,
      Item: user
    }));

    // Generate JWT
    const secret = new TextEncoder().encode('your-secret-key');
    const token = await new jose.SignJWT({ email, sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'User created successfully',
        token,
        user: { email, name, id: userId }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create user' })
    };
  }
}, { cors: true });
```

## Step 5: User Login

```typescript
// Login user
api.route('POST', '/auth/login', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
  const jose = require('jose');
  
  const { email, password } = JSON.parse(event.body || '{}');
  
  if (!email || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email and password are required' })
    };
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const usersTable = process.env.KV_USERS;

  try {
    const result = await docClient.send(new GetCommand({
      TableName: usersTable,
      Key: { email }
    }));

    if (!result.Item || result.Item.password !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Generate JWT
    const secret = new TextEncoder().encode('your-secret-key');
    const token = await new jose.SignJWT({ email, sub: result.Item.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Login successful',
        token,
        user: {
          email: result.Item.email,
          name: result.Item.name,
          id: result.Item.id
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Login failed' })
    };
  }
}, { cors: true });
```

## Step 6: Todo CRUD Operations

```typescript
// Get user's todos
api.route('GET', '/todos', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  
  const userId = event.requestContext?.authorizer?.userId;
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const todosTable = process.env.KV_TODOS;

  try {
    const result = await docClient.send(new ScanCommand({
      TableName: todosTable,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        todos: result.Items || [],
        count: result.Count || 0
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch todos' })
    };
  }
}, { cors: true, authorizer: 'jwt-auth' });

// Create todo
api.route('POST', '/todos', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
  const { nanoid } = require('nanoid');
  
  const userId = event.requestContext?.authorizer?.userId;
  const { title, description } = JSON.parse(event.body || '{}');
  
  if (!title) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Title is required' })
    };
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const todosTable = process.env.KV_TODOS;

  try {
    const todo = {
      id: nanoid(),
      userId,
      title,
      description: description || '',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: todosTable,
      Item: todo
    }));

    return {
      statusCode: 201,
      body: JSON.stringify(todo)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create todo' })
    };
  }
}, { cors: true, authorizer: 'jwt-auth' });

// Update todo
api.route('PUT', '/todos/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  
  const userId = event.requestContext?.authorizer?.userId;
  const todoId = event.pathParameters?.id;
  const { title, description, completed } = JSON.parse(event.body || '{}');

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const todosTable = process.env.KV_TODOS;

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: todosTable,
      Key: { id: todoId },
      UpdateExpression: 'SET title = :title, description = :description, completed = :completed, updatedAt = :updatedAt',
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':title': title,
        ':description': description || '',
        ':completed': completed || false,
        ':updatedAt': new Date().toISOString(),
        ':userId': userId
      },
      ReturnValues: 'ALL_NEW'
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(result.Attributes)
    };
  } catch (error) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Todo not found or access denied' })
    };
  }
}, { cors: true, authorizer: 'jwt-auth' });

// Delete todo
api.route('DELETE', '/todos/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
  
  const userId = event.requestContext?.authorizer?.userId;
  const todoId = event.pathParameters?.id;

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const todosTable = process.env.KV_TODOS;

  try {
    await docClient.send(new DeleteCommand({
      TableName: todosTable,
      Key: { id: todoId },
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    return {
      statusCode: 204,
      body: ''
    };
  } catch (error) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Todo not found or access denied' })
    };
  }
}, { cors: true, authorizer: 'jwt-auth' });

// Export for CLI deployment
export default app;
```

## Step 7: Deploy and Test

```bash
# Deploy
npx nimbus deploy

# Test registration
curl -X POST https://your-api-url/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Test login
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Create todo (use token from login response)
curl -X POST https://your-api-url/todos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"title":"Learn Nimbus","description":"Complete the tutorial"}'

# Get todos
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://your-api-url/todos
```

## What You've Built

Congratulations! You've created a complete serverless todo application with:

- ✅ User registration and authentication
- ✅ JWT-based authorization
- ✅ CRUD operations for todos
- ✅ User-specific data isolation
- ✅ Automatic database and API creation
- ✅ Proper error handling

## Next Steps

- Explore the [examples](/examples/) to learn more patterns
- Read the [API reference](/api/nimbus) for detailed documentation
- Try the [KV Store example](/examples/kv) for database operations
- Check out the [Authentication example](/examples/auth-api) for JWT patterns

## Clean Up

```bash
npx nimbus destroy --project todo-app --region us-east-1
```