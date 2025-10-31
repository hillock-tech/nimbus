import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: API with JWT Authorization
 * 
 * This example demonstrates how to use a Lambda authorizer to protect
 * API endpoints with JWT token validation using the jose library.
 */
async function authExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'auth-api-app',
  });

  // Create an API
  const api = app.API({
    name: 'auth-api',
    description: 'API with JWT authorization',
    stage: 'prod',
  });

  // Add a REQUEST-type authorizer that validates JWT tokens
  api.authorizer({
    name: 'jwt-authorizer',
    type: 'REQUEST',
    handler: async (event: any) => {
      const jose = require('jose');
      
      try {
        // Extract the token from the Authorization header
        const token = event.headers?.Authorization || event.headers?.authorization;
        
        if (!token) {
          throw new Error('No authorization token provided');
        }

        // Remove 'Bearer ' prefix if present
        const jwt = token.startsWith('Bearer ') ? token.substring(7) : token;

        // Secret for verifying the JWT (in production, use AWS Secrets Manager)
        const secret = new TextEncoder().encode(
          'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
        );

        // Verify the JWT
        const { payload, protectedHeader } = await jose.jwtVerify(jwt, secret, {
          issuer: 'urn:example:issuer',
          audience: 'urn:example:audience',
        });

        console.log('JWT verified:', { protectedHeader, payload });

        // Check for required claim
        if (!payload['urn:example:claim']) {
          throw new Error('Required claim not found in token');
        }

        // Return an IAM policy allowing the request
        return {
          principalId: payload.sub || 'user',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Action: 'execute-api:Invoke',
                Effect: 'Allow',
                Resource: event.methodArn.split('/').slice(0, 2).join('/') + '/*', // Allow all methods in this API
              },
            ],
          },
          context: {
            userId: payload.sub || 'anonymous',
            email: payload.email || '',
          },
        };
      } catch (error: any) {
        console.error('Authorization failed:', error.message);
        
        // Throw an error to return a custom 401 response
        // You can customize the message here
        if (error.message.includes('JWSSignatureVerificationFailed')) {
          throw new Error('Invalid token signature');
        } else if (error.message.includes('expired')) {
          throw new Error('Token expired');
        } else if (error.message.includes('claim')) {
          throw new Error('Missing required permissions');
        } else {
          throw new Error('Unauthorized');
        }
      }
    },
    authorizerResultTtlInSeconds: 300, // Cache for 5 minutes
  });

  // Public endpoint (no auth required)
  api.route('GET', '/public', async () => {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'This is a public endpoint - no authentication required!',
      }),
    };
  }, { cors: true });

  // Protected endpoint (requires JWT auth)
  api.route('GET', '/protected', async (event: any) => {
    // The authorizer context is available in event.requestContext.authorizer
    const userId = event.requestContext?.authorizer?.userId || 'unknown';
    const email = event.requestContext?.authorizer?.email || 'unknown';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'This is a protected endpoint - you are authenticated!',
        user: {
          id: userId,
          email: email,
        },
      }),
    };
  }, { cors: true, authorizer: 'jwt-authorizer' });

  // Another protected endpoint
  api.route('GET', '/admin', async (event: any) => {
    const userId = event.requestContext?.authorizer?.userId || 'unknown';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Admin access granted!',
        userId,
      }),
    };
  }, { cors: true, authorizer: 'jwt-authorizer' });

  // Deploy everything!
  const result = await app.deploy();

  console.log('\n✅ Deployed successfully!');
  console.log(`\nAPI URL: ${result.apis[0].url}`);
  console.log(`\nExample usage:`);
  console.log(`\n  # Access public endpoint (no auth):`);
  console.log(`  curl ${result.apis[0].url}/public`);
  console.log(`\n  # Try protected endpoint without token (will fail):`);
  console.log(`  curl ${result.apis[0].url}/protected`);
  console.log(`\n  # Try protected endpoint with valid JWT:`);
  console.log(`  TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ1cm46ZXhhbXBsZTpjbGFpbSI6dHJ1ZSwiaWF0IjoxNjY5MDU2MjMxLCJpc3MiOiJ1cm46ZXhhbXBsZTppc3N1ZXIiLCJhdWQiOiJ1cm46ZXhhbXBsZTphdWRpZW5jZSJ9.C4iSlLfAUMBq--wnC6VqD9gEOhwpRZpoRarE0m7KEnI"`);
  console.log(`  curl -H "Authorization: Bearer $TOKEN" ${result.apis[0].url}/protected`);
}

// Run the example
if (require.main === module) {
  authExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export default authExample;
