<p align="center">
    <a href="#" title="Nimbus - Enterprise Serverless Framework">
        <img src="https://hillocktech.com/nimbus-logo.png" width="350">
    </a>
</p>

# Nimbus

**Enterprise-ready serverless framework for AWS**

[![Production Ready](https://img.shields.io/badge/Production%20Ready-85%25-green.svg)](https://github.com/hillock-tech/nimbus-js)
[![Security](https://img.shields.io/badge/Security-WAF%20%7C%20Encryption%20%7C%20Secrets-blue.svg)](https://github.com/hillock-tech/nimbus-js)
[![Reliability](https://img.shields.io/badge/Reliability-DLQ%20%7C%20Circuit%20Breakers-orange.svg)](https://github.com/hillock-tech/nimbus-js)

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus({
  projectName: 'my-app',
  stage: 'prod',
  tracing: true, // X-Ray tracing enabled
});

// Encrypted database with backups
const userStore = nimbus.NoSQL({
  name: 'users',
  encryption: true,
});

// WAF-protected API
const api = nimbus.API({
  name: 'api',
  waf: {
    enabled: true,
    rateLimiting: { enabled: true, limit: 10000 },
    sqlInjectionProtection: true,
  },
});

api.route('GET', '/users/{id}', async (event) => {
  const user = await userStore.get(event.pathParameters.id);
  return { statusCode: 200, body: JSON.stringify(user) };
});

// Export for CLI deployment
export default nimbus;
```

## 🎯 Why Nimbus?

### **Production-First Design**
Unlike other frameworks, Nimbus is built with production requirements from day one:

- **🔒 Security by default** - WAF protection, encryption, least-privilege IAM
- **🛡️ Reliability patterns** - Dead letter queues, circuit breakers, retry logic
- **📊 Complete observability** - X-Ray tracing, structured logging, health checks
- **🔧 Operational excellence** - State management, resource cleanup, multi-stage deployments

### **Developer Experience**
- **Type-safe** - Full TypeScript support with intelligent autocomplete
- **Declarative** - Describe what you want, not how to build it
- **Zero configuration** - Sensible defaults for everything
- **Batteries included** - All production features work out of the box

## 🚀 Quick Start

```bash
npm install @hillock-tech/nimbus-js
```

Create your first app:

```typescript
// index.ts
import Nimbus from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus({
  projectName: 'hello-nimbus',
  stage: 'dev',
});

const api = nimbus.API({ name: 'hello-api' });

api.route('GET', '/hello', async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Hello, Nimbus!' }),
}));

export default nimbus;
```

Deploy:

```bash
npx nimbus deploy
```

## 🏗️ Resources

All resources are automatically integrated with proper IAM permissions and environment variables.

### 🌐 API Gateway with WAF Protection

```typescript
const api = nimbus.API({
  name: 'protected-api',
  waf: {
    enabled: true,
    rateLimiting: { enabled: true, limit: 10000 },
    sqlInjectionProtection: true,
    xssProtection: true,
    ipBlocking: { enabled: true, blockedIPs: ['192.168.1.100'] },
    geoBlocking: { enabled: true, blockedCountries: ['CN'] },
  },
});
```

### 🗄️ NoSQL Database (DynamoDB)

```typescript
const store = nimbus.NoSQL({
  name: 'users',
  encryption: true, // KMS encryption at rest
});

// Usage in API routes with init pattern
const api = nimbus.API({
  name: 'users-api',
  init: () => {
    // Initialize DynamoDB client once per container
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    global.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
});

api.route('POST', '/users', async (event) => {
  const { PutCommand } = require('@aws-sdk/lib-dynamodb');
  const user = JSON.parse(event.body);
  
  await global.docClient.send(new PutCommand({
    TableName: process.env.NOSQL_USERS,
    Item: user
  }));
  
  return { statusCode: 201, body: JSON.stringify(user) };
});
```

### 🗃️ SQL Database (Aurora DSQL)

```typescript
const db = nimbus.SQL({
  name: 'analytics',
  // Encryption enabled by default
});

// Available as environment variables in Lambda functions
// SQL_ANALYTICS_ENDPOINT, SQL_ANALYTICS_ARN, etc.
```

### 📦 Storage (S3)

```typescript
const storage = nimbus.Storage({
  name: 'documents',
});

// Usage in API routes
api.route('POST', '/documents', async (event) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({});
  
  const { fileName, content } = JSON.parse(event.body);
  
  await s3.send(new PutObjectCommand({
    Bucket: process.env.STORAGE_DOCUMENTS,
    Key: fileName,
    Body: Buffer.from(content, 'base64')
  }));
  
  return { statusCode: 201, body: JSON.stringify({ fileName }) };
});
```

### 🔄 Queue with Dead Letter Queue

```typescript
const orderQueue = nimbus.Queue({
  name: 'orders',
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3,
  },
  worker: async (event) => {
    for (const record of event.Records) {
      const order = JSON.parse(record.body);
      await processOrder(order); // Failed messages go to DLQ after retries
    }
  },
});

// Send messages via API
api.route('POST', '/orders', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  const sqs = new SQSClient({});
  
  const order = JSON.parse(event.body);
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_ORDERS,
    MessageBody: JSON.stringify(order)
  }));
  
  return { statusCode: 202, body: JSON.stringify({ status: 'queued' }) };
});
```

### ⏰ Scheduled Tasks (EventBridge)

```typescript
const dailyReport = nimbus.Timer({
  name: 'daily-report',
  schedule: 'cron(0 9 * * ? *)', // 9 AM daily
  handler: async () => {
    await generateDailyReport();
  },
});
```

### 🔐 Secrets Management

```typescript
const dbSecret = nimbus.Secret({
  name: 'database-credentials',
  description: 'Production database credentials',
});

// Usage in API routes
api.route('GET', '/data', async (event) => {
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({});
  
  const secret = await client.send(new GetSecretValueCommand({
    SecretId: process.env.SECRET_DATABASE_CREDENTIALS
  }));
  
  const credentials = JSON.parse(secret.SecretString);
  // Use credentials to connect to database
});
```

### 📋 Parameter Store

```typescript
const appConfig = nimbus.Parameter({
  name: '/app/config/version',
  value: '1.0.0',
  description: 'Application version',
});

const featureFlag = nimbus.Parameter({
  name: '/app/features/new-ui',
  value: 'enabled',
});

// Usage in API routes
api.route('GET', '/config', async () => {
  const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({});
  
  const version = await ssm.send(new GetParameterCommand({
    Name: process.env.PARAMETER_APP_CONFIG_VERSION
  }));
  
  return { 
    statusCode: 200, 
    body: JSON.stringify({ version: version.Parameter.Value }) 
  };
});
```

## 🏢 Enterprise Features

### 🛡️ Security

- **WAF Protection** - Automatic API security with rate limiting, SQL injection, and XSS protection
- **Encryption at Rest** - All data stores encrypted with KMS
- **Secrets Management** - AWS Secrets Manager integration for sensitive data
- **Least Privilege IAM** - Automatic minimal permission policies

### 🔄 Reliability

- **Dead Letter Queues** - Automatic handling of failed messages
- **Circuit Breakers** - Graceful degradation patterns
- **Retry Logic** - Exponential backoff for transient failures
- **Health Checks** - Multi-service monitoring endpoints

### 📊 Observability

- **X-Ray Tracing** - Complete request tracing across all services
- **Structured Logging** - Consistent, searchable log formats
- **Performance Metrics** - Automatic CloudWatch metrics
- **Health Monitoring** - Built-in health check patterns

### 🔧 Operations

- **State Management** - Complete resource lifecycle tracking
- **Multi-Stage Deployments** - Separate dev/staging/prod environments
- **Resource Cleanup** - Safe destroy with data protection
- **Configuration Management** - Centralized parameter management

## 🌍 Multi-Environment Deployments

```typescript
const stage = process.env.STAGE || 'dev';

const nimbus = new Nimbus({
  projectName: 'my-app',
  stage,
  tracing: stage !== 'dev', // Enable tracing for staging/prod
});

// Stage-specific configuration
const config = {
  dev: { rateLimiting: 1000 },
  staging: { rateLimiting: 5000 },
  prod: { rateLimiting: 10000 },
}[stage];

const api = nimbus.API({
  name: 'api',
  waf: {
    enabled: stage !== 'dev',
    rateLimiting: { enabled: true, limit: config.rateLimiting },
  },
});

export default nimbus;
```

Deploy to different environments:

```bash
# Development
npx nimbus deploy

# Staging
STAGE=staging npx nimbus deploy

# Production
STAGE=prod npx nimbus deploy
```

## 📁 Examples

Check out [examples/](./examples/) for complete applications:

- **[production-ready/](./examples/production-ready/)** - Complete production app with all features
- **[enterprise-ready/](./examples/enterprise-ready/)** - Enterprise application with advanced patterns
- **[test-new-features/](./examples/test-new-features.ts)** - Test all new production features
- **[xray-tracing/](./examples/xray-tracing/)** - X-Ray distributed tracing example

### 🚀 Production-Ready Example

```typescript
// Complete production application
const nimbus = new Nimbus({
  projectName: 'tasks-api',
  stage: 'prod',
  tracing: true,
});

// Encrypted database
const tasksStore = nimbus.NoSQL({
  name: 'tasks',
  encryption: true,
});

// WAF-protected API with init pattern
const api = nimbus.API({
  name: 'tasks-api',
  waf: {
    enabled: true,
    rateLimiting: { enabled: true, limit: 2000 },
    sqlInjectionProtection: true,
    xssProtection: true,
  },
  init: () => {
    // Initialize DynamoDB client once per container
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    global.docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
});

// Health check with circuit breaker
api.route('GET', '/health', async () => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkExternalService(),
  ]);
  
  const allHealthy = checks.every(c => c.status === 'fulfilled');
  return {
    statusCode: allHealthy ? 200 : 503,
    body: JSON.stringify({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
    }),
  };
});

// CRUD operations with error handling
api.route('POST', '/tasks', async (event) => {
  try {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');
    const task = JSON.parse(event.body);
    task.id = generateId();
    task.createdAt = new Date().toISOString();
    
    await global.docClient.send(new PutCommand({
      TableName: process.env.NOSQL_TASKS,
      Item: task
    }));
    
    return {
      statusCode: 201,
      body: JSON.stringify(task),
    };
  } catch (error) {
    console.error('Error creating task:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create task' }),
    };
  }
});

export default nimbus;
```

## 🔧 Commands

```bash
# Deploy
npx nimbus deploy                 # Deploy to dev stage
STAGE=prod npx nimbus deploy      # Deploy to production

# Destroy (safe - preserves data)
npx nimbus destroy --project my-app --region us-east-1

# Force destroy (removes everything including data)
npx nimbus destroy --project my-app --region us-east-1 --force

# Initialize configuration
npx nimbus init
```

## 📊 vs. Other Tools

| Feature | Nimbus | CDK | Serverless | SAM |
|---------|--------|-----|------------|-----|
| **Production Ready** | 85% out of box | Manual setup | Plugin dependent | Basic |
| **Security** | WAF + Encryption + Secrets | Manual | Plugins | Basic |
| **Reliability** | DLQ + Circuit Breakers | Manual | Limited | Basic |
| **Developer Experience** | Type-safe + Auto-wired | Complex | YAML config | YAML config |
| **State Management** | Built-in S3 | CloudFormation | CloudFormation | CloudFormation |
| **Learning Curve** | Minimal | Steep | Medium | Medium |
| **Best For** | Production serverless | Complex AWS infra | Multi-cloud | AWS-only simple apps |

**Choose Nimbus for:** Production-ready serverless applications with enterprise requirements  
**Choose others for:** Complex infrastructure, multi-cloud, or existing workflows

- Multi-region support (cross-region replication)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 🆘 Support

- 🐛 **[Report Issues](https://github.com/hillock-tech/nimbus-js/issues)**
- 💬 **[Join Discussions](https://github.com/hillock-tech/nimbus-js/discussions)**
- 📖 **[Read the Docs](https://hillock-tech.github.io/nimbus-js/)**

## 📄 License

MIT License

---

<p align="center">
  <strong>Built with ❤️ for the serverless community</strong>
</p>

<p align="center">
  <a href="https://github.com/hillock-tech/nimbus-js">⭐ Star us on GitHub</a> •
  <a href="https://github.com/hillock-tech/nimbus-js/discussions">💬 Join the Discussion</a> •
  <a href="https://hillock-tech.github.io/nimbus-js/">📖 Read the Docs</a>
</p>