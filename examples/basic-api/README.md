# Basic API Example

This example demonstrates how to create a simple REST API with multiple routes using Nimbus.

## Features

- Multiple HTTP methods (GET, POST)
- Path parameters
- CORS support
- Automatic Lambda function creation

## Setup

```bash
npm install
```

## Run

```bash
npm run deploy
```

This will deploy your API to AWS and output the URL.

## Test

Once deployed, test the endpoints:

```bash
# Test the hello endpoint
curl https://YOUR_API_URL/hello

# Test the users endpoint
curl https://YOUR_API_URL/users/123

# Create a user
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

## Clean Up

To destroy all resources:

```bash
npx nimbus destroy --project my-app --region us-east-1
```
