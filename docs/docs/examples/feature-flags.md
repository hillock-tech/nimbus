# Feature Flags Example

This example demonstrates the proper separation between **Deploy Context** and **Runtime Context** when working with feature flags, secrets, and parameters.

## Overview

The feature flags example shows how to:

- Define infrastructure without hardcoded values (Deploy Context)
- Use runtime helpers to access data in Lambda functions (Runtime Context)
- Implement feature flags for gradual rollouts and A/B testing
- Manage configuration and secrets securely at runtime
- Cache data efficiently for optimal performance

## Key Concepts

### Deploy Context vs Runtime Context

**Deploy Context** (Infrastructure Definition):
```typescript
// ✅ Define infrastructure without values
const featureFlags = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Feature flags configuration'
  // No value here - set at runtime
});
```

**Runtime Context** (Lambda Functions):
```typescript
// ✅ Use runtime helpers in Lambda functions
api.route('GET', '/features', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Access data at runtime
  const flags = await runtime.featureFlags.getAll();
  const isEnabled = await runtime.featureFlags.isEnabled('new-ui');
  
  return { statusCode: 200, body: JSON.stringify({ flags }) };
});
```

## Code Structure

### Infrastructure Definition
```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// Define infrastructure placeholders
const featureFlagsParam = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Application feature flags configuration',
  type: 'String'
});

const apiKeysSecret = nimbus.Secret({
  name: 'api-keys',
  description: 'External service API keys'
});

const api = nimbus.api({
  name: 'feature-flags-demo',
  description: 'Feature flags demonstration'
});
```

### Runtime Usage
```typescript
// Feature flag checking
api.route('GET', '/features/:flagName', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const { flagName } = event.pathParameters || {};
  const isEnabled = await runtime.featureFlags.isEnabled(flagName);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      flag: flagName,
      enabled: isEnabled,
      timestamp: new Date().toISOString()
    })
  };
});

// Feature-driven processing
api.route('POST', '/process-data', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const { data } = JSON.parse(event.body || '{}');
  
  // Get configuration and feature flags
  const config = await runtime.parameters.getJson('/app/config') || {};
  const useAdvancedProcessing = await runtime.featureFlags.isEnabled('advanced-processing');
  
  // Apply feature-flag driven logic
  let results;
  if (useAdvancedProcessing) {
    // Advanced processing with additional features
    results = data?.map((item, index) => ({
      id: index,
      processed: true,
      value: item,
      enhanced: true,
      score: Math.random() * 100,
      timestamp: new Date().toISOString()
    }));
  } else {
    // Basic processing
    results = data?.map((item, index) => ({
      id: index,
      processed: true,
      value: item,
      timestamp: new Date().toISOString()
    }));
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      processed: results?.length || 0,
      results,
      features: { advancedProcessing: useAdvancedProcessing }
    })
  };
});
```

## Runtime Helpers

### Feature Flags
```typescript
const { runtime } = await import('nimbus-framework');

// Check if flag is enabled
const enabled = await runtime.featureFlags.isEnabled('new-feature');

// Get all flags
const allFlags = await runtime.featureFlags.getAll();

// Admin operations
await runtime.featureFlags.enable('beta-features');
await runtime.featureFlags.disable('old-feature');
await runtime.featureFlags.toggle('experimental');
```

### Secrets
```typescript
// Get secret as JSON object
const apiKeys = await runtime.secrets.getJson('api-keys');

// Get secret as string
const dbPassword = await runtime.secrets.getString('db-password');

// Set secret (admin operation)
await runtime.secrets.set('new-secret', { key: 'value' });
```

### Parameters
```typescript
// Get parameter as JSON
const config = await runtime.parameters.getJson('/app/config');

// Get parameter as string
const version = await runtime.parameters.get('/app/version');

// Set parameter (admin operation)
await runtime.parameters.setJson('/app/settings', { theme: 'dark' });
```

## Deployment

```bash
cd examples/feature-flags
npm install
npm run deploy
```

## Usage Examples

### 1. Set Initial Configuration
```bash
# Enable feature flags
curl -X POST https://your-api-url/admin/features/advanced-processing \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Set application config
curl -X PUT https://your-api-url/admin/config \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"maxResults": 50, "timeout": 30}'
```

### 2. Check Feature Flags
```bash
# Get all feature flags
curl https://your-api-url/features

# Check specific flag
curl https://your-api-url/features/advanced-processing
```

### 3. Test Feature-Driven Logic
```bash
# Test data processing (behavior changes based on flags)
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

## Key Benefits

### 1. **Separation of Concerns**
- Infrastructure definition is separate from data access
- Deploy context handles resource creation
- Runtime context handles data operations

### 2. **Security**
- No hardcoded secrets or sensitive data in code
- Values are set securely at runtime
- Proper IAM permissions automatically configured

### 3. **Performance**
- Automatic caching with configurable TTL
- AWS SDK client reuse across invocations
- Minimal cold start impact

### 4. **Flexibility**
- Change feature flags without redeployment
- Update configuration on the fly
- A/B testing and gradual rollouts

### 5. **Developer Experience**
- Clean, intuitive API
- TypeScript support with full intellisense
- Consistent patterns across all resource types

## Advanced Patterns

### Gradual Rollout
```typescript
const userId = event.requestContext.authorizer?.userId;
const enableNewFeature = await runtime.featureFlags.isEnabled('new-feature');
const isTestUser = userId && userId.endsWith('@company.com');

if (enableNewFeature || isTestUser) {
  // Use new feature
} else {
  // Use old feature
}
```

### A/B Testing
```typescript
const experimentGroup = await runtime.featureFlags.isEnabled('experiment-a');
const algorithm = experimentGroup ? 'algorithm-a' : 'algorithm-b';
const results = await processData(data, algorithm);
```

### Environment-Specific Configuration
```typescript
const stage = process.env.STAGE || 'dev';
const config = await runtime.parameters.getJson(`/${stage}/app-config`);
```

## Caching

All runtime helpers include intelligent caching:

```typescript
// Default caching (5 minutes)
const flags1 = await runtime.featureFlags.getAll();

// Custom TTL (1 minute)
const flags2 = await runtime.featureFlags.getAll({ ttl: 60000 });

// Disable caching
const freshFlags = await runtime.featureFlags.getAll({ cache: false });

// Clear all cache
runtime.clearCache();
```

## Error Handling

```typescript
try {
  const flags = await runtime.featureFlags.getAll();
} catch (error) {
  console.error('Failed to get feature flags:', error);
  // Fallback to default behavior
  const flags = { defaultFeature: true };
}
```

## Cleanup

```bash
npm run destroy
```

## Next Steps

- Implement your own feature flags for gradual rollouts
- Set up A/B testing experiments
- Create environment-specific configurations
- Add monitoring and alerting for feature flag changes
- Integrate with your CI/CD pipeline for automated flag management

## Related Examples

- [Secrets Manager](./secrets-manager.md) - Dedicated secrets example
- [Basic API](./basic-api.md) - Simple API without configuration
- [Auth API](./auth-api.md) - Authentication patterns

## Learn More

- [Runtime Helpers API](../api/runtime.md) - Complete API reference
- [Parameter Store](../api/parameters.md) - Parameter Store documentation
- [Secrets Manager](../api/secrets.md) - Secrets Manager documentation