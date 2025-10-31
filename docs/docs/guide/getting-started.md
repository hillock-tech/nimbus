# Getting Started

Let's build your first serverless application with Nimbus. We'll create a simple API with a database in just a few minutes.

## Create Your First App

### 1. Initialize Project

```bash
mkdir my-nimbus-app
cd my-nimbus-app
npm init -y
npm install nimbus
npm install -D @types/node tsx typescript
```

### 2. Initialize State Management

```bash
npx nimbus init
```

When prompted:
- Enter a unique S3 bucket name (e.g., `my-nimbus-state-12345`)
- Choose your AWS region (or press Enter for `us-east-1`)

This creates a `.nimbusrc` file for state management.

### 3. Create the Application

Create `index.ts`:

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'my-first-app',
  region: 'us-east-1'
});

// Create a KV store for users
const users = app.KV({
  name: 'users',
  primaryKey: 'id'
});

// Create an API
const api = app.API({
  name: 'users-api',
  stage: 'dev'
});

// Get all users
api.route('GET', '/users', async () => {
  // In a real app, you'd query the database here
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      users: [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' }
      ]
    })
  };
});

// Get user by ID
api.route('GET', '/users/{id}', async (event) => {
  const userId = event.pathParameters?.id;
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: userId,
      name: 'Sample User',
      email: 'user@example.com'
    })
  };
});

// Create a new user
api.route('POST', '/users', async (event) => {
  const user = JSON.parse(event.body || '{}');
  
  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: Math.random().toString(36).substring(7),
      ...user,
      createdAt: new Date().toISOString()
    })
  };
});

// Export for CLI deployment
export default app;
```

### 4. Deploy Your Application

Deploy using the Nimbus CLI:

```bash
npx nimbus deploy index.ts
```

The CLI will:
1. Import your `index.ts` file
2. Load the exported Nimbus instance
3. Call `.deploy()` on it
4. Show deployment results

### 5. Add TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 6. Update Package.json

Add deployment scripts to `package.json`:

```json
{
  "scripts": {
    "deploy": "npx nimbus deploy index.ts",
    "destroy": "npx nimbus destroy --project my-first-app --region us-east-1"
  }
}
```

## Performance Optimization with Init

For better Lambda performance, use the `init` pattern to initialize expensive resources once per container:

```typescript
const api = nimbus.API({
  name: 'optimized-api',
  init: () => {
    // Runs once per Lambda container (cold start)
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    
    // Initialize clients once
    const client = new DynamoDBClient({});
    global.docClient = DynamoDBDocumentClient.from(client);
    
    console.log('Container initialized');
  }
});

api.route('POST', '/users', async (event) => {
  // Runs on every invocation - use pre-initialized client
  const { PutCommand } = require('@aws-sdk/lib-dynamodb');
  
  const user = JSON.parse(event.body || '{}');
  
  await global.docClient.send(new PutCommand({
    TableName: process.env.KV_USERS,
    Item: user
  }));
  
  return {
    statusCode: 201,
    body: JSON.stringify(user)
  };
});
```

**Benefits:**
- 50-80% faster warm invocations
- Reduced AWS SDK initialization overhead
- Lower memory usage through resource reuse
- Better cost efficiency

### 6. Deploy Your App

```bash
npm run deploy
```

You'll see output like:

```
🚀 Deploying my-first-app...
✅ Created DynamoDB table: users
✅ Created Lambda functions
✅ Created API Gateway
✅ Deployment complete!

API URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev
```

### 7. Test Your API

```bash
# Get all users
curl https://your-api-url/users

# Get specific user
curl https://your-api-url/users/123

# Create a user
curl -X POST https://your-api-url/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}'
```

## What Just Happened?

Nimbus automatically created:

1. **DynamoDB Table**: A NoSQL database for storing users
2. **Lambda Functions**: One for each API route
3. **API Gateway**: REST API with proper routing
4. **IAM Roles**: Permissions for Lambda to access DynamoDB
5. **Environment Variables**: Database table name injected into functions

## Clean Up

When you're done experimenting:

```bash
npm run destroy
```

This removes all AWS resources created by Nimbus.

## Next Steps

- Learn about [project structure](/guide/project-structure)
- Explore more [examples](/examples/)
- Read the [API reference](/api/nimbus)

## Common Issues

### AWS Credentials Not Found
Make sure you've configured AWS CLI:
```bash
aws configure
```

### Region Not Supported
Some AWS services aren't available in all regions. Try `us-east-1` or `us-west-2`.

### Permission Denied
Your AWS user needs permissions to create Lambda functions, API Gateway, DynamoDB tables, and IAM roles.