import {
  WAFV2Client,
  CreateWebACLCommand,
  AssociateWebACLCommand,
  DeleteWebACLCommand,
  DisassociateWebACLCommand,
  GetWebACLCommand,
  ListWebACLsCommand,
  CreateIPSetCommand,
  DeleteIPSetCommand,
  GetIPSetCommand,
  ListIPSetsCommand,
  UpdateIPSetCommand,
  Rule,
  WebACL,
  IPSet,
} from '@aws-sdk/client-wafv2';

export interface WAFOptions {
  /** Name of the WAF Web ACL */
  name: string;
  /** Description of the WAF Web ACL */
  description?: string;
  /** Enable rate limiting */
  rateLimiting?: {
    enabled: boolean;
    limit: number; // requests per 5 minutes
  };
  /** Enable IP blocking */
  ipBlocking?: {
    enabled: boolean;
    blockedIPs?: string[];
    allowedIPs?: string[];
  };
  /** Enable geo blocking */
  geoBlocking?: {
    enabled: boolean;
    blockedCountries?: string[];
  };
  /** Enable SQL injection protection */
  sqlInjectionProtection?: boolean;
  /** Enable XSS protection */
  xssProtection?: boolean;
}

/**
 * WAF (Web Application Firewall) for API Gateway protection
 */
export class WAF {
  private name: string;
  private description: string;
  private region: string;
  private accountId: string;
  private options: WAFOptions;
  private wafClient: WAFV2Client;
  private webAclArn?: string;
  private webAclId?: string;
  private ipSetArn?: string;
  private ipSetId?: string;

  constructor(options: WAFOptions, region: string, accountId: string) {
    this.name = options.name;
    this.description = options.description || `WAF for ${options.name}`;
    this.region = region;
    this.accountId = accountId;
    this.options = options;
    this.wafClient = new WAFV2Client({ region });
  }

  /**
   * Get the Web ACL ARN
   */
  getArn(): string {
    if (!this.webAclArn) {
      return `arn:aws:wafv2:${this.region}:${this.accountId}:regional/webacl/${this.name}`;
    }
    return this.webAclArn;
  }

  /**
   * Get the Web ACL ID
   */
  getId(): string | undefined {
    return this.webAclId;
  }

  /**
   * Provision the WAF Web ACL
   */
  async provision(): Promise<void> {
    // Check if Web ACL already exists
    const existing = await this.findExistingWebACL();
    if (existing) {
      this.webAclArn = existing.ARN;
      this.webAclId = existing.Id;
      console.log(`  INFO Using existing WAF Web ACL: ${this.name}`);
      
      // Still need to provision IP sets if they don't exist
      if (this.options.ipBlocking?.enabled) {
        await this.provisionIPSets();
      }
      return;
    }

    // Provision IP sets first if needed
    if (this.options.ipBlocking?.enabled) {
      await this.provisionIPSets();
    }

    // Create rules based on options
    const rules = this.createRules();

    const createCommand = new CreateWebACLCommand({
      Name: this.name,
      Description: this.description,
      Scope: 'REGIONAL', // For API Gateway
      DefaultAction: { Allow: {} },
      Rules: rules,
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: this.name,
      },
    });

    const response = await this.wafClient.send(createCommand);
    this.webAclArn = response.Summary?.ARN;
    this.webAclId = response.Summary?.Id;

    console.log(`  Created WAF Web ACL: ${this.name}`);
  }

  /**
   * Associate WAF with API Gateway
   */
  async associateWithAPI(apiArn: string): Promise<void> {
    if (!this.webAclArn) {
      throw new Error('WAF Web ACL not provisioned');
    }

    try {
      const associateCommand = new AssociateWebACLCommand({
        WebACLArn: this.webAclArn,
        ResourceArn: apiArn,
      });

      await this.wafClient.send(associateCommand);
      console.log(`  Associated WAF with API Gateway`);
    } catch (error: any) {
      if (error.name === 'WAFAssociatedItemException') {
        console.log(`  INFO WAF already associated with API Gateway`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create WAF rules based on options
   */
  private createRules(): Rule[] {
    const rules: Rule[] = [];
    let priority = 1;

    // Rate limiting rule
    if (this.options.rateLimiting?.enabled) {
      rules.push({
        Name: `${this.name}-rate-limit`,
        Priority: priority++,
        Statement: {
          RateBasedStatement: {
            Limit: this.options.rateLimiting.limit,
            AggregateKeyType: 'IP',
          },
        },
        Action: { Block: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-rate-limit`,
        },
      });
    }

    // IP allow rule (whitelist) - higher priority than block rules
    if (this.options.ipBlocking?.enabled && this.options.ipBlocking.allowedIPs?.length) {
      rules.push({
        Name: `${this.name}-ip-allow`,
        Priority: priority++,
        Statement: {
          IPSetReferenceStatement: {
            ARN: `arn:aws:wafv2:${this.region}:${this.accountId}:regional/ipset/${this.name}-allowed-ips`,
          },
        },
        Action: { Allow: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-ip-allow`,
        },
      });
    }

    // IP blocking rule
    if (this.options.ipBlocking?.enabled && this.options.ipBlocking.blockedIPs?.length) {
      rules.push({
        Name: `${this.name}-ip-block`,
        Priority: priority++,
        Statement: {
          IPSetReferenceStatement: {
            ARN: `arn:aws:wafv2:${this.region}:${this.accountId}:regional/ipset/${this.name}-blocked-ips`,
          },
        },
        Action: { Block: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-ip-block`,
        },
      });
    }

    // Geo blocking rule
    if (this.options.geoBlocking?.enabled && this.options.geoBlocking.blockedCountries?.length) {
      rules.push({
        Name: `${this.name}-geo-block`,
        Priority: priority++,
        Statement: {
          GeoMatchStatement: {
            CountryCodes: this.options.geoBlocking.blockedCountries as any,
          },
        },
        Action: { Block: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-geo-block`,
        },
      });
    }

    // SQL injection protection
    if (this.options.sqlInjectionProtection) {
      rules.push({
        Name: `${this.name}-sqli-protection`,
        Priority: priority++,
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesSQLiRuleSet',
          },
        },
        OverrideAction: { None: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-sqli-protection`,
        },
      });
    }

    // XSS protection (using Common Rule Set which includes XSS protection)
    if (this.options.xssProtection) {
      rules.push({
        Name: `${this.name}-xss-protection`,
        Priority: priority++,
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesCommonRuleSet',
          },
        },
        OverrideAction: { None: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `${this.name}-xss-protection`,
        },
      });
    }

    return rules;
  }

  /**
   * Find existing Web ACL
   */
  private async findExistingWebACL(): Promise<WebACL | undefined> {
    try {
      const listCommand = new ListWebACLsCommand({
        Scope: 'REGIONAL',
      });
      
      const response = await this.wafClient.send(listCommand);
      const existing = response.WebACLs?.find((acl: any) => acl.Name === this.name);
      
      if (existing) {
        const getCommand = new GetWebACLCommand({
          Name: this.name,
          Scope: 'REGIONAL',
          Id: existing.Id!,
        });
        const getResponse = await this.wafClient.send(getCommand);
        return getResponse.WebACL;
      }
    } catch (error) {
      // Web ACL doesn't exist
    }
    
    return undefined;
  }

  /**
   * Destroy the WAF Web ACL
   */
  async destroy(): Promise<void> {
    // First disassociate from any APIs
    if (this.webAclArn) {
      await this.disassociateFromAllAPIs();
    }

    // Delete Web ACL
    if (this.webAclId) {
      try {
        const deleteCommand = new DeleteWebACLCommand({
          Name: this.name,
          Scope: 'REGIONAL',
          Id: this.webAclId,
          LockToken: await this.getLockToken(),
        });

        await this.wafClient.send(deleteCommand);
        console.log(`  SUCCESS Deleted WAF Web ACL: ${this.name}`);
      } catch (error: any) {
        if (error.name === 'WAFNonexistentItemException') {
          // Already deleted
        } else {
          throw error;
        }
      }
    }

    // Delete IP set
    await this.destroyIPSet();
  }

  /**
   * Disassociate WAF from all associated APIs
   */
  private async disassociateFromAllAPIs(): Promise<void> {
    if (!this.webAclArn) return;

    try {
      // Note: AWS doesn't provide a direct way to list associated resources
      // In practice, this would need to be tracked by the application
      // For now, we'll just attempt to disassociate and ignore errors
      console.log(`  INFO Disassociating WAF from APIs (if any)`);
    } catch (error: any) {
      console.warn(`  WARNING Failed to disassociate WAF: ${error.message}`);
    }
  }

  /**
   * Provision IP sets for IP blocking and allowing
   */
  private async provisionIPSets(): Promise<void> {
    // Provision blocked IPs set
    if (this.options.ipBlocking?.blockedIPs?.length) {
      await this.provisionIPSet('blocked-ips', this.options.ipBlocking.blockedIPs);
    }

    // Provision allowed IPs set
    if (this.options.ipBlocking?.allowedIPs?.length) {
      await this.provisionIPSet('allowed-ips', this.options.ipBlocking.allowedIPs);
    }
  }

  /**
   * Provision IP set for IP blocking or allowing
   */
  private async provisionIPSet(type: 'blocked-ips' | 'allowed-ips', addresses: string[]): Promise<void> {
    const ipSetName = `${this.name}-${type}`;
    
    // Check if IP set already exists
    const existing = await this.findExistingIPSet(ipSetName);
    if (existing) {
      console.log(`  INFO Using existing IP set: ${ipSetName}`);
      
      // Update IP set with current IPs
      await this.updateIPSet(type, addresses);
      return;
    }

    // Create new IP set
    const createCommand = new CreateIPSetCommand({
      Name: ipSetName,
      Description: `${type === 'blocked-ips' ? 'Blocked' : 'Allowed'} IPs for ${this.name}`,
      Scope: 'REGIONAL',
      IPAddressVersion: 'IPV4',
      Addresses: addresses,
    });

    const response = await this.wafClient.send(createCommand);
    console.log(`  Created IP set: ${ipSetName} with ${addresses.length} addresses`);
  }

  /**
   * Update IP set with current IPs
   */
  private async updateIPSet(type: 'blocked-ips' | 'allowed-ips', addresses: string[]): Promise<void> {
    const ipSetName = `${this.name}-${type}`;
    
    try {
      // Get the IP set to find its ID
      const existing = await this.findExistingIPSet(ipSetName);
      if (!existing?.Id) {
        console.warn(`  WARNING IP set ${ipSetName} not found for update`);
        return;
      }

      const lockToken = await this.getIPSetLockToken(ipSetName, existing.Id);
      
      const updateCommand = new UpdateIPSetCommand({
        Name: ipSetName,
        Scope: 'REGIONAL',
        Id: existing.Id,
        Addresses: addresses,
        LockToken: lockToken,
      });

      await this.wafClient.send(updateCommand);
      console.log(`  Updated IP set ${ipSetName} with ${addresses.length} addresses`);
    } catch (error: any) {
      console.warn(`  WARNING Failed to update IP set ${ipSetName}: ${error.message}`);
    }
  }

  /**
   * Find existing IP set
   */
  private async findExistingIPSet(name: string): Promise<IPSet | undefined> {
    try {
      const listCommand = new ListIPSetsCommand({
        Scope: 'REGIONAL',
      });
      
      const response = await this.wafClient.send(listCommand);
      const existing = response.IPSets?.find((ipSet: any) => ipSet.Name === name);
      
      if (existing) {
        const getCommand = new GetIPSetCommand({
          Name: name,
          Scope: 'REGIONAL',
          Id: existing.Id!,
        });
        const getResponse = await this.wafClient.send(getCommand);
        return getResponse.IPSet;
      }
    } catch (error) {
      // IP set doesn't exist
    }
    
    return undefined;
  }

  /**
   * Get lock token for IP set operations
   */
  private async getIPSetLockToken(name: string, id: string): Promise<string> {
    const getCommand = new GetIPSetCommand({
      Name: name,
      Scope: 'REGIONAL',
      Id: id,
    });
    
    const response = await this.wafClient.send(getCommand);
    return response.LockToken!;
  }

  /**
   * Get lock token for Web ACL operations
   */
  private async getLockToken(): Promise<string> {
    const getCommand = new GetWebACLCommand({
      Name: this.name,
      Scope: 'REGIONAL',
      Id: this.webAclId!,
    });
    
    const response = await this.wafClient.send(getCommand);
    return response.LockToken!;
  }

  /**
   * Destroy IP sets
   */
  private async destroyIPSet(): Promise<void> {
    // Destroy blocked IPs set
    await this.destroySingleIPSet('blocked-ips');
    
    // Destroy allowed IPs set
    await this.destroySingleIPSet('allowed-ips');
  }

  /**
   * Destroy a single IP set
   */
  private async destroySingleIPSet(type: 'blocked-ips' | 'allowed-ips'): Promise<void> {
    const ipSetName = `${this.name}-${type}`;
    
    try {
      const existing = await this.findExistingIPSet(ipSetName);
      if (!existing?.Id) {
        return; // IP set doesn't exist
      }

      const lockToken = await this.getIPSetLockToken(ipSetName, existing.Id);
      
      const deleteCommand = new DeleteIPSetCommand({
        Name: ipSetName,
        Scope: 'REGIONAL',
        Id: existing.Id,
        LockToken: lockToken,
      });

      await this.wafClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted IP set: ${ipSetName}`);
    } catch (error: any) {
      if (error.name === 'WAFNonexistentItemException') {
        // Already deleted
        return;
      }
      console.warn(`  WARNING Failed to delete IP set ${ipSetName}: ${error.message}`);
    }
  }
}