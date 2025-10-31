# CLI Reference

The Nimbus CLI provides commands for managing your serverless applications.

## Commands

### init

Initialize S3 state management for your Nimbus projects.

```bash
npx nimbus init
```

**What it does:**
- Prompts for S3 bucket name for state storage
- Prompts for AWS region (defaults to us-east-1)
- Creates the S3 bucket if it doesn't exist
- Saves configuration to `.nimbusrc` file

**Example:**
```bash
$ npx nimbus init
Enter S3 bucket name for state storage: my-company-nimbus-state
Enter AWS region (default: us-east-1): us-west-2
Created bucket my-company-nimbus-state.
State config saved to /path/to/project/.nimbusrc
```

**Output file (`.nimbusrc`):**
```json
{
  "bucket": "my-company-nimbus-state",
  "region": "us-west-2"
}
```

### deploy

Deploy your Nimbus application to AWS.

```bash
npx nimbus deploy [options]
```

**Options:**
- `--file <path>` - Path to your application file (default: auto-detects index.ts or index.js)
- `--stage <name>` - Deployment stage/environment (default: default)

**Examples:**
```bash
# Auto-detect index.ts or index.js
npx nimbus deploy

# Specify custom file
npx nimbus deploy --file my-app.ts

# Deploy to specific stage
npx nimbus deploy --stage production

# Deploy custom file to specific stage
npx nimbus deploy --file src/app.ts --stage staging
```

**What it does:**
- Runs your application file (TypeScript or JavaScript)
- Creates/updates AWS resources defined in your app (APIs, databases, storage, etc.)
- Automatically creates and configures Lambda functions for API routes, queue workers, and scheduled tasks
- Outputs deployment information (API URLs, resource names, etc.)

### destroy

Remove all AWS resources created by your Nimbus application.

```bash
npx nimbus destroy --project <name> --region <region> [options]
```

**Required Options:**
- `--project <name>` - Project name (must match your Nimbus config)
- `--region <region>` - AWS region where resources were deployed

**Optional Options:**
- `--stage <name>` - Deployment stage/environment (default: default)
- `--force` - Force delete data resources (KV stores, SQL databases, S3 buckets)

**Examples:**
```bash
# Basic destroy (keeps data resources)
npx nimbus destroy --project my-app --region us-east-1

# Destroy specific stage
npx nimbus destroy --project my-app --region us-east-1 --stage production

# Force destroy including data resources
npx nimbus destroy --project my-app --region us-east-1 --force

# Destroy specific stage with force
npx nimbus destroy --project my-app --region us-east-1 --stage prod --force
```

**What it does:**
- Removes API Gateway, Lambda functions (created automatically), IAM roles
- Optionally removes data resources with `--force` flag:
  - DynamoDB tables (KV stores)
  - S3 buckets (Storage)
  - Aurora DSQL databases (SQL)
  - SQS queues

::: warning Force Delete
The `--force` flag will permanently delete all data in your databases and storage buckets. This action cannot be undone.
:::

## File Detection

The CLI automatically detects your application file:

1. Looks for `index.ts` first
2. Falls back to `index.js`
3. Uses `--file` option if specified

**Supported file types:**
- **TypeScript (`.ts`)**: Uses `npx tsx` to run
- **JavaScript (`.js`)**: Runs directly with Node.js

## State Management

Nimbus uses S3 to store deployment state, which allows:

- **Incremental deployments**: Only update changed resources
- **Team collaboration**: Share state across team members
- **Environment isolation**: Separate state per stage
- **Rollback capability**: Track deployment history

## Environment Variables

The CLI respects these environment variables:

- `AWS_REGION` - Default AWS region
- `AWS_PROFILE` - AWS profile to use
- `NODE_ENV` - Node.js environment (affects some behaviors)

## Exit Codes

- `0` - Success
- `1` - Error (invalid arguments, deployment failure, etc.)

## Common Workflows

### Initial Setup
```bash
# 1. Create project
mkdir my-app && cd my-app
npm init -y
npm install nimbus

# 2. Initialize state management
npx nimbus init

# 3. Create application
# ... write your index.ts ...

# 4. Deploy
npx nimbus deploy
```

### Development Workflow
```bash
# Deploy to dev
npx nimbus deploy --stage dev

# Deploy to staging
npx nimbus deploy --stage staging

# Deploy to production
npx nimbus deploy --stage prod
```

### Cleanup
```bash
# Remove dev environment
npx nimbus destroy --project my-app --region us-east-1 --stage dev

# Remove everything including data
npx nimbus destroy --project my-app --region us-east-1 --force
```

## Troubleshooting

### Common Issues

**"No index.ts or index.js found"**
- Create an `index.ts` or `index.js` file
- Or use `--file` to specify your application file

**"Bucket already exists"**
- S3 bucket names must be globally unique
- Try a different bucket name during `nimbus init`

**"Access Denied"**
- Check your AWS credentials: `aws sts get-caller-identity`
- Ensure your AWS user has necessary permissions

**"Project not found" (during destroy)**
- Make sure `--project` matches the `projectName` in your Nimbus config
- Check that resources were deployed to the specified region/stage

### Debug Mode

For more verbose output, set the Node.js debug flag:

```bash
DEBUG=nimbus* npx nimbus deploy
```