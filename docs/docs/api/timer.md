# Timer

The Timer class represents a scheduled Lambda function triggered by EventBridge (CloudWatch Events).

## Creation

```typescript
const timer = app.Timer(config: TimerConfig)
```

### TimerConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Timer name |
| `schedule` | `string` | ✅ | Cron or rate expression |
| `handler` | `function` | ✅ | Function to execute |
| `description` | `string` | ❌ | Timer description |
| `enabled` | `boolean` | ❌ | Enable/disable timer (default: true) |
| `timezone` | `string` | ❌ | Timezone for cron expressions |

### Example

```typescript
const dailyCleanup = app.Timer({
  name: 'daily-cleanup',
  schedule: 'cron(0 2 * * ? *)', // 2 AM UTC daily
  handler: async (event) => {
    console.log('Running daily cleanup...');
    
    // Cleanup logic here
    const deletedCount = await cleanupOldRecords();
    
    return {
      statusCode: 200,
      message: `Cleanup completed, deleted ${deletedCount} records`
    };
  },
  description: 'Daily cleanup of old records'
});
```

## Schedule Expressions

### Rate Expressions

Execute at regular intervals:

```typescript
// Every 5 minutes
app.Timer({
  name: 'frequent-task',
  schedule: 'rate(5 minutes)',
  handler: async () => {
    console.log('Running every 5 minutes');
  }
});

// Every hour
app.Timer({
  name: 'hourly-task',
  schedule: 'rate(1 hour)',
  handler: async () => {
    console.log('Running every hour');
  }
});

// Every day
app.Timer({
  name: 'daily-task',
  schedule: 'rate(1 day)',
  handler: async () => {
    console.log('Running daily');
  }
});
```

### Cron Expressions

Execute at specific times:

```typescript
// Every day at 2 AM UTC
app.Timer({
  name: 'daily-backup',
  schedule: 'cron(0 2 * * ? *)',
  handler: async () => {
    console.log('Running daily backup at 2 AM UTC');
  }
});

// Every Monday at 9 AM UTC
app.Timer({
  name: 'weekly-report',
  schedule: 'cron(0 9 ? * MON *)',
  handler: async () => {
    console.log('Generating weekly report');
  }
});

// Every 15 minutes during business hours (9 AM - 5 PM UTC)
app.Timer({
  name: 'business-hours-check',
  schedule: 'cron(0/15 9-17 * * ? *)',
  handler: async () => {
    console.log('Business hours check');
  }
});

// First day of every month at midnight UTC
app.Timer({
  name: 'monthly-billing',
  schedule: 'cron(0 0 1 * ? *)',
  handler: async () => {
    console.log('Processing monthly billing');
  }
});
```

## Event Object

The handler receives an EventBridge event:

```typescript
app.Timer({
  name: 'event-inspector',
  schedule: 'rate(1 hour)',
  handler: async (event) => {
    console.log('Event details:', {
      id: event.id,
      source: event.source,
      time: event.time,
      region: event.region,
      account: event.account
    });
    
    // Event structure:
    // {
    //   "id": "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
    //   "detail-type": "Scheduled Event",
    //   "source": "aws.events",
    //   "account": "123456789012",
    //   "time": "1970-01-01T00:00:00Z",
    //   "region": "us-east-1",
    //   "detail": {}
    // }
  }
});
```

## Common Use Cases

### Database Cleanup

```typescript
const dbCleanup = app.Timer({
  name: 'database-cleanup',
  schedule: 'cron(0 3 * * ? *)', // 3 AM daily
  handler: async (event) => {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
    
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = process.env.KV_SESSIONS;
    
    // Delete expired sessions
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days ago
    
    const result = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'createdAt < :cutoff',
      ExpressionAttributeValues: {
        ':cutoff': cutoffDate.toISOString()
      }
    }));
    
    let deletedCount = 0;
    for (const item of result.Items || []) {
      await docClient.send(new DeleteCommand({
        TableName: tableName,
        Key: { sessionId: item.sessionId }
      }));
      deletedCount++;
    }
    
    console.log(`Deleted ${deletedCount} expired sessions`);
    
    return {
      statusCode: 200,
      deletedCount
    };
  }
});
```

### Report Generation

```typescript
const weeklyReport = app.Timer({
  name: 'weekly-report',
  schedule: 'cron(0 9 ? * MON *)', // Every Monday at 9 AM
  handler: async (event) => {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    
    const dynamoClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(dynamoClient);
    const sesClient = new SESClient({});
    
    // Get data from last week
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.KV_USERS,
      FilterExpression: 'createdAt >= :lastWeek',
      ExpressionAttributeValues: {
        ':lastWeek': lastWeek.toISOString()
      }
    }));
    
    const newUsers = result.Items || [];
    
    // Generate report
    const report = {
      week: `${lastWeek.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}`,
      newUsers: newUsers.length,
      totalUsers: await getTotalUserCount(),
      topDomains: getTopEmailDomains(newUsers)
    };
    
    // Send email report
    await sesClient.send(new SendEmailCommand({
      Source: 'reports@example.com',
      Destination: {
        ToAddresses: ['admin@example.com']
      },
      Message: {
        Subject: {
          Data: `Weekly Report - ${report.week}`
        },
        Body: {
          Text: {
            Data: `
Weekly Report

New Users: ${report.newUsers}
Total Users: ${report.totalUsers}
Top Email Domains: ${JSON.stringify(report.topDomains, null, 2)}
            `
          }
        }
      }
    }));
    
    console.log('Weekly report sent');
    
    return {
      statusCode: 200,
      report
    };
  }
});
```

### Health Checks

```typescript
const healthCheck = app.Timer({
  name: 'health-monitor',
  schedule: 'rate(5 minutes)',
  handler: async (event) => {
    const checks = [];
    
    // Check database connectivity
    try {
      const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
      const client = new DynamoDBClient({});
      
      await client.send(new DescribeTableCommand({
        TableName: process.env.KV_USERS
      }));
      
      checks.push({ service: 'DynamoDB', status: 'healthy' });
    } catch (error) {
      checks.push({ service: 'DynamoDB', status: 'unhealthy', error: error.message });
    }
    
    // Check external API
    try {
      const response = await fetch('https://api.external-service.com/health');
      if (response.ok) {
        checks.push({ service: 'External API', status: 'healthy' });
      } else {
        checks.push({ service: 'External API', status: 'unhealthy', error: `HTTP ${response.status}` });
      }
    } catch (error) {
      checks.push({ service: 'External API', status: 'unhealthy', error: error.message });
    }
    
    // Alert if any service is unhealthy
    const unhealthyServices = checks.filter(check => check.status === 'unhealthy');
    
    if (unhealthyServices.length > 0) {
      const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
      const sns = new SNSClient({});
      
      await sns.send(new PublishCommand({
        TopicArn: process.env.ALERT_TOPIC_ARN,
        Subject: 'Health Check Alert',
        Message: `Unhealthy services detected:\n${JSON.stringify(unhealthyServices, null, 2)}`
      }));
    }
    
    console.log('Health check completed:', checks);
    
    return {
      statusCode: 200,
      checks,
      healthy: unhealthyServices.length === 0
    };
  }
});
```

### Data Synchronization

```typescript
const dataSync = app.Timer({
  name: 'data-sync',
  schedule: 'cron(0 1 * * ? *)', // 1 AM daily
  handler: async (event) => {
    const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
    
    const s3Client = new S3Client({});
    const dynamoClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(dynamoClient);
    
    try {
      // Download data from external source
      const externalData = await fetchExternalData();
      
      // Transform data
      const transformedData = externalData.map(item => ({
        id: item.external_id,
        name: item.name,
        lastSynced: new Date().toISOString(),
        source: 'external'
      }));
      
      // Batch write to DynamoDB
      const batches = chunkArray(transformedData, 25); // DynamoDB batch limit
      
      for (const batch of batches) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [process.env.KV_EXTERNAL_DATA]: batch.map(item => ({
              PutRequest: { Item: item }
            }))
          }
        }));
      }
      
      // Store sync metadata
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.STORAGE_SYNC_LOGS,
        Key: `sync-${new Date().toISOString().split('T')[0]}.json`,
        Body: JSON.stringify({
          syncedAt: new Date().toISOString(),
          recordCount: transformedData.length,
          status: 'success'
        })
      }));
      
      console.log(`Synced ${transformedData.length} records`);
      
      return {
        statusCode: 200,
        syncedRecords: transformedData.length
      };
    } catch (error) {
      console.error('Sync failed:', error);
      
      // Log error
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.STORAGE_SYNC_LOGS,
        Key: `sync-error-${new Date().toISOString()}.json`,
        Body: JSON.stringify({
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
      }));
      
      throw error;
    }
  }
});
```

## Disabled Timers

Create timers that can be enabled later:

```typescript
const maintenanceTimer = app.Timer({
  name: 'maintenance-window',
  schedule: 'cron(0 3 ? * SUN *)', // Every Sunday at 3 AM
  enabled: false, // Disabled by default
  handler: async (event) => {
    console.log('Running maintenance tasks...');
    
    // Maintenance logic
    await performMaintenance();
    
    return {
      statusCode: 200,
      message: 'Maintenance completed'
    };
  }
});
```

## Error Handling

```typescript
const robustTimer = app.Timer({
  name: 'robust-processor',
  schedule: 'rate(1 hour)',
  handler: async (event) => {
    try {
      // Main processing logic
      const result = await processData();
      
      console.log('Processing completed successfully:', result);
      
      return {
        statusCode: 200,
        result
      };
    } catch (error) {
      console.error('Timer execution failed:', error);
      
      // Send alert
      const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
      const sns = new SNSClient({});
      
      await sns.send(new PublishCommand({
        TopicArn: process.env.ERROR_TOPIC_ARN,
        Subject: 'Timer Execution Failed',
        Message: `Timer: robust-processor\nError: ${error.message}\nStack: ${error.stack}`
      }));
      
      // Re-throw to mark as failed
      throw error;
    }
  }
});
```

## Best Practices

1. **Idempotency**: Make timer functions idempotent to handle retries
2. **Error Handling**: Always handle errors gracefully and log details
3. **Timeouts**: Set appropriate timeouts for long-running tasks
4. **Monitoring**: Monitor timer execution and failures
5. **Resource Cleanup**: Clean up resources in finally blocks
6. **Alerting**: Set up alerts for failed executions
7. **Testing**: Test timer functions with sample events
8. **Documentation**: Document what each timer does and when it runs

## Cron Expression Reference

| Field | Values | Special Characters |
|-------|--------|--------------------|
| Minutes | 0-59 | , - * / |
| Hours | 0-23 | , - * / |
| Day of month | 1-31 | , - * ? / L W |
| Month | 1-12 or JAN-DEC | , - * / |
| Day of week | 1-7 or SUN-SAT | , - * ? L # |
| Year | 1970-2199 | , - * / |

### Common Patterns

- `0 2 * * ? *` - Daily at 2 AM
- `0 9 ? * MON *` - Every Monday at 9 AM  
- `0/15 * * * ? *` - Every 15 minutes
- `0 0 1 * ? *` - First day of every month
- `0 9-17 ? * MON-FRI *` - Business hours (9 AM - 5 PM, weekdays)