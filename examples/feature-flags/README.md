# Feature Flags Example

This example demonstrates the **correct separation** between **Deploy Context** and **Runtime Context** when working with feature flags, secrets, and parameters in Nimbus.

## 🏗️ Two Contexts Explained

### Deploy Context
- **Purpose**: Define infrastructure and resources
- **When**: During `nimbus deploy`
- **What**: Create placeholders for secrets, parameters, APIs
- **Code**: Uses `nimbus.Secret()`, `nimbus.Parameter()`, `nimbus.api()`

### Runtime Context  
- **Purpose**: Access and manipulate data at runtime
- **When**: During Lambda function execution
- **What**: Get/set secrets, parameters, feature flags
- **Code**: Uses `runtime.secrets.get()`, `runtime.featureFlags.isEnabled()`

## 🚀 How It Works

### 1. Deploy Context (Infrastructure)
```typescript
// ✅ DEPLOY: Define infrastructure (no values!)
const featureFlags = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Feature flags configuration'
  // No value here - set at runtime
});

const apiKeys = nimbus.Secret({
  name: 'api-keys',
  description: 'External API keys'
  // No value here - set at runtime
});
```

### 2. Runtime Context (Lambda Functions)
```typescript
// ✅ RUNTIME: Use runtime helpers in Lambda functions
api.route('GET', '/features', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Get feature flags at runtime
  const flags = await runtime.featureFlags.getAll();
  
  // Check specific flag
  const isEnabled = await runtime.featureFlags.isEnabled('new-ui');
  
  // Get secrets
  const apiKeys = await runtime.secrets.getJson('api-keys');
  
  // Get parameters
  const config = await runtime.parameters.getJson('/app/config');
  
  return { statusCode: 200, body: JSON.stringify({ flags, config }) };
});
```

## 🎯 Runtime Helpers Available

### Feature Flags
```typescript
const { runtime } = await import('nimbus-framework');

// Check if flag is enabled
const enabled = await runtime.featureFlags.isEnabled('new-feature');

// Get all flags
const allFlags = await runtime.featureFlags.getAll();

// Set a flag (admin operation)
await runtime.featureFlags.enable('beta-features');
await runtime.featureFlags.disable('old-feature');
await runtime.featureFlags.toggle('experimental');
```

### Secrets
```typescript
// Get secret as JSON object
const dbCreds = await runtime.secrets.getJson('database-credentials');

// Get secret as string
const apiKey = await runtime.secrets.getString('stripe-api-key');

// Set secret (admin operation)
await runtime.secrets.set('new-secret', { key: 'value' });
```

### Parameters
```typescript
// Get parameter value
const configValue = await runtime.parameters.get('/app/config');

// Get parameter as JSON
const config = await runtime.parameters.getJson('/app/settings');

// Set parameter (admin operation)
await runtime.parameters.set('/app/feature-flags', '{"newUI": true}');
await runtime.parameters.setJson('/app/config', { maxUsers: 1000 });
```

### Caching
All runtime helpers include automatic caching:
```typescript
// First call: fetches from AWS (50ms)
const flags1 = await runtime.featureFlags.getAll();

// Second call: returns from cache (1ms)
const flags2 = await runtime.featureFlags.getAll();

// Disable caching for specific call
const freshFlags = await runtime.featureFlags.getAll({ cache: false });

// Custom TTL (10 seconds)
const shortCacheFlags = await runtime.featureFlags.getAll({ ttl: 10000 });
```

## 📋 Available Endpoints

After deployment, you can use these endpoints:

### Public Endpoints
- `GET /features` - Get all feature flags
- `GET /features/{flagName}` - Check specific feature flag
- `POST /process-data` - Process data with feature-driven logic
- `POST /external-api-call` - Make external API calls (if enabled)

### Admin Endpoints (Require Authentication)
- `POST /admin/features/{flagName}` - Enable/disable feature flag
- `PUT /admin/config` - Update application configuration
- `PUT /admin/secrets` - Update secrets

## 🚀 Deployment & Usage

### 1. Deploy Infrastructure
```bash
npm run deploy
```

This creates:
- Parameter Store entries (empty)
- Secrets Manager entries (empty)
- Lambda functions with proper IAM permissions
- API Gateway endpoints

### 2. Set Initial Configuration
```bash
# Set feature flags
curl -X POST https://your-api-url/admin/features/advanced-processing \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Set application config
curl -X PUT https://your-api-url/admin/config \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"maxResults": 50, "timeout": 30}'

# Set API keys
curl -X PUT https://your-api-url/admin/secrets \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"secretName": "api-keys", "secretValue": {"external_service": "sk_live_123"}}'
```

### 3. Test Feature Flags
```bash
# Check all feature flags
curl https://your-api-url/features

# Check specific flag
curl https://your-api-url/features/advanced-processing

# Test feature-driven processing
curl -X POST https://your-api-url/process-data \
  -H "Content-Type: application/json" \
  -d '{"data": [1, 2, 3, 4, 5]}'
```

### 4. Toggle Features in Real-Time
```bash
# Enable new feature
curl -X POST https://your-api-url/admin/features/beta-ui \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Test immediately - no redeployment needed!
curl https://your-api-url/features/beta-ui
```

## 🎯 Key Benefits

### 1. **Clear Separation of Concerns**
- Deploy context: Infrastructure definition
- Runtime context: Data access and manipulation

### 2. **No Hardcoded Values**
- Infrastructure is defined without sensitive data
- Values are set securely at runtime

### 3. **Runtime Flexibility**
- Change feature flags without redeployment
- Update configuration on the fly
- Rotate secrets without code changes

### 4. **Performance Optimized**
- Automatic caching with configurable TTL
- Reuse AWS SDK clients across invocations
- Minimal cold start impact

### 5. **Developer Experience**
- Clean, intuitive API
- TypeScript support with full intellisense
- Consistent patterns across all resource types

## 🔧 Advanced Usage

### Custom Cache TTL
```typescript
// Cache for 1 minute only
const flags = await runtime.featureFlags.getAll({ ttl: 60000 });

// Disable caching for admin operations
const freshConfig = await runtime.parameters.getJson('/app/config', { cache: false });
```

### Error Handling
```typescript
try {
  const flags = await runtime.featureFlags.getAll();
} catch (error) {
  console.error('Failed to get feature flags:', error);
  // Fallback to default behavior
  const flags = { defaultFeature: true };
}
```

### Environment-Specific Flags
```typescript
const stage = process.env.STAGE || 'dev';
const flags = await runtime.parameters.getJson(`/${stage}/feature-flags`);
```

## 🧹 Cleanup

```bash
npm run destroy
```

## 🎓 Key Takeaways

1. **Deploy Context**: Define infrastructure without values
2. **Runtime Context**: Use runtime helpers to access data
3. **Import runtime helpers**: `const { runtime } = await import('nimbus-framework')`
4. **Caching**: Automatic with configurable TTL
5. **Real-time updates**: Change flags/config without redeployment
6. **Security**: No hardcoded secrets or sensitive data

This pattern ensures secure, flexible, and performant serverless applications with proper separation of infrastructure and runtime concerns!