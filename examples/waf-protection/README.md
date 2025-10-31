# WAF Protection Example

This example demonstrates how to use Nimbus with AWS WAF (Web Application Firewall) to protect your API Gateway from common attacks and malicious traffic.

## Features Demonstrated

- **Rate Limiting**: Prevents abuse by limiting requests per IP
- **IP Blocking**: Block specific malicious IP addresses or ranges
- **IP Whitelisting**: Allow only trusted IP addresses (optional)
- **Geo Blocking**: Block requests from specific countries
- **SQL Injection Protection**: AWS managed rules to prevent SQL injection attacks
- **XSS Protection**: AWS managed rules to prevent cross-site scripting attacks

## Configuration

The WAF is configured in the API options:

```typescript
const api = nimbus.api({
  name: 'secure-api',
  waf: {
    enabled: true,
    rateLimiting: {
      enabled: true,
      limit: 1000, // requests per 5 minutes per IP
    },
    ipBlocking: {
      enabled: true,
      blockedIPs: ['192.168.1.100/32', '10.0.0.0/8'],
      allowedIPs: ['203.0.113.0/24'], // optional whitelist
    },
    geoBlocking: {
      enabled: true,
      blockedCountries: ['CN', 'RU', 'KP'],
    },
    sqlInjectionProtection: true,
    xssProtection: true,
  },
});
```

## Deployment

```bash
npm run deploy
```

## Testing WAF Rules

After deployment, you can test the WAF rules:

1. **Rate Limiting**: Send many requests quickly to trigger rate limiting
2. **IP Blocking**: Try accessing from a blocked IP (if configured)
3. **Geo Blocking**: Use a VPN to access from a blocked country
4. **SQL Injection**: Try sending malicious SQL in request parameters
5. **XSS**: Try sending malicious scripts in request data

## Monitoring

WAF provides CloudWatch metrics for monitoring:

- `AllowedRequests`: Number of allowed requests
- `BlockedRequests`: Number of blocked requests
- `CountedRequests`: Number of counted requests (for count actions)

You can view these metrics in the AWS CloudWatch console under the WAF section.

## Cost Considerations

WAF pricing includes:

- Web ACL: $1.00 per month per Web ACL
- Rules: $0.60 per month per rule
- Requests: $0.60 per million requests processed

For this example with 6 rules, the monthly cost would be approximately:
- Web ACL: $1.00
- Rules: $3.60 (6 rules × $0.60)
- Plus request processing costs

## Cleanup

```bash
npm run destroy
```

This will remove the API Gateway, Lambda functions, and WAF resources.