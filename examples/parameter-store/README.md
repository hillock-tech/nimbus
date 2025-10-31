# Parameter Store Example

This example demonstrates configuration management using AWS Systems Manager Parameter Store with Nimbus runtime helpers.

## Overview

Parameter Store provides secure, hierarchical storage for configuration data. This example shows how to:

- Create parameter placeholders without hardcoded values
- Store configuration via API endpoints
- Retrieve parameters at runtime using helper functions
- Update configuration without redeployment
- Implement feature flags and dynamic configuration

## Key Concepts

### Deploy Context vs Runtime Context

**Deploy Context** (Infrastructure Definition):
```typescript
// ✅ Define infrastructure without values
const appConfig = nimbus.Parameter({
  name: '/app/config',
  description: 'Application configuration settings'
  // No value here - set at runtime
});
```

**Runtime Context** (Lambda Functions):
```typescript
// ✅ Use runtime helpers in Lambda functions
api.route('GET', '/config', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Access data at runtime
  const config = await runtime.parameters.getJson('/app/config');
  
  return { statusCode: 200, body: JSON.stringify({ config }) };
});
```

## Parameter Types

### String Parameters
```typescript
const version = nimbus.Parameter({
  name: '/app/version',
  description: 'Application version',
  type: 'String'
});
```

### Encrypted Parameters
```typescript
const encryptedConfig = nimbus.Parameter({
  name: '/app/encrypted-config',
  description: 'Encrypted configuration data',
  type: 'SecureString' // Encrypted with KMS
});
```

### JSON Configuration
```typescript
const appConfig = nimbus.Parameter({
  name: '/app/config',
  description: 'Application configuration as JSON',
  type: 'String' // Will store JSON string
});

// Usage
const config = await runtime.parameters.getJson('/app/config');
```

## Runtime Helper Methods

### Getting Parameters
```typescript
const { runtime } = await import('nimbus-framework');

// Get parameter as string
const version = await runtime.parameters.get('/app/version');

// Get parameter as JSON object
const config = await runtime.parameters.getJson('/app/config');

// Get encrypted parameter (automatically decrypted)
const secret = await runtime.parameters.get('/app/secret-config', { decrypt: true });
```

### Setting Parameters (Admin Operations)
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
await runtime.parameters.set('/app/secret', 'sensitive-value', { 
  type: 'SecureString' 
});
```

### Caching Options
```typescript
// Default caching (5 minutes)
const config1 = await runtime.parameters.get('/app/config');

// Custom cache TTL (1 minute)
const config2 = await runtime.parameters.get('/app/config', { ttl: 60000 });

// Disable caching
const freshConfig = await runtime.parameters.get('/app/config', { cache: false });
```

## Available Endpoints

After deployment, you can use these endpoints:

### Admin Endpoints (Require Authentication)
- `POST /admin/parameters` - Store parameter values
- `PUT /admin/parameters/update` - Update existing parameters

### Application Endpoints
- `GET /features` - Get feature flags configuration
- `POST /process-data` - Process data with configuration-driven logic
- `GET /external-data/:source` - Fetch data using configured endpoints
- `GET /database-status` - Check database with dynamic configuration

## Deployment

```bash
cd examples/parameter-store
npm install
npm run deploy
```

## Usage Examples

### 1. Set Configuration
```bash
# Set feature flags
curl -X POST https://your-api-url/admin/parameters \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "parameterName": "feature-flags",
    "parameterValue": {
      "enableNewUI": true,
      "enableBetaFeatures": false,
      "enableDetailedLogging": true
    }
  }'

# Set application config
curl -X POST https://your-api-url/admin/parameters \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "parameterName": "app-config",
    "parameterValue": {
      "maxItemsPerRequest": 50,
      "timeout": 30000,
      "retryAttempts": 3
    }
  }'
```

### 2. Test Configuration-Driven Behavior
```bash
# Get feature flags
curl https://your-api-url/features

# Test data processing (behavior changes based on config)
curl -X POST https://your-api-url/process-data \
  -H "Content-Type: application/json" \
  -d '{"data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}'
```

### 3. Update Configuration in Real-Time
```bash
# Update feature flags without redeployment
curl -X PUT https://your-api-url/admin/parameters/update \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "parameterName": "feature-flags",
    "newValue": {
      "enableNewUI": false,
      "enableBetaFeatures": true,
      "enableDetailedLogging": false
    }
  }'

# Test immediately - changes take effect without redeployment!
curl https://your-api-url/features
```

## Configuration Patterns

### Hierarchical Organization
```typescript
// Environment-specific parameters
const devConfig = nimbus.Parameter({
  name: '/myapp/dev/database-config',
  description: 'Development database configuration'
});

const prodConfig = nimbus.Parameter({
  name: '/myapp/prod/database-config',
  description: 'Production database configuration'
});

// Feature-specific parameters
const authConfig = nimbus.Parameter({
  name: '/myapp/auth/settings',
  description: 'Authentication settings'
});
```

### Dynamic Configuration Access
```typescript
api.route('GET', '/env-config', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const stage = process.env.STAGE || 'dev';
  const config = await runtime.parameters.getJson(`/myapp/${stage}/config`);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ environment: stage, config })
  };
});
```

## Feature Flags Implementation

### Basic Feature Flags
```typescript
api.route('POST', '/process-data', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Get feature flags
  const flags = await runtime.parameters.getJson('/app/feature-flags') || {};
  
  const enableAdvancedProcessing = flags.enableAdvancedProcessing || false;
  const enableLogging = flags.enableDetailedLogging || false;
  
  if (enableLogging) {
    console.log('Processing with advanced features:', enableAdvancedProcessing);
  }
  
  // Apply feature-driven logic
  const results = enableAdvancedProcessing 
    ? await advancedProcessing(data)
    : await basicProcessing(data);
    
  return {
    statusCode: 200,
    body: JSON.stringify({ results, features: flags })
  };
});
```

### A/B Testing
```typescript
api.route('GET', '/recommendation', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const flags = await runtime.parameters.getJson('/app/feature-flags') || {};
  const useNewAlgorithm = flags.useRecommendationV2 || false;
  
  const recommendations = useNewAlgorithm
    ? await getRecommendationsV2(userId)
    : await getRecommendationsV1(userId);
    
  return {
    statusCode: 200,
    body: JSON.stringify({
      recommendations,
      algorithm: useNewAlgorithm ? 'v2' : 'v1'
    })
  };
});
```

## Cost Considerations

### Standard Parameters (Free Tier)
- **Storage**: Free for up to 10,000 parameters
- **API Calls**: $0.05 per 10,000 requests
- **Size Limit**: 4KB per parameter

### Advanced Parameters
- **Storage**: $0.05 per parameter per month
- **API Calls**: $0.05 per 10,000 requests
- **Size Limit**: 8KB per parameter

Example monthly cost:
- 20 standard parameters: Free
- 5 advanced parameters: $0.25
- 50K API calls: $0.25
- **Total**: ~$0.50/month

## Security Features

1. **Encryption**: SecureString parameters encrypted with KMS
2. **Access Control**: IAM-based permissions automatically configured
3. **Audit Trail**: All parameter access logged in CloudTrail
4. **Versioning**: Parameter history maintained automatically

## Best Practices

### 1. Use Hierarchical Naming
```typescript
// ✅ Good - organized hierarchy
'/myapp/prod/database/host'
'/myapp/prod/database/port'
'/myapp/dev/database/host'

// ❌ Avoid - flat structure
'prod-db-host'
'dev-db-host'
```

### 2. Use SecureString for Sensitive Data
```typescript
// ✅ Good - encrypted sensitive data
const apiKey = nimbus.Parameter({
  name: '/app/external-api-key',
  type: 'SecureString'
});

// ❌ Avoid - plain text sensitive data
const apiKey = nimbus.Parameter({
  name: '/app/external-api-key',
  type: 'String'
});
```

### 3. Implement Fallback Values
```typescript
const config = await runtime.parameters.getJson('/app/config').catch(() => ({}));
const maxRetries = config.maxRetries || 3; // Fallback value
const timeout = config.timeout || 30000; // Fallback value
```

### 4. Cache Appropriately
```typescript
// ✅ Good - cache for performance
const config = await runtime.parameters.getJson('/app/config');

// ✅ Good - fresh data for admin operations
const config = await runtime.parameters.getJson('/app/config', { cache: false });
```

## Error Handling

```typescript
try {
  const config = await runtime.parameters.get('/app/config');
  if (!config) {
    // Parameter doesn't exist - use defaults
    return defaultConfiguration;
  }
  return JSON.parse(config);
} catch (error) {
  console.error('Failed to get configuration:', error);
  // Fallback to default configuration
  return defaultConfiguration;
}
```

## Monitoring

### CloudWatch Metrics
Parameter Store automatically provides metrics for:
- Parameter retrieval frequency
- Error rates
- Latency

### Custom Monitoring
```typescript
api.route('GET', '/health', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  try {
    // Test parameter access
    const config = await runtime.parameters.get('/app/config');
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'healthy',
        configurationAvailable: !!config,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'unhealthy',
        error: 'Configuration unavailable'
      })
    };
  }
});
```

## Cleanup

```bash
npm run destroy
```

## Key Takeaways

1. **Deploy Context**: Define infrastructure without values
2. **Runtime Context**: Use runtime helpers to access data
3. **Hierarchical Organization**: Use structured parameter names
4. **Caching**: Automatic with configurable TTL
5. **Real-time Updates**: Change configuration without redeployment
6. **Security**: Use SecureString for sensitive data

This pattern enables flexible, secure, and performant configuration management for serverless applications!

## Related Examples

- [Feature Flags](./feature-flags.md) - Dedicated feature flags example
- [Secrets Manager](./secrets-manager.md) - Secure secret management
- [Basic API](./basic-api.md) - Simple API without configuration

## Learn More

- [Runtime Helpers API](../api/runtime.md) - Complete runtime API reference
- [Parameter Store](../api/parameters.md) - Parameter Store documentation
- [Security Best Practices](../guide/security.md) - Overall security guidance