# Configuration

Learn how to configure your Nimbus applications for different environments and use cases.

## Basic Configuration

The main configuration is passed to the Nimbus constructor:

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'my-app',        // Required: Unique project identifier
  region: 'us-east-1',          // Required: AWS region
  stage: 'dev',                 // Optional: Deployment stage
  tracing: false                // Optional: Enable X-Ray tracing
});
```

## Environment-Based Configuration

### Using Environment Variables

```typescript
const app = new Nimbus({
  projectName: process.env.PROJECT_NAME || 'my-app',
  region: process.env.AWS_REGION || 'us-east-1',
  stage: process.env.STAGE || 'dev',
  tracing: process.env.ENABLE_TRACING === 'true'
});
```

### Configuration Files

Create environment-specific configuration files:

```typescript
// config/base.ts
export const baseConfig = {
  projectName: 'my-app',
  region: 'us-east-1'
};

// config/development.ts
import { baseConfig } from './base';

export const developmentConfig = {
  ...baseConfig,
  stage: 'dev',
  tracing: false
};

// config/production.ts
import { baseConfig } from './base';

export const productionConfig = {
  ...baseConfig,
  stage: 'prod',
  tracing: true
};
```

Use the configuration:

```typescript
// index.ts
import { developmentConfig, productionConfig } from './config';

const config = process.env.NODE_ENV === 'production' 
  ? productionConfig 
  : developmentConfig;

const app = new Nimbus(config);
```

## Resource Configuration

### API Gateway Configuration

```typescript
const api = app.API({
  name: 'my-api',
  description: 'My REST API',
  stage: 'v1',
  customDomain: 'api.example.com',  // Optional custom domain
  cors: {                           // CORS configuration
    origins: ['https://example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    headers: ['Content-Type', 'Authorization']
  }
});
```

### Lambda Function Configuration

Lambda functions are automatically created for API routes, queue workers, and scheduled tasks. You can configure them through route options:

```typescript
// Configure Lambda function through API route options
api.route('POST', '/process', async (event) => {
  // Your handler logic
}, {
  timeout: 60,                      // Timeout in seconds
  memorySize: 512,                  // Memory in MB
  environment: {                    // Custom environment variables
    LOG_LEVEL: 'info',
    EXTERNAL_API_URL: 'https://api.external.com'
  },
  permissions: [                    // Custom IAM permissions
    {
      Effect: 'Allow',
      Action: 'ses:SendEmail',
      Resource: '*'
    }
  ]
});
```

### Database Configuration

```typescript
// DynamoDB (KV Store)
const users = app.KV({
  name: 'users',
  primaryKey: 'email',              // Custom primary key
  billingMode: 'PAY_PER_REQUEST',   // or 'PROVISIONED'
  encryption: true                  // Enable encryption at rest
});

// SQL Database
const database = app.SQL({
  name: 'main-db',
  schema: 'myapp',                  // Schema name
  deletionProtection: true,         // Prevent accidental deletion
  backupRetention: 7                // Backup retention in days
});
```

### Storage Configuration

```typescript
const storage = app.Storage({
  name: 'uploads',
  versioning: true,                 // Enable versioning
  encryption: 'AES256',             // Server-side encryption
  lifecycle: {                      // Lifecycle rules
    transitions: [
      {
        days: 30,
        storageClass: 'STANDARD_IA'
      },
      {
        days: 90,
        storageClass: 'GLACIER'
      }
    ]
  }
});
```

### Queue Configuration

```typescript
const taskQueue = app.Queue({
  name: 'tasks',
  worker: async (event) => { /* ... */ },
  visibilityTimeout: 300,           // Message visibility timeout
  messageRetention: 1209600,        // 14 days in seconds
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3
  },
  batchSize: 10                     // Messages per batch
});
```

## Stage-Specific Configuration

### Multi-Stage Setup

```typescript
interface StageConfig {
  memorySize: number;
  timeout: number;
  customDomain?: string;
  tracing: boolean;
}

const stageConfigs: Record<string, StageConfig> = {
  dev: {
    memorySize: 128,
    timeout: 30,
    tracing: false
  },
  staging: {
    memorySize: 256,
    timeout: 60,
    customDomain: 'staging-api.example.com',
    tracing: true
  },
  prod: {
    memorySize: 512,
    timeout: 120,
    customDomain: 'api.example.com',
    tracing: true
  }
};

const stage = process.env.STAGE || 'dev';
const stageConfig = stageConfigs[stage];

const app = new Nimbus({
  projectName: 'my-app',
  region: 'us-east-1',
  stage,
  tracing: stageConfig.tracing
});
```

## Security Configuration

### IAM Permissions

```typescript
// Custom permissions for external services via API routes
api.route('POST', '/send-email', async (event) => {
  // Email sending logic
}, {
  permissions: [
    {
      Effect: 'Allow',
      Action: [
        'ses:SendEmail',
        'ses:SendRawEmail'
      ],
      Resource: '*'
    },
    {
      Effect: 'Allow',
      Action: 'ssm:GetParameter',
      Resource: 'arn:aws:ssm:*:*:parameter/myapp/*'
    }
  ]
});
```

### Environment Variables

```typescript
// Secure environment variables via API routes
const api = app.API({ name: 'secure-api' });

api.route('POST', '/process', async (event) => {
  // Access secure configuration
  const apiKey = process.env.EXTERNAL_API_KEY;
  const dbPassword = process.env.DB_PASSWORD;
  
  // Use AWS Systems Manager for secrets
  const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({});
  
  const secret = await ssm.send(new GetParameterCommand({
    Name: '/myapp/secret-key',
    WithDecryption: true
  }));
  
  // Process with secrets
}, {
  environment: {
    EXTERNAL_API_KEY: process.env.EXTERNAL_API_KEY
  },
  permissions: [
    {
      Effect: 'Allow',
      Action: 'ssm:GetParameter',
      Resource: 'arn:aws:ssm:*:*:parameter/myapp/*'
    }
  ]
});
```

## Monitoring Configuration

### X-Ray Tracing

```typescript
const app = new Nimbus({
  projectName: 'traced-app',
  region: 'us-east-1',
  tracing: true                     // Enable for all resources
});

// Or enable per resource
const api = app.API({
  name: 'traced-api',
  tracing: true                     // API-specific tracing
});
```

### CloudWatch Logs

```typescript
// Configure log retention through API routes
api.route('POST', '/process', async (event) => {
  console.log('Processing event:', JSON.stringify(event));
  // Logs automatically go to CloudWatch
}, {
  logRetention: 30                  // Days to retain logs
});
```

## Configuration Validation

### Runtime Validation

```typescript
function validateConfig() {
  const required = ['PROJECT_NAME', 'AWS_REGION'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();

const app = new Nimbus({
  projectName: process.env.PROJECT_NAME!,
  region: process.env.AWS_REGION!
});
```

### TypeScript Configuration Types

```typescript
interface AppConfig {
  projectName: string;
  region: string;
  stage: 'dev' | 'staging' | 'prod';
  tracing: boolean;
  customDomain?: string;
}

const config: AppConfig = {
  projectName: 'my-app',
  region: 'us-east-1',
  stage: 'dev',
  tracing: false
};

const app = new Nimbus(config);
```

## Best Practices

1. **Environment Variables**: Use environment variables for sensitive data
2. **Stage Isolation**: Keep stages completely separate
3. **Validation**: Validate configuration at startup
4. **Defaults**: Provide sensible defaults for optional settings
5. **Documentation**: Document all configuration options
6. **Security**: Never commit secrets to version control
7. **Consistency**: Use consistent naming conventions

## Next Steps

- Explore the [API reference](/api/nimbus) for detailed documentation
- Try the [examples](/examples/) to see configuration in action
- Read about [project structure](/guide/project-structure) for organizing your code