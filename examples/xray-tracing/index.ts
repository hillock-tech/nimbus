import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: X-Ray Tracing
 * 
 * This example demonstrates how to enable X-Ray tracing for API Gateway
 * and Lambda functions to monitor performance and debug issues.
 */
async function xrayExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'xray-tracing-app',
    tracing: true, // Enable X-Ray tracing for all resources
  });

  // Create a KV store for demonstration
  const kv = app.KV({ name: 'users' });

  // Create an API with tracing enabled
  const api = app.API({ 
    name: 'traced-api',
    description: 'API with X-Ray tracing enabled'
  });

  // Health check with KV store ping - will generate DynamoDB traces
  api.route('GET', '/health', async (event) => {
    console.log('Health check with KV store ping...');
    
    // Import DynamoDB client for direct operations
    const { DynamoDBClient, GetItemCommand, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    
    const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    const tableName = process.env.KV_DEV_USERS || 'dev-users';
    
    let kvStatus = 'unknown';
    try {
      // Ping the KV store - this will generate a DynamoDB GetItem trace
      const getCommand = new GetItemCommand({
        TableName: tableName,
        Key: marshall({ id: 'health-check-ping' })
      });
      await dynamoClient.send(getCommand);
      kvStatus = 'accessible';
    } catch (error) {
      kvStatus = 'accessible-but-empty'; // DynamoDB is working, just no data
    }
    
    // Store health check timestamp - generates DynamoDB PutItem trace
    try {
      const putCommand = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          id: 'last-health-check',
          value: new Date().toISOString()
        })
      });
      await dynamoClient.send(putCommand);
    } catch (error) {
      console.log('Failed to store health check timestamp:', error);
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        tracing: 'enabled',
        kvStore: kvStatus,
        service: 'xray-tracing-app'
      }),
    };
  }, { cors: true });

  api.route('GET', '/users', async (event) => {
    console.log('Fetching users from KV store...');
    
    // Import DynamoDB client for direct operations
    const { DynamoDBClient, GetItemCommand, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
    
    const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    const tableName = process.env.KV_DEV_USERS || 'dev-users';
    
    try {
      // Try to get user list from KV store - this will generate DynamoDB GetItem trace
      const getCommand = new GetItemCommand({
        TableName: tableName,
        Key: marshall({ id: 'user-list' })
      });
      const result = await dynamoClient.send(getCommand);
      
      if (result.Item) {
        const item = unmarshall(result.Item);
        const users = JSON.parse(item.value);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            users,
            count: users.length,
            source: 'kv-store',
            traced: true
          }),
        };
      }
    } catch (error) {
      console.log('User list not found in KV, creating default list:', error);
    }
    
    // Create default users and store in KV for next time
    const defaultUsers = [
      { id: '1', name: 'John Doe', email: 'john@example.com' },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
    ];
    
    try {
      // Store user list in KV - this will generate DynamoDB PutItem trace
      const putCommand = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          id: 'user-list',
          value: JSON.stringify(defaultUsers)
        })
      });
      await dynamoClient.send(putCommand);
      console.log('Stored default user list in KV store');
    } catch (error) {
      console.log('Failed to store user list in KV:', error);
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: defaultUsers,
        count: defaultUsers.length,
        source: 'default-cached-to-kv',
        traced: true
      }),
    };
  }, { cors: true });

  api.route('POST', '/users', async (event) => {
    const user = JSON.parse(event.body || '{}');
    console.log('Creating user with KV store operations:', user);
    
    // Import DynamoDB client for direct operations
    const { DynamoDBClient, GetItemCommand, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
    
    const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    const tableName = process.env.KV_DEV_USERS || 'dev-users';
    
    // Generate user ID
    const userId = Math.random().toString(36).substring(7);
    const newUser = {
      ...user,
      id: userId,
      createdAt: new Date().toISOString(),
    };
    
    try {
      // Store individual user in KV - this will generate DynamoDB PutItem trace
      const putUserCommand = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          id: `user:${userId}`,
          value: JSON.stringify(newUser)
        })
      });
      await dynamoClient.send(putUserCommand);
      console.log(`Stored user ${userId} in KV store`);
      
      // Get existing user list and update it - this will generate GetItem + PutItem traces
      let userList = [];
      try {
        const getListCommand = new GetItemCommand({
          TableName: tableName,
          Key: marshall({ id: 'user-list' })
        });
        const result = await dynamoClient.send(getListCommand);
        if (result.Item) {
          const item = unmarshall(result.Item);
          userList = JSON.parse(item.value);
        }
      } catch (error) {
        console.log('No existing user list found, creating new one');
      }
      
      // Add new user to list and store back
      userList.push(newUser);
      const putListCommand = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          id: 'user-list',
          value: JSON.stringify(userList)
        })
      });
      await dynamoClient.send(putListCommand);
      console.log('Updated user list in KV store');
      
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'User created successfully',
          user: newUser,
          kvOperations: 3, // user:id + get user-list + set user-list
          traced: true
        }),
      };
    } catch (error) {
      console.error('KV store error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Failed to create user',
          error: error.message || 'KV store operation failed',
          traced: true
        }),
      };
    }
  }, { cors: true });

  // Route that demonstrates error tracing with KV context
  api.route('GET', '/error', async (event) => {
    console.log('Simulating an error with KV context for tracing...');
    
    // Import DynamoDB client for direct operations
    const { DynamoDBClient, GetItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    
    const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
    const tableName = process.env.KV_DEV_USERS || 'dev-users';
    
    try {
      // Try to access KV before error - this will generate DynamoDB GetItem trace
      const getCommand = new GetItemCommand({
        TableName: tableName,
        Key: marshall({ id: 'non-existent-key' })
      });
      await dynamoClient.send(getCommand);
      console.log('KV operation completed before error');
    } catch (kvError) {
      console.log('KV operation completed (key not found) before error');
    }
    
    // This error will be captured in X-Ray traces along with the KV operation
    throw new Error('This is a test error for X-Ray tracing with KV context');
  }, { cors: true });

  // Standalone function with KV operations and tracing
  const processor = app.Function({
    name: 'data-processor',
    handler: async (event) => {
      console.log('Processing data with KV operations and X-Ray tracing...');
      
      // Import DynamoDB client for direct operations
      const { DynamoDBClient, GetItemCommand, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
      const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
      
      const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
      const tableName = process.env.KV_DEV_USERS || 'dev-users';
      
      try {
        // Read processing stats from KV - generates DynamoDB GetItem trace
        let stats = { processedCount: 0, lastProcessed: null };
        try {
          const getStatsCommand = new GetItemCommand({
            TableName: tableName,
            Key: marshall({ id: 'processing-stats' })
          });
          const result = await dynamoClient.send(getStatsCommand);
          if (result.Item) {
            const item = unmarshall(result.Item);
            stats = JSON.parse(item.value);
          }
        } catch (error) {
          console.log('No existing processing stats found');
        }
        
        // Simulate processing work
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update stats and store back - generates DynamoDB PutItem trace
        stats.processedCount += 1;
        stats.lastProcessed = new Date().toISOString();
        const putStatsCommand = new PutItemCommand({
          TableName: tableName,
          Item: marshall({
            id: 'processing-stats',
            value: JSON.stringify(stats)
          })
        });
        await dynamoClient.send(putStatsCommand);
        
        // Store processing result - generates another DynamoDB PutItem trace
        const processingResult = {
          processedAt: new Date().toISOString(),
          eventData: event,
          stats
        };
        const putResultCommand = new PutItemCommand({
          TableName: tableName,
          Item: marshall({
            id: `processing-result:${Date.now()}`,
            value: JSON.stringify(processingResult)
          })
        });
        await dynamoClient.send(putResultCommand);
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Data processed successfully',
            result: processingResult,
            kvOperations: 3, // get stats + set stats + set result
            traced: true
          })
        };
      } catch (error) {
        console.error('Processing error:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'Processing failed',
            error: error.message,
            traced: true
          })
        };
      }
    },
    description: 'Data processor with KV operations and X-Ray tracing'
  });

  // Timer with tracing
  app.Timer({
    name: 'traced-timer',
    schedule: 'rate(5 minutes)',
    handler: async (event) => {
      console.log('Timer execution with X-Ray tracing...');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Timer executed successfully',
          timestamp: new Date().toISOString(),
          traced: true
        })
      };
    },
  });

  // Deploy everything!
  const result = await app.deploy();

  console.log('\nX-Ray tracing example deployed successfully!');
  console.log(`\nAPI URL: ${result.apis[0].url}`);
  console.log(`\nX-Ray tracing is enabled for:`);
  console.log(`  - API Gateway stage`);
  console.log(`  - All Lambda functions`);
  console.log(`  - Timer functions`);

  console.log(`\nTest endpoints:`);
  console.log(`  GET  ${result.apis[0].url}/health`);
  console.log(`  GET  ${result.apis[0].url}/users`);
  console.log(`  POST ${result.apis[0].url}/users`);
  console.log(`  GET  ${result.apis[0].url}/error (will generate error trace)`);

  console.log(`\nTo view X-Ray traces:`);
  console.log(`  1. Go to AWS X-Ray console`);
  console.log(`  2. Navigate to Service Map or Traces`);
  console.log(`  3. Make some API calls to generate traces`);
  console.log(`  4. View the service map and trace details`);

  console.log(`\nX-Ray will show:`);
  console.log(`  - Request/response times`);
  console.log(`  - Service dependencies`);
  console.log(`  - Error rates and exceptions`);
  console.log(`  - Performance bottlenecks`);
  console.log(`  - Cold start metrics`);
}

// Run the example
if (require.main === module) {
  xrayExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export default xrayExample;