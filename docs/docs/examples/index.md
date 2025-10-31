# Examples

Explore these hands-on examples to learn Nimbus features and best practices.

## 🚀 Quick Start Examples

### [Basic API](./basic-api)
The simplest possible Nimbus app - just API endpoints with routing.
- REST endpoints
- Path parameters
- CORS support
- Lambda functions created automatically for each route

### [Authentication API](./auth-api)
API with JWT authentication using Lambda authorizers.
- JWT token validation
- Lambda authorizers
- Protected routes
- User context

## 📚 Feature Examples

### Core Features

#### [KV Store](./kv)
NoSQL operations with DynamoDB.
- Key-value storage
- CRUD operations
- Auto-injected table names
- IAM permissions

#### [File Storage](./storage)
File upload/download with S3.
- File uploads
- Base64 encoding
- Presigned URLs
- Bucket management

#### [Message Queues](./queue)
Async processing with SQS.
- Message queues
- Dead letter queues
- Retry logic
- Background workers

#### [SQL Database](./sql)
Relational database with Aurora DSQL.
- PostgreSQL compatibility
- IAM authentication
- Schema isolation
- Connection pooling

#### [Scheduled Tasks](./timer)
Cron jobs and scheduled functions.
- Cron expressions
- Rate expressions
- Event triggers
- Timezone support

### Production Features

#### Advanced Examples
More advanced examples coming soon! For now, explore combinations of the existing examples to build complex applications.

## 🏃‍♂️ Running Examples

Each example is self-contained and ready to deploy:

```bash
# Clone or download the example
cd examples/basic-api

# Install dependencies
npm install

# Deploy to AWS
npm run deploy

# Test the API
curl https://your-api-url/hello

# Clean up resources
npm run destroy
```

## 📖 Learning Path

1. **Start with [Basic API](./basic-api)** - understand the fundamentals
2. **Try [KV Store](./kv)** - learn database operations  
3. **Explore [Authentication](./auth-api)** - see security features
4. **Check specific features** you need for your project
5. **Build your own app** using the patterns you've learned

## 💡 Tips

- Each example includes a detailed README
- All examples use TypeScript for better development experience
- Examples demonstrate best practices and common patterns
- Code is production-ready with proper error handling
- All resources are automatically cleaned up with `npm run destroy`

## 🔗 Related Resources

- [API Reference](/api/nimbus) - Complete API documentation
- [Guide](/guide/getting-started) - Step-by-step tutorials
- [GitHub Repository](https://github.com/your-org/nimbus) - Source code and issues

## 📝 Example Structure

Each example follows this structure:

```
example-name/
├── index.ts          # Main application code
├── package.json      # Dependencies and scripts
├── README.md         # Detailed explanation
└── .gitignore        # Git ignore rules
```

The `package.json` includes these standard scripts:

- `npm run deploy` - Deploy to AWS
- `npm run destroy` - Remove all resources
- `npm run dev` - Local development (where applicable)

## 🆘 Need Help?

- Check the example README for specific instructions
- Check the CloudWatch logs for detailed error messages
- Open an issue on [GitHub](https://github.com/your-org/nimbus/issues)
- Join our [Discord community](https://discord.gg/nimbus)