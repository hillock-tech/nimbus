# WAF Protection Example

This example demonstrates how to protect your API Gateway with AWS WAF (Web Application Firewall) using Nimbus.

## Overview

The WAF protection example shows how to:

- Enable rate limiting to prevent abuse
- Block malicious IP addresses and ranges
- Allow only trusted IP addresses (whitelist)
- Block requests from specific countries
- Protect against SQL injection and XSS attacks

## Code

```typescript
import { Nimbus } from 'nimbus-framework';

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

export { api };
```

## Features Demonstrated

### 1. Rate Limiting
Prevents abuse by limiting requests to 1000 per 5-minute window per IP address.

### 2. IP Management
- **Blocked IPs**: Specific malicious IP addresses and ranges are blocked
- **Allowed IPs**: Optional whitelist for trusted sources (office networks, partners)

### 3. Geographic Blocking
Blocks requests from specific countries based on IP geolocation.

### 4. Attack Protection
- **SQL Injection Protection**: AWS managed rules detect and block SQL injection attempts
- **XSS Protection**: AWS managed rules detect and block cross-site scripting attacks

## Deployment

```bash
cd examples/waf-protection
npm install
npm run deploy
```

## Testing the Protection

After deployment, you can test various WAF rules:

### Rate Limiting Test
```bash
# Send multiple requests quickly to trigger rate limiting
for i in {1..50}; do
  curl -s "https://your-api-url.amazonaws.com/" &
done
wait
```

### SQL Injection Test
```bash
# Try a basic SQL injection attack (should be blocked)
curl "https://your-api-url.amazonaws.com/users?id=1' OR '1'='1"
```

### XSS Test
```bash
# Try an XSS attack (should be blocked)
curl -X POST "https://your-api-url.amazonaws.com/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(\"xss\")</script>"}'
```

## Monitoring

### CloudWatch Metrics

WAF provides several metrics in CloudWatch:

- `AllowedRequests`: Requests that passed all rules
- `BlockedRequests`: Requests blocked by WAF
- `CountedRequests`: Requests that matched count rules

### Viewing Logs

1. Go to AWS CloudWatch console
2. Navigate to Log Groups
3. Find `/aws/wafv2/webacl/secure-api-waf`
4. View detailed request logs

## Cost Breakdown

For this example configuration:

- **Web ACL**: $1.00/month
- **6 Rules**: $3.60/month (6 × $0.60)
- **Request Processing**: $0.60 per million requests

**Total Base Cost**: ~$4.60/month + request volume

## Security Benefits

### Protection Against:
- **DDoS attacks** via rate limiting
- **Malicious IPs** via IP blocking
- **Geographic threats** via country blocking
- **SQL injection** via AWS managed rules
- **XSS attacks** via AWS managed rules

### Compliance:
- Helps meet security compliance requirements
- Provides audit logs for security reviews
- Enables proactive threat detection

## Best Practices Applied

1. **Layered Security**: Multiple protection mechanisms
2. **Whitelist Approach**: Allow trusted IPs when needed
3. **Managed Rules**: Leverage AWS expertise for common attacks
4. **Monitoring**: Built-in CloudWatch integration
5. **Cost Optimization**: Balanced protection vs. cost

## Cleanup

```bash
npm run destroy
```

This removes all resources including:
- API Gateway
- Lambda functions
- WAF Web ACL and rules
- IP sets
- CloudWatch logs

## Next Steps

- Customize IP ranges for your environment
- Adjust rate limits based on your traffic patterns
- Add custom WAF rules for specific threats
- Set up CloudWatch alarms for security monitoring
- Integrate with AWS Security Hub for centralized security management

## Related Examples

- [Basic API](./basic-api.md) - Simple API without security
- [Auth API](./auth-api.md) - Authentication-based security
- [Custom Permissions](./custom-permissions.md) - IAM-based security

## Learn More

- [WAF API Reference](../api/waf.md)
- [Security Best Practices](../guide/security.md)
- [AWS WAF Documentation](https://docs.aws.amazon.com/waf/)