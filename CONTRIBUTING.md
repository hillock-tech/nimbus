# Contributing to Nimbus

Thank you for your interest in contributing to Nimbus! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- AWS CLI configured with appropriate credentials
- TypeScript knowledge
- Basic understanding of AWS services (Lambda, API Gateway, DynamoDB, etc.)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/hillock-tech/nimbus-js.git
   cd nimbus-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npx tsc
   # or use the npm script
   npm run build
   ```

4. **Set up AWS credentials**
   ```bash
   aws configure
   # or use environment variables
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   export AWS_DEFAULT_REGION=us-east-1
   ```

5. **Initialize Nimbus state management**
   ```bash
   npx nimbus init
   ```

## Project Structure

```
nimbus-js/
├── src/                    # Core library source code
│   ├── cli/               # CLI implementation
│   │   ├── index.ts       # Main CLI router
│   │   ├── deploy.ts      # Deploy command
│   │   ├── destroy.ts     # Destroy command
│   │   ├── init.ts        # Init command
│   │   └── utils.ts       # CLI utilities and styling
│   ├── api.ts             # API Gateway management
│   ├── function.ts        # Lambda function management
│   ├── index.ts           # Main Nimbus class
│   ├── nosql.ts           # DynamoDB management
│   ├── sql.ts             # Aurora DSQL management
│   ├── storage.ts         # S3 management
│   ├── queue.ts           # SQS management
│   ├── timer.ts           # EventBridge management
│   ├── secrets.ts         # Secrets Manager
│   ├── parameter-store.ts # Parameter Store
│   ├── role.ts            # IAM role management
│   ├── state.ts           # State management
│   ├── waf.ts             # WAF protection
│   ├── runtime.ts         # Runtime helpers
│   ├── utils.ts           # Utility functions
│   ├── types-v2.ts        # TypeScript definitions (v2)
│   └── types.ts           # TypeScript definitions (legacy)
├── examples/              # Example applications
├── docs/                  # Documentation (VitePress)
├── bin/                   # CLI entry point
├── dist/                  # Compiled output
├── CHANGELOG.md           # Version history
└── CONTRIBUTING.md        # This file
```

## Development Workflow

### **Important Note: Development vs Production**

- **Examples use local development version**: `"@hillock-tech/nimbus-js": "file:../.."`
- **Published package**: `"@hillock-tech/nimbus-js": "^1.0.0"`
- **Always build the main project** before testing examples: `npx tsc`

### 1. **Create a feature branch**
```bash
git checkout -b feature/your-feature-name
```

### 2. **Make your changes**
- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Follow the existing code style

### 3. **Test your changes**
```bash
# Build the project
npx tsc

# Test with examples
cd examples/basic-api
node ../../bin/nimbus.js deploy index.ts

# Clean up
node ../../bin/nimbus.js destroy --project my-app --region us-east-1 --stage dev --force
```

### 4. **Update documentation**
- Update relevant documentation in `docs/`
- Add examples if introducing new features
- Update README.md if needed

## Testing

### Manual Testing

Since Nimbus deploys real AWS resources, most testing is done manually:

1. **Test core functionality**
   ```bash
   cd examples/basic-api
   # Build the main project first
   cd ../.. && npx tsc && cd examples/basic-api
   
   # Deploy using local development version
   npx nimbus deploy index.ts
   
   # Test the deployed endpoints
   curl https://your-api-url.com/hello
   
   # Clean up
   npx nimbus destroy --project my-app --region us-east-1 --force
   ```

2. **Test CLI improvements**
   ```bash
   node bin/nimbus.js --help
   node bin/nimbus.js deploy examples/basic-api/index.ts
   ```

3. **Test different resource types**
   - APIs with various route configurations
   - NoSQL/KV stores
   - SQL databases
   - Storage buckets
   - Queues and timers
   - Secrets and parameters

### Integration Testing

Test combinations of resources:
```bash
cd examples/kv
# Examples use local development version via file:../..
npx nimbus deploy index.ts  # Test API + DynamoDB integration
```

## Documentation

### Writing Documentation

1. **API Documentation** - Located in `docs/docs/api/`
   - Document all public methods and options
   - Include practical examples
   - Show both basic and advanced usage

2. **Examples** - Located in `docs/docs/examples/`
   - Create complete, working examples
   - Explain the use case and benefits
   - Include deployment and testing instructions

3. **Guides** - Located in `docs/docs/guide/`
   - Step-by-step tutorials
   - Best practices and patterns
   - Troubleshooting guides

### Documentation Standards

- Use clear, concise language
- Include code examples for all features
- Show both TypeScript and JavaScript examples where applicable
- Use the new export-based pattern (not direct `nimbus.Function()` calls)
- Include performance tips and best practices

### Running Documentation Locally

```bash
npm run docs:dev
# Visit http://localhost:5173
```

## Submitting Changes

### Pull Request Process

1. **Ensure your branch is up to date**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Create a pull request**
   - Use a descriptive title
   - Explain what changes you made and why
   - Include examples of how to test the changes
   - Reference any related issues

3. **Pull request template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Tested manually with examples
   - [ ] Updated documentation
   - [ ] No breaking changes to existing APIs

   ## Examples
   How to test these changes...
   ```

### Code Review Guidelines

- Be respectful and constructive
- Focus on code quality, performance, and maintainability
- Test the changes locally when possible
- Check that documentation is updated

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Build and test thoroughly
4. Create release tag
5. Publish to npm as `@hillock-tech/nimbus-js`
6. Deploy documentation updates to GitHub Pages

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small

### Architecture Principles

1. **Separation of Concerns**
   - Each class handles one AWS service
   - CLI commands are in separate files
   - State management is centralized

2. **Error Handling**
   - Provide clear, actionable error messages
   - Handle AWS service errors gracefully
   - Use proper TypeScript error types

3. **Performance**
   - Use the init pattern for Lambda optimization
   - Minimize AWS API calls
   - Cache results when appropriate

4. **Security**
   - Follow AWS security best practices
   - Use least-privilege IAM policies
   - Validate user inputs

### CLI Guidelines

- Use the modern CLI styling (colors, ASCII symbols, hierarchical display)
- Provide helpful error messages with suggestions
- Show progress for long-running operations
- Log endpoint mappings for API deployments (e.g., `GET /users/:id → function-name`)
- Use the CLI utilities from `src/cli/utils.ts` for consistent styling

### API Design

- Keep the public API simple and intuitive
- Use the export-based deployment pattern
- Avoid exposing internal implementation details
- Provide sensible defaults

## Getting Help

- **Documentation**: Check the [docs](https://hillock-tech.github.io/nimbus/)
- **Examples**: Look at the `examples/` directory
- **Issues**: Search existing [GitHub issues](https://github.com/hillock-tech/nimbus-js/issues)
- **Discussions**: Use [GitHub Discussions](https://github.com/hillock-tech/nimbus-js/discussions) for questions

## Common Development Tasks

### Adding a New AWS Service

1. Create a new class in `src/` (e.g., `src/new-service.ts`)
2. Implement the service interface with `provision()` and `destroy()` methods
3. Add the service to the main `Nimbus` class in `src/index.ts`
4. Create examples in `examples/`
5. Add documentation in `docs/docs/api/`
6. Update TypeScript types in `src/types-v2.ts`

### Adding a New CLI Command

1. Create the command file in `src/cli/` (e.g., `src/cli/new-command.ts`)
2. Add the command to the router in `src/cli/index.ts`
3. Use the CLI utilities for consistent styling
4. Add help text and error handling
5. Test thoroughly with various inputs

### Updating Documentation

1. Make changes in `docs/docs/`
2. Test locally with `npm run docs:dev`
3. Build with `npm run docs:build`
4. Documentation auto-deploys on merge to main

Thank you for contributing to Nimbus!