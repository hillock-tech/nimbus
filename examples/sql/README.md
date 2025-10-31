# SQL Database Example

This example demonstrates how to use Aurora DSQL with Nimbus, including:

- Schema-based isolation
- IAM authentication
- Automatic environment variable injection
- PostgreSQL connection with DsqlSigner

## Features

- **Schema Isolation**: Each application gets its own schema
- **IAM Roles**: Lambdas connect using IAM roles mapped to database roles
- **Auto-Injection**: Database credentials automatically available as environment variables
- **Full CRUD**: Create tables, insert, update, delete, and query data

## Setup

```bash
npm install
```

## Run

```bash
npm run deploy
```

This will:
1. Create an Aurora DSQL cluster
2. Set up a schema named "myapp"
3. Create a database role for your Lambdas
4. Deploy an API with database operations

## Environment Variables

Your Lambda functions automatically receive these environment variables:

- `SQL_MAIN_DB_ENDPOINT` - Database endpoint
- `SQL_MAIN_DB_IDENTIFIER` - Cluster identifier
- `SQL_MAIN_DB_SCHEMA` - Schema name (myapp)
- `SQL_MAIN_DB_DB_ROLE` - Database role name (lambda_myapp)
- `SQL_MAIN_DB_ARN` - Cluster ARN

## API Endpoints

### GET /info
Returns database configuration information

### POST /init
Creates the `users` table in the myapp schema

### POST /users
Creates a new user
```bash
curl -X POST https://YOUR_API_URL/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

### GET /users
Lists all users

### GET /users/count
Returns the count of users

## How It Works

1. **During Deploy**: Nimbus connects as admin to:
   - Create the schema
   - Create a database role for Lambdas
   - Map your Lambda IAM role to the database role
   - Grant permissions on the schema

2. **During Runtime**: Lambda functions:
   - Use `DsqlSigner` to generate IAM auth tokens
   - Connect as the mapped database role (not admin)
   - Execute queries within their schema

## Clean Up

To destroy all resources:

```bash
npx nimbus destroy --project sql-demo --region us-east-1 --force
```

Note: Use `--force` to also delete the database (data resources).
