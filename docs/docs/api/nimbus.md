# Nimbus Class

The main Nimbus class is the entry point for creating serverless applications.

## Constructor

```typescript
new Nimbus(config: NimbusConfig)
```

### NimbusConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `projectName` | `string` | ✅ | Unique name for your project |
| `region` | `string` | ✅ | AWS region (e.g., 'us-east-1') |
| `stage` | `string` | ❌ | Deployment stage (default: 'dev') |
| `tracing` | `boolean` | ❌ | Enable X-Ray tracing (default: false) |

### Example

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'my-app',
  region: 'us-east-1',
  stage: 'production',
  tracing: true
});
```

## Methods

### API()

Creates an API Gateway with Lambda integration.

```typescript
app.API(config: APIConfig): API
```

**Parameters:**
- `config.name` (string) - API name
- `config.description` (string, optional) - API description
- `config.stage` (string, optional) - API stage
- `config.customDomain` (string, optional) - Custom domain name

**Returns:** [API](/api/api) instance



### KV()

Creates a DynamoDB table for key-value storage.

```typescript
app.KV(config: KVConfig): KV
```

**Parameters:**
- `config.name` (string) - Table name
- `config.primaryKey` (string, optional) - Primary key name (default: 'id')

**Returns:** [KV](/api/kv) instance

### Storage()

Creates an S3 bucket for file storage.

```typescript
app.Storage(config: StorageConfig): Storage
```

**Parameters:**
- `config.name` (string) - Bucket name

**Returns:** [Storage](/api/storage) instance

### Queue()

Creates an SQS queue with optional dead letter queue.

```typescript
app.Queue(config: QueueConfig): Queue
```

**Parameters:**
- `config.name` (string) - Queue name
- `config.worker` (function) - Message handler function
- `config.deadLetterQueue` (object, optional) - DLQ configuration

**Returns:** [Queue](/api/queue) instance

### SQL()

Creates an Aurora DSQL database.

```typescript
app.SQL(config: SQLConfig): SQL
```

**Parameters:**
- `config.name` (string) - Database name
- `config.schema` (string) - Schema name
- `config.deletionProtection` (boolean, optional) - Enable deletion protection

**Returns:** [SQL](/api/sql) instance

### Timer()

Creates a scheduled Lambda function.

```typescript
app.Timer(config: TimerConfig): Timer
```

**Parameters:**
- `config.name` (string) - Timer name
- `config.schedule` (string) - Cron or rate expression
- `config.handler` (function) - Function to execute
- `config.enabled` (boolean, optional) - Enable/disable timer (default: true)

**Returns:** [Timer](/api/timer) instance

### deploy()

Deploys all resources to AWS.

```typescript
app.deploy(): Promise<DeploymentResult>
```

**Returns:** Promise that resolves to deployment information

### destroy()

Removes all resources from AWS.

```typescript
app.destroy(): Promise<void>
```

## Environment Variables

Nimbus automatically injects environment variables for resource access:

| Pattern | Description | Example |
|---------|-------------|---------|
| `KV_{NAME}` | DynamoDB table name | `KV_USERS` |
| `STORAGE_{NAME}` | S3 bucket name | `STORAGE_FILES` |
| `QUEUE_{NAME}` | SQS queue URL | `QUEUE_TASKS` |
| `SQL_{NAME}_ENDPOINT` | Database endpoint | `SQL_MAIN_ENDPOINT` |

## IAM Permissions

Nimbus automatically creates IAM roles with minimal required permissions:

- Lambda execution role
- API Gateway invoke permissions
- DynamoDB read/write permissions
- S3 bucket access permissions
- SQS send/receive permissions
- SQL database access permissions

## Examples

### Basic Application

```typescript
const app = new Nimbus({
  projectName: 'hello-world',
  region: 'us-east-1'
});

const api = app.API({ name: 'api' });

api.route('GET', '/hello', async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Hello World!' })
}));

export default app;
```

### Full-Stack Application

```typescript
const app = new Nimbus({
  projectName: 'full-stack-app',
  region: 'us-east-1',
  tracing: true
});

// Database
const users = app.KV({ name: 'users' });
const posts = app.KV({ name: 'posts' });

// File storage
const uploads = app.Storage({ name: 'uploads' });

// Background processing
const emailQueue = app.Queue({
  name: 'emails',
  worker: async (event) => {
    // Send emails
  }
});

// API
const api = app.API({ name: 'api' });

// Routes
api.route('GET', '/users', async () => {
  // Get users from database
});

api.route('POST', '/upload', async (event) => {
  // Upload file to S3
});

// Scheduled tasks
app.Timer({
  name: 'cleanup',
  schedule: 'rate(1 day)',
  handler: async () => {
    // Daily cleanup
  }
});

export default app;
```