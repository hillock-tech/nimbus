import { Nimbus } from '@hillock-tech/nimbus-js';

// Example 1: Function with init code as a function
const nimbus = new Nimbus({ projectName: 'lambda-init-example' });
const functionWithInit = nimbus.Function({
  name: 'function-with-init',
  description: 'Lambda function with static initialization',
  init: () => {
    // This code runs once per Lambda container (cold start)
    const AWS = require('aws-sdk');
    const crypto = require('crypto');
    
    // Initialize AWS SDK clients (reused across invocations)
    global.dynamoClient = new AWS.DynamoDB.DocumentClient();
    global.s3Client = new AWS.S3();
    
    // Pre-compute expensive operations
    global.encryptionKey = crypto.randomBytes(32);
    
    // Set up global configuration
    global.appConfig = {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      startTime: new Date().toISOString()
    };
    
    console.log('Lambda container initialized at:', global.appConfig.startTime);
  },
  handler: async (event, context) => {
    // This code runs on every invocation
    console.log('Handler invoked with config:', global.appConfig);
    
    // Use pre-initialized clients
    const params = {
      TableName: process.env.USERS_TABLE,
      Key: { id: event.pathParameters?.id }
    };
    
    try {
      const result = await global.dynamoClient.get(params).promise();
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          user: result.Item,
          containerStartTime: global.appConfig.startTime,
          invocationTime: new Date().toISOString()
        })
      };
    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  }
});

// Example 2: Function with init code as a string
const functionWithStringInit = nimbus.Function({
  name: 'function-with-string-init',
  description: 'Lambda function with string-based initialization',
  init: `
    // Static initialization code (runs once per container)
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    
    // Pre-compile regex patterns
    global.emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    global.phoneRegex = /^\+?[1-9]\d{1,14}$/;
    
    // Initialize connection pools
    global.connectionPool = {
      maxConnections: 10,
      currentConnections: 0,
      connections: []
    };
    
    // Cache frequently used data
    global.cache = new Map();
    
    console.log('String-based initialization completed');
  `,
  handler: async (event, context) => {
    const { email, password } = JSON.parse(event.body || '{}');
    
    // Use pre-compiled regex
    if (!global.emailRegex.test(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }
    
    // Use cached data
    const cachedUser = global.cache.get(email);
    if (cachedUser) {
      console.log('Using cached user data');
      return {
        statusCode: 200,
        body: JSON.stringify({ user: cachedUser, cached: true })
      };
    }
    
    // Simulate user authentication
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      loginTime: new Date().toISOString()
    };
    
    // Cache the user
    global.cache.set(email, user);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ user, cached: false })
    };
  }
});

// Example 3: API with init functions
const api = nimbus.api({
  name: 'init-demo-api',
  description: 'API demonstrating Lambda initialization patterns'
});

// Route with database connection pooling
api.route('GET', '/users/:id', async (event) => {
  // Use pre-initialized database client from init
  const userId = event.pathParameters?.id;
  
  try {
    // Simulate database query using pre-initialized client
    const user = {
      id: userId,
      name: `User ${userId}`,
      fetchedAt: new Date().toISOString(),
      containerStart: global.appConfig?.startTime || 'unknown'
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify(user)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch user' })
    };
  }
});

// Route with cached configuration
api.route('GET', '/config', async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      config: global.appConfig || {},
      cacheSize: global.cache?.size || 0,
      timestamp: new Date().toISOString()
    })
  };
});

// Route that demonstrates performance benefits
api.route('POST', '/validate', async (event) => {
  const { email, phone } = JSON.parse(event.body || '{}');
  
  // Use pre-compiled regex patterns (much faster than compiling each time)
  const emailValid = global.emailRegex?.test(email) || false;
  const phoneValid = global.phoneRegex?.test(phone) || false;
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      validation: {
        email: emailValid,
        phone: phoneValid
      },
      timestamp: new Date().toISOString()
    })
  };
});

// Example 4: Function with complex initialization
const complexInitFunction = nimbus.Function({
  name: 'complex-init-function',
  description: 'Function with complex initialization including external dependencies',
  init: () => {
    // Load and configure external libraries
    const axios = require('axios');
    const Redis = require('redis');
    
    // Create HTTP client with default configuration
    global.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Nimbus-Lambda/1.0.0'
      }
    });
    
    // Initialize Redis client (if Redis endpoint is available)
    if (process.env.REDIS_ENDPOINT) {
      global.redisClient = Redis.createClient({
        url: process.env.REDIS_ENDPOINT
      });
      
      global.redisClient.on('error', (err) => {
        console.error('Redis error:', err);
      });
    }
    
    // Pre-load configuration from environment
    global.serviceConfig = {
      apiBaseUrl: process.env.API_BASE_URL || 'https://api.example.com',
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      batchSize: parseInt(process.env.BATCH_SIZE || '100'),
      enableCaching: process.env.ENABLE_CACHING === 'true'
    };
    
    // Initialize metrics collection
    global.metrics = {
      invocations: 0,
      errors: 0,
      totalProcessingTime: 0
    };
    
    console.log('Complex initialization completed with config:', global.serviceConfig);
  },
  handler: async (event, context) => {
    const startTime = Date.now();
    global.metrics.invocations++;
    
    try {
      // Use pre-configured HTTP client
      const response = await global.httpClient.get('/health');
      
      // Use Redis for caching if available
      if (global.redisClient && global.serviceConfig.enableCaching) {
        await global.redisClient.set('last-health-check', JSON.stringify(response.data));
      }
      
      const processingTime = Date.now() - startTime;
      global.metrics.totalProcessingTime += processingTime;
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          health: response.data,
          metrics: global.metrics,
          processingTime,
          config: global.serviceConfig
        })
      };
    } catch (error) {
      global.metrics.errors++;
      console.error('Handler error:', error);
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Service unavailable',
          metrics: global.metrics
        })
      };
    }
  }
});

// Export the nimbus instance for CLI to deploy
export default nimbus;