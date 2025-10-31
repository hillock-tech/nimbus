# Lambda Initialization Example

This example demonstrates how to use static initialization code in Lambda functions with Nimbus. The init function runs once per Lambda container (during cold starts) and is perfect for expensive operations that should be reused across invocations.

## Overview

Lambda containers are reused across multiple invocations. The init function allows you to:

- Initialize AWS SDK clients once per container
- Pre-compile regex patterns and templates
- Load configuration and cache data
- Set up database connection pools
- Perform expensive computations once

## Key Benefits

### Performance
- **Faster warm starts**: Expensive operations done once during cold start
- **Reduced latency**: Pre-initialized clients and cached data
- **Better resource utilization**: Reuse connections and compiled patterns

### Cost Optimization
- **Fewer CPU cycles**: Avoid repeated initialization
- **Lower memory usage**: Shared resources across invocations
- **Reduced API calls**: Cache configuration and data

## Usage Patterns

### 1. Function-Based Init
```typescript
const nimbus = new Nimbus({ projectName: 'my-app' });
const func = nimbus.Function({
  name: 'my-function',
  init: () => {
    // This runs once per container
    const AWS = require('aws-sdk');
    global.dynamoClient = new AWS.DynamoDB.DocumentClient();
    global.startTime = new Date().toISOString();
    console.log('Container initialized');
  },
  handler: async (event, context) => {
    // This runs on every invocation
    // Use global.dynamoClient and global.startTime
    return { statusCode: 200, body: 'Hello World' };
  }
});
```

### 2. String-Based Init
```typescript
const func = nimbus.Function({
  name: 'my-function',
  init: `
    // Static initialization code
    const jwt = require('jsonwebtoken');
    global.jwtSecret = process.env.JWT_SECRET;
    global.emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    console.log('String-based init completed');
  `,
  handler: async (event, context) => {
    // Use global.jwtSecret and global.emailRegex
    return { statusCode: 200, body: 'Initialized' };
  }
});
```

## Examples in This Demo

### 1. AWS SDK Client Initialization
```typescript
init: () => {
  const AWS = require('aws-sdk');
  
  // Initialize clients once per container
  global.dynamoClient = new AWS.DynamoDB.DocumentClient();
  global.s3Client = new AWS.S3();
  
  // Pre-compute expensive operations
  global.encryptionKey = crypto.randomBytes(32);
}
```

### 2. Regex Pattern Compilation
```typescript
init: `
  // Pre-compile regex patterns (expensive operation)
  global.emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  global.phoneRegex = /^\\+?[1-9]\\d{1,14}$/;
  
  // Initialize cache
  global.cache = new Map();
`
```

### 3. HTTP Client Configuration
```typescript
init: () => {
  const axios = require('axios');
  
  // Create configured HTTP client
  global.httpClient = axios.create({
    timeout: 10000,
    headers: { 'User-Agent': 'Nimbus-Lambda/1.0.0' }
  });
  
  // Load configuration
  global.serviceConfig = {
    apiBaseUrl: process.env.API_BASE_URL,
    maxRetries: parseInt(process.env.MAX_RETRIES || '3')
  };
}
```

## Deployment

```bash
cd examples/lambda-init
npm install
npm run deploy
```

## Testing the Examples

After deployment, test the different initialization patterns:

### 1. Test Pre-initialized Clients
```bash
# Test function with AWS SDK initialization
curl https://your-api-url/users/123
```

### 2. Test Cached Configuration
```bash
# Check container configuration and cache
curl https://your-api-url/config
```

### 3. Test Pre-compiled Patterns
```bash
# Test email/phone validation with pre-compiled regex
curl -X POST https://your-api-url/validate \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "phone": "+1234567890"}'
```

### 4. Test Performance Benefits
```bash
# Multiple calls to see container reuse
for i in {1..5}; do
  curl https://your-api-url/config
  echo ""
done
```

## Performance Comparison

### Without Init (Traditional)
```typescript
// ❌ Inefficient - runs on every invocation
handler: async (event, context) => {
  const AWS = require('aws-sdk'); // Loaded every time
  const dynamoClient = new AWS.DynamoDB.DocumentClient(); // Created every time
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Compiled every time
  
  // Use clients and patterns...
}
```

### With Init (Optimized)
```typescript
// ✅ Efficient - runs once per container
init: () => {
  const AWS = require('aws-sdk');
  global.dynamoClient = new AWS.DynamoDB.DocumentClient(); // Created once
  global.emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Compiled once
},
handler: async (event, context) => {
  // Use pre-initialized global.dynamoClient and global.emailRegex
}
```

**Performance Impact:**
- **Cold start**: Slightly longer (initialization happens)
- **Warm invocations**: 50-80% faster (no re-initialization)
- **Memory usage**: Lower (shared resources)
- **Cost**: Reduced (fewer CPU cycles per invocation)

## Best Practices

### 1. Use Global Variables
```typescript
init: () => {
  // ✅ Good - accessible from handler
  global.myClient = new SomeClient();
  
  // ❌ Avoid - not accessible from handler
  const myClient = new SomeClient();
}
```

### 2. Handle Initialization Errors
```typescript
init: () => {
  try {
    global.client = new SomeClient();
    global.initSuccess = true;
  } catch (error) {
    console.error('Initialization failed:', error);
    global.initSuccess = false;
  }
},
handler: async (event, context) => {
  if (!global.initSuccess) {
    return { statusCode: 500, body: 'Service unavailable' };
  }
  // Use global.client
}
```

### 3. Environment-Specific Initialization
```typescript
init: () => {
  const stage = process.env.STAGE || 'dev';
  
  global.config = {
    dev: { timeout: 5000, retries: 1 },
    prod: { timeout: 10000, retries: 3 }
  }[stage];
  
  global.client = new SomeClient(global.config);
}
```

### 4. Lazy Initialization for Optional Services
```typescript
init: () => {
  // Always initialize core services
  global.dynamoClient = new AWS.DynamoDB.DocumentClient();
  
  // Conditionally initialize optional services
  if (process.env.REDIS_ENDPOINT) {
    global.redisClient = new Redis(process.env.REDIS_ENDPOINT);
  }
}
```

## Common Use Cases

### 1. Database Connection Pooling
```typescript
init: () => {
  const { Pool } = require('pg');
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5 // Connection pool size
  });
}
```

### 2. Template Compilation
```typescript
init: () => {
  const Handlebars = require('handlebars');
  const fs = require('fs');
  
  // Pre-compile email templates
  global.templates = {
    welcome: Handlebars.compile(fs.readFileSync('./templates/welcome.hbs', 'utf8')),
    reset: Handlebars.compile(fs.readFileSync('./templates/reset.hbs', 'utf8'))
  };
}
```

### 3. Crypto Key Generation
```typescript
init: () => {
  const crypto = require('crypto');
  
  // Generate encryption keys once
  global.encryptionKey = crypto.randomBytes(32);
  global.hmacKey = crypto.randomBytes(64);
}
```

### 4. Configuration Loading
```typescript
init: () => {
  // Load and parse configuration once
  global.config = {
    apiKeys: {
      stripe: process.env.STRIPE_KEY,
      sendgrid: process.env.SENDGRID_KEY
    },
    limits: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
      rateLimit: parseInt(process.env.RATE_LIMIT || '100')
    }
  };
}
```

## Monitoring and Debugging

### 1. Track Container Reuse
```typescript
init: () => {
  global.containerStats = {
    startTime: new Date().toISOString(),
    invocations: 0,
    errors: 0
  };
},
handler: async (event, context) => {
  global.containerStats.invocations++;
  
  // Log container stats periodically
  if (global.containerStats.invocations % 10 === 0) {
    console.log('Container stats:', global.containerStats);
  }
}
```

### 2. Measure Initialization Time
```typescript
init: () => {
  const startTime = Date.now();
  
  // Perform initialization...
  global.client = new SomeClient();
  
  const initTime = Date.now() - startTime;
  console.log(`Initialization completed in ${initTime}ms`);
  global.initTime = initTime;
}
```

### 3. Health Checks
```typescript
init: () => {
  global.health = {
    database: false,
    cache: false,
    external: false
  };
  
  try {
    global.dbClient = new DatabaseClient();
    global.health.database = true;
  } catch (error) {
    console.error('Database init failed:', error);
  }
}
```

## Troubleshooting

### Common Issues

1. **Variables not accessible in handler**
   - Use `global.` prefix for variables
   - Ensure init function completes successfully

2. **Memory leaks**
   - Clean up resources properly
   - Monitor memory usage over time

3. **Cold start timeouts**
   - Keep initialization lightweight
   - Use lazy loading for optional services

4. **Connection limits**
   - Configure appropriate pool sizes
   - Handle connection failures gracefully

## Cleanup

```bash
npm run destroy
```

## Key Takeaways

1. **Use init for expensive operations** that should run once per container
2. **Store in global variables** to access from handler
3. **Handle initialization errors** gracefully
4. **Monitor container reuse** to optimize performance
5. **Keep init lightweight** to avoid cold start timeouts

This pattern can significantly improve Lambda performance and reduce costs by avoiding repeated initialization work!

## Related Examples

- [Basic API](../basic-api/) - Simple API without initialization
- [Feature Flags](../feature-flags/) - Configuration management
- [Secrets Manager](../secrets-manager/) - Secure credential handling

## Learn More

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda Container Reuse](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)
- [Performance Optimization](https://docs.aws.amazon.com/lambda/latest/dg/performance.html)