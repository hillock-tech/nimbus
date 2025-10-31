# Parameter Store Example

This example demonstrates configuration management using AWS Systems Manager Parameter Store with Nimbus runtime helpers.

## Overview

Parameter Store provides secure, hierarchical storage for configuration data. This example shows how to:

- Create parameter placeholders without hardcoded values
- Store configuration via API endpoints
- Retrieve parameters at runtime using helper functions
- Update configuration without redeployment
- Implement feature flags and dynamic configuration

## Code Structure

### Infrastructure Definition
```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// Define parameter placeholders
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
```

### Runtime Usage
```typescript
// Use runtime helpers in Lambda functions
api.route('GET', '/config', async (event) => {
  const { runtime } = await import('nimbus-framework');
  
  const config = await runtime.parameters.getJson('/app/config');
  
  return {
    statusCode: 200,
    body: JSON.stringify({ config })
  };
});
```

## Deployment

```bash
cd examples/parameter-store
npm install
npm run deploy
```

## Related Examples

- [Feature Flags](./feature-flags.md) - Dedicated feature flags example
- [Secrets Manager](./secrets-manager.md) - Secure secret management
- [Basic API](./basic-api.md) - Simple API without configuration

## Learn More

- [Runtime Helpers API](../api/runtime.md) - Complete runtime API reference
- [Parameter Store](../api/parameters.md) - Parameter Store documentation
- [Security Best Practices](../guide/security.md) - Overall security guidance