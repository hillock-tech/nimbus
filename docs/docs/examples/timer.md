# Timer Example

This example demonstrates how to use scheduled Lambda functions with EventBridge for running tasks on a regular schedule.

## Overview

The timer example shows:
- Scheduled Lambda functions using cron and rate expressions
- Different scheduling patterns (frequent, daily, weekly)
- Integration with other Nimbus resources (KV store)
- Disabled timers that can be enabled later
- Task logging and monitoring

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

async function timerExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'timer-app',
  });

  // Create a KV store for tracking task executions
  const taskLogs = app.KV({ name: 'task-logs' });

  // Timer that runs every 5 minutes
  const frequentTimer = app.Timer({
    name: 'frequent-task',
    schedule: 'rate(5 minutes)',
    description: 'Runs every 5 minutes to check system health',
    handler: async (event) => {
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
      
      const timestamp = new Date().toISOString();
      const taskId = Math.random().toString(36).substring(7);

      console.log(`Frequent task executed at ${timestamp}`);

      // Log the execution to KV store
      const client = new DynamoDBClient({});
      const docClient = DynamoDBDocumentClient.from(client);
      const tableName = process.env.KV_TASK_LOGS;

      const healthCheck = {
        id: taskId,
        type: 'health-check',
        timestamp,
        status: 'completed',
        details: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        }
      };

      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: healthCheck
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Health check completed',
          task: healthCheck,
        }),
      };
    },
  });

  // Timer that runs daily at 2 AM UTC using cron expression
  const dailyTimer = app.Timer({
    name: 'daily-cleanup',
    schedule: 'cron(0 2 * * ? *)', // 2 AM UTC every day
    description: 'Daily cleanup task',
    handler: async (event) => {
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
      
      const timestamp = new Date().toISOString();
      console.log(`Daily cleanup task executed at ${timestamp}`);

      const client = new DynamoDBClient({});
      const docClient = DynamoDBDocumentClient.from(client);
      const tableName = process.env.KV_TASK_LOGS;

      // Clean up old task logs (older than 7 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const result = await docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: '#timestamp < :cutoff',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':cutoff': cutoffDate.toISOString()
        }
      }));

      let deletedCount = 0;
      for (const item of result.Items || []) {
        await docClient.send(new DeleteCommand({
          TableName: tableName,
          Key: { id: item.id }
        }));
        deletedCount++;
      }

      const cleanupResults = {
        timestamp,
        type: 'daily-cleanup',
        itemsProcessed: result.Items?.length || 0,
        itemsDeleted: deletedCount,
        duration: Date.now() - new Date(timestamp).getTime(),
      };

      // Log cleanup results
      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          id: Math.random().toString(36).substring(7),
          ...cleanupResults
        }
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Daily cleanup completed',
          results: cleanupResults,
        }),
      };
    },
  });

  // Timer that runs every Monday at 9 AM UTC
  const weeklyTimer = app.Timer({
    name: 'weekly-report',
    schedule: 'cron(0 9 ? * MON *)', // 9 AM UTC every Monday
    description: 'Weekly report generation',
    handler: async (event) => {
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
      
      const timestamp = new Date().toISOString();
      console.log(`Weekly report task executed at ${timestamp}`);

      const client = new DynamoDBClient({});
      const docClient = DynamoDBDocumentClient.from(client);
      const tableName = process.env.KV_TASK_LOGS;

      // Get all tasks from the last week
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      const result = await docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: '#timestamp >= :lastWeek',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':lastWeek': lastWeek.toISOString()
        }
      }));

      // Generate report data
      const tasks = result.Items || [];
      const tasksByType = tasks.reduce((acc, task) => {
        acc[task.type] = (acc[task.type] || 0) + 1;
        return acc;
      }, {});

      const reportData = {
        timestamp,
        type: 'weekly-report',
        week: `${lastWeek.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}`,
        totalTasks: tasks.length,
        tasksByType,
        metrics: {
          successRate: tasks.filter(t => t.status === 'completed').length / tasks.length,
          avgDuration: tasks.reduce((sum, t) => sum + (t.duration || 0), 0) / tasks.length,
        }
      };

      // Store report
      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          id: Math.random().toString(36).substring(7),
          ...reportData
        }
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Weekly report generated',
          report: reportData,
        }),
      };
    },
  });

  // Disabled timer (can be enabled later)
  const maintenanceTimer = app.Timer({
    name: 'maintenance-window',
    schedule: 'cron(0 3 ? * SUN *)', // 3 AM UTC every Sunday
    description: 'Maintenance window - currently disabled',
    enabled: false, // This timer won't trigger until enabled
    handler: async (event) => {
      console.log('Maintenance window started');

      // Simulate maintenance tasks
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Maintenance completed',
          timestamp: new Date().toISOString(),
        }),
      };
    },
  });

// Export for CLI deployment
export default app;
  console.log(`\nTimers created:`);

  if (result.timers) {
    for (const timer of result.timers) {
      console.log(`  - ${timer.name}: ${timer.schedule} (${timer.enabled ? 'enabled' : 'disabled'})`);
    }
  }

  console.log(`\nSchedule expressions used:`);
  console.log(`  - rate(5 minutes)           - Every 5 minutes`);
  console.log(`  - cron(0 2 * * ? *)         - Daily at 2 AM UTC`);
  console.log(`  - cron(0 9 ? * MON *)       - Every Monday at 9 AM UTC`);
  console.log(`  - cron(0 3 ? * SUN *)       - Every Sunday at 3 AM UTC (disabled)`);

  console.log(`\nNote: The maintenance timer is disabled and won't execute.`);
  console.log(`You can enable it by setting enabled: true and redeploying.`);
}

timerExample()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir timer-example
   cd timer-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   npm install -D @types/node tsx typescript
   ```

3. **Initialize Nimbus state:**
   ```bash
   npx nimbus init
   ```

4. **Create the application file:**
   Save the code above as `index.ts`

5. **Add package.json scripts:**
   ```json
   {
     "scripts": {
       "deploy": "npx nimbus deploy",
       "destroy": "npx nimbus destroy --project timer-app --region us-east-1 --force"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will create:
1. EventBridge rules for each timer
2. Lambda functions for each timer handler
3. DynamoDB table for task logs
4. IAM roles and permissions

## Monitor Timer Execution

### Check CloudWatch Logs

1. Go to AWS CloudWatch Console
2. Navigate to Log Groups
3. Find log groups for your timer functions
4. View execution logs

### Check DynamoDB Table

1. Go to AWS DynamoDB Console
2. Find the `task-logs` table
3. View items to see execution history

## Key Features Demonstrated

### 1. Schedule Expressions

#### Rate Expressions
- `rate(5 minutes)` - Every 5 minutes
- `rate(1 hour)` - Every hour
- `rate(1 day)` - Every day

#### Cron Expressions
- `cron(0 2 * * ? *)` - Daily at 2 AM UTC
- `cron(0 9 ? * MON *)` - Every Monday at 9 AM UTC
- `cron(0 3 ? * SUN *)` - Every Sunday at 3 AM UTC

### 2. Timer States
- **Enabled**: Timer executes on schedule
- **Disabled**: Timer exists but doesn't execute

### 3. Integration with Other Resources
- Timers can access KV stores, APIs, and other Nimbus resources
- Environment variables automatically injected

### 4. Event Object
Each timer handler receives an EventBridge event with:
- Event ID and timestamp
- Source information
- Region and account details

## Advanced Usage

### Health Monitoring Timer

```typescript
const healthMonitor = app.Timer({
  name: 'health-monitor',
  schedule: 'rate(2 minutes)',
  handler: async (event) => {
    const checks = [];
    
    // Check DynamoDB
    try {
      const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
      const client = new DynamoDBClient({});
      
      await client.send(new DescribeTableCommand({
        TableName: process.env.KV_TASK_LOGS
      }));
      
      checks.push({ service: 'DynamoDB', status: 'healthy' });
    } catch (error) {
      checks.push({ service: 'DynamoDB', status: 'unhealthy', error: error.message });
    }
    
    // Check external API
    try {
      const response = await fetch('https://api.example.com/health');
      checks.push({ 
        service: 'External API', 
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status
      });
    } catch (error) {
      checks.push({ service: 'External API', status: 'unhealthy', error: error.message });
    }
    
    // Alert if any service is unhealthy
    const unhealthyServices = checks.filter(check => check.status === 'unhealthy');
    
    if (unhealthyServices.length > 0) {
      console.error('Unhealthy services detected:', unhealthyServices);
      // Send alert (SNS, email, etc.)
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        checks,
        healthy: unhealthyServices.length === 0
      })
    };
  }
});
```

### Data Backup Timer

```typescript
const backupTimer = app.Timer({
  name: 'data-backup',
  schedule: 'cron(0 1 * * ? *)', // 1 AM daily
  handler: async (event) => {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    
    const dynamoClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(dynamoClient);
    const s3Client = new S3Client({});
    
    // Export data from DynamoDB
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.KV_TASK_LOGS
    }));
    
    // Create backup file
    const backup = {
      timestamp: new Date().toISOString(),
      itemCount: result.Items?.length || 0,
      data: result.Items || []
    };
    
    // Store in S3
    const backupKey = `backups/task-logs-${new Date().toISOString().split('T')[0]}.json`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.STORAGE_BACKUPS,
      Key: backupKey,
      Body: JSON.stringify(backup, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`Backup completed: ${backupKey}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Backup completed',
        key: backupKey,
        itemCount: backup.itemCount
      })
    };
  }
});
```

### Conditional Timer

```typescript
const conditionalTimer = app.Timer({
  name: 'conditional-task',
  schedule: 'rate(1 hour)',
  handler: async (event) => {
    // Only run during business hours (9 AM - 5 PM UTC)
    const hour = new Date().getUTCHours();
    
    if (hour < 9 || hour >= 17) {
      console.log('Outside business hours, skipping task');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Skipped - outside business hours' })
      };
    }
    
    // Run the actual task
    console.log('Running business hours task');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Business hours task completed' })
    };
  }
});
```

## Schedule Expression Reference

### Cron Format
```
cron(Minutes Hours Day-of-month Month Day-of-week Year)
```

| Field | Values | Special Characters |
|-------|--------|--------------------|
| Minutes | 0-59 | , - * / |
| Hours | 0-23 | , - * / |
| Day of month | 1-31 | , - * ? / L W |
| Month | 1-12 or JAN-DEC | , - * / |
| Day of week | 1-7 or SUN-SAT | , - * ? L # |
| Year | 1970-2199 | , - * / |

### Common Patterns

```typescript
// Every 15 minutes
schedule: 'rate(15 minutes)'

// Every hour
schedule: 'rate(1 hour)'

// Daily at 2 AM UTC
schedule: 'cron(0 2 * * ? *)'

// Weekdays at 9 AM UTC
schedule: 'cron(0 9 ? * MON-FRI *)'

// First day of every month at midnight
schedule: 'cron(0 0 1 * ? *)'

// Every Sunday at 3 AM UTC
schedule: 'cron(0 3 ? * SUN *)'

// Every 30 minutes during business hours
schedule: 'cron(0/30 9-17 * * ? *)'
```

## Architecture

```
EventBridge Rule
    ↓
Lambda Function
    ↓
DynamoDB / S3 / Other Resources
    ↓
CloudWatch Logs
```

## Clean Up

```bash
npm run destroy
```

The `--force` flag removes all resources including the DynamoDB table.

## Next Steps

- Try the [Queue example](./queue) for event-driven processing
- Explore [Authentication](./auth-api) for secure scheduled tasks
- Learn about [Storage example](./storage) for file operations

## Troubleshooting

### Common Issues

**Timer not executing**
- Check that the timer is enabled (`enabled: true`)
- Verify the schedule expression syntax
- Check CloudWatch Events rules in AWS Console

**"Table not found" errors**
- Make sure the deployment completed successfully
- Check that environment variables are set correctly

**Timezone confusion**
- All cron expressions use UTC timezone
- Convert local times to UTC for scheduling

**Function timeout**
- Increase timeout for long-running tasks
- Consider breaking large tasks into smaller chunks