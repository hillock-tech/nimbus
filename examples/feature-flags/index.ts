// =============================================================================
// DEPLOY CONTEXT - Infrastructure Definition
// =============================================================================

import { Nimbus } from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus();

// ✅ DEPLOY CONTEXT: Define infrastructure (no values here!)
const featureFlagsParam = nimbus.Parameter({
  name: '/app/feature-flags',
  description: 'Application feature flags configuration',
  type: 'String'
});

const appConfigParam = nimbus.Parameter({
  name: '/app/config',
  description: 'Application configuration settings',
  type: 'String'
});

const apiKeysSecret = nimbus.Secret({
  name: 'api-keys',
  description: 'External service API keys'
});

// Create API
const api = nimbus.api({
  name: 'feature-flags-demo',
  description: 'Feature flags and configuration management demo'
});

// =============================================================================
// RUNTIME CONTEXT - Lambda Function Code
// =============================================================================

// ✅ RUNTIME CONTEXT: Lambda functions use runtime helpers
api.route('GET', '/features', async (event) => {
  // Import runtime helpers inside Lambda function
  const { featureFlags } = await import('../../src/runtime');
  
  try {
    // Get all feature flags
    const flags = await featureFlags.getAll();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        features: flags,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get feature flags' })
    };
  }
});

api.route('GET', '/features/:flagName', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    const { flagName } = event.pathParameters || {};
    
    if (!flagName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Flag name required' })
      };
    }
    
    // Check if specific feature is enabled
    const isEnabled = await runtime.featureFlags.isEnabled(flagName);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        flag: flagName,
        enabled: isEnabled,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to check feature flag' })
    };
  }
});

api.route('POST', '/process-data', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    const { data } = JSON.parse(event.body || '{}');
    
    // Get configuration and feature flags using runtime helpers
    const config = await runtime.parameters.getJson('/app/config') || {};
    const useAdvancedProcessing = await runtime.featureFlags.isEnabled('advanced-processing');
    const enableLogging = await runtime.featureFlags.isEnabled('detailed-logging');
    
    if (enableLogging) {
      console.log('Processing data with config:', { config, useAdvancedProcessing });
    }
    
    // Apply feature-flag driven logic
    let results;
    if (useAdvancedProcessing) {
      // Advanced processing algorithm
      results = data?.map((item: any, index: number) => ({
        id: index,
        processed: true,
        value: item,
        enhanced: true,
        score: Math.random() * 100,
        timestamp: new Date().toISOString()
      }));
    } else {
      // Basic processing
      results = data?.map((item: any, index: number) => ({
        id: index,
        processed: true,
        value: item,
        timestamp: new Date().toISOString()
      }));
    }
    
    // Apply configuration limits
    const maxResults = config.maxResults || 100;
    const limitedResults = results?.slice(0, maxResults) || [];
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        processed: limitedResults.length,
        results: limitedResults,
        features: {
          advancedProcessing: useAdvancedProcessing,
          detailedLogging: enableLogging
        },
        config: {
          maxResults
        }
      })
    };
    
  } catch (error) {
    console.error('Processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process data' })
    };
  }
});

api.route('POST', '/external-api-call', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    // Get API keys from secrets
    const apiKeys = await runtime.secrets.getJson('api-keys');
    
    if (!apiKeys) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API keys not configured' })
      };
    }
    
    // Check if external API feature is enabled
    const externalApiEnabled = await runtime.featureFlags.isEnabled('external-api-integration');
    
    if (!externalApiEnabled) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'External API integration is disabled',
          mockData: { id: 1, name: 'Mock Response' }
        })
      };
    }
    
    // Make external API call using secret API key
    const response = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
      headers: {
        'Authorization': `Bearer ${apiKeys.external_service}`,
        'Content-Type': 'application/json'
      }
    });
    
    const externalData = await response.json();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        externalData,
        source: 'external-api',
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('External API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to call external API' })
    };
  }
});

// Admin endpoints for managing flags and config
api.route('POST', '/admin/features/:flagName', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    // Verify admin access (implement your auth logic)
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }
    
    const { flagName } = event.pathParameters || {};
    const { enabled } = JSON.parse(event.body || '{}');
    
    if (!flagName || typeof enabled !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Flag name and enabled status required' })
      };
    }
    
    // Set feature flag using runtime helper
    await runtime.featureFlags.set(flagName, enabled);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Feature flag '${flagName}' ${enabled ? 'enabled' : 'disabled'}`,
        flag: flagName,
        enabled,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Feature flag update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update feature flag' })
    };
  }
});

api.route('PUT', '/admin/config', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    // Verify admin access
    const authHeader = event.headers.Authorization;
    if (!authHeader || !await verifyAdminToken(authHeader)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }
    
    const newConfig = JSON.parse(event.body || '{}');
    
    // Update configuration using runtime helper
    await runtime.parameters.setJson('/app/config', newConfig);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Configuration updated successfully',
        config: newConfig,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Config update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update configuration' })
    };
  }
});

api.route('PUT', '/admin/secrets', async (event) => {
  const { runtime } = await import('../../src');
  
  try {
    // Verify admin access
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
        body: JSON.stringify({ error: 'Secret name and value required' })
      };
    }
    
    // Update secret using runtime helper
    await runtime.secrets.set(secretName, secretValue);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Secret '${secretName}' updated successfully`,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Secret update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update secret' })
    };
  }
});

// Helper function
async function verifyAdminToken(authHeader: string): Promise<boolean> {
  const token = authHeader.replace('Bearer ', '');
  // Implement your admin token verification logic
  return token === 'admin-secret-token' || token.startsWith('admin-');
}

export { api, featureFlagsParam, appConfigParam, apiKeysSecret };