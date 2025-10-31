# Installation

## Prerequisites

Before installing Nimbus, make sure you have:

- **Node.js** 18 or later
- **npm** or **yarn**
- **AWS CLI** configured with your credentials
- **TypeScript** knowledge (recommended)

## AWS Setup

### 1. Install AWS CLI

```bash
# macOS
brew install awscli

# Windows
winget install Amazon.AWSCLI

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 2. Configure AWS Credentials

```bash
aws configure
```

You'll need:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Output format (use `json`)

### 3. Verify Setup

```bash
aws sts get-caller-identity
```

## Install Nimbus

### Option 1: Create New Project

```bash
mkdir my-nimbus-app
cd my-nimbus-app
npm init -y
npm install nimbus
```

### Option 2: Add to Existing Project

```bash
npm install nimbus
```

::: warning
We don't recommend installing Nimbus globally as it can cause version conflicts and dependency issues. Always install it locally in your project.
:::

## Initialize State Management

Nimbus uses S3 to store deployment state. Initialize this once per AWS account/region:

```bash
npx nimbus init
```

This command will:
1. Prompt for an S3 bucket name for state storage
2. Prompt for AWS region (defaults to us-east-1)
3. Create the S3 bucket if it doesn't exist
4. Save configuration to `.nimbusrc` file

### Example Init Session

```bash
$ npx nimbus init
Enter S3 bucket name for state storage: my-nimbus-state-bucket
Enter AWS region (default: us-east-1): us-west-2
Created bucket my-nimbus-state-bucket.
State config saved to /path/to/project/.nimbusrc
```

### .nimbusrc File

The init command creates a `.nimbusrc` file in your project:

```json
{
  "bucket": "my-nimbus-state-bucket",
  "region": "us-west-2"
}
```

::: tip
Add `.nimbusrc` to your `.gitignore` if it contains sensitive information, or commit it if you want to share state configuration across your team.
:::

## Project Structure

A typical Nimbus project looks like this:

```
my-app/
├── index.ts          # Main application file
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── .gitignore        # Git ignore file
```

## Verify Installation

Create a simple `index.ts` file:

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'test-app',
  region: 'us-east-1'
});

const api = app.API({ name: 'test-api' });

api.route('GET', '/hello', async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Hello from Nimbus!' })
}));

export default app;
```

Add a deploy script to your `package.json`:

```json
{
  "scripts": {
    "deploy": "npx nimbus deploy",
    "destroy": "npx nimbus destroy --project test-app --region us-east-1"
  }
}
```

Deploy your first app:

```bash
npm run deploy
```

If everything is set up correctly, you should see deployment progress and get an API URL at the end.

## Next Steps

Now that Nimbus is installed, let's [create your first app](/guide/getting-started)!