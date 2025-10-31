# Security Best Practices

This guide covers security best practices when building serverless applications with Nimbus.

## Overview

Security in serverless applications requires attention to multiple layers: infrastructure, application code, data protection, and access control. Nimbus provides built-in security features and follows AWS security best practices.

## Core Security Principles

### 1. Principle of Least Privilege
Grant only the minimum permissions necessary for each function to operate.

```typescript
// ✅ Good - specific permissions
const nimbus = new Nimbus({ projectName: 'my-app' });
const api = nimbus.API({ name: 'user-api' });

api.route('POST', '/users', async (event) => {
  // Process user data
  permissions: [
    {
      Effect: 'Allow',
      Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      Resource: 'arn:aws:dynamodb:region:account:table/users'
    }
  ]
});

// ❌ Avoid - overly broad permissions  
api.route('POST', '/users', async (event) => {
  // This function would have overly broad permissions
  permissions: [
    {
      Effect: 'Allow',
      Action: ['*'],
      Resource: ['*']
    }
  ]
});
```

### 2. Defense in Depth
Implement multiple layers of security controls.

```typescript
const api = nimbus.api({
  name: 'secure-api',
  // Layer 1: WAF protection
  waf: {
    enabled: true,
    rateLimiting: { enabled: true, limit: 1000 },
    sqlInjectionProtection: true,
    xssProtection: true
  }
});

// Layer 2: Authentication
api.authorizer({
  name: 'jwt-auth',
  type: 'TOKEN',
  handler: './auth/authorizer.js'
});

// Layer 3: Input validation
api.route('POST', '/users', async (event) => {
  // Validate input
  const { error, value } = validateUserInput(event.body);
  if (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
  
  // Process validated data
  return processUser(value);
}, { authorizer: 'jwt-auth' });
```

### 3. Secure by Default
Use secure defaults and explicit security configurations.

```typescript
// ✅ Good - explicit security settings
const kv = nimbus.KV({
  name: 'user-data',
  encryption: true, // Explicit encryption
  pointInTimeRecovery: true,
  deletionProtection: true
});

const storage = nimbus.Storage({
  name: 'user-uploads',
  encryption: true,
  versioning: true,
  publicAccess: false // Explicit private access
});
```

## Secrets and Configuration Management

### Never Hardcode Secrets
```typescript
// ❌ NEVER do this
const apiKey = 'sk_live_1234567890abcdef'; // Hardcoded secret

// ✅ DO this instead
const apiKeySecret = nimbus.Secret({
  name: 'stripe-api-key',
  description: 'Stripe API key for payments'
});

// Use in Lambda function
api.route('POST', '/charge', async (event) => {
  const { runtime } = await import('nimbus-framework');
  const apiKey = await runtime.secrets.getString('stripe-api-key');
  // Use apiKey securely
});
```

### Separate Configuration by Environment
```typescript
// Environment-specific secrets
const prodDbSecret = nimbus.Secret({
  name: 'prod-database-credentials',
  description: 'Production database credentials'
});

const devDbSecret = nimbus.Secret({
  name: 'dev-database-credentials',
  description: 'Development database credentials'
});

// Environment-specific parameters
const prodConfig = nimbus.Parameter({
  name: '/myapp/prod/config',
  description: 'Production configuration'
});
```

### Use Encryption for Sensitive Parameters
```typescript
// ✅ Good - encrypted parameter
const sensitiveConfig = nimbus.Parameter({
  name: '/app/sensitive-config',
  type: 'SecureString', // Encrypted with KMS
  description: 'Sensitive configuration data'
});

// ❌ Avoid - plain text sensitive data
const sensitiveConfig = nimbus.Parameter({
  name: '/app/sensitive-config',
  type: 'String', // Not encrypted
  description: 'Sensitive configuration data'
});
```

## API Security

### Authentication and Authorization
```typescript
// JWT-based authentication
const jwtAuthorizer = nimbus.api({
  name: 'secure-api'
}).authorizer({
  name: 'jwt-auth',
  type: 'TOKEN',
  handler: async (event) => {
    const { runtime } = await import('nimbus-framework');
    
    try {
      const token = event.authorizationToken.replace('Bearer ', '');
      const jwtSecret = await runtime.secrets.getString('jwt-secret');
      
      const decoded = jwt.verify(token, jwtSecret);
      
      return {
        principalId: decoded.sub,
        policyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn
          }]
        },
        context: {
          userId: decoded.sub,
          email: decoded.email
        }
      };
    } catch (error) {
      throw new Error('Unauthorized');
    }
  }
});
```

### Input Validation
```typescript
import Joi from 'joi';

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(50).required(),
  age: Joi.number().integer().min(18).max(120)
});

api.route('POST', '/users', async (event) => {
  try {
    // Validate input
    const { error, value } = userSchema.validate(JSON.parse(event.body || '{}'));
    
    if (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        })
      };
    }
    
    // Process validated data
    const user = await createUser(value);
    
    return {
      statusCode: 201,
      body: JSON.stringify(user)
    };
    
  } catch (error) {
    console.error('User creation error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
});
```

### CORS Configuration
```typescript
api.route('GET', '/public-data', async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://myapp.com', // Specific origin
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    },
    body: JSON.stringify({ data: 'public data' })
  };
}, { cors: true });
```

## Data Protection

### Encryption at Rest
```typescript
// DynamoDB encryption
const encryptedKV = nimbus.KV({
  name: 'sensitive-data',
  encryption: true, // Server-side encryption
  kmsKeyId: 'arn:aws:kms:region:account:key/key-id' // Custom KMS key
});

// S3 encryption
const encryptedStorage = nimbus.Storage({
  name: 'sensitive-files',
  encryption: true,
  kmsKeyId: 'arn:aws:kms:region:account:key/key-id'
});
```

### Encryption in Transit
```typescript
// All Nimbus APIs use HTTPS by default
const api = nimbus.api({
  name: 'secure-api',
  // HTTPS is enforced automatically
});

// Custom domain with TLS certificate
const api = nimbus.api({
  name: 'secure-api',
  customDomain: 'api.myapp.com', // Automatic ACM certificate
});
```

### Data Sanitization
```typescript
api.route('POST', '/comments', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const { comment } = JSON.parse(event.body || '{}');
  
  // Sanitize HTML input
  const sanitizedComment = sanitizeHtml(comment, {
    allowedTags: ['b', 'i', 'em', 'strong'],
    allowedAttributes: {}
  });
  
  // Store sanitized data
  await runtime.kv.put('comments-table', {
    id: generateId(),
    comment: sanitizedComment,
    createdAt: new Date().toISOString()
  });
  
  return {
    statusCode: 201,
    body: JSON.stringify({ message: 'Comment created' })
  };
});
```

## WAF Protection

### Basic WAF Configuration
```typescript
const api = nimbus.api({
  name: 'protected-api',
  waf: {
    enabled: true,
    rateLimiting: {
      enabled: true,
      limit: 1000 // requests per 5 minutes per IP
    },
    sqlInjectionProtection: true,
    xssProtection: true
  }
});
```

### Advanced WAF Configuration
```typescript
const api = nimbus.api({
  name: 'enterprise-api',
  waf: {
    enabled: true,
    rateLimiting: {
      enabled: true,
      limit: 2000
    },
    ipBlocking: {
      enabled: true,
      blockedIPs: [
        '192.168.1.100/32', // Specific malicious IP
        '10.0.0.0/8'        // Private network range
      ],
      allowedIPs: [
        '203.0.113.0/24'    // Office network
      ]
    },
    geoBlocking: {
      enabled: true,
      blockedCountries: ['CN', 'RU', 'KP']
    },
    sqlInjectionProtection: true,
    xssProtection: true
  }
});
```

## Monitoring and Logging

### Security Monitoring
```typescript
// Enable X-Ray tracing for security analysis
const api = nimbus.api({
  name: 'monitored-api',
  tracing: true // Enable X-Ray tracing
});

// Log security events
api.route('POST', '/sensitive-operation', async (event) => {
  const userId = event.requestContext.authorizer?.userId;
  const sourceIP = event.requestContext.identity?.sourceIp;
  
  // Log security-relevant events
  console.log(JSON.stringify({
    event: 'sensitive_operation_attempted',
    userId,
    sourceIP,
    timestamp: new Date().toISOString(),
    userAgent: event.headers['User-Agent']
  }));
  
  // Perform operation
  const result = await performSensitiveOperation();
  
  // Log successful completion
  console.log(JSON.stringify({
    event: 'sensitive_operation_completed',
    userId,
    timestamp: new Date().toISOString()
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
});
```

### Error Handling Without Information Disclosure
```typescript
api.route('POST', '/login', async (event) => {
  try {
    const { email, password } = JSON.parse(event.body || '{}');
    
    const user = await authenticateUser(email, password);
    
    if (!user) {
      // Generic error message - don't reveal if user exists
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ token: generateToken(user) })
    };
    
  } catch (error) {
    // Log detailed error internally
    console.error('Authentication error:', error);
    
    // Return generic error to client
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Authentication failed' })
    };
  }
});
```

## Compliance and Auditing

### CloudTrail Integration
```typescript
// All AWS API calls are automatically logged to CloudTrail
// Including:
// - Secret access
// - Parameter retrieval
// - Database operations
// - File storage access
```

### Data Retention Policies
```typescript
const auditStorage = nimbus.Storage({
  name: 'audit-logs',
  encryption: true,
  versioning: true,
  lifecycleRules: [
    {
      id: 'audit-retention',
      status: 'Enabled',
      transitions: [
        {
          days: 30,
          storageClass: 'STANDARD_IA'
        },
        {
          days: 90,
          storageClass: 'GLACIER'
        }
      ],
      expiration: {
        days: 2555 // 7 years retention
      }
    }
  ]
});
```

## Security Checklist

### Development Phase
- [ ] No hardcoded secrets or credentials
- [ ] Input validation on all endpoints
- [ ] Proper error handling without information disclosure
- [ ] Authentication and authorization implemented
- [ ] HTTPS enforced for all communications
- [ ] Sensitive data encrypted at rest and in transit

### Deployment Phase
- [ ] Secrets stored in AWS Secrets Manager
- [ ] Parameters encrypted with SecureString type
- [ ] WAF enabled for public APIs
- [ ] CloudTrail logging enabled
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested

### Production Phase
- [ ] Regular security audits
- [ ] Secret rotation procedures
- [ ] Incident response plan
- [ ] Access reviews and cleanup
- [ ] Security monitoring and alerting
- [ ] Compliance reporting

## Common Security Pitfalls

### 1. Logging Sensitive Data
```typescript
// ❌ Don't log sensitive data
console.log('User login:', { email, password }); // BAD!

// ✅ Log safely
console.log('User login attempt:', { email, timestamp: new Date().toISOString() });
```

### 2. SQL Injection in NoSQL
```typescript
// ❌ Vulnerable to injection
const userId = event.pathParameters.userId; // Unsanitized input
const user = await runtime.kv.get('users-table', { id: userId });

// ✅ Validate input
const userId = event.pathParameters.userId;
if (!/^[a-zA-Z0-9-]+$/.test(userId)) {
  return { statusCode: 400, body: 'Invalid user ID format' };
}
const user = await runtime.kv.get('users-table', { id: userId });
```

### 3. Insecure Direct Object References
```typescript
// ❌ No authorization check
api.route('GET', '/users/:userId', async (event) => {
  const userId = event.pathParameters.userId;
  const user = await getUser(userId); // Any user can access any user
  return { statusCode: 200, body: JSON.stringify(user) };
});

// ✅ Proper authorization
api.route('GET', '/users/:userId', async (event) => {
  const requestedUserId = event.pathParameters.userId;
  const currentUserId = event.requestContext.authorizer?.userId;
  
  // Users can only access their own data
  if (requestedUserId !== currentUserId) {
    return { statusCode: 403, body: 'Access denied' };
  }
  
  const user = await getUser(requestedUserId);
  return { statusCode: 200, body: JSON.stringify(user) };
}, { authorizer: 'jwt-auth' });
```

## Security Resources

### AWS Security Best Practices
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
- [AWS Lambda Security Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/lambda-security.html)
- [API Gateway Security](https://docs.aws.amazon.com/apigateway/latest/developerguide/security.html)

### Security Tools and Libraries
- **Input Validation**: Joi, Yup, express-validator
- **Sanitization**: DOMPurify, sanitize-html
- **Authentication**: jsonwebtoken, passport
- **Encryption**: crypto (Node.js built-in), bcrypt

### Compliance Frameworks
- **SOC 2**: System and Organization Controls
- **PCI DSS**: Payment Card Industry Data Security Standard
- **HIPAA**: Health Insurance Portability and Accountability Act
- **GDPR**: General Data Protection Regulation

## Related

- [WAF Protection](../api/waf.md) - Web Application Firewall
- [Secrets Manager](../api/secrets.md) - Secure secret management
- [Parameter Store](../api/parameters.md) - Configuration management
- [Examples: WAF Protection](../examples/waf-protection.md) - WAF example