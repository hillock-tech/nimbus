# Basic API Example

This example demonstrates how to create a simple REST API with multiple routes using Nimbus.

## Overview

The basic API example shows:
- Multiple HTTP methods (GET, POST)
- Path parameters
- CORS support
- Automatic Lambda function creation
- JSON request/response handling

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: Basic API with declarative syntax
 */
async function basicExample() {
  const nimbus = new Nimbus({
    region: 'us-east-1',
    projectName: 'my-app',
  });

  // Create an API
  const api = nimbus.API({
    name: 'my-api',
    description: 'My serverless API',
    stage: 'dev',
  });

  // Add routes - Nimbus automatically creates Lambda functions
  api
    .route('GET', '/hello', async (event: any) => {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello from Nimbus!',
          timestamp: new Date().toISOString(),
        }),
      };
    }, { cors: true })
    
    .route('GET', '/users/{id}', async (event: any) => {
      const userId = event.pathParameters?.id || 'unknown';
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: 'John Doe',
          email: 'john@example.com',
        }),
      };
    }, { cors: true })
    
    .route('POST', '/users', async (event: any) => {
      const body = JSON.parse(event.body || '{}');
      
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'User created',
          user: body,
          id: Math.random().toString(36).substring(7),
        }),
      };
    }, { cors: true });

// Export for CLI deployment
export default nimbus;

// Run the example
basicExample()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir basic-api-example
   cd basic-api-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus
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
       "destroy": "npx nimbus destroy --project my-app --region us-east-1"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will:
1. Create Lambda functions for each route
2. Create an API Gateway
3. Set up proper IAM permissions
4. Output the API URL

## Test the API

Once deployed, test the endpoints:

### Hello Endpoint
```bash
curl https://YOUR_API_URL/hello
```

**Response:**
```json
{
  "message": "Hello from Nimbus!",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Get User Endpoint
```bash
curl https://YOUR_API_URL/users/123
```

**Response:**
```json
{
  "userId": "123",
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Create User Endpoint
```bash
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

**Response:**
```json
{
  "message": "User created",
  "user": {
    "name": "Alice",
    "email": "alice@example.com"
  },
  "id": "abc123"
}
```

## Key Features Demonstrated

### 1. Multiple HTTP Methods
- **GET** for retrieving data
- **POST** for creating resources

### 2. Path Parameters
```typescript
api.route('GET', '/users/{id}', async (event) => {
  const userId = event.pathParameters?.id;
  // Use userId in your logic
});
```

### 3. Request Body Parsing
```typescript
api.route('POST', '/users', async (event) => {
  const body = JSON.parse(event.body || '{}');
  // Process the request body
});
```

### 4. CORS Support
```typescript
api.route('GET', '/hello', handler, { cors: true });
```

### 5. Proper HTTP Status Codes
- `200` for successful GET requests
- `201` for successful resource creation
- Proper error codes for failures

## What Gets Created

When you deploy this example, Nimbus creates:

1. **API Gateway**: REST API with three endpoints
2. **Lambda Functions**: One function per route
3. **IAM Roles**: Execution roles for Lambda functions
4. **CloudWatch Logs**: Log groups for each function

## Architecture

```
Internet
    ↓
API Gateway
    ↓
Lambda Functions
    ↓
CloudWatch Logs
```

## Customization

### Add More Routes
```typescript
// Health check endpoint
api.route('GET', '/health', async () => ({
  statusCode: 200,
  body: JSON.stringify({ status: 'healthy' })
}));

// Delete user endpoint
api.route('DELETE', '/users/{id}', async (event) => {
  const userId = event.pathParameters?.id;
  
  return {
    statusCode: 204,
    body: ''
  };
});
```

### Custom Response Headers
```typescript
api.route('GET', '/data', async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=3600',
    'X-Custom-Header': 'MyValue'
  },
  body: JSON.stringify({ data: 'example' })
}));
```

### Error Handling
```typescript
api.route('POST', '/users', async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    
    if (!body.name || !body.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Name and email are required' 
        })
      };
    }
    
    // Process user creation
    return {
      statusCode: 201,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error' 
      })
    };
  }
});
```

## Clean Up

To remove all resources:

```bash
npm run destroy
```

This will delete:
- API Gateway
- Lambda functions
- IAM roles
- CloudWatch log groups

## Next Steps

- Try the [KV Store example](./kv) to add a database
- Explore [Authentication](./auth-api) to secure your API
- Learn about [Storage](./storage) for file uploads

## Troubleshooting

### Common Issues

**"No index.ts found"**
- Make sure you created the `index.ts` file in your project root

**"Access Denied"**
- Check your AWS credentials: `aws sts get-caller-identity`
- Ensure your AWS user has necessary permissions

**"API Gateway not found"**
- Make sure the deployment completed successfully
- Check the deployment logs for errors

**CORS Issues**
- Ensure you added `{ cors: true }` to your route options
- Check that your frontend is making requests to the correct URL