# Project Structure

Learn how to organize your Nimbus projects for maintainability and scalability.

## Basic Structure

A minimal Nimbus project looks like this:

```
my-app/
├── index.ts          # Main application file
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── .gitignore        # Git ignore file
```

## Recommended Structure

For larger applications, we recommend this structure:

```
my-app/
├── src/
│   ├── index.ts           # Main application entry
│   ├── config/
│   │   └── database.ts    # Database configuration
│   ├── handlers/
│   │   ├── auth.ts        # Authentication handlers
│   │   ├── users.ts       # User-related handlers
│   │   └── posts.ts       # Post-related handlers
│   ├── middleware/
│   │   ├── auth.ts        # Authentication middleware
│   │   └── validation.ts  # Input validation
│   ├── models/
│   │   ├── User.ts        # User model/types
│   │   └── Post.ts        # Post model/types
│   └── utils/
│       ├── jwt.ts         # JWT utilities
│       └── validation.ts  # Validation helpers
├── tests/
│   ├── handlers/
│   └── utils/
├── package.json
├── tsconfig.json
├── jest.config.js         # Test configuration
└── .gitignore
```

## File Organization Patterns

### 1. Feature-Based Structure

Organize by business features:

```
src/
├── auth/
│   ├── handlers.ts
│   ├── middleware.ts
│   └── types.ts
├── users/
│   ├── handlers.ts
│   ├── models.ts
│   └── validation.ts
└── posts/
    ├── handlers.ts
    ├── models.ts
    └── validation.ts
```

### 2. Layer-Based Structure

Organize by technical layers:

```
src/
├── routes/
│   ├── auth.ts
│   ├── users.ts
│   └── posts.ts
├── services/
│   ├── authService.ts
│   ├── userService.ts
│   └── postService.ts
├── repositories/
│   ├── userRepository.ts
│   └── postRepository.ts
└── models/
    ├── User.ts
    └── Post.ts
```

::: info Route Handlers vs Functions
In Nimbus, you write route handlers, queue workers, and scheduled task handlers. Lambda functions are created automatically - you don't manage them directly.
:::

## Main Application File

Your `src/index.ts` should be the orchestration layer:

```typescript
import Nimbus from '@hillock-tech/nimbus-js';
import { setupAuth } from './auth/setup';
import { setupUsers } from './users/setup';
import { setupPosts } from './posts/setup';

const app = new Nimbus({
  projectName: 'my-app',
  region: 'us-east-1'
});

// Create shared resources
const database = app.KV({ name: 'main-db' });
const storage = app.Storage({ name: 'uploads' });
const api = app.API({ name: 'api' });

// Setup feature modules
setupAuth(app, api);
setupUsers(app, api, database);
setupPosts(app, api, database, storage);

// Export for CLI deployment
export default app;
```

## Feature Modules

Each feature module exports a setup function:

```typescript
// src/users/setup.ts
import { Nimbus, API, KV } from 'nimbus';
import { createUser, getUser, updateUser } from './handlers';

export function setupUsers(app: Nimbus, api: API, database: KV) {
  api.route('POST', '/users', createUser);
  api.route('GET', '/users/{id}', getUser);
  api.route('PUT', '/users/{id}', updateUser);
}
```

## Route Handler Organization

Keep route handlers focused and testable:

```typescript
// src/users/routes.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UserService } from './service';
import { validateUser } from './validation';

export async function createUser(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userData = JSON.parse(event.body || '{}');
    
    // Validate input
    const validation = validateUser(userData);
    if (!validation.valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ errors: validation.errors })
      };
    }

    // Create user
    const user = await UserService.create(userData);
    
    return {
      statusCode: 201,
      body: JSON.stringify(user)
    };
  } catch (error) {
    console.error('Error creating user:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
```

## Configuration Management

Centralize configuration:

```typescript
// src/config/index.ts
export const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret',
    expiresIn: '24h'
  },
  database: {
    region: process.env.AWS_REGION || 'us-east-1'
  },
  email: {
    fromAddress: process.env.FROM_EMAIL || 'noreply@example.com'
  }
};
```

## Type Definitions

Define shared types:

```typescript
// src/types/index.ts
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
}

export interface APIResponse<T = any> {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}
```

## Environment-Specific Files

Handle different environments:

```typescript
// src/config/environments.ts
const environments = {
  development: {
    logLevel: 'debug',
    corsOrigins: ['http://localhost:3000']
  },
  staging: {
    logLevel: 'info',
    corsOrigins: ['https://staging.example.com']
  },
  production: {
    logLevel: 'error',
    corsOrigins: ['https://example.com']
  }
};

export const env = environments[process.env.NODE_ENV || 'development'];
```

## Package.json Scripts

Useful scripts for development:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "deploy": "npx nimbus deploy",
    "deploy:staging": "NODE_ENV=staging npx nimbus deploy",
    "deploy:prod": "NODE_ENV=production npx nimbus deploy",
    "destroy": "npx nimbus destroy --project my-app --region us-east-1",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

::: tip Local Installation
Always use `npx nimbus` instead of installing Nimbus globally. This ensures you're using the correct version for each project and avoids dependency conflicts.
:::

## TypeScript Configuration

Recommended `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@/types/*": ["types/*"],
      "@/utils/*": ["utils/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Git Ignore

Essential `.gitignore` entries:

```bash
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Coverage
coverage/
.nyc_output/

# AWS
.aws-sam/
```

## Best Practices

1. **Separation of Concerns**: Keep business logic separate from AWS-specific code
2. **Testability**: Structure code to be easily testable
3. **Type Safety**: Use TypeScript interfaces and types
4. **Error Handling**: Implement consistent error handling patterns
5. **Configuration**: Externalize configuration and secrets
6. **Documentation**: Document complex business logic and APIs
7. **Consistency**: Follow consistent naming and organization patterns

## Next Steps

- Learn about [configuration management](/guide/configuration)
- Explore the [examples](/examples/) to see project structures in action
- Read the [API reference](/api/nimbus) for detailed documentation