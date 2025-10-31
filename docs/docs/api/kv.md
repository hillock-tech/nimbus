# KV Store

The KV class represents a DynamoDB table optimized for key-value operations.

> **Performance Tip**: Use the `init` pattern in your API or Function definitions to initialize AWS SDK clients once per container instead of on every request. This can improve performance by 50-80% for warm invocations.

## Creation

```typescript
const kv = app.KV(config: KVConfig)
```

### KVConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Table name |
| `primaryKey` | `string` | ❌ | Primary key name (default: 'id') |
| `billingMode` | `string` | ❌ | 'PAY_PER_REQUEST' or 'PROVISIONED' |
| `encryption` | `boolean` | ❌ | Enable encryption at rest |

### Example

```typescript
const users = app.KV({
  name: 'users',
  primaryKey: 'email', // Use email as primary key
  billingMode: 'PAY_PER_REQUEST',
  encryption: true
});
```

## Environment Variables

KV stores automatically inject environment variables:

- `KV_{NAME}` - Table name (e.g., `KV_USERS`)
- `KV_{NAME}_ARN` - Table ARN

## Usage in Lambda Functions

### Basic Operations

```typescript
// Create API with shared initialization
const api = nimbus.API({
  name: 'users-api',
  init: () => {
    // Initialize DynamoDB client once per container
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    
    const client = new DynamoDBClient({});
    global.docClient = DynamoDBDocumentClient.from(client);
  }
});

api.route('POST', '/users', async (event) => {
  const { PutCommand } = require('@aws-sdk/lib-dynamodb');
  const tableName = process.env.KV_USERS; // Auto-injected
  
  const user = JSON.parse(event.body || '{}');
  
  await global.docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: new Date().toISOString()
    }
  }));
  
  return {
    statusCode: 201,
    body: JSON.stringify(user)
  };
});
```

### Get Item

```typescript
api.route('GET', '/users/{id}', async (event) => {
  const { GetCommand } = require('@aws-sdk/lib-dynamodb');
  // Use pre-initialized client from API init
  const tableName = process.env.KV_USERS;
  
  const userId = event.pathParameters?.id;
  
  const result = await global.docClient.send(new GetCommand({
    TableName: tableName,
    Key: { id: userId }
  }));
  
  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'User not found' })
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify(result.Item)
  };
});
```

### Put Item

```typescript
api.route('PUT', '/users/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
  const userId = event.pathParameters?.id;
  const updates = JSON.parse(event.body || '{}');
  
  const item = {
    id: userId,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: item
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify(item)
  };
});
```

### Update Item

```typescript
api.route('PATCH', '/users/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
  const userId = event.pathParameters?.id;
  const updates = JSON.parse(event.body || '{}');
  
  // Build update expression
  const updateExpression = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  Object.keys(updates).forEach((key, index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    
    updateExpression.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = updates[key];
  });
  
  // Add updatedAt
  updateExpression.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  
  const result = await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { id: userId },
    UpdateExpression: `SET ${updateExpression.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify(result.Attributes)
  };
});
```

### Delete Item

```typescript
api.route('DELETE', '/users/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
  const userId = event.pathParameters?.id;
  
  await docClient.send(new DeleteCommand({
    TableName: tableName,
    Key: { id: userId }
  }));
  
  return {
    statusCode: 204,
    body: ''
  };
});
```

### Scan (List All)

```typescript
api.route('GET', '/users', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
  const result = await docClient.send(new ScanCommand({
    TableName: tableName
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

### Query with Filters

```typescript
api.route('GET', '/users/active', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
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

## Advanced Operations

### Conditional Updates

```typescript
// Only update if item exists
await docClient.send(new UpdateCommand({
  TableName: tableName,
  Key: { id: userId },
  UpdateExpression: 'SET #name = :name',
  ConditionExpression: 'attribute_exists(id)',
  ExpressionAttributeNames: { '#name': 'name' },
  ExpressionAttributeValues: { ':name': newName }
}));
```

### Atomic Counters

```typescript
// Increment a counter atomically
await docClient.send(new UpdateCommand({
  TableName: tableName,
  Key: { id: 'page-views' },
  UpdateExpression: 'ADD #count :increment',
  ExpressionAttributeNames: { '#count': 'count' },
  ExpressionAttributeValues: { ':increment': 1 }
}));
```

### Batch Operations

```typescript
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// Batch write multiple items
const items = [
  { id: '1', name: 'User 1' },
  { id: '2', name: 'User 2' },
  { id: '3', name: 'User 3' }
];

await docClient.send(new BatchWriteCommand({
  RequestItems: {
    [tableName]: items.map(item => ({
      PutRequest: { Item: item }
    }))
  }
}));
```

### Pagination

```typescript
api.route('GET', '/users/paginated', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
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

## Data Types

DynamoDB supports various data types:

```typescript
const item = {
  id: 'user123',                    // String
  age: 25,                          // Number
  active: true,                     // Boolean
  tags: ['admin', 'user'],          // List
  metadata: {                       // Map
    lastLogin: '2024-01-01',
    preferences: {
      theme: 'dark',
      notifications: true
    }
  },
  scores: new Set([100, 200, 300]), // Number Set
  roles: new Set(['admin', 'user']) // String Set
};
```

## Error Handling

```typescript
api.route('GET', '/users/{id}', async (event) => {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
  
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.KV_USERS;
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { id: event.pathParameters?.id }
    }));
    
    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(result.Item)
    };
  } catch (error) {
    console.error('DynamoDB error:', error);
    
    if (error.name === 'ValidationException') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request' })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
});
```

## Best Practices

1. **Primary Key Design**: Choose a primary key that distributes data evenly
2. **Item Size**: Keep items under 400KB
3. **Attribute Names**: Use short attribute names to save space
4. **Indexes**: Use Global Secondary Indexes for different access patterns
5. **Batch Operations**: Use batch operations for multiple items
6. **Error Handling**: Handle DynamoDB-specific errors appropriately
7. **Pagination**: Implement pagination for large result sets
8. **Conditional Operations**: Use conditions to prevent race conditions

## Common Patterns

### User Profile Store

```typescript
const profiles = app.KV({
  name: 'user-profiles',
  primaryKey: 'userId'
});

// Store user profile
api.route('PUT', '/profile', async (event) => {
  const profile = JSON.parse(event.body || '{}');
  const userId = event.requestContext?.authorizer?.userId;
  
  await docClient.send(new PutCommand({
    TableName: process.env.KV_USER_PROFILES,
    Item: {
      userId,
      ...profile,
      updatedAt: new Date().toISOString()
    }
  }));
  
  return { statusCode: 200, body: JSON.stringify({ updated: true }) };
});
```

### Session Store

```typescript
const sessions = app.KV({
  name: 'sessions',
  primaryKey: 'sessionId'
});

// Create session
api.route('POST', '/sessions', async (event) => {
  const sessionId = require('nanoid').nanoid();
  const { userId } = JSON.parse(event.body || '{}');
  
  await docClient.send(new PutCommand({
    TableName: process.env.KV_SESSIONS,
    Item: {
      sessionId,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    }
  }));
  
  return {
    statusCode: 201,
    body: JSON.stringify({ sessionId })
  };
});
```

### Configuration Store

```typescript
const config = app.KV({
  name: 'app-config',
  primaryKey: 'key'
});

// Get configuration value
api.route('GET', '/config/{key}', async (event) => {
  const key = event.pathParameters?.key;
  
  const result = await docClient.send(new GetCommand({
    TableName: process.env.KV_APP_CONFIG,
    Key: { key }
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      key,
      value: result.Item?.value || null
    })
  };
});
```