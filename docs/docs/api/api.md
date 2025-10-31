# API Gateway

The API class represents an AWS API Gateway with automatic Lambda function creation and integration.

## Creation

```typescript
const api = app.API(config: APIConfig)
```

### APIConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | API name |
| `description` | `string` | ❌ | API description |
| `stage` | `string` | ❌ | API stage (default: 'dev') |
| `customDomain` | `string` | ❌ | Custom domain name |
| `cors` | `CORSConfig` | ❌ | CORS configuration |

### Example

```typescript
const api = app.API({
  name: 'my-api',
  description: 'My REST API',
  stage: 'v1',
  customDomain: 'api.example.com'
});
```

## Methods

### route()

Add a route to the API. Nimbus automatically creates a Lambda function for each route.

```typescript
api.route(method: string, path: string, handler: Function, options?: RouteOptions)
```

**Parameters:**
- `method` - HTTP method (GET, POST, PUT, DELETE, etc.)
- `path` - Route path with optional parameters
- `handler` - Route handler function (Lambda function created automatically)
- `options` - Route configuration options

**Route Options:**
- `cors` (boolean) - Enable CORS for this route
- `authorizer` (string) - Name of authorizer to use
- `timeout` (number) - Lambda function timeout in seconds
- `memorySize` (number) - Lambda function memory in MB
- `environment` (object) - Environment variables for the Lambda function
- `permissions` (array) - Custom IAM permissions for the Lambda function

::: info Automatic Lambda Creation
Each route automatically gets its own Lambda function. You don't need to manage Lambda functions directly - Nimbus handles the creation, configuration, and deployment for you.
:::

**Examples:**

```typescript
// Simple GET route
api.route('GET', '/hello', async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Hello World!' })
}));

// Route with path parameters
api.route('GET', '/users/{id}', async (event) => {
  const userId = event.pathParameters?.id;
  return {
    statusCode: 200,
    body: JSON.stringify({ userId, name: 'John Doe' })
  };
});

// POST route with CORS
api.route('POST', '/users', async (event) => {
  const user = JSON.parse(event.body || '{}');
  return {
    statusCode: 201,
    body: JSON.stringify({ id: '123', ...user })
  };
}, { cors: true });

// Protected route with authorizer
api.route('GET', '/protected', async (event) => {
  const userId = event.requestContext?.authorizer?.userId;
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Protected data', userId })
  };
}, { 
  cors: true, 
  authorizer: 'jwt-auth',
  timeout: 30
});
```

### authorizer()

Add a Lambda authorizer to the API.

```typescript
api.authorizer(config: AuthorizerConfig)
```

**AuthorizerConfig:**
- `name` (string) - Authorizer name
- `type` (string) - 'TOKEN' or 'REQUEST'
- `handler` (function) - Authorizer function
- `authorizerResultTtlInSeconds` (number) - Cache TTL

**Example:**

```typescript
api.authorizer({
  name: 'jwt-auth',
  type: 'REQUEST',
  handler: async (event) => {
    const token = event.headers?.Authorization;
    
    if (!token || !isValidToken(token)) {
      throw new Error('Unauthorized');
    }
    
    return {
      principalId: 'user123',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn
        }]
      },
      context: {
        userId: 'user123',
        email: 'user@example.com'
      }
    };
  },
  authorizerResultTtlInSeconds: 300
});
```

## Path Parameters

Use curly braces to define path parameters:

```typescript
// Single parameter
api.route('GET', '/users/{id}', async (event) => {
  const id = event.pathParameters?.id;
  // ...
});

// Multiple parameters
api.route('GET', '/users/{userId}/posts/{postId}', async (event) => {
  const { userId, postId } = event.pathParameters || {};
  // ...
});

// Optional parameters with proxy
api.route('GET', '/files/{proxy+}', async (event) => {
  const filePath = event.pathParameters?.proxy;
  // Matches /files/folder/subfolder/file.txt
});
```

## Request Handling

### Event Object

The handler receives an AWS API Gateway event:

```typescript
interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  pathParameters: Record<string, string> | null;
  queryStringParameters: Record<string, string> | null;
  headers: Record<string, string>;
  body: string | null;
  isBase64Encoded: boolean;
  requestContext: {
    requestId: string;
    authorizer?: Record<string, any>;
    // ... more context
  };
}
```

### Response Format

Return a response object:

```typescript
interface APIGatewayResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}
```

**Examples:**

```typescript
// JSON response
return {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Success' })
};

// HTML response
return {
  statusCode: 200,
  headers: { 'Content-Type': 'text/html' },
  body: '<h1>Hello World</h1>'
};

// Binary response
return {
  statusCode: 200,
  headers: { 'Content-Type': 'image/png' },
  body: base64EncodedImage,
  isBase64Encoded: true
};

// Error response
return {
  statusCode: 400,
  body: JSON.stringify({ error: 'Bad Request' })
};
```

## CORS Configuration

### Simple CORS

```typescript
api.route('GET', '/api/data', handler, { cors: true });
```

### Custom CORS

```typescript
const api = app.API({
  name: 'api',
  cors: {
    origins: ['https://example.com', 'https://app.example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    headers: ['Content-Type', 'Authorization', 'X-Api-Key'],
    credentials: true
  }
});
```

## Environment Variables

API Gateway routes automatically receive:

- `AWS_REGION` - AWS region
- `AWS_LAMBDA_FUNCTION_NAME` - Function name
- Plus any custom environment variables from route options

## Error Handling

```typescript
api.route('POST', '/users', async (event) => {
  try {
    const user = JSON.parse(event.body || '{}');
    
    if (!user.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    // Process user...
    
    return {
      statusCode: 201,
      body: JSON.stringify(user)
    };
  } catch (error) {
    console.error('Error creating user:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
});
```

## Custom Domains

```typescript
const api = app.API({
  name: 'production-api',
  customDomain: 'api.example.com'
});
```

This automatically:
- Creates/finds ACM certificate
- Sets up domain mapping
- Configures Route 53 (if hosted zone exists)

## Best Practices

1. **Error Handling**: Always wrap handlers in try-catch
2. **Validation**: Validate input data before processing
3. **CORS**: Configure CORS appropriately for your frontend
4. **Status Codes**: Use proper HTTP status codes
5. **Logging**: Use console.log for CloudWatch logs
6. **Timeouts**: Set appropriate timeouts for long-running operations
7. **Memory**: Adjust memory size based on function requirements

## Examples

### REST API

```typescript
const api = app.API({ name: 'rest-api' });

// List resources
api.route('GET', '/users', async () => {
  // Return list of users
});

// Get specific resource
api.route('GET', '/users/{id}', async (event) => {
  const id = event.pathParameters?.id;
  // Return specific user
});

// Create resource
api.route('POST', '/users', async (event) => {
  const user = JSON.parse(event.body || '{}');
  // Create and return user
});

// Update resource
api.route('PUT', '/users/{id}', async (event) => {
  const id = event.pathParameters?.id;
  const updates = JSON.parse(event.body || '{}');
  // Update and return user
});

// Delete resource
api.route('DELETE', '/users/{id}', async (event) => {
  const id = event.pathParameters?.id;
  // Delete user
  return { statusCode: 204, body: '' };
});
```

### File Upload API

```typescript
api.route('POST', '/upload', async (event) => {
  const { filename, content } = JSON.parse(event.body || '{}');
  
  // Upload to S3
  const key = `uploads/${Date.now()}-${filename}`;
  // ... S3 upload logic
  
  return {
    statusCode: 201,
    body: JSON.stringify({ key, url: `https://bucket.s3.amazonaws.com/${key}` })
  };
}, { 
  cors: true,
  timeout: 60,
  memorySize: 512
});
```