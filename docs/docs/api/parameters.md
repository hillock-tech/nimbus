# Parameter Store

Manage application configuration and settings using AWS Systems Manager Parameter Store with Nimbus.

## Overview

AWS Systems Manager Parameter Store provides secure, hierarchical storage for configuration data and secrets management. Nimbus integrates with Parameter Store to provide easy configuration management with support for different parameter types, encryption, and versioning.

## Basic Usage

Create parameter placeholders during deployment:

```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// ✅ CORRECT: Create parameters without hardcoded values
const appConfig = nimbus.Parameter({
  name: '/app/config',
  description: 'Application configuration settings',
  type: 'String'
});

const featureFlags = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Feature toggle configuration',
  type: 'String'
});

const encryptedConfig = nimbus.Parameter({
  name: '/app/encrypted-config',
  description: 'Encrypted configuration data',
  type: 'SecureString' // Encrypted with KMS
});
```

## Configuration Options

### Parameter Types

```typescript
// String parameter (default)
const stringParam = nimbus.Parameter({
  name: '/app/version',
  description: 'Application version',
  type: 'String'
});

// Encrypted parameter
const secureParam = nimbus.Parameter({
  name: '/app/database-password',
  description: 'Database password',
  type: 'SecureString'
});

// String list parameter
const listParam = nimbus.Parameter({
  name: '/app/allowed-origins',
  description: 'Allowed CORS origins',
  type: 'StringList'
});
```

### Advanced Configuration

```typescript
const parameter = nimbus.Parameter({
  name: '/app/advanced-config',
  description: 'Advanced configuration with custom settings',
  type: 'SecureString',
  keyId: 'arn:aws:kms:region:account:key/key-id', // Custom KMS key
  tier: 'Advanced' // For parameters > 4KB
});
```

## Runtime Usage

Use runtime helpers to access parameters in Lambda functions:

```typescript
api.route('GET', '/config', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  try {
    // Get application configuration
    const config = await runtime.parameters.getJson('/app/config');
    
    if (!config) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Configuration not available' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ config })
    };
    
  } catch (error) {
    console.error('Configuration error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get configuration' })
    };
  }
});
```

## Runtime Methods

### Getting Parameters
```typescript
const { runtime } = await import('nimbus-framework');

// Get parameter value as string
const version = await runtime.parameters.get('/app/version');

// Get parameter as JSON object
const config = await runtime.parameters.getJson('/app/config');
// Returns parsed JSON object

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

## Parameter Organization

### Hierarchical Structure
```typescript
// Environment-specific parameters
const devConfig = nimbus.Parameter({
  name: '/myapp/dev/database-url',
  description: 'Development database URL'
});

const prodConfig = nimbus.Parameter({
  name: '/myapp/prod/database-url',
  description: 'Production database URL'
});

// Feature-specific parameters
const authConfig = nimbus.Parameter({
  name: '/myapp/auth/jwt-secret',
  description: 'JWT signing secret',
  type: 'SecureString'
});

const paymentConfig = nimbus.Parameter({
  name: '/myapp/payments/stripe-config',
  description: 'Stripe payment configuration'
});
```

### Environment-Based Access
```typescript
api.route('GET', '/database-status', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const stage = process.env.STAGE || 'dev';
  const dbUrl = await runtime.parameters.get(`/myapp/${stage}/database-url`);
  
  // Use environment-specific database URL
  const status = await checkDatabaseConnection(dbUrl);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ status, environment: stage })
  };
});
```

## Configuration Patterns

### Application Settings
```typescript
const appSettings = nimbus.Parameter({
  name: '/app/settings',
  description: 'Application settings and configuration'
});

// Usage in Lambda
const settings = await runtime.parameters.getJson('/app/settings');
const maxRetries = settings?.maxRetries || 3;
const timeout = settings?.timeout || 30000;
```

### Feature Flags
```typescript
const featureFlags = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Feature toggle configuration'
});

// Usage in Lambda
const flags = await runtime.parameters.getJson('/app/feature-flags') || {};
const enableNewUI = flags.enableNewUI || false;
const enableBetaFeatures = flags.enableBetaFeatures || false;

if (enableNewUI) {
  // Use new UI logic
}
```

### API Endpoints
```typescript
const apiEndpoints = nimbus.Parameter({
  name: '/app/api-endpoints',
  description: 'External API endpoint URLs'
});

// Usage in Lambda
const endpoints = await runtime.parameters.getJson('/app/api-endpoints');
const paymentAPI = endpoints?.payment || 'https://api.stripe.com';
const notificationAPI = endpoints?.notification || 'https://api.sendgrid.com';
```

## Parameter Types in Detail

### String Parameters
```typescript
// Simple string value
await runtime.parameters.set('/app/version', '1.0.0');
const version = await runtime.parameters.get('/app/version');
// Returns: "1.0.0"
```

### SecureString Parameters
```typescript
// Encrypted parameter (uses default KMS key)
await runtime.parameters.set('/app/api-key', 'secret-api-key', { 
  type: 'SecureString' 
});

// Get with automatic decryption
const apiKey = await runtime.parameters.get('/app/api-key', { decrypt: true });
```

### StringList Parameters
```typescript
// Comma-separated list
await runtime.parameters.set('/app/allowed-origins', 'https://app.com,https://admin.com', {
  type: 'StringList'
});

const origins = await runtime.parameters.get('/app/allowed-origins');
// Returns: "https://app.com,https://admin.com"

// Parse as array
const originsList = origins?.split(',') || [];
```

## Dynamic Configuration

### Real-time Configuration Updates
```typescript
// Admin endpoint to update configuration
api.route('PUT', '/admin/config', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Verify admin access
  if (!await verifyAdminAccess(event)) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  
  const newConfig = JSON.parse(event.body);
  
  // Update configuration without redeployment
  await runtime.parameters.setJson('/app/config', newConfig);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      message: 'Configuration updated successfully',
      config: newConfig 
    })
  };
});
```

### Configuration-Driven Behavior
```typescript
api.route('POST', '/process-data', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Get current configuration
  const config = await runtime.parameters.getJson('/app/processing-config') || {};
  
  const maxItems = config.maxItemsPerRequest || 100;
  const enableValidation = config.enableDataValidation || false;
  const processingTimeout = config.processingTimeout || 30000;
  
  // Apply configuration-driven logic
  const { data } = JSON.parse(event.body || '{}');
  
  if (enableValidation && !isValidData(data)) {
    return { statusCode: 400, body: 'Invalid data format' };
  }
  
  const itemsToProcess = data.slice(0, maxItems);
  const results = await processDataWithTimeout(itemsToProcess, processingTimeout);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      processed: results.length,
      results,
      appliedConfig: { maxItems, enableValidation, processingTimeout }
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
- **Features**: Parameter policies, expiration, notifications

Example monthly cost:
- 50 standard parameters: Free
- 10 advanced parameters: $0.50
- 100K API calls: $0.50
- **Total**: ~$1.00/month

## Monitoring and Notifications

### CloudWatch Integration
```typescript
// Parameters automatically create CloudWatch metrics
// Monitor parameter access patterns and usage
```

### Parameter Policies
```typescript
const parameter = nimbus.Parameter({
  name: '/app/temp-config',
  description: 'Temporary configuration with expiration',
  type: 'String',
  tier: 'Advanced' // Required for policies
  // Policies can be set via AWS console or CLI
});
```

### Change Notifications
```typescript
// Set up CloudWatch Events for parameter changes
// Trigger Lambda functions when parameters are updated
```

## Security Best Practices

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
const dbPassword = nimbus.Parameter({
  name: '/app/database/password',
  type: 'SecureString'
});

// ❌ Avoid - plain text sensitive data
const dbPassword = nimbus.Parameter({
  name: '/app/database/password',
  type: 'String' // Sensitive data not encrypted
});
```

### 3. Implement Proper Access Control
```typescript
// Parameters automatically get appropriate IAM permissions
// Lambda functions can only access parameters they're configured to use
```

### 4. Handle Missing Parameters Gracefully
```typescript
const config = await runtime.parameters.getJson('/app/config').catch(() => ({}));
const maxRetries = config.maxRetries || 3; // Fallback value
```

## Error Handling

```typescript
try {
  const parameter = await runtime.parameters.get('/app/config');
} catch (error) {
  if (error.name === 'ParameterNotFound') {
    // Parameter doesn't exist
    console.log('Parameter not found, using defaults');
  } else if (error.name === 'AccessDeniedException') {
    // Insufficient permissions
    console.error('Access denied to parameter');
  } else {
    // Other AWS service errors
    console.error('Unexpected error:', error);
  }
}
```

## Integration Examples

### Database Configuration
```typescript
const dbConfig = await runtime.parameters.getJson('/app/database/config');
const connection = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  // Use Secrets Manager for credentials
  user: dbCredentials.username,
  password: dbCredentials.password
});
```

### External Service Configuration
```typescript
const serviceConfig = await runtime.parameters.getJson('/app/external-services');
const httpClient = axios.create({
  baseURL: serviceConfig.apiBaseUrl,
  timeout: serviceConfig.timeout,
  headers: {
    'User-Agent': serviceConfig.userAgent
  }
});
```

## Related

- [Runtime Helpers](./runtime.md) - Complete runtime API reference
- [Secrets Manager](./secrets.md) - Secure secret management
- [Examples: Feature Flags](../examples/feature-flags.md) - Complete example
- [Examples: Parameter Store](../examples/parameter-store.md) - Parameter example