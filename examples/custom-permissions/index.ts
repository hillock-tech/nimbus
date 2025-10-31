import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: Custom IAM Permissions
 * 
 * This example demonstrates how to add custom IAM permissions to Lambda functions
 * for accessing AWS services that aren't automatically handled by Nimbus.
 */
async function customPermissionsExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'custom-permissions-app',
  });

  // Create an API
  const api = app.API({ name: 'api' });

  // Example 1: Function that needs to send emails via SES
  api.route('POST', '/send-email', async (event) => {
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    
    const sesClient = new SESClient({ region: process.env.AWS_REGION });
    const { to, subject, body } = JSON.parse(event.body || '{}');
    
    try {
      const command = new SendEmailCommand({
        Source: 'noreply@example.com',
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } }
        }
      });
      
      const result = await sesClient.send(command);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Email sent successfully',
          messageId: result.MessageId
        })
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to send email',
          details: error.message
        })
      };
    }
  }, { 
    cors: true,
    // Add custom permissions for SES
    permissions: [
      {
        Effect: 'Allow',
        Action: [
          'ses:SendEmail',
          'ses:SendRawEmail'
        ],
        Resource: '*'
      }
    ]
  });

  // Example 2: Function that needs to publish to SNS
  api.route('POST', '/notify', async (event) => {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    
    const snsClient = new SNSClient({ region: process.env.AWS_REGION });
    const { message, phoneNumber } = JSON.parse(event.body || '{}');
    
    try {
      const command = new PublishCommand({
        Message: message,
        PhoneNumber: phoneNumber
      });
      
      const result = await snsClient.send(command);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'SMS sent successfully',
          messageId: result.MessageId
        })
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to send SMS',
          details: error.message
        })
      };
    }
  }, { 
    cors: true,
    // Add custom permissions for SNS
    permissions: [
      {
        Effect: 'Allow',
        Action: [
          'sns:Publish'
        ],
        Resource: '*'
      }
    ]
  });

  // Example 3: Function that needs to access Parameter Store
  api.route('GET', '/config/{key}', async (event) => {
    const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
    
    const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
    const key = event.pathParameters?.key;
    
    if (!key) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Key parameter is required' })
      };
    }
    
    try {
      const command = new GetParameterCommand({
        Name: `/myapp/${key}`,
        WithDecryption: true
      });
      
      const result = await ssmClient.send(command);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          key,
          value: result.Parameter?.Value
        })
      };
    } catch (error: any) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Parameter not found',
          details: error.message
        })
      };
    }
  }, { 
    cors: true,
    // Add custom permissions for Systems Manager Parameter Store
    permissions: [
      {
        Effect: 'Allow',
        Action: [
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath'
        ],
        Resource: `arn:aws:ssm:us-east-1:*:parameter/myapp/*`
      }
    ]
  });

  // Example 4: Standalone function with multiple custom permissions
  const dataProcessor = app.Function({
    name: 'data-processor',
    handler: async (event) => {
      // This function can:
      // 1. Read from S3 (beyond the auto-managed buckets)
      // 2. Write to CloudWatch Logs (custom log groups)
      // 3. Access Secrets Manager
      
      console.log('Processing data with custom permissions');
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Data processed successfully',
          timestamp: new Date().toISOString()
        })
      };
    },
    // Add multiple custom permissions
    permissions: [
      {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:PutObject'
        ],
        Resource: 'arn:aws:s3:::external-data-bucket/*'
      },
      {
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        Resource: 'arn:aws:logs:us-east-1:*:log-group:/custom/data-processor/*'
      },
      {
        Effect: 'Allow',
        Action: [
          'secretsmanager:GetSecretValue'
        ],
        Resource: 'arn:aws:secretsmanager:us-east-1:*:secret:myapp/*'
      }
    ]
  });

  // You can also add permissions after function creation
  dataProcessor.addPermission({
    Effect: 'Allow',
    Action: [
      'kms:Decrypt'
    ],
    Resource: 'arn:aws:kms:us-east-1:*:key/12345678-1234-1234-1234-123456789012'
  });

  // Deploy everything!
  const result = await app.deploy();

  console.log('\n✅ Custom permissions example deployed successfully!');
  console.log(`\nAPI URL: ${result.apis[0].url}`);
  console.log(`\nExample endpoints:`);
  console.log(`  POST ${result.apis[0].url}/send-email`);
  console.log(`       Body: {"to": "user@example.com", "subject": "Test", "body": "Hello!"}`);
  console.log(`  POST ${result.apis[0].url}/notify`);
  console.log(`       Body: {"message": "Hello SMS", "phoneNumber": "+1234567890"}`);
  console.log(`  GET  ${result.apis[0].url}/config/database-url`);
  
  console.log(`\nCustom permissions added for:`);
  console.log(`  - SES (Simple Email Service)`);
  console.log(`  - SNS (Simple Notification Service)`);
  console.log(`  - SSM Parameter Store`);
  console.log(`  - External S3 buckets`);
  console.log(`  - Custom CloudWatch Log Groups`);
  console.log(`  - Secrets Manager`);
  console.log(`  - KMS for decryption`);
}

// Run the example
if (require.main === module) {
  customPermissionsExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export default customPermissionsExample;