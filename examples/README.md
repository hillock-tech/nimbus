# Nimbus Examples

Simple, direct examples showing how to use Nimbus features.

## 🚀 Quick Start Examples

### [Basic API](./basic-api/)
The simplest possible Nimbus app - just API endpoints with routing.

### [Auth API](./auth-api/)
API with JWT authentication using Lambda authorizers.

## 📚 Feature Examples

### Core Features
- **[Basic API](./basic-api/)** - REST endpoints with routing
- **[KV Store](./kv/)** - NoSQL operations (DynamoDB)
- **[Storage](./storage/)** - File upload/download (S3)
- **[Queue](./queue/)** - Message processing (SQS)
- **[SQL](./sql/)** - Aurora DSQL database operations
- **[Timer](./timer/)** - Scheduled Lambda functions

### Production Features
- **[Auth API](./auth-api/)** - JWT authentication with Lambda authorizers
- **[WAF Protection](./waf-protection/)** - Web Application Firewall security
- **[Feature Flags](./feature-flags/)** - Runtime feature toggles and configuration
- **[Secrets Manager](./secrets-manager/)** - Secure secret management
- **[Custom Domain](./custom-domain/)** - Custom domain with ACM certificates
- **[Custom Permissions](./custom-permissions/)** - Custom IAM permissions
- **[X-Ray Tracing](./xray-tracing/)** - Distributed tracing

### Advanced
- **[Lambda Init](./lambda-init/)** - Static initialization for performance optimization
- **[Multi-Stage](./multi-stage/)** - Deploy to dev/staging/prod environments

## 🏃‍♂️ Running Examples

Each example is self-contained:

```bash
cd examples/basic-api
npm install
npm run deploy
```

Clean up:
```bash
npm run destroy
```

## 📖 Learning Path

1. Start with **Basic API** - understand the basics
2. Try **KV Store** - learn database operations  
3. Explore **Auth API** - see authentication features
4. Check **specific features** you need
5. Build your own app!

Each example includes:
- ✅ Complete working code
- ✅ README with explanation
- ✅ Deploy/destroy scripts
- ✅ TypeScript types