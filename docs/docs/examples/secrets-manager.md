# Secrets Manager Example

This example demonstrates the **correct** way to handle secrets in serverless applications using AWS Secrets Manager with Nimbus runtime helpers.

## Overview

The secrets manager example shows how to:

- Create secret placeholders without hardcoded values
- Store secrets securely via API endpoints
- Retrieve secrets at runtime using helper functions
- Rotate secrets without code changes
- Implement proper security practices

## Security Best Practices

### ❌ NEVER Do This
```typescript
// DON'T store secrets in code!
const secret = nimbus.Secret({
  name: 'my-secret',
  value: 'hardcoded-secret-value' // ❌ BAD!
});
```

### ✅ DO This Instead
```typescript
// Create secret placeholder (no value in code)
const secret = nimbus.Secret({
  name: 'my-secret',
  description: 'My application secret'
  // No value here - will be set securely via API/console
});

// Use in Lambda function
api.route('GET', '/protected', async (event) => {
  const { runtime } = await import('nimbus-framework');
  const secretValue = await runtime.secrets.getJson('my-secret'); // ✅ GOOD!
  // Use secretValue...
});
```

## Code Structure

### Infrastructure Definition (Deploy Context)
```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// ✅ CORRECT: Create secret placeholders without values
const databaseCredentials = nimbus.Secret({
  name: 'database-credentials',
  description: 'Production database connection details'
  // No value here - will be set securely via API
});

const apiKeys = nimbus.Secret({
  name: 'external-api-keys',
  description: 'Third-party service API keys'
  // No value here - will be set securely via API
});

const jwtConfig = nimbus.Secret({
  name: 'jwt-configuration',
  description: 'JWT signing and encryption keys'
  // No value here - will be set securely via API
});
```

### Runtime Usage (Lambda Functions)
```typescript
// Admin endpoint to store secrets
api.route('POST', '/admin/secrets', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  try {
    // Verify admin authentication
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { secretName, secretValue } = JSON.parse(event.body || '{}');
    
    // Store the secret securely using runtime helper
    await runtime.secrets.set(secretName, secretValue);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Secret '${secretName}' stored successfully`
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to store secret' })
    };
  }
});

// Application endpoint that uses secrets
api.route('POST', '/auth/login', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  try {
    const { email, password } = JSON.parse(event.body || '{}');
    
    // ✅ CORRECT: Retrieve secret at runtime
    const dbCreds = await runtime.secrets.getJson('database-credentials');
    
    if (!dbCreds) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database configuration not available' })
      };
    }
    
    // Use the secret to connect to database
    const user = await authenticateUser(email, password, dbCreds);
    
    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
    
    // Get JWT configuration
    const jwtCreds = await runtime.secrets.getJson('jwt-configuration');
    
    // Generate JWT token
    const token = generateJWT(user, jwtCreds);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: { id: user.id, email: user.email }
      })
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

## How It Works

### 1. **Deployment Phase**
```bash
npm run deploy
```
- Nimbus creates empty secret placeholders in AWS Secrets Manager
- Lambda functions get IAM permissions to read these secrets
- No actual secret values are deployed with your code

### 2. **Secret Storage Phase**
Store secrets securely via the admin API:

```bash
# Store database credentials
curl -X POST https://your-api.amazonaws.com/admin/secrets \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "database-credentials",
    "secretValue": {
      "host": "prod-db.example.com",
      "username": "app_user",
      "password": "actual-secure-password",
      "database": "production"
    }
  }'

# Store API keys
curl -X POST https://your-api.amazonaws.com/admin/secrets \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "external-api-keys",
    "secretValue": {
      "stripe": "sk_live_actual_stripe_key",
      "sendgrid": "SG.actual_sendgrid_key"
    }
  }'
```

### 3. **Runtime Phase**
Lambda functions retrieve secrets securely:

```typescript
api.route('POST', '/payments/charge', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  // ✅ Secret is fetched from AWS Secrets Manager at runtime
  const apiKeys = await runtime.secrets.getJson('external-api-keys');
  
  // Use the secret API key
  const stripe = require('stripe')(apiKeys.stripe);
  const charge = await stripe.charges.create({
    amount: amount * 100,
    currency: 'usd',
    source: token
  });
  
  // Send email using secret SendGrid key
  const sendgrid = require('@sendgrid/mail');
  sendgrid.setApiKey(apiKeys.sendgrid);
  await sendgrid.send({
    to: 'customer@example.com',
    from: 'noreply@myapp.com',
    subject: 'Payment Confirmation',
    text: `Payment of $${amount} processed successfully.`
  });
});
```

## Runtime Helper Methods

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

## Secret Rotation

Update secrets without redeploying code:

```bash
# Rotate JWT signing key
curl -X PUT https://your-api.amazonaws.com/admin/secrets/rotate \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "jwt-configuration",
    "newValue": {
      "signing_key": "new-256-bit-secret-key",
      "issuer": "myapp.com"
    }
  }'
```

## Available Endpoints

### Admin Endpoints (Require Authentication)
- `POST /admin/secrets` - Store a new secret value
- `PUT /admin/secrets/rotate` - Rotate/update existing secret

### Application Endpoints
- `POST /auth/login` - User authentication (uses database credentials)
- `POST /payments/charge` - Process payments (uses Stripe API key)

## Security Features

1. **No Hardcoded Secrets**: Secret values never appear in your code
2. **IAM Permissions**: Lambda functions only get access to specific secrets
3. **Encryption**: All secrets encrypted at rest with AWS KMS
4. **Audit Trail**: All secret access logged in CloudTrail
5. **Rotation**: Secrets can be updated without code changes

## Alternative Secret Storage Methods

Instead of using the API, you can also store secrets via:

### AWS Console
1. Go to AWS Secrets Manager console
2. Find your secret (e.g., `dev-database-credentials`)
3. Click "Retrieve secret value" → "Edit"
4. Update the JSON value

### AWS CLI
```bash
aws secretsmanager put-secret-value \
  --secret-id dev-database-credentials \
  --secret-string '{"host":"prod-db.com","username":"user","password":"pass"}'
```

### Terraform/CloudFormation
```hcl
resource "aws_secretsmanager_secret_version" "db_creds" {
  secret_id = "dev-database-credentials"
  secret_string = jsonencode({
    host     = "prod-db.example.com"
    username = "app_user"
    password = var.db_password
  })
}
```

## Cost

- **Secrets Manager**: ~$0.40 per secret per month
- **API Calls**: ~$0.05 per 10,000 requests
- **Example Cost**: 3 secrets = ~$1.20/month

## Deployment

```bash
cd examples/secrets-manager
npm install
npm run deploy
```

## Testing

After deployment, test the secret storage:

```bash
# 1. Store a test secret
curl -X POST https://your-api-url/admin/secrets \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "database-credentials",
    "secretValue": {
      "host": "localhost",
      "username": "test",
      "password": "test123"
    }
  }'

# 2. Test login (which retrieves the secret)
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## Error Handling

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

// Graceful degradation
const apiKeys = await runtime.secrets.getJson('api-keys').catch(() => null);
if (!apiKeys) {
  return { statusCode: 500, body: 'Service temporarily unavailable' };
}
```

## Cleanup

```bash
npm run destroy
```

This removes all Lambda functions, API Gateway, and secrets (with a 7-day recovery window).

## Key Takeaways

1. **Never hardcode secrets** in your application code
2. **Use runtime retrieval** with `runtime.secrets.get()`
3. **Store secrets securely** via API, console, or CLI
4. **Rotate secrets regularly** without code changes
5. **Monitor access** via CloudTrail logs
6. **Handle errors gracefully** with fallback behavior

This pattern ensures your secrets are secure, auditable, and manageable in production environments!

## Related Examples

- [Feature Flags](./feature-flags.md) - Feature flags and configuration
- [Basic API](./basic-api.md) - Simple API without secrets
- [Auth API](./auth-api.md) - Authentication patterns

## Learn More

- [Runtime Helpers API](../api/runtime.md) - Complete runtime API reference
- [Secrets Manager](../api/secrets.md) - Deploy-time secrets documentation
- [Security Best Practices](../guide/security.md) - Overall security guidance