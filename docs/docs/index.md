---
layout: home

hero:
  name: "Nimbus"
  text: "Serverless AWS Framework"
  tagline: "Build and deploy serverless applications with zero configuration"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View Examples
      link: /examples/

features:
  - title: Zero Configuration
    details: No YAML, no complex setup. Just write TypeScript and deploy.
  - title: Type-Safe
    details: Full TypeScript support with automatic type inference and validation.
  - title: Auto-Wiring
    details: Resources are automatically connected with proper IAM permissions and environment variables.
  - title: Local Development
    details: Test your functions locally before deploying to AWS.
  - title: Multi-Environment
    details: Deploy to dev, staging, and production with environment-specific configurations.
  - title: Observability
    details: Built-in X-Ray tracing, CloudWatch logs, and monitoring.
---

## Quick Example

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'my-app',
  region: 'us-east-1'
});

// Create an API
const api = app.API({ name: 'api' });

// Add routes
api.route('GET', '/hello', async () => ({
  statusCode: 200,
  body: JSON.stringify({ 
    message: 'Hello from Nimbus!',
    timestamp: new Date().toISOString()
  })
}));

api.route('POST', '/users', async (event) => {
  const user = JSON.parse(event.body || '{}');
  
  return {
    statusCode: 201,
    body: JSON.stringify({
      id: Math.random().toString(36).substring(7),
      ...user,
      createdAt: new Date().toISOString()
    })
  };
});

// Export for CLI deployment
export default app;
```

## Why Nimbus?

- **Simple**: Write code, not configuration
- **Fast**: Deploy in seconds, not minutes
- **Reliable**: Built on AWS best practices
- **Scalable**: Automatically scales with your traffic
- **Cost-effective**: Pay only for what you use
