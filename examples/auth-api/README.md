# Auth API Example

This example demonstrates how to protect API endpoints using JWT (JSON Web Token) authentication with a Lambda authorizer.

## Features

- **REQUEST-type Lambda Authorizer**: Validates JWT tokens using the `jose` library
- **Custom Claims Validation**: Checks for specific claims in the JWT payload
- **Public and Protected Routes**: Mix of authenticated and unauthenticated endpoints
- **Context Passing**: Authorizer context (user info) available to route handlers

## How It Works

1. **Authorizer Lambda**: Validates the JWT token from the `Authorization` header
2. **Claim Verification**: Ensures the token contains the required `urn:example:claim`
3. **IAM Policy**: Returns Allow/Deny policy based on validation result
4. **Context**: Passes user information to the route handler

## Files

- `index.ts` - Main application with JWT authorizer and routes
- `package.json` - Dependencies (nimbus, jose)
- `README.md` - This file

## Setup

```bash
npm install
```

## Deploy

```bash
npm run deploy
```

## Test

### Access public endpoint (no authentication required)
```bash
curl https://your-api-url/prod/public
```

Response:
```json
{
  "message": "This is a public endpoint - no authentication required!"
}
```

### Try protected endpoint without token (will be denied)
```bash
curl https://your-api-url/prod/protected
```

Response:
```json
{
  "message": "Unauthorized"
}
```

### Access protected endpoint with valid JWT
```bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ1cm46ZXhhbXBsZTpjbGFpbSI6dHJ1ZSwiaWF0IjoxNjY5MDU2MjMxLCJpc3MiOiJ1cm46ZXhhbXBsZTppc3N1ZXIiLCJhdWQiOiJ1cm46ZXhhbXBsZTphdWRpZW5jZSJ9.C4iSlLfAUMBq--wnC6VqD9gEOhwpRZpoRarE0m7KEnI"

curl -H "Authorization: Bearer $TOKEN" https://your-api-url/prod/protected
```

Response:
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

The example uses a pre-signed JWT token with these properties:

- **Algorithm**: HS256
- **Secret**: `cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2`
- **Issuer**: `urn:example:issuer`
- **Audience**: `urn:example:audience`
- **Claim**: `urn:example:claim: true`

⚠️ **Note**: In production, use AWS Secrets Manager to store the JWT secret securely!

## Generating Your Own Tokens

To create your own JWT tokens for testing:

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

## Cleanup

```bash
npm run destroy
```

## Architecture

```
┌─────────────────┐
│   API Gateway   │
│                 │
│  GET /public    │◄─── No auth
│                 │
│  GET /protected │◄─┐
│  GET /admin     │  │
└─────────────────┘  │
                     │
                     │ Authorizer
                     │
              ┌──────▼──────┐
              │   Lambda    │
              │             │
              │ JWT Verify  │
              │ w/ jose lib │
              └─────────────┘
```

## Environment Variables

None required - all resources are auto-injected by Nimbus.

## Learn More

- [jose Documentation](https://github.com/panva/jose)
- [API Gateway Lambda Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html)
- [JWT.io](https://jwt.io/) - Decode and verify JWT tokens
