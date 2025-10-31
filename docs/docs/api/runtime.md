# Runtime Helpers

Runtime helpers provide a clean, efficient way to access AWS services from within your Lambda functions. They handle caching, error handling, and AWS SDK management automatically.

## Overview

Nimbus separates **Deploy Context** (infrastructure definition) from **Runtime Context** (data access). Runtime helpers are used inside Lambda functions to interact with AWS services.

```typescript
// ✅ Deploy Context - Define infrastructure
const secret = nimbus.Secret({ name: 'api-keys' });

// ✅ Runtime Context - Access data in Lambda
api.route('GET', '/data', async (event) => {
  const { runtime } = await import('nimbus-framework');
  const apiKeys = await runtime.secrets.getJson('api-keys');
  // Use apiKeys...
});
```

## Import Runtime Helpers

```typescript
// Import all helpers
const { runtime } = await import('nimbus-framework');

// Or import specific helpers
const { secrets, parameters, featureFlags } = await import('nimbus-framework/runtime');
```

## Secrets Manager

Securely access secrets stored in AWS Secrets Manager.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Get secret as JSON object
const dbCreds = await runtime.secrets.getJson('database-credentials');
// Returns: { host: "db.example.com", username: "user", password: "pass" }

// Get secret as string
const apiKey = await runtime.secrets.getString('stripe-api-key');
// Returns: "sk_live_1234567890abcdef"

// Get raw secret (auto-detects JSON vs string)
const secret = await runtime.secrets.get('my-secret');
```

### Setting Secrets (Admin Operations)

```typescript
// Set secret as JSON object
await runtime.secrets.set('database-credentials', {
  host: 'prod-db.example.com',
  username: 'app_user',
  password: 'secure-password'
});

// Set secret as string
await runtime.secrets.set('api-key', 'sk_live_new_key');
```

### Caching Options

```typescript
// Default caching (5 minutes)
const secret1 = await runtime.secrets.get('my-secret');

// Custom cache TTL (1 minute)
const secret2 = await runtime.secrets.get('my-secret', { ttl: 60000 });

// Disable caching
const secret3 = await runtime.secrets.get('my-secret', { cache: false });
```

## Parameter Store

Access configuration parameters from AWS Systems Manager Parameter Store.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Get parameter value
const configValue = await runtime.parameters.get('/app/config');

// Get parameter as JSON object
const config = await runtime.parameters.getJson('/app/settings');
// Returns parsed JSON object

// Get with decryption (for SecureString parameters)
const encryptedValue = await runtime.parameters.get('/app/secret-config', { decrypt: true });
```

### Setting Parameters

```typescript
// Set string parameter
await runtime.parameters.set('/app/version', '1.2.3');

// Set JSON parameter
await runtime.parameters.setJson('/app/config', {
  maxUsers: 1000,
  timeout: 30,
  features: ['feature1', 'feature2']
});

// Set encrypted parameter
await runtime.parameters.set('/app/secret', 'sensitive-value', { type: 'SecureString' });
```

### Parameter Types

```typescript
// String parameter (default)
await runtime.parameters.set('/app/name', 'MyApp');

// Encrypted parameter
await runtime.parameters.set('/app/secret', 'secret-value', { type: 'SecureString' });

// String list parameter
await runtime.parameters.set('/app/tags', 'tag1,tag2,tag3', { type: 'StringList' });
```

## Feature Flags

Manage feature flags using Parameter Store with a convenient API.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Check if feature is enabled
const isEnabled = await runtime.featureFlags.isEnabled('new-ui');
if (isEnabled) {
  // Use new UI logic
}

// Get all feature flags
const allFlags = await runtime.featureFlags.getAll();
// Returns: { "new-ui": true, "beta-features": false, ... }
```

### Managing Feature Flags

```typescript
// Enable a feature
await runtime.featureFlags.enable('beta-features');

// Disable a feature
await runtime.featureFlags.disable('old-feature');

// Set specific value
await runtime.featureFlags.set('experimental-mode', true);

// Toggle a feature
const newState = await runtime.featureFlags.toggle('debug-mode');
console.log(`Debug mode is now ${newState ? 'enabled' : 'disabled'}`);
```

### Feature Flag Patterns

```typescript
// Gradual rollout
const userId = event.requestContext.authorizer?.userId;
const enableNewFeature = await runtime.featureFlags.isEnabled('new-feature');
const isTestUser = userId && userId.endsWith('@company.com');

if (enableNewFeature || isTestUser) {
  // Use new feature
} else {
  // Use old feature
}

// A/B testing
const experimentGroup = await runtime.featureFlags.isEnabled('experiment-a');
const algorithm = experimentGroup ? 'algorithm-a' : 'algorithm-b';
```

## KV Store (DynamoDB)

Access DynamoDB tables with a simple key-value interface.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Get item
const user = await runtime.kv.get('users-table', { id: 'user123' });

// Put item
await runtime.kv.put('users-table', {
  id: 'user123',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date().toISOString()
});

// Update item
await runtime.kv.update('users-table', 
  { id: 'user123' }, 
  { lastLogin: new Date().toISOString() }
);

// Delete item
await runtime.kv.delete('users-table', { id: 'user123' });
```

## Storage (S3)

Access S3 objects with simple get/put operations.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Get object as string
const content = await runtime.storage.get('my-bucket', 'path/to/file.txt');

// Get object as JSON
const data = await runtime.storage.getJson('my-bucket', 'data/config.json');

// Put string content
await runtime.storage.put('my-bucket', 'logs/app.log', 'Log content');

// Put JSON data
await runtime.storage.putJson('my-bucket', 'data/user.json', { id: 1, name: 'John' });

// Delete object
await runtime.storage.delete('my-bucket', 'temp/old-file.txt');
```

### Content Types

```typescript
// Put with specific content type
await runtime.storage.put('my-bucket', 'images/photo.jpg', imageBuffer, {
  contentType: 'image/jpeg'
});

// Put JSON with proper content type (automatic)
await runtime.storage.putJson('my-bucket', 'api/response.json', { status: 'ok' });
```

## Queue (SQS)

Send and receive messages from SQS queues.

### Basic Usage

```typescript
const { runtime } = await import('nimbus-framework');

// Send message
await runtime.queue.send('https://sqs.region.amazonaws.com/account/queue-name', {
  userId: 'user123',
  action: 'process-order',
  data: { orderId: 'order456' }
});

// Send with options
await runtime.queue.send(queueUrl, message, {
  delaySeconds: 30,
  messageGroupId: 'order-processing' // For FIFO queues
});

// Receive messages
const messages = await runtime.queue.receive(queueUrl, {
  maxMessages: 10,
  waitTimeSeconds: 20
});

// Process and delete messages
for (const message of messages) {
  console.log('Processing:', message.data);
  
  // Delete message after processing
  await runtime.queue.delete(queueUrl, message.receiptHandle);
}
```

## Utility Functions

Additional helper functions for common operations.

### Environment Variables

```typescript
const { runtime } = await import('nimbus-framework');

// Get environment variable with default
const stage = runtime.env('STAGE', 'dev');

// Get required environment variable (throws if missing)
const dbUrl = runtime.requireEnv('DATABASE_URL');
```

### JSON Parsing

```typescript
// Parse JSON safely with default
const config = runtime.parseJson(jsonString, { default: 'config' });

// Parse JSON (throws on invalid JSON)
const data = runtime.parseJson(jsonString);
```

### Cache Management

```typescript
// Clear all cached values
runtime.clearCache();
```

## Caching Behavior

All runtime helpers include intelligent caching:

### Default Caching
- **TTL**: 5 minutes (300,000ms)
- **Scope**: Per Lambda execution context
- **Automatic**: Enabled by default

### Cache Keys
- Secrets: `secret:{secretName}`
- Parameters: `param:{parameterName}`
- Feature flags: `param:/app/feature-flags`

### Custom Caching

```typescript
// Custom TTL (1 minute)
const value = await runtime.secrets.get('my-secret', { ttl: 60000 });

// Disable caching
const freshValue = await runtime.secrets.get('my-secret', { cache: false });

// Clear all cache
runtime.clearCache();
```

## Error Handling

Runtime helpers provide consistent error handling:

```typescript
try {
  const secret = await runtime.secrets.get('my-secret');
  if (!secret) {
    // Secret doesn't exist
    console.log('Secret not found');
  }
} catch (error) {
  // AWS service error
  console.error('Failed to get secret:', error);
}
```

### Common Error Patterns

```typescript
// Graceful degradation
const flags = await runtime.featureFlags.getAll().catch(() => ({}));
const isEnabled = flags.newFeature || false;

// Fallback values
const config = await runtime.parameters.getJson('/app/config').catch(() => ({
  maxRetries: 3,
  timeout: 30000
}));
```

## Performance Best Practices

### 1. Use Caching
```typescript
// ✅ Good - uses cache
const flags = await runtime.featureFlags.getAll();

// ❌ Avoid - bypasses cache unnecessarily
const flags = await runtime.featureFlags.getAll({ cache: false });
```

### 2. Batch Operations
```typescript
// ✅ Good - parallel requests
const [config, flags, secrets] = await Promise.all([
  runtime.parameters.getJson('/app/config'),
  runtime.featureFlags.getAll(),
  runtime.secrets.getJson('api-keys')
]);
```

### 3. Module-Level Caching
```typescript
// ✅ Good - cache at module level for Lambda container reuse
let cachedConfig: any = null;

export async function getConfig() {
  if (!cachedConfig) {
    cachedConfig = await runtime.parameters.getJson('/app/config');
  }
  return cachedConfig;
}
```

## TypeScript Support

Runtime helpers include full TypeScript support:

```typescript
// Type-safe secret access
interface DatabaseCredentials {
  host: string;
  username: string;
  password: string;
  port: number;
}

const dbCreds = await runtime.secrets.getJson<DatabaseCredentials>('db-credentials');
// dbCreds is typed as DatabaseCredentials | null

// Type-safe parameter access
interface AppConfig {
  maxUsers: number;
  timeout: number;
  features: string[];
}

const config = await runtime.parameters.getJson<AppConfig>('/app/config');
// config is typed as AppConfig | null
```

## Related

- [Secrets Manager](./secrets.md) - Deploy-time secret management
- [Parameter Store](./parameters.md) - Deploy-time parameter management
- [Examples: Feature Flags](../examples/feature-flags.md) - Complete example
- [Examples: Secrets Manager](../examples/secrets-manager.md) - Secrets example