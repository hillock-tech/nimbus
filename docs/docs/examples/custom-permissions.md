# Custom Permissions Example

This example demonstrates how to implement custom IAM permissions for fine-grained access control in your Nimbus applications.

## Overview

By default, Nimbus automatically configures IAM permissions for your Lambda functions based on the resources they use. However, you may need custom permissions for:

- Accessing AWS services not directly supported by Nimbus
- Implementing fine-grained access control
- Cross-account resource access
- Custom security policies

## Basic Custom Permissions

```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

// Function with custom permissions
const nimbus = new Nimbus({ projectName: 'my-app' });
const customFunction = nimbus.Function({
  name: 'custom-permissions-function',
  handler: './handlers/custom.js',
  permissions: [
    {
      Effect: 'Allow',
      Action: [
        'ses:SendEmail',
        'ses:SendRawEmail'
      ],
      Resource: '*'
    },
    {
      Effect: 'Allow',
      Action: ['cloudwatch:PutMetricData'],
      Resource: '*'
    }
  ]
});
```

## Advanced Permission Patterns

### Resource-Specific Permissions
```typescript
const dataProcessor = nimbus.Function({
  name: 'data-processor',
  handler: './handlers/processor.js',
  permissions: [
    // Access specific S3 bucket
    {
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:PutObject'
      ],
      Resource: 'arn:aws:s3:::my-data-bucket/*'
    },
    // Access specific DynamoDB table
    {
      Effect: 'Allow',
      Action: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/ProcessingResults'
    }
  ]
});
```

### Cross-Account Access
```typescript
const crossAccountFunction = nimbus.Function({
  name: 'cross-account-function',
  handler: './handlers/cross-account.js',
  permissions: [
    {
      Effect: 'Allow',
      Action: ['s3:GetObject'],
      Resource: 'arn:aws:s3:::external-account-bucket/*',
      Condition: {
        StringEquals: {
          's3:ExistingObjectTag/Environment': 'production'
        }
      }
    }
  ]
});
```

## API with Custom Permissions

```typescript
const api = nimbus.api({
  name: 'custom-permissions-api',
  description: 'API with custom IAM permissions'
});

// Route that needs custom permissions
api.route('POST', '/send-notification', async (event) => {
  const AWS = require('aws-sdk');
  const ses = new AWS.SES();
  
  const { email, subject, message } = JSON.parse(event.body || '{}');
  
  try {
    // Send email using SES (requires custom permission)
    await ses.sendEmail({
      Source: 'noreply@myapp.com',
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: message } }
      }
    }).promise();
    
    // Put custom metric (requires custom permission)
    const cloudwatch = new AWS.CloudWatch();
    await cloudwatch.putMetricData({
      Namespace: 'MyApp/Notifications',
      MetricData: [{
        MetricName: 'EmailsSent',
        Value: 1,
        Unit: 'Count'
      }]
    }).promise();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notification sent successfully' })
    };
    
  } catch (error) {
    console.error('Notification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send notification' })
    };
  }
});
```

## Permission Conditions

### Time-Based Access
```typescript
const timeRestrictedFunction = nimbus.Function({
  name: 'time-restricted-function',
  handler: './handlers/restricted.js',
  permissions: [
    {
      Effect: 'Allow',
      Action: ['s3:GetObject'],
      Resource: 'arn:aws:s3:::sensitive-data/*',
      Condition: {
        DateGreaterThan: {
          'aws:CurrentTime': '2024-01-01T00:00:00Z'
        },
        DateLessThan: {
          'aws:CurrentTime': '2024-12-31T23:59:59Z'
        }
      }
    }
  ]
});
```

### IP-Based Access
```typescript
const ipRestrictedFunction = nimbus.Function({
  name: 'ip-restricted-function',
  handler: './handlers/ip-restricted.js',
  permissions: [
    {
      Effect: 'Allow',
      Action: ['dynamodb:*'],
      Resource: 'arn:aws:dynamodb:*:*:table/SensitiveData',
      Condition: {
        IpAddress: {
          'aws:SourceIp': ['203.0.113.0/24', '198.51.100.0/24']
        }
      }
    }
  ]
});
```

## Multi-Resource Permissions

```typescript
const multiResourceFunction = nimbus.Function({
  name: 'multi-resource-function',
  handler: './handlers/multi-resource.js',
  permissions: [
    // SNS permissions
    {
      Effect: 'Allow',
      Action: [
        'sns:Publish',
        'sns:CreateTopic',
        'sns:Subscribe'
      ],
      Resource: 'arn:aws:sns:*:*:MyApp-*'
    },
    // SQS permissions
    {
      Effect: 'Allow',
      Action: [
        'sqs:SendMessage',
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage'
      ],
      Resource: 'arn:aws:sqs:*:*:MyApp-*'
    },
    // Lambda permissions (for invoking other functions)
    {
      Effect: 'Allow',
      Action: ['lambda:InvokeFunction'],
      Resource: 'arn:aws:lambda:*:*:function:MyApp-*'
    }
  ]
});
```

## Deployment

```bash
cd examples/custom-permissions
npm install
npm run deploy
```

## Testing Custom Permissions

After deployment, test the custom permissions:

```bash
# Test SES email sending
curl -X POST https://your-api-url/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Test Notification",
    "message": "This is a test message sent via SES"
  }'
```

## Best Practices

### 1. Principle of Least Privilege
```typescript
// ✅ Good - specific permissions
permissions: [
  {
    Effect: 'Allow',
    Action: ['s3:GetObject'],
    Resource: 'arn:aws:s3:::my-bucket/uploads/*'
  }
]

// ❌ Avoid - overly broad permissions
permissions: [
  {
    Effect: 'Allow',
    Action: ['*'],
    Resource: '*'
  }
]
```

### 2. Use Resource ARN Patterns
```typescript
// ✅ Good - specific resource pattern
Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/MyApp-*'

// ❌ Avoid - wildcard resources when possible
Resource: '*'
```

### 3. Implement Conditions
```typescript
// ✅ Good - conditional access
permissions: [
  {
    Effect: 'Allow',
    Action: ['s3:GetObject'],
    Resource: 'arn:aws:s3:::my-bucket/*',
    Condition: {
      StringEquals: {
        's3:ExistingObjectTag/Environment': '${aws:PrincipalTag/Environment}'
      }
    }
  }
]
```

## Common Use Cases

### 1. Email Notifications
```typescript
// SES permissions for email sending
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
```

### 2. Custom Metrics
```typescript
// CloudWatch permissions for custom metrics
permissions: [
  {
    Effect: 'Allow',
    Action: ['cloudwatch:PutMetricData'],
    Resource: '*'
  }
]
```

### 3. File Processing
```typescript
// S3 permissions for file processing
permissions: [
  {
    Effect: 'Allow',
    Action: [
      's3:GetObject',
      's3:PutObject',
      's3:DeleteObject'
    ],
    Resource: [
      'arn:aws:s3:::input-bucket/*',
      'arn:aws:s3:::output-bucket/*'
    ]
  }
]
```

### 4. Cross-Service Integration
```typescript
// Multiple service permissions
permissions: [
  // SNS for notifications
  {
    Effect: 'Allow',
    Action: ['sns:Publish'],
    Resource: 'arn:aws:sns:*:*:MyApp-notifications'
  },
  // Step Functions for workflows
  {
    Effect: 'Allow',
    Action: ['states:StartExecution'],
    Resource: 'arn:aws:states:*:*:stateMachine:MyApp-*'
  }
]
```

## Troubleshooting

### Permission Denied Errors
1. Check CloudWatch Logs for specific error messages
2. Verify resource ARNs are correct
3. Ensure conditions are properly formatted
4. Test with broader permissions first, then narrow down

### Testing Permissions
```typescript
// Add logging to test permissions
api.route('POST', '/test-permissions', async (event) => {
  const AWS = require('aws-sdk');
  
  try {
    // Test SES permission
    const ses = new AWS.SES();
    await ses.describeConfigurationSets().promise();
    console.log('SES permission: OK');
    
    // Test CloudWatch permission
    const cloudwatch = new AWS.CloudWatch();
    await cloudwatch.listMetrics({ Namespace: 'AWS/Lambda' }).promise();
    console.log('CloudWatch permission: OK');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'All permissions working' })
    };
    
  } catch (error) {
    console.error('Permission test failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
```

## Cleanup

```bash
npm run destroy
```

## Related Examples

- [Basic API](./basic-api.md) - Simple API without custom permissions
- [Auth API](./auth-api.md) - Authentication-based permissions

## Learn More

- [AWS IAM Policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)
- [Lambda Execution Role](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html)
- [Security Best Practices](../guide/security.md) - Overall security guidance