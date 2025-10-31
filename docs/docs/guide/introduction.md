# Introduction

Nimbus is a modern serverless framework for AWS that eliminates configuration complexity while providing full TypeScript support and automatic resource wiring.

## What is Nimbus?

Nimbus is designed to make serverless development on AWS as simple as possible. Instead of writing YAML configuration files or managing complex infrastructure code, you write TypeScript and Nimbus handles the rest.

## Key Features

### Zero Configuration
- No YAML files to maintain
- No complex infrastructure definitions
- Just write TypeScript and deploy

### Automatic Resource Wiring
- Resources are automatically connected
- IAM permissions are handled automatically
- Environment variables are injected automatically

### Type Safety
- Full TypeScript support
- Automatic type inference
- Compile-time validation

### Local Development
- Test functions locally
- Fast development cycle
- Debug with familiar tools

## How It Works

1. **Define Resources**: Create APIs, databases, queues, etc. using simple TypeScript
2. **Write Handlers**: Implement your business logic as route handlers, queue workers, and scheduled tasks
3. **Deploy**: Run `npx nimbus deploy` and everything is created on AWS (including Lambda functions automatically)
4. **Scale**: Your application automatically scales with traffic

Nimbus abstracts away the complexity of Lambda function management - they're created automatically when you define API routes, queue workers, or scheduled tasks.

## Supported AWS Services

- **API Gateway**: REST APIs with automatic routing
- **DynamoDB**: NoSQL key-value store
- **S3**: Object storage for files and static assets
- **SQS**: Message queues for async processing
- **Aurora DSQL**: SQL databases with automatic scaling
- **EventBridge**: Scheduled tasks and timers
- **X-Ray**: Distributed tracing and monitoring

::: info Lambda Functions
Lambda functions are automatically created and managed internally by Nimbus for API routes, queue workers, and scheduled tasks. You don't need to manage them directly.
:::

## Getting Started

Ready to build your first serverless app? Let's [get started](/guide/getting-started)!