/**
 * Custom Domain Example
 * 
 * This example demonstrates how to set up a custom domain for your API Gateway.
 * It will automatically handle ACM certificate creation with DNS validation.
 * 
 * Prerequisites:
 * - You must own the domain you're using
 * - You must have access to modify DNS records for the domain
 * 
 * Flow:
 * 1. Nimbus checks for existing ACM certificate
 * 2. If not found, requests a new certificate with DNS validation
 * 3. Displays DNS records you need to add to your domain
 * 4. Waits for you to confirm DNS records are added
 * 5. Waits for certificate validation
 * 6. Creates custom domain in API Gateway
 * 7. Maps the domain to your API
 */

import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'custom-domain-demo',
  region: 'us-east-1',
});

// Create API with custom domain
// IMPORTANT: Replace 'api.example.com' with your actual domain
const api = app.API({
  name: 'custom-domain-api',
  description: 'API with custom domain',
  stage: 'prod',
  customDomain: 'api.example.com', // Replace with your domain
});

// Add a simple hello route
api.route('GET', '/hello', async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      message: 'Hello from custom domain!',
      timestamp: new Date().toISOString(),
    }),
  };
});

// Add a health check route
api.route('GET', '/health', async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ 
      status: 'healthy',
      service: 'custom-domain-api',
    }),
  };
});

// Deploy
app.deploy().then(() => {
  console.log('\n🎉 Deployment complete!');
  console.log(`\nYour API is now available at your custom domain!`);
  console.log(`\nTest your endpoints:`);
  console.log(`  curl https://api.example.com/hello`);
  console.log(`  curl https://api.example.com/health`);
  console.log(`\nNote: You may need to add an A or CNAME record pointing`);
  console.log(`      your domain to the API Gateway endpoint.`);
});
