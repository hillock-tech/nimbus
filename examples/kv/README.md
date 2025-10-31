# KV Store Example

This example demonstrates how to use DynamoDB as a key-value store with Nimbus, including automatic environment variable injection and IAM permissions.

## Features

- **DynamoDB KV Store**: Simple key-value interface backed by DynamoDB
- **Auto-Injection**: Table names automatically available as environment variables
- **IAM Permissions**: Automatically grants Lambda functions access to DynamoDB
- **Full CRUD**: Create, read, update, and delete operations

## Setup

```bash
npm install
```

## Run

```bash
npm run deploy
```

This will:
1. Create a DynamoDB table with on-demand billing
2. Deploy Lambda functions that can access the KV store
3. Deploy an API Gateway with CRUD endpoints

## Environment Variables

Your Lambda functions automatically receive:

- `KV_USERS_TABLE_NAME` - DynamoDB table name

## API Endpoints

### POST /users
Create a new user
```bash
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"userId":"123","name":"Alice","email":"alice@example.com"}'
```

### GET /users/{userId}
Get a user by ID
```bash
curl https://YOUR_API_URL/users/123
```

### GET /users
List all users
```bash
curl https://YOUR_API_URL/users
```

### DELETE /users/{userId}
Delete a user
```bash
curl -X DELETE https://YOUR_API_URL/users/123
```

## How It Works

1. **During Deploy**: Nimbus creates a DynamoDB table with PAY_PER_REQUEST billing
2. **Auto-Injection**: The table name is injected as `KV_USERS_TABLE_NAME` environment variable
3. **IAM Permissions**: Lambda role automatically gets permissions to perform CRUD on the table
4. **Runtime**: Use the AWS SDK DynamoDB client with the table name from env vars

## Clean Up

To destroy all resources:

```bash
npx nimbus destroy --project kv-app --region us-east-1 --force
```

Note: Use `--force` to also delete the DynamoDB table (data resource).
