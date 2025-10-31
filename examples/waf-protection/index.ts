import { Nimbus } from '@hillock-tech/nimbus-js';

const nimbus = new Nimbus();

// Create an API with comprehensive WAF protection
const api = nimbus.api({
  name: 'secure-api',
  description: 'API with WAF protection',
  stage: 'prod',
  waf: {
    enabled: true,
    // Rate limiting: max 1000 requests per 5 minutes per IP
    rateLimiting: {
      enabled: true,
      limit: 1000,
    },
    // IP blocking and allowing
    ipBlocking: {
      enabled: true,
      // Block specific malicious IPs
      blockedIPs: [
        '192.168.1.100/32',
        '10.0.0.0/8',
      ],
      // Allow only specific trusted IPs (optional whitelist)
      allowedIPs: [
        '203.0.113.0/24', // Office network
        '198.51.100.0/24', // Partner network
      ],
    },
    // Block requests from specific countries
    geoBlocking: {
      enabled: true,
      blockedCountries: ['CN', 'RU', 'KP'], // China, Russia, North Korea
    },
    // Enable AWS managed rule sets for common attacks
    sqlInjectionProtection: true,
    xssProtection: true,
  },
});

// Add routes
api.route('GET', '/', () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from protected API!',
      timestamp: new Date().toISOString(),
    }),
  };
});

api.route('POST', '/users', (event) => {
  const body = JSON.parse(event.body || '{}');
  
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'User created successfully',
      user: {
        id: Math.random().toString(36).substr(2, 9),
        name: body.name,
        email: body.email,
      },
    }),
  };
});

api.route('GET', '/health', () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'healthy',
      protected: true,
    }),
  };
});

// Export the nimbus instance for CLI to deploy
export default nimbus;