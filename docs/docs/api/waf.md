# WAF (Web Application Firewall)

Protect your API Gateway with AWS WAF to defend against common web attacks and malicious traffic.

## Overview

AWS WAF helps protect your web applications from common web exploits and bots. Nimbus integrates WAF seamlessly with your API Gateway to provide:

- Rate limiting to prevent abuse
- IP blocking and whitelisting
- Geographic blocking
- Protection against SQL injection and XSS attacks
- Custom rules for specific threats

## Basic Usage

Enable WAF protection by adding the `waf` configuration to your API:

```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

const api = nimbus.api({
  name: 'protected-api',
  waf: {
    enabled: true,
    rateLimiting: {
      enabled: true,
      limit: 1000, // requests per 5 minutes per IP
    },
    sqlInjectionProtection: true,
    xssProtection: true,
  },
});
```

## Configuration Options

### Rate Limiting

Prevent abuse by limiting the number of requests per IP address:

```typescript
waf: {
  enabled: true,
  rateLimiting: {
    enabled: true,
    limit: 1000, // Maximum requests per 5-minute window per IP
  },
}
```

### IP Blocking and Whitelisting

Block malicious IPs or allow only trusted sources:

```typescript
waf: {
  enabled: true,
  ipBlocking: {
    enabled: true,
    // Block specific IPs or ranges
    blockedIPs: [
      '192.168.1.100/32',  // Single IP
      '10.0.0.0/8',        // IP range
      '172.16.0.0/12',     // Another range
    ],
    // Optional: Allow only specific IPs (whitelist)
    allowedIPs: [
      '203.0.113.0/24',    // Office network
      '198.51.100.0/24',   // Partner network
    ],
  },
}
```

**Note**: If both `blockedIPs` and `allowedIPs` are specified, allowed IPs take precedence (whitelist approach).

### Geographic Blocking

Block requests from specific countries using ISO 3166-1 alpha-2 country codes:

```typescript
waf: {
  enabled: true,
  geoBlocking: {
    enabled: true,
    blockedCountries: ['CN', 'RU', 'KP'], // China, Russia, North Korea
  },
}
```

### Managed Rule Protection

Enable AWS managed rule groups for common attack patterns:

```typescript
waf: {
  enabled: true,
  sqlInjectionProtection: true, // Protect against SQL injection
  xssProtection: true,          // Protect against XSS attacks
}
```

## Complete Example

```typescript
import { Nimbus } from 'nimbus-framework';

const nimbus = new Nimbus();

const api = nimbus.api({
  name: 'secure-api',
  description: 'API with comprehensive WAF protection',
  waf: {
    enabled: true,
    
    // Rate limiting
    rateLimiting: {
      enabled: true,
      limit: 1000, // 1000 requests per 5 minutes per IP
    },
    
    // IP management
    ipBlocking: {
      enabled: true,
      blockedIPs: [
        '192.168.1.100/32',
        '10.0.0.0/8',
      ],
      allowedIPs: [
        '203.0.113.0/24', // Office network
      ],
    },
    
    // Geographic restrictions
    geoBlocking: {
      enabled: true,
      blockedCountries: ['CN', 'RU'],
    },
    
    // Attack protection
    sqlInjectionProtection: true,
    xssProtection: true,
  },
});

// Your API routes
api.route('GET', '/', () => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Protected API endpoint' }),
}));
```

## Monitoring and Metrics

WAF provides CloudWatch metrics to monitor protection effectiveness:

### Available Metrics

- **AllowedRequests**: Number of requests that passed all rules
- **BlockedRequests**: Number of requests blocked by WAF rules
- **CountedRequests**: Number of requests that matched count-only rules

### Viewing Metrics

1. Go to AWS CloudWatch console
2. Navigate to WAF metrics
3. Select your Web ACL name
4. View request patterns and blocked attempts

### Setting Up Alarms

Create CloudWatch alarms for security monitoring:

```typescript
// Example: Alert when blocked requests exceed threshold
// (This would be done in AWS console or via CloudFormation)
```

## Rule Priority

WAF rules are evaluated in priority order:

1. **IP Allow Rules** (highest priority) - Whitelist takes precedence
2. **Rate Limiting** - Blocks excessive requests
3. **IP Block Rules** - Blocks malicious IPs
4. **Geographic Blocking** - Blocks by country
5. **SQL Injection Protection** - AWS managed rules
6. **XSS Protection** - AWS managed rules

## Cost Considerations

WAF pricing includes:

- **Web ACL**: $1.00 per month per Web ACL
- **Rules**: $0.60 per month per rule
- **Requests**: $0.60 per million requests processed

Example monthly cost for a typical configuration:
- 1 Web ACL: $1.00
- 6 rules (rate limit, IP block, geo block, 2 managed rules): $3.60
- 1M requests: $0.60
- **Total**: ~$5.20/month + request volume

## Best Practices

### 1. Start Simple
Begin with basic protection and add rules as needed:

```typescript
waf: {
  enabled: true,
  rateLimiting: { enabled: true, limit: 1000 },
  sqlInjectionProtection: true,
  xssProtection: true,
}
```

### 2. Monitor Before Blocking
Use count mode initially to understand traffic patterns before enabling blocking.

### 3. Whitelist Trusted Sources
Always configure allowed IPs for your monitoring and admin systems:

```typescript
ipBlocking: {
  enabled: true,
  allowedIPs: ['your-office-ip/32'],
}
```

### 4. Regular Review
Periodically review WAF logs and metrics to:
- Identify new attack patterns
- Adjust rate limits based on legitimate traffic
- Update IP block lists

### 5. Test Thoroughly
Test your WAF configuration to ensure:
- Legitimate traffic is not blocked
- Attack patterns are properly detected
- Rate limits are appropriate for your use case

## Limitations

- WAF rules apply to the entire API Gateway stage
- IP sets have a maximum of 10,000 IP addresses
- Rate limiting is per IP address (not per user)
- Geographic blocking is based on IP geolocation (not 100% accurate)

## Troubleshooting

### Common Issues

**Legitimate traffic being blocked:**
- Check rate limits are not too restrictive
- Verify IP whitelist includes necessary addresses
- Review geographic blocking settings

**WAF not blocking expected traffic:**
- Confirm rules are properly configured
- Check rule priorities
- Verify IP addresses are in correct CIDR format

**High costs:**
- Monitor request volume and optimize rules
- Consider using count mode for testing rules
- Review and remove unnecessary rules

### Debugging

1. **Check WAF logs** in CloudWatch
2. **Review metrics** for blocked vs allowed requests
3. **Test with curl** or Postman from different IPs
4. **Use AWS WAF console** to see real-time traffic

## Related

- [API Gateway](./api.md) - Core API functionality
- [Examples: WAF Protection](../examples/waf-protection.md) - Complete example
- [Security Best Practices](../guide/security.md) - Overall security guidance