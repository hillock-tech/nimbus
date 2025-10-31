# Secrets Manager Example

This example demonstrates the **correct** way to handle secrets in serverless applications using AWS Secrets Manager with Nimbus.

## 🔐 Security Best Practices

**❌ NEVER do this:**
```typescript
// DON'T store secrets in code!
const secret = nimbus.Secret({
  name: 'my-secret',
  value: 'hardcoded-secret-value' // ❌ BAD!
});
```

**✅ DO this instead:**
```typescript
// Create secret placeholder (no value in code)
const secret = nimbus.Secret({
  name: 'my-secret',
  description: 'My application secret'
  // No value here - will be set securely via API/console
});

// Use in Lambda function
api.route('GET', '/protected', async (event) => {
  const secretValue = await secret.getJsonValue(); // ✅ GOOD!
  // Use secretValue...
});
```

## 🚀 How It Works

### 1. **Deployment Phase**
```bash
npm run deploy
```
- Nimbus creates empty secret placeholders in AWS Secrets Manager
- Lambda functions get IAM permissions to read these secrets
- No actual secret values are deployed with your code

### 2. **Secret Storage Phase**
Store secrets securely via the admin API:

```bash
# Store database credentials
curl -X POST https://your-api.amazonaws.com/admin/secrets \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "database-credentials",
    "secretValue": {
      "host": "prod-db.example.com",
      "username": "app_user",
      "password": "actual-secure-password",
      "database": "production"
    }
  }'

# Store API keys
curl -X POST https://your-api.amazonaws.com/admin/secrets \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "api-keys",
    "secretValue": {
      "stripe": "sk_live_actual_stripe_key",
      "sendgrid": "SG.actual_sendgrid_key"
    }
  }'
```

### 3. **Runtime Phase**
Lambda functions retrieve secrets securely:

```typescript
api.route('POST', '/auth/login', async (event) => {
  // ✅ Secret is fetched from AWS Secrets Manager at runtime
  const dbCreds = await databaseCredentials.getJsonValue();
  
  // Use the secret to connect to database
  const connection = await connectToDatabase(dbCreds);
  // ...
});
```

## 🔄 Secret Rotation

Update secrets without redeploying code:

```bash
# Rotate JWT signing key
curl -X PUT https://your-api.amazonaws.com/admin/secrets/rotate \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "jwt-config",
    "newValue": {
      "signing_key": "new-256-bit-secret-key",
      "issuer": "myapp.com"
    }
  }'
```

## 📋 Available Endpoints

### Admin Endpoints (Require Authentication)

- `POST /admin/secrets` - Store a new secret value
- `PUT /admin/secrets/rotate` - Rotate/update existing secret

### Application Endpoints

- `POST /auth/login` - User authentication (uses database credentials)
- `POST /payments/charge` - Process payments (uses Stripe API key)

## 🛡️ Security Features

1. **No Hardcoded Secrets**: Secret values never appear in your code
2. **IAM Permissions**: Lambda functions only get access to specific secrets
3. **Encryption**: All secrets encrypted at rest with AWS KMS
4. **Audit Trail**: All secret access logged in CloudTrail
5. **Rotation**: Secrets can be updated without code changes

## 💰 Cost

- **Secrets Manager**: ~$0.40 per secret per month
- **API Calls**: ~$0.05 per 10,000 requests
- **Example Cost**: 3 secrets = ~$1.20/month

## 🚀 Deployment

```bash
# Deploy the infrastructure
npm run deploy

# The API will output URLs like:
# POST https://abc123.execute-api.us-east-1.amazonaws.com/dev/admin/secrets
# POST https://abc123.execute-api.us-east-1.amazonaws.com/dev/auth/login
```

## 🧪 Testing

After deployment, test the secret storage:

```bash
# 1. Store a test secret
curl -X POST https://your-api-url/admin/secrets \
  -H "Authorization: Bearer admin-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "secretName": "database-credentials",
    "secretValue": {
      "host": "localhost",
      "username": "test",
      "password": "test123"
    }
  }'

# 2. Test login (which retrieves the secret)
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## 🔧 Alternative Secret Storage Methods

Instead of using the API, you can also store secrets via:

### AWS Console
1. Go to AWS Secrets Manager console
2. Find your secret (e.g., `dev-database-credentials`)
3. Click "Retrieve secret value" → "Edit"
4. Update the JSON value

### AWS CLI
```bash
aws secretsmanager put-secret-value \
  --secret-id dev-database-credentials \
  --secret-string '{"host":"prod-db.com","username":"user","password":"pass"}'
```

### Terraform/CloudFormation
```hcl
resource "aws_secretsmanager_secret_version" "db_creds" {
  secret_id = "dev-database-credentials"
  secret_string = jsonencode({
    host     = "prod-db.example.com"
    username = "app_user"
    password = var.db_password
  })
}
```

## 🧹 Cleanup

```bash
npm run destroy
```

This removes all Lambda functions, API Gateway, and secrets (with a 7-day recovery window).

## 🎯 Key Takeaways

1. **Never hardcode secrets** in your application code
2. **Use runtime retrieval** with `secret.getJsonValue()`
3. **Store secrets securely** via API, console, or CLI
4. **Rotate secrets regularly** without code changes
5. **Monitor access** via CloudTrail logs

This pattern ensures your secrets are secure, auditable, and manageable in production environments!