import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: Basic API with declarative syntax
 */
const nimbus = new Nimbus({
  region: 'us-east-1',
  projectName: 'my-app',
});

// Create an API
const api = nimbus.API({
  name: 'my-api',
  description: 'My serverless API',
  stage: 'dev',
});

// Add routes - Nimbus automatically creates Lambda functions
api
  .route('GET', '/hello', async (event: any) => {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello from Nimbus!',
        timestamp: new Date().toISOString(),
      }),
    };
  }, { cors: true })

  .route('GET', '/users/{id}', async (event: any) => {
    const userId = event.pathParameters?.id || 'unknown';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
      }),
    };
  }, { cors: true })

  .route('POST', '/users', async (event: any) => {
    const body = JSON.parse(event.body || '{}');

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'User created',
        user: body,
        id: Math.random().toString(36).substring(7),
      }),
    };
  }, { cors: true });

// Export the nimbus instance for CLI to deploy
export default nimbus;
