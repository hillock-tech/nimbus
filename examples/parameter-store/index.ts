import { Nimbus } from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus();

/**
 * 📋 HOW PARAMETER STORE WORKS IN LAMBDA FUNCTIONS:
 * 
 * 1. During deployment, Nimbus creates parameter placeholders in AWS Systems Manager
 * 2. The Lambda functions get IAM permissions to read these parameters
 * 3. At runtime, when you call `parameter.get()`, it uses the AWS SDK
 *    to fetch the parameter from Parameter Store
 * 4. Parameters are great for configuration that changes frequently
 * 
 * Use Parameter Store for:
 * - Application configuration
 * - Feature flags
 * - Environment-specific settings
 * - Non-sensitive operational parameters
 */

// ✅ CORRECT: Create parameter placeholders without values
// Values will be set via API calls or AWS console
const appConfig = nimbus.Parameter({
  name: '/app/config',
  description: 'Application configuration settings',
  type: 'String' // Will store JSON string
});

const featureFlags = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Feature toggle configuration',
  type: 'String'
});

const apiEndpoints = nimbus.Parameter({
  name: '/app/api-endpoints',
  description: 'External API endpoint URLs',
  type: 'String'
});

const databaseConfig = nimbus.Parameter({
  name: '/app/database-config',
  description: 'Database connection configuration (non-sensitive)',
  type: 'String'
});

// Secure parameter for sensitive config
const encryptedConfig = nimbus.Parameter({
  name: '/app/encrypted-config',
  description: 'Encrypted configuration data',
  type: 'SecureString' // Encrypted with KMS
});

// Create API for parameter management
const api = nimbus.api({
  name: 'config-demo',
  description: 'Parameter Store configuration management demonstration'
});

// ✅ ADMIN ENDPOINT: Store parameters securely (admin-only)
api.route('POST', '/admin/parameters', async (event) => {
  try {
    // Verify admin authentication
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { parameterName, parameterValue } = JSON.parse(event.body || '{}');
    
    if (!parameterName || !parameterValue) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'parameterName and parameterValue required' })
      };
    }

    // Store the parameter securely
    let parameter;
    switch (parameterName) {
      case 'app-config':
        await appConfig.updateValue(JSON.stringify(parameterValue));
        parameter = appConfig;
        break;
      case 'feature-flags':
        await featureFlags.updateValue(JSON.stringify(parameterValue));
        parameter = featureFlags;
        break;
      case 'api-endpoints':
        await apiEndpoints.updateValue(JSON.stringify(parameterValue));
        parameter = apiEndpoints;
        break;
      case 'database-config':
        await databaseConfig.updateValue(JSON.stringify(parameterValue));
        parameter = databaseConfig;
        break;
      case 'encrypted-config':
        await encryptedConfig.updateValue(JSON.stringify(parameterValue));
        parameter = encryptedConfig;
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unknown parameter name' })
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Parameter '${parameterName}' stored successfully`,
        arn: parameter.getArn()
      })
    };

  } catch (error) {
    console.error('Parameter storage error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to store parameter' })
    };
  }
});

// ✅ APPLICATION ENDPOINT: Use feature flags
api.route('GET', '/features', async (event) => {
  try {
    // ✅ CORRECT: Retrieve parameter at runtime
    const flagsJson = await featureFlags.getValue();
    
    if (!flagsJson) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Feature flags not configured',
          features: {}
        })
      };
    }
    
    const flags = JSON.parse(flagsJson);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        features: flags,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Feature flags error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve feature flags' })
    };
  }
});

// ✅ APPLICATION ENDPOINT: Dynamic behavior based on config
api.route('POST', '/process-data', async (event) => {
  try {
    const { data } = JSON.parse(event.body || '{}');
    
    // Get application configuration
    const configJson = await appConfig.getValue();
    const config = configJson ? JSON.parse(configJson) : {};
    
    // Get feature flags
    const flagsJson = await featureFlags.getValue();
    const flags = flagsJson ? JSON.parse(flagsJson) : {};
    
    // Apply configuration-driven logic
    const maxItems = config.maxItemsPerRequest || 100;
    const enableValidation = flags.enableDataValidation || false;
    const enableLogging = flags.enableDetailedLogging || false;
    
    if (enableLogging) {
      console.log(`Processing ${data?.length || 0} items with config:`, {
        maxItems,
        enableValidation
      });
    }
    
    // Validate data if feature is enabled
    if (enableValidation && (!data || !Array.isArray(data))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid data format' })
      };
    }
    
    // Apply max items limit
    const itemsToProcess = data ? data.slice(0, maxItems) : [];
    
    // Process the data
    const results = itemsToProcess.map((item: any, index: number) => ({
      id: index,
      processed: true,
      value: item,
      timestamp: new Date().toISOString()
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        processed: results.length,
        results,
        config: {
          maxItems,
          validationEnabled: enableValidation,
          loggingEnabled: enableLogging
        }
      })
    };
    
  } catch (error) {
    console.error('Data processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process data' })
    };
  }
});

// ✅ APPLICATION ENDPOINT: External API integration with dynamic endpoints
api.route('GET', '/external-data/:source', async (event) => {
  try {
    const { source } = event.pathParameters || {};
    
    // Get API endpoints configuration
    const endpointsJson = await apiEndpoints.getValue();
    
    if (!endpointsJson) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API endpoints not configured' })
      };
    }
    
    const endpoints = JSON.parse(endpointsJson);
    const apiUrl = endpoints[source];
    
    if (!apiUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: `Unknown data source: ${source}`,
          availableSources: Object.keys(endpoints)
        })
      };
    }
    
    // Fetch data from external API
    const response = await fetch(apiUrl);
    const externalData = await response.json();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        source,
        data: externalData,
        fetchedAt: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('External API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch external data' })
    };
  }
});

// ✅ APPLICATION ENDPOINT: Database connection with dynamic config
api.route('GET', '/database-status', async (event) => {
  try {
    // Get database configuration
    const dbConfigJson = await databaseConfig.getValue();
    
    if (!dbConfigJson) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database configuration not available' })
      };
    }
    
    const dbConfig = JSON.parse(dbConfigJson);
    
    // Check database connection (mock implementation)
    const connectionStatus = await checkDatabaseConnection(dbConfig);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: connectionStatus.connected ? 'connected' : 'disconnected',
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        lastChecked: new Date().toISOString(),
        responseTime: connectionStatus.responseTime
      })
    };
    
  } catch (error) {
    console.error('Database status error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to check database status' })
    };
  }
});

// ✅ PARAMETER UPDATE ENDPOINT: Update configuration without redeployment
api.route('PUT', '/admin/parameters/update', async (event) => {
  try {
    // Verify admin authentication
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { parameterName, newValue } = JSON.parse(event.body || '{}');
    
    // Update the parameter
    switch (parameterName) {
      case 'feature-flags':
        await featureFlags.updateValue(JSON.stringify(newValue));
        break;
      case 'app-config':
        await appConfig.updateValue(JSON.stringify(newValue));
        break;
      case 'api-endpoints':
        await apiEndpoints.updateValue(JSON.stringify(newValue));
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Unknown parameter name' })
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Parameter '${parameterName}' updated successfully`,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Parameter update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update parameter' })
    };
  }
});

// Helper functions
async function verifyAdminToken(authHeader: string): Promise<boolean> {
  const token = authHeader.replace('Bearer ', '');
  return token === 'admin-secret-token' || token.startsWith('admin-');
}

async function checkDatabaseConnection(config: any) {
  // Mock database connection check
  return {
    connected: true,
    responseTime: Math.floor(Math.random() * 100) + 10
  };
}

export { 
  api, 
  appConfig, 
  featureFlags, 
  apiEndpoints, 
  databaseConfig, 
  encryptedConfig 
};