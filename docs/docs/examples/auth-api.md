# Authentication API Example

This example demonstrates how to protect API endpoints using JWT authentication with a Lambda authorizer.

## Overview

The authentication API example shows:
- JWT token validation using the `jose` library
- REQUEST-type Lambda authorizer
- Custom claims validation
- Public and protected routes
- Context passing from authorizer to route handlers

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

async function authExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'auth-api-app',
  });

  const api = app.API({
    name: 'auth-api',
    description: 'API with JWT authorization',
    stage: 'prod',
  });

  // JWT Authorizer
  api.authorizer({
    name: 'jwt-authorizer',
    type: 'REQUEST',
    handler: async (event) => {
      const jose = require('jose');
      
      try {
        const token = event.headers?.Authorization || event.headers?.authorization;
        
        if (!token) {
          throw new Error('No authorization token provided');
        }

        const jwt = token.startsWith('Bearer ') ? token.substring(7) : token;

        const secret = new TextEncoder().encode(
          'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
        );

        const { payload, protectedHeader } = await jose.jwtVerify(jwt, secret, {
          issuer: 'urn:example:issuer',
          audience: 'urn:example:audience',
        });

        if (!payload['urn:example:claim']) {
          throw new Error('Required claim not found in token');
        }

        return {
          principalId: payload.sub || 'user',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Action: 'execute-api:Invoke',
              Effect: 'Allow',
              Resource: event.methodArn.split('/').slice(0, 2).join('/') + '/*',
            }],
          },
          context: {
            userId: payload.sub || 'anonymous',
            email: payload.email || '',
          },
        };
      } catch (error) {
        console.error('Authorization failed:', error.message);
        throw new Error('Unauthorized');
      }
    },
    authorizerResultTtlInSeconds: 300,
  });

  // Public endpoint
  api.route('GET', '/public', async () => {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'This is a public endpoint - no authentication required!',
      }),
    };
  }, { cors: true });

  // Protected endpoint
  api.route('GET', '/protected', async (event) => {
    const userId = event.requestContext?.authorizer?.userId || 'unknown';
    const email = event.requestContext?.authorizer?.email || 'unknown';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'This is a protected endpoint - you are authenticated!',
        user: { id: userId, email: email },
      }),
    };
  }, { cors: true, authorizer: 'jwt-authorizer' });

// Export for CLI deployment
export default app;

authExample()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir auth-api-example
   cd auth-api-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus jose
   npm install -D @types/node tsx typescript
   ```

3. **Initialize Nimbus state:**
   ```bash
   npx nimbus init
   ```

4. **Create the application file:**
   Save the code above as `index.ts`

5. **Add package.json scripts:**
   ```json
   {
     "scripts": {
       "deploy": "npx nimbus deploy",
       "destroy": "npx nimbus destroy --project auth-api-app --region us-east-1"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will create:
1. API Gateway with JWT authorizer
2. Lambda functions for routes and authorizer
3. IAM roles and permissions

## Test the API

### Access Public Endpoint

```bash
curl https://YOUR_API_URL/public
```

**Response:**
```json
{
  "message": "This is a public endpoint - no authentication required!"
}
```

### Try Protected Endpoint Without Token

```bash
curl https://YOUR_API_URL/protected
```

**Response:**
```json
{
  "message": "Unauthorized"
}
```

### Access Protected Endpoint With Valid JWT

```bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ1cm46ZXhhbXBsZTpjbGFpbSI6dHJ1ZSwiaWF0IjoxNjY5MDU2MjMxLCJpc3MiOiJ1cm46ZXhhbXBsZTppc3N1ZXIiLCJhdWQiOiJ1cm46ZXhhbXBsZTphdWRpZW5jZSJ9.C4iSlLfAUMBq--wnC6VqD9gEOhwpRZpoRarE0m7KEnI"

curl -H "Authorization: Bearer $TOKEN" https://YOUR_API_URL/protected
```

**Response:**
```json
{
  "message": "This is a protected endpoint - you are authenticated!",
  "user": {
    "id": "unknown",
    "email": "unknown"
  }
}
```

## JWT Token Details

The example uses a pre-signed JWT token with:

- **Algorithm**: HS256
- **Secret**: `cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2`
- **Issuer**: `urn:example:issuer`
- **Audience**: `urn:example:audience`
- **Claim**: `urn:example:claim: true`

::: warning Production Security
In production, use AWS Secrets Manager to store the JWT secret securely!
:::

## Key Features Demonstrated

### 1. Lambda Authorizer
- **REQUEST-type**: Validates entire request context
- **Token Validation**: Uses `jose` library for JWT verification
- **Claims Checking**: Validates required claims in token
- **Context Passing**: Passes user info to route handlers

### 2. Authorization Flow
1. Client sends request with `Authorization: Bearer <token>` header
2. API Gateway invokes Lambda authorizer
3. Authorizer validates JWT token
4. If valid, returns IAM policy allowing access
5. API Gateway caches result for 5 minutes
6. Route handler receives user context

### 3. Mixed Route Types
- **Public routes**: No authorizer required
- **Protected routes**: Require valid JWT token

## Generating Your Own Tokens

To create JWT tokens for testing:

```javascript
const jose = require('jose');

const secret = new TextEncoder().encode('cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2');

const jwt = await new jose.SignJWT({ 'urn:example:claim': true })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setIssuer('urn:example:issuer')
  .setAudience('urn:example:audience')
  .setExpirationTime('2h')
  .sign(secret);

console.log(jwt);
```

## Advanced Usage

### User Registration Route

```typescript
api.route('POST', '/register', async (event) => {
  const { email, password, name } = JSON.parse(event.body || '{}');
  
  // Validate input
  if (!email || !password || !name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email, password, and name required' })
    };
  }
  
  // Hash password (use bcrypt in production)
  const hashedPassword = await hashPassword(password);
  
  // Store user in database
  const userId = await createUser({ email, password: hashedPassword, name });
  
  // Generate JWT token
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new jose.SignJWT({ 
    'urn:example:claim': true,
    sub: userId,
    email: email
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('urn:example:issuer')
    .setAudience('urn:example:audience')
    .setExpirationTime('24h')
    .sign(secret);
  
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'User registered successfully',
      token,
      user: { id: userId, email, name }
    })
  };
}, { cors: true });
```

### Login Route

```typescript
api.route('POST', '/login', async (event) => {
  const { email, password } = JSON.parse(event.body || '{}');
  
  // Validate credentials
  const user = await validateUser(email, password);
  
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid credentials' })
    };
  }
  
  // Generate JWT token
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new jose.SignJWT({ 
    'urn:example:claim': true,
    sub: user.id,
    email: user.email
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('urn:example:issuer')
    .setAudience('urn:example:audience')
    .setExpirationTime('24h')
    .sign(secret);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    })
  };
}, { cors: true });
```

### Role-Based Access

```typescript
// Admin-only route
api.route('GET', '/admin', async (event) => {
  const userId = event.requestContext?.authorizer?.userId;
  
  // Check if user has admin role
  const user = await getUser(userId);
  if (!user || user.role !== 'admin') {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Admin access required' })
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Admin access granted!',
      adminData: await getAdminData()
    })
  };
}, { cors: true, authorizer: 'jwt-authorizer' });
```

## Architecture

```
Client Request
    ↓
API Gateway
    ↓
Lambda Authorizer (JWT validation)
    ↓
Route Handler (with user context)
    ↓
Response
```

## Clean Up

```bash
npm run destroy
```

## Next Steps

- Try the [KV Store example](./kv) to add user data persistence
- Explore the [Storage example](./storage) for file uploads
- Learn about the [Queue example](./queue) for async processing

## Troubleshooting

### Common Issues

**"Unauthorized" for valid token**
- Check that the JWT secret matches
- Verify the token hasn't expired
- Ensure required claims are present

**"Internal server error"**
- Check CloudWatch logs for detailed error messages
- Verify the `jose` library is installed

**CORS issues**
- Ensure `{ cors: true }` is set on routes
- Check that preflight OPTIONS requests are handled