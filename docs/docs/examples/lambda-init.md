# Lambda Initialization Example

This example demonstrates how to use static initialization code in Lambda functions for performance optimization and cost reduction.

## Overview

Lambda containers are reused across multiple invocations. The `init` function allows you to perform expensive operations once per container during cold starts, rather than on every invocation.

## Key Benefits

### Performance Optimization
- **50-80% faster warm invocations**: Avoid repeated initialization
- **Reduced latency**: Pre-initialized clients and cached data
- **Better resource utilization**: Reuse connections and compiled patterns

### Cost Reduction
- **Fewer CPU cycles**: Expensive operations done once
- **Lower memory usage**: Shared resources across invocations
- **Reduced API calls**: Cache configuration and data

## Usage Patterns

### Function-Based Init
```typescript
const nimbus = new Nimbus({ projectName: 'my-app' });
const api = nimbus.API({ 
  name: 'optimized-api',
  init: () => {
    // Runs once per Lambda container (cold start)
  init: () => {
    // Runs once per Lambda container
    const AWS = require('aws-sdk');
    global.dynamoClient = new AWS.DynamoDB.DocumentClient();
    global.startTime = new Date().toISOString();
    console.log('Container initialized');
  },
  handler: async (event, context) => {
    // Runs on every invocation
    // Use pre-initialized global.dynamoClient
    const result = await global.dynamoClient.get({
      TableName: 'users',
      Key: { id: event.pathParameters.id }
    }).promise();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        user: result.Item,
        containerStart: global.startTime
      })
    };
  }
});
```

### String-Based Init
```typescript
const nimbus = new Nimbus({ projectName: 'my-app' });
const api = nimbus.API({ 
  name: 'string-init-api',
  init: `
    // Static initialization code
    const jwt = require('jsonwebtoken');
    
    // Pre-compile expensive regex patterns
    global.emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    global.phoneRegex = /^\\+?[1-9]\\d{1,14}$/;
    
    // Initialize cache
    global.cache = new Map();
    
    console.log('String-based initialization completed');
  `,
  handler: async (event, context) => {
    const { email } = JSON.parse(event.body || '{}');
    
    // Use pre-compiled regex (much faster)
    if (!global.emailRegex.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: true })
    };
  }
});
```

## Common Use Cases

### 1. AWS SDK Client Initialization
```typescript
init: () => {
  const AWS = require('aws-sdk');
  
  // Initialize clients once per container
  global.dynamoClient = new AWS.DynamoDB.DocumentClient();
  global.s3Client = new AWS.S3();
  global.sesClient = new AWS.SES();
  
  console.log('AWS clients initialized');
}
```

### 2. Database Connection Pooling
```typescript
init: () => {
  const { Pool } = require('pg');
  
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5, // Connection pool size
    idleTimeoutMillis: 30000
  });
  
  console.log('Database pool initialized');
}
```

### 3. Template and Pattern Compilation
```typescript
init: () => {
  const Handlebars = require('handlebars');
  const fs = require('fs');
  
  // Pre-compile email templates
  global.templates = {
    welcome: Handlebars.compile(fs.readFileSync('./templates/welcome.hbs', 'utf8')),
    reset: Handlebars.compile(fs.readFileSync('./templates/reset.hbs', 'utf8'))
  };
  
  // Pre-compile regex patterns
  global.patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\+?[1-9]\d{1,14}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  };
}
```

### 4. Configuration and Secrets Loading
```typescript
init: () => {
  // Load configuration once
  global.config = {
    apiKeys: {
      stripe: process.env.STRIPE_KEY,
      sendgrid: process.env.SENDGRID_KEY
    },
    limits: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
      rateLimit: parseInt(process.env.RATE_LIMIT || '100')
    },
    features: {
      enableCaching: process.env.ENABLE_CACHING === 'true',
      enableLogging: process.env.ENABLE_LOGGING === 'true'
    }
  };
  
  console.log('Configuration loaded:', Object.keys(global.config));
}
```

### 5. HTTP Client Configuration
```typescript
init: () => {
  const axios = require('axios');
  
  // Create configured HTTP client
  global.httpClient = axios.create({
    timeout: 10000,
    headers: {
      'User-Agent': 'MyApp/1.0.0',
      'Accept': 'application/json'
    },
    retry: 3
  });
  
  // Initialize metrics collection
  global.metrics = {
    requests: 0,
    errors: 0,
    totalTime: 0
  };
}
```

## Performance Comparison

### Without Init (Inefficient)
```typescript
// ❌ Runs on every invocation
handler: async (event, context) => {
  const AWS = require('aws-sdk'); // Loaded every time
  const client = new AWS.DynamoDB.DocumentClient(); // Created every time
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Compiled every time
  
  // Process request...
}
```

### With Init (Optimized)
```typescript
// ✅ Runs once per container
init: () => {
  const AWS = require('aws-sdk');
  global.client = new AWS.DynamoDB.DocumentClient(); // Created once
  global.emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Compiled once
},
handler: async (event, context) => {
  // Use pre-initialized resources
  // 50-80% faster execution
}
```

## Best Practices

### 1. Use Global Variables
```typescript
init: () => {
  // ✅ Accessible from handler
  global.myClient = new SomeClient();
  
  // ❌ Not accessible from handler
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
    console.error('Init failed:', error);
    global.initSuccess = false;
  }
},
handler: async (event, context) => {
  if (!global.initSuccess) {
    return { statusCode: 500, body: 'Service unavailable' };
  }
  // Use global.client safely
}
```

### 3. Environment-Specific Configuration
```typescript
init: () => {
  const stage = process.env.STAGE || 'dev';
  
  global.config = {
    dev: { timeout: 5000, retries: 1 },
    staging: { timeout: 8000, retries: 2 },
    prod: { timeout: 10000, retries: 3 }
  }[stage];
}
```

### 4. Lazy Loading for Optional Services
```typescript
init: () => {
  // Always initialize core services
  global.dynamoClient = new AWS.DynamoDB.DocumentClient();
  
  // Conditionally initialize optional services
  if (process.env.REDIS_ENDPOINT) {
    const Redis = require('redis');
    global.redisClient = Redis.createClient(process.env.REDIS_ENDPOINT);
  }
  
  if (process.env.ELASTICSEARCH_ENDPOINT) {
    const { Client } = require('@elastic/elasticsearch');
    global.esClient = new Client({ node: process.env.ELASTICSEARCH_ENDPOINT });
  }
}
```

## Monitoring and Debugging

### Container Reuse Tracking
```typescript
init: () => {
  global.containerStats = {
    startTime: new Date().toISOString(),
    invocations: 0,
    errors: 0,
    totalProcessingTime: 0
  };
},
handler: async (event, context) => {
  const startTime = Date.now();
  global.containerStats.invocations++;
  
  try {
    // Process request...
    const result = await processRequest(event);
    
    const processingTime = Date.now() - startTime;
    global.containerStats.totalProcessingTime += processingTime;
    
    // Log stats every 10 invocations
    if (global.containerStats.invocations % 10 === 0) {
      console.log('Container stats:', {
        ...global.containerStats,
        avgProcessingTime: global.containerStats.totalProcessingTime / global.containerStats.invocations
      });
    }
    
    return result;
  } catch (error) {
    global.containerStats.errors++;
    throw error;
  }
}
```

### Health Checks
```typescript
init: () => {
  global.health = {
    database: false,
    cache: false,
    external: false
  };
  
  // Test database connection
  try {
    global.dbClient = new DatabaseClient();
    global.health.database = true;
  } catch (error) {
    console.error('Database init failed:', error);
  }
  
  // Test cache connection
  try {
    global.cacheClient = new CacheClient();
    global.health.cache = true;
  } catch (error) {
    console.error('Cache init failed:', error);
  }
}
```

## Deployment

```bash
cd examples/lambda-init
npm install
npm run deploy
```

## Testing Performance Benefits

After deployment, test the performance improvements:

```bash
# Test multiple invocations to see container reuse
for i in {1..10}; do
  echo "Invocation $i:"
  curl -w "Time: %{time_total}s\n" https://your-api-url/config
  echo ""
done
```

## Common Pitfalls

### 1. Memory Leaks
```typescript
// ❌ Can cause memory leaks
init: () => {
  global.cache = new Map();
  // Cache grows indefinitely
}

// ✅ Implement cache size limits
init: () => {
  global.cache = new Map();
  global.MAX_CACHE_SIZE = 1000;
},
handler: async (event, context) => {
  // Implement LRU or size-based eviction
  if (global.cache.size > global.MAX_CACHE_SIZE) {
    const firstKey = global.cache.keys().next().value;
    global.cache.delete(firstKey);
  }
}
```

### 2. Cold Start Timeouts
```typescript
// ❌ Too much work in init
init: () => {
  // Heavy computation that might timeout
  global.data = processLargeDataset();
}

// ✅ Keep init lightweight
init: () => {
  // Initialize clients only
  global.client = new SomeClient();
  // Defer heavy work to first invocation
}
```

### 3. Connection Limits
```typescript
// ❌ Too many connections
init: () => {
  global.dbPool = new Pool({ max: 100 }); // Too many
}

// ✅ Appropriate pool size
init: () => {
  global.dbPool = new Pool({ 
    max: 5, // Reasonable for Lambda
    idleTimeoutMillis: 30000
  });
}
```

## Cleanup

```bash
npm run destroy
```

## Key Takeaways

1. **Use init for expensive operations** that should run once per container
2. **Store results in global variables** to access from handler
3. **Handle initialization errors** gracefully with fallbacks
4. **Monitor container reuse** to measure performance benefits
5. **Keep initialization lightweight** to avoid cold start timeouts
6. **Implement proper resource management** to prevent memory leaks

The init function can provide significant performance improvements and cost savings by eliminating repeated initialization work across Lambda invocations!

## Related Examples

- [Feature Flags](./feature-flags.md) - Configuration management patterns
- [Secrets Manager](./secrets-manager.md) - Secure credential handling
- [Basic API](./basic-api.md) - Simple API without optimization

## Learn More

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda Performance Optimization](https://docs.aws.amazon.com/lambda/latest/dg/performance.html)
- [Container Reuse](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)