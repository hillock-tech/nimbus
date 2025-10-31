import { Nimbus } from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus();

/**
 * 🔑 HOW SECRETS WORK IN LAMBDA FUNCTIONS:
 * 
 * 1. During deployment, Nimbus creates the secret placeholders in AWS Secrets Manager
 * 2. The Lambda functions get IAM permissions to read these secrets
 * 3. At runtime, when you call `secret.getJsonValue()`, it uses the AWS SDK
 *    to fetch the secret from Secrets Manager
 * 4. The secret values are never stored in your code - they're retrieved securely
 *    from AWS at runtime
 * 
 * This is the CORRECT way to handle secrets in serverless applications!
 */

// ✅ CORRECT: Create secret placeholders without values
// Values will be set via API calls or AWS console
const databaseCredentials = nimbus.Secret({
  name: 'database-credentials',
  description: 'Production database connection details'
  // No value here - will be set securely via API
});

const apiKeys = nimbus.Secret({
  name: 'external-api-keys',
  description: 'Third-party service API keys'
  // No value here - will be set securely via API
});

const jwtConfig = nimbus.Secret({
  name: 'jwt-configuration',
  description: 'JWT signing and encryption keys'
  // No value here - will be set securely via API
});

// Create API for secret management
const api = nimbus.api({
  name: 'secrets-demo',
  description: 'Secure secret management demonstration'
});

// ✅ ADMIN ENDPOINT: Store secrets securely (admin-only)
api.route('POST', '/admin/secrets', async (event) => {
  try {
    // Verify admin authentication (implement your auth logic)
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { secretName, secretValue } = JSON.parse(event.body || '{}');
    
    if (!secretName || !secretValue) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'secretName and secretValue required' })
      };
    }

    // Store the secret securely
    let secret;
    switch (secretName) {
      case 'database-credentials':
        await databaseCredentials.updateValue(secretValue);
        secret = databaseCredentials;
        break;
      case 'api-keys':
        await apiKeys.updateValue(secretValue);
        secret = apiKeys;
        break;
      case 'jwt-config':
        await jwtConfig.updateValue(secretValue);
        secret = jwtConfig;
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unknown secret name' })
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Secret '${secretName}' stored successfully`,
        arn: secret.getArn()
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to store secret' })
    };
  }
});

// ✅ APPLICATION ENDPOINT: Use secrets (normal operation)
api.route('POST', '/auth/login', async (event) => {
  try {
    const { email, password } = JSON.parse(event.body || '{}');
    
    // ✅ CORRECT: Retrieve secret at runtime
    const dbCreds = await databaseCredentials.getJsonValue();
    
    if (!dbCreds) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database configuration not available' })
      };
    }
    
    // Use the secret to connect to database
    const user = await authenticateUser(email, password, dbCreds);
    
    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
    
    // Get JWT configuration
    const jwtCreds = await jwtConfig.getJsonValue();
    
    if (!jwtCreds) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'JWT configuration not available' })
      };
    }
    
    // Generate JWT token
    const token = generateJWT(user, jwtCreds);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: { id: user.id, email: user.email }
      })
    };
    
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Authentication failed' })
    };
  }
});

// ✅ PAYMENT ENDPOINT: Use API keys from secrets
api.route('POST', '/payments/charge', async (event) => {
  try {
    const { amount, token, currency = 'usd' } = JSON.parse(event.body || '{}');
    
    // ✅ CORRECT: Get API keys at runtime
    const keys = await apiKeys.getJsonValue();
    
    if (!keys || !keys.stripe) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Payment configuration not available' })
      };
    }
    
    // Use the secret API key
    const stripe = require('stripe')(keys.stripe);
    
    const charge = await stripe.charges.create({
      amount: amount * 100,
      currency,
      source: token,
      description: 'Service payment'
    });
    
    // Send email if SendGrid key is available
    if (keys.sendgrid) {
      const sendgrid = require('@sendgrid/mail');
      sendgrid.setApiKey(keys.sendgrid);
      
      await sendgrid.send({
        to: event.requestContext.authorizer?.email || 'customer@example.com',
        from: 'noreply@myapp.com',
        subject: 'Payment Confirmation',
        text: `Payment of $${amount} processed successfully.`
      });
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        chargeId: charge.id,
        amount: charge.amount / 100
      })
    };
    
  } catch (error) {
    console.error('Payment error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Payment processing failed' })
    };
  }
});

// ✅ SECRET ROTATION ENDPOINT: Update secrets
api.route('PUT', '/admin/secrets/rotate', async (event) => {
  try {
    // Verify admin authentication
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { secretName, newValue } = JSON.parse(event.body || '{}');
    
    // Rotate the secret
    switch (secretName) {
      case 'jwt-config':
        await jwtConfig.updateValue(newValue);
        break;
      case 'api-keys':
        await apiKeys.updateValue(newValue);
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unknown secret name' })
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Secret '${secretName}' rotated successfully`,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to rotate secret' })
    };
  }
});

// Health check endpoint that doesn't use secrets
api.route('GET', '/health', () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString()
    })
  };
});

// Helper functions (would be imported from separate modules)
async function verifyAdminToken(authHeader: string): Promise<boolean> {
  // Implement your admin token verification logic
  // This could check JWT, API key, or other authentication method
  const token = authHeader.replace('Bearer ', '');
  
  // Example: verify against a known admin token or JWT
  // In real implementation, this would validate the token properly
  return token === 'admin-secret-token' || token.startsWith('admin-');
}

async function authenticateUser(email: string, password: string, dbCreds: any) {
  // Use the database credentials to connect and authenticate
  console.log(`Connecting to ${dbCreds.host}:${dbCreds.port}/${dbCreds.database}`);
  
  // Database authentication logic would go here
  // This is just a mock implementation
  if (email && password) {
    return { id: 1, email };
  }
  return null;
}

function generateJWT(user: any, jwtCreds: any) {
  // Use the JWT credentials to sign the token
  console.log(`Signing JWT with issuer: ${jwtCreds.issuer}`);
  
  // JWT generation logic would use jwtCreds.signing_key
  return 'jwt-token-signed-with-secret-key';
}

export { api, databaseCredentials, apiKeys, jwtConfig };