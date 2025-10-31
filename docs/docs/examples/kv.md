# KV Store Example

This example demonstrates how to use DynamoDB as a key-value store with Nimbus, including automatic environment variable injection and IAM permissions.

## Overview

The KV store example shows:
- DynamoDB table creation and management
- CRUD operations (Create, Read, Update, Delete)
- Automatic environment variable injection
- IAM permissions handling
- Error handling and validation

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: API with DynamoDB KV store
 */
async function kvExample() {
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

  // GET /users - List all users
  api.route('GET', '/users', async (event: any) => {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    const tableName = process.env.KV_USERS; // Auto-set by Nimbus

    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    try {
      const result = await docClient.send(new ScanCommand({
        TableName: tableName,
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: result.Items || [],
          count: result.Count || 0,
        }),
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

// Export for CLI deployment
export default nimbus;
  console.log(`\nAPI URL: ${result.apis[0].url}`);
  console.log(`\nKV Stores created:`);
  result.kvStores.forEach(kv => console.log(`  - ${kv.name}`));
}

// Run the example
kvExample()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir kv-store-example
   cd kv-store-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb nanoid
   npm install -D @types/node tsx typescript
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
       "destroy": "npx nimbus destroy --project kv-app --region us-east-1 --force"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will:
1. Create a DynamoDB table named `users`
2. Create Lambda functions for each API route
3. Set up IAM permissions for DynamoDB access
4. Create an API Gateway
5. Inject environment variables with table names

## Test the API

### Create a User
```bash
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

**Response:**
```json
{
  "userId": "abc123def",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### Get a User
```bash
curl https://YOUR_API_URL/users/abc123def
```

**Response:**
```json
{
  "userId": "abc123def",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### List All Users
```bash
curl https://YOUR_API_URL/users
```

**Response:**
```json
{
  "users": [
    {
      "userId": "abc123def",
      "name": "Alice",
      "email": "alice@example.com",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Delete a User
```bash
curl -X DELETE https://YOUR_API_URL/users/abc123def
```

**Response:** `204 No Content`

## Key Features Demonstrated

### 1. Automatic Environment Variables
```typescript
const tableName = process.env.KV_USERS; // Auto-injected by Nimbus
```

### 2. IAM Permissions
Nimbus automatically grants Lambda functions the necessary permissions to:
- Read from DynamoDB (`dynamodb:GetItem`, `dynamodb:Scan`)
- Write to DynamoDB (`dynamodb:PutItem`)
- Delete from DynamoDB (`dynamodb:DeleteItem`)

### 3. DynamoDB Operations

#### Create (PUT)
```typescript
await docClient.send(new PutCommand({
  TableName: tableName,
  Item: user,
}));
```

#### Read (GET)
```typescript
const result = await docClient.send(new GetCommand({
  TableName: tableName,
  Key: { userId },
}));
```

#### List (SCAN)
```typescript
const result = await docClient.send(new ScanCommand({
  TableName: tableName,
}));
```

#### Delete
```typescript
await docClient.send(new DeleteCommand({
  TableName: tableName,
  Key: { userId },
}));
```

### 4. Error Handling
```typescript
try {
  // DynamoDB operation
} catch (error) {
  return {
    statusCode: 500,
    body: JSON.stringify({ error: error.message })
  };
}
```

## What Gets Created

When you deploy this example, Nimbus creates:

1. **DynamoDB Table**: `users` table with `userId` as primary key
2. **Lambda Functions**: One function per API route
3. **IAM Roles**: With DynamoDB permissions
4. **API Gateway**: REST API with CRUD endpoints
5. **Environment Variables**: Table name injected into Lambda functions

## Architecture

```
Internet
    ↓
API Gateway
    ↓
Lambda Functions
    ↓
DynamoDB Table
```

## Advanced Usage

### Custom Primary Key
```typescript
const products = nimbus.KV({
  name: 'products',
  primaryKey: 'productId', // Custom primary key
});
```

### Conditional Operations
```typescript
// Only create if user doesn't exist
await docClient.send(new PutCommand({
  TableName: tableName,
  Item: user,
  ConditionExpression: 'attribute_not_exists(userId)'
}));
```

### Update Operations
```typescript
api.route('PUT', '/users/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  
  const userId = event.pathParameters?.id;
  const updates = JSON.parse(event.body || '{}');
  const tableName = process.env.KV_USERS;

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { userId },
      UpdateExpression: 'SET #name = :name, #email = :email, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#email': 'email'
      },
      ExpressionAttributeValues: {
        ':name': updates.name,
        ':email': updates.email,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(result.Attributes)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
```

### Filtering and Querying
```typescript
// Get active users only
api.route('GET', '/users/active', async (event) => {
  const result = await docClient.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'active'
    }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      users: result.Items || [],
      count: result.Count || 0
    })
  };
});
```

### Pagination
```typescript
api.route('GET', '/users/paginated', async (event) => {
  const limit = parseInt(event.queryStringParameters?.limit || '10');
  const lastKey = event.queryStringParameters?.lastKey;
  
  const params = {
    TableName: tableName,
    Limit: limit
  };
  
  if (lastKey) {
    params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
  }
  
  const result = await docClient.send(new ScanCommand(params));
  
  const response = {
    users: result.Items || [],
    count: result.Count || 0
  };
  
  if (result.LastEvaluatedKey) {
    response.lastKey = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify(response)
  };
});
```

## Clean Up

To remove all resources including the DynamoDB table:

```bash
npm run destroy
```

The `--force` flag is required to delete data resources like DynamoDB tables.

## Next Steps

- Try the [Authentication example](./auth-api) to secure your API
- Explore [Storage example](./storage) for file uploads
- Learn about [Timer example](./timer) for scheduled tasks

## Troubleshooting

### Common Issues

**"Table not found"**
- Make sure the deployment completed successfully
- Check that the environment variable `KV_USERS` is set

**"Access Denied"**
- Nimbus should automatically set IAM permissions
- Check CloudWatch logs for detailed error messages

**"ValidationException"**
- Check that your data matches the expected format
- Ensure required fields are present

**"ConditionalCheckFailedException"**
- This occurs when conditional operations fail
- Check your condition expressions