# Secrets Manager

Securely store and manage sensitive data using AWS Secrets Manager with Nimbus.

## Overview

AWS Secrets Manager helps you protect secrets needed to access your applications, services, and IT resources. Nimbus integrates seamlessly with Secrets Manager to provide secure secret storage with automatic encryption, rotation capabilities, and fine-grained access control.

## Basic Usage

Create a secret placeholder during deployment:

```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// ✅ CORRECT: Create secret without hardcoded values
const databaseCredentials = nimbus.Secret({
  name: 'database-credentials',
  description: 'Production database connection details'
  // No value here - will be set securely at runtime
});

const apiKeys = nimbus.Secret({
  name: 'external-api-keys',
  description: 'Third-party service API keys'
});
```

## Configuration Options

### Basic Secret
```typescript
const secret = nimbus.Secret({
  name: 'my-secret',
  description: 'Description of what this secret contains'
});
```

### Advanced Configuration
```typescript
const secret = nimbus.Secret({
  name: 'advanced-secret',
  description: 'Advanced secret configuration',
  kmsKeyId: 'arn:aws:kms:region:account:key/key-id', // Custom KMS key
  automaticRotation: true, // Enable automatic rotation
  rotationLambdaArn: 'arn:aws:lambda:region:account:function:rotation-function'
});
```

## Runtime Usage

Use runtime helpers to access secrets in Lambda functions:

```typescript
api.route('POST', '/auth/login', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  try {
    // Get database credentials
    const dbCreds = await runtime.secrets.getJson('database-credentials');
    
    if (!dbCreds) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database configuration not available' })
      };
    }
    
    // Use credentials to authenticate user
    const user = await authenticateUser(email, password, dbCreds);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ user })
    };
    
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Authentication failed' })
    };
  }
});
```

## Runtime Methods

### Getting Secrets
```typescript
const { runtime } = await import('nimbus-framework');

// Get secret as JSON object
const dbCreds = await runtime.secrets.getJson('database-credentials');
// Returns: { host: "db.com", username: "user", password: "pass" }

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

## Secret Management Patterns

### Database Credentials
```typescript
const dbSecret = nimbus.Secret({
  name: 'database-credentials',
  description: 'Database connection credentials'
});

// In Lambda function
const credentials = await runtime.secrets.getJson('database-credentials');
const connection = await createConnection({
  host: credentials.host,
  username: credentials.username,
  password: credentials.password,
  database: credentials.database
});
```

### API Keys
```typescript
const apiKeysSecret = nimbus.Secret({
  name: 'external-api-keys',
  description: 'Third-party service API keys'
});

// In Lambda function
const apiKeys = await runtime.secrets.getJson('external-api-keys');
const stripe = new Stripe(apiKeys.stripe);
const sendgrid = new SendGrid(apiKeys.sendgrid);
```

### JWT Configuration
```typescript
const jwtSecret = nimbus.Secret({
  name: 'jwt-configuration',
  description: 'JWT signing and encryption keys'
});

// In Lambda function
const jwtConfig = await runtime.secrets.getJson('jwt-configuration');
const token = jwt.sign(payload, jwtConfig.signing_key, {
  issuer: jwtConfig.issuer,
  audience: jwtConfig.audience
});
```

## Security Best Practices

### 1. Never Hardcode Secrets
```typescript
// ❌ NEVER do this
const secret = nimbus.Secret({
  name: 'my-secret',
  value: 'hardcoded-secret-value' // BAD!
});

// ✅ DO this instead
const secret = nimbus.Secret({
  name: 'my-secret',
  description: 'My application secret'
  // No value - set securely at runtime
});
```

### 2. Use Descriptive Names
```typescript
// ✅ Good - clear purpose
const databaseCredentials = nimbus.Secret({
  name: 'prod-database-credentials',
  description: 'Production database connection details'
});

// ❌ Avoid - unclear purpose
const secret1 = nimbus.Secret({
  name: 'secret1'
});
```

### 3. Implement Proper Error Handling
```typescript
try {
  const secret = await runtime.secrets.get('my-secret');
  if (!secret) {
    // Handle missing secret gracefully
    return fallbackBehavior();
  }
  // Use secret
} catch (error) {
  console.error('Failed to retrieve secret:', error);
  // Implement fallback or fail gracefully
}
```

### 4. Use Caching Appropriately
```typescript
// ✅ Good - cache for performance
const secret = await runtime.secrets.get('my-secret');

// ✅ Good - fresh data for sensitive operations
const secret = await runtime.secrets.get('my-secret', { cache: false });
```

## Secret Rotation

Secrets can be rotated without code changes:

### Manual Rotation
```typescript
// Admin endpoint for secret rotation
api.route('PUT', '/admin/secrets/rotate', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // Verify admin access
  if (!await verifyAdminAccess(event)) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  
  const { secretName, newValue } = JSON.parse(event.body);
  
  // Rotate the secret
  await runtime.secrets.set(secretName, newValue);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Secret rotated successfully' })
  };
});
```

### Automatic Rotation
```typescript
const secret = nimbus.Secret({
  name: 'database-password',
  description: 'Database password with automatic rotation',
  automaticRotation: true,
  rotationLambdaArn: 'arn:aws:lambda:region:account:function:rotate-db-password'
});
```

## Cost Considerations

- **Secret Storage**: $0.40 per secret per month
- **API Calls**: $0.05 per 10,000 requests
- **Rotation**: Additional Lambda execution costs if using automatic rotation

Example monthly cost:
- 5 secrets: $2.00
- 100K API calls: $0.50
- **Total**: ~$2.50/month

## Monitoring and Compliance

### CloudTrail Integration
All secret access is automatically logged to CloudTrail:
- Who accessed which secret
- When the access occurred
- Source IP and user agent
- Success/failure status

### CloudWatch Metrics
Monitor secret usage with CloudWatch:
- Number of secret retrievals
- Failed access attempts
- Rotation events

### Compliance Features
- **Encryption**: All secrets encrypted at rest with AWS KMS
- **Access Control**: Fine-grained IAM permissions
- **Audit Trail**: Complete access logging
- **Rotation**: Automated secret rotation capabilities

## Error Handling

Common error scenarios and how to handle them:

```typescript
try {
  const secret = await runtime.secrets.get('my-secret');
} catch (error) {
  if (error.name === 'ResourceNotFoundException') {
    // Secret doesn't exist
    console.log('Secret not found');
  } else if (error.name === 'DecryptionFailureException') {
    // KMS decryption failed
    console.error('Failed to decrypt secret');
  } else if (error.name === 'AccessDeniedException') {
    // Insufficient permissions
    console.error('Access denied to secret');
  } else {
    // Other AWS service errors
    console.error('Unexpected error:', error);
  }
}
```

## Integration with Other Services

### Database Connections
```typescript
const dbCreds = await runtime.secrets.getJson('database-credentials');
const pool = new Pool({
  host: dbCreds.host,
  port: dbCreds.port,
  database: dbCreds.database,
  user: dbCreds.username,
  password: dbCreds.password,
  ssl: { rejectUnauthorized: false }
});
```

### External APIs
```typescript
const apiKeys = await runtime.secrets.getJson('api-keys');

// Stripe integration
const stripe = new Stripe(apiKeys.stripe);

// SendGrid integration
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiKeys.sendgrid);

// Custom API integration
const response = await fetch('https://api.example.com/data', {
  headers: {
    'Authorization': `Bearer ${apiKeys.external_service}`,
    'Content-Type': 'application/json'
  }
});
```

## Related

- [Runtime Helpers](./runtime.md) - Complete runtime API reference
- [Parameter Store](./parameters.md) - Configuration management
- [Examples: Secrets Manager](../examples/secrets-manager.md) - Complete example
- [Security Best Practices](../guide/security.md) - Overall security guidance