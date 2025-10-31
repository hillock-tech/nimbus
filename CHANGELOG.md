# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Modern CLI with colors and hierarchical display
- Enhanced endpoint logging showing REST path to Lambda function mapping
- Export-based deployment pattern (replaces direct `deploy()` calls)
- Modular CLI architecture with separate command files
- Performance optimization with init pattern for Lambda functions
- Path parameter support for API routes (`:id` and `{id}` syntax)
- Comprehensive CONTRIBUTING.md guide
- Factory functions for cleaner API (`createFunction`, `createAPI`)

### Changed
- **BREAKING**: Package name changed to `@hillock-tech/nimbus-js`
- **BREAKING**: Deployment pattern now uses `export default nimbus` instead of `await nimbus.deploy()`
- **BREAKING**: CLI commands updated to `npx nimbus deploy [file]` syntax
- **BREAKING**: `.nimbusrc` configuration now stored in home directory only
- **BREAKING**: Removed direct `nimbus.Function()` usage from public API (now internal)
- CLI help output redesigned with modern styling and better organization
- Function name generation improved to handle both `:id` and `{id}` path parameters
- API Gateway resource creation fixed for path parameters
- Documentation updated to reflect new patterns and best practices

### Fixed
- Path parameter routing in API Gateway (`:id` parameters now work correctly)
- Function ARN generation for API Gateway integrations
- CLI argument parsing for file-based deployment
- TypeScript compilation errors in CLI modules

### Removed
- Emoji icons from CLI output (replaced with ASCII symbols)
- Direct `nimbus.Function()` usage from examples and documentation
- Old deployment pattern examples

## [1.0.0] - 2024-10-30

### Added
- Initial release of Nimbus serverless framework
- Core AWS service integrations:
  - API Gateway with WAF protection
  - Lambda functions with automatic IAM roles
  - DynamoDB (NoSQL/KV) with encryption
  - Aurora DSQL (SQL) databases
  - S3 Storage buckets
  - SQS Queues with dead letter queues
  - EventBridge Timers for scheduled tasks
  - Secrets Manager integration
  - Parameter Store integration
- State management with S3 backend
- Multi-stage deployment support
- TypeScript support with full type definitions
- CLI for deployment and resource management
- Comprehensive documentation and examples
- X-Ray tracing support
- Automatic IAM role and permission management
- Resource cleanup and destroy functionality

### Security
- WAF protection for APIs with rate limiting, SQL injection, and XSS protection
- Encryption at rest for all data stores
- Least-privilege IAM policies
- Secrets management integration

### Performance
- Lambda container reuse optimization
- Automatic resource linking and environment variable injection
- Efficient state management and resource tracking

---

## Release Notes

### Version 1.0.0 - Initial Release

This is the first stable release of Nimbus, providing a complete serverless framework for AWS with enterprise-ready features including security, reliability, and observability built-in.

**Key Features:**
- Declarative infrastructure as code
- Type-safe TypeScript API
- Production-ready security and reliability patterns
- Comprehensive AWS service integrations
- Modern CLI with excellent developer experience

**Getting Started:**
```bash
npm install @hillock-tech/nimbus-js
npx nimbus init
npx nimbus deploy
```

For detailed documentation, visit the [Nimbus Documentation](https://nimbus-docs.com).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information on how to contribute to this project.

## Support

- 🐛 [Report Issues](https://github.com/hillock-tech/nimbus/issues)
- 💬 [Join Discussions](https://github.com/hillock-tech/nimbus/discussions)
- 📖 [Read the Docs](https://nimbus-docs.com)