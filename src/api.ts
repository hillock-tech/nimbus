import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  GetRestApisCommand,
  GetMethodCommand,
  CreateResourceCommand,
  DeleteRestApiCommand,
  PutMethodCommand,
  PutMethodResponseCommand,
  PutIntegrationCommand,
  PutIntegrationResponseCommand,
  CreateDeploymentCommand,
  CreateDomainNameCommand,
  GetDomainNameCommand,
  GetDomainNamesCommand,
  CreateBasePathMappingCommand,
  DeleteBasePathMappingCommand,
  GetBasePathMappingsCommand,
  CreateAuthorizerCommand,
  GetAuthorizersCommand,
  UpdateStageCommand,
  IntegrationType,
} from '@aws-sdk/client-api-gateway';
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from '@aws-sdk/client-acm';
import { NimbusFunction } from './function';
import { Role } from './role';
import { APIOptions, RouteConfig, AuthorizerConfig, HttpMethod, LambdaHandler, PolicyStatement } from './types-v2';
import * as readline from 'readline';

/**
 * Nimbus.API - API Gateway with automatic Lambda integration
 */
export class API {
  private name: string;
  private description?: string;
  private stage: string;
  private customDomain?: string;
  private region: string;
  private accountId: string;
  private routes: RouteConfig[];
  private authorizers: AuthorizerConfig[];
  private authorizerIds: Map<string, string> = new Map();
  private functions: Map<string, NimbusFunction> = new Map();
  private apiGatewayClient: APIGatewayClient;
  private acmClient: ACMClient;
  private apiId?: string;
  private rootResourceId?: string;
  private url?: string;
  private regionalDomainName?: string;
  private certificateArn?: string;
  private tracing: boolean;

  constructor(
    options: APIOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.description = options.description;
    this.stage = options.stage || 'dev';
    this.customDomain = options.customDomain;
    this.region = region;
    this.accountId = accountId;
    this.routes = options.routes || [];
    this.authorizers = options.authorizers || [];
    this.tracing = options.tracing || false;
    
    this.apiGatewayClient = new APIGatewayClient({ region });
    this.acmClient = new ACMClient({ region: 'us-east-1' }); // ACM for API Gateway must be in us-east-1
  }

  /**
   * Add a route to the API
   */
  route(
    method: HttpMethod,
    path: string,
    handler: LambdaHandler | string,
    options?: { cors?: boolean; authorizer?: string; permissions?: PolicyStatement[] }
  ): this {
    this.routes.push({
      method,
      path,
      handler,
      cors: options?.cors,
      authorizationType: options?.authorizer ? 'CUSTOM' : 'NONE',
      authorizerId: options?.authorizer,
      permissions: options?.permissions,
    });
    return this;
  }

  /**
   * Add an authorizer to the API
   */
  authorizer(config: AuthorizerConfig): this {
    this.authorizers.push(config);
    return this;
  }

  /**
   * Set account ID (called after resolution)
   */
  setAccountId(accountId: string): void {
    this.accountId = accountId;
  }

  /**
   * Get all functions used by this API
   */
  getFunctions(): NimbusFunction[] {
    return Array.from(this.functions.values());
  }

  /**
   * Create functions from routes
   */
  createFunctions(): void {
    // Create route handler functions
    for (const route of this.routes) {
      const functionName = this.generateFunctionName(route.method, route.path);
      
      if (!this.functions.has(functionName)) {
        const func = new NimbusFunction(
          {
            name: functionName,
            handler: route.handler,
            timeout: 30,
            memorySize: 128,
            permissions: route.permissions,
            tracing: this.tracing,
          },
          this.region,
          this.accountId
        );

        this.functions.set(functionName, func);
      }
    }

    // Create authorizer functions
    for (const authorizer of this.authorizers) {
      const functionName = `${this.name}-authorizer-${authorizer.name}`;
      
      if (!this.functions.has(functionName)) {
        const func = new NimbusFunction(
          {
            name: functionName,
            handler: authorizer.handler,
            timeout: 30,
            memorySize: 128,
            tracing: this.tracing,
          },
          this.region,
          this.accountId
        );

        this.functions.set(functionName, func);
      }
    }
  }

  /**
   * Generate function name from method and path
   */
  private generateFunctionName(method: HttpMethod, path: string): string {
    const sanitizedPath = path
      .replace(/^\//, '')
      .replace(/\//g, '-')
      .replace(/\{([^}]+)\}/g, '$1')  // Handle {id} syntax
      .replace(/:([^\/]+)/g, '$1')    // Handle :id syntax
      .toLowerCase();
    
    return `${this.name}-${method.toLowerCase()}-${sanitizedPath || 'root'}`;
  }

  /**
   * Provision the API Gateway
   */
  async provision(role: Role): Promise<void> {
    // Ensure functions are created
    this.createFunctions();

    // Check if API already exists
    const existingApi = await this.findExistingApi();
    
    if (existingApi) {
      console.log(`  INFO  API "${this.name}" already exists (${existingApi.id}), updating...`);
      this.apiId = existingApi.id;
      this.rootResourceId = await this.getRootResourceId();
    } else {
      // Create REST API
      const createApiCommand = new CreateRestApiCommand({
        name: this.name,
        description: this.description || `API managed by Nimbus`,
        endpointConfiguration: {
          types: ['REGIONAL'],
        },
      });

      const apiResponse = await this.apiGatewayClient.send(createApiCommand);
      this.apiId = apiResponse.id!;
      this.rootResourceId = await this.getRootResourceId();
    }

    // Provision all functions first
    const roleArn = role.getArn();
    await Promise.all(
      this.getFunctions().map(func => func.provision(roleArn))
    );

    // Create authorizers
    await this.provisionAuthorizers();

    // Create resources and methods for each route
    const resourceMap = await this.buildResourceMap();

    for (const route of this.routes) {
      await this.provisionRoute(route, resourceMap);
    }

    // Deploy the API
    await this.deployApi();
    
    // Set up custom domain if specified
    if (this.customDomain) {
      await this.setupCustomDomain();
      this.url = `https://${this.customDomain}`;
    } else {
      this.url = `https://${this.apiId}.execute-api.${this.region}.amazonaws.com/${this.stage}`;
    }

  }

  /**
   * Set up custom domain with ACM certificate
   */
  private async setupCustomDomain(): Promise<void> {
    if (!this.customDomain) return;

    console.log(`\n🌐 Setting up custom domain: ${this.customDomain}`);

    // Clean up any old base path mappings for this API (in case domain changed)
    await this.cleanupOldBasePathMappings();

    // Step 1: Check for existing or create ACM certificate
    this.certificateArn = await this.findOrCreateCertificate(this.customDomain);

    // Step 2: Wait for certificate validation
    await this.waitForCertificateValidation(this.certificateArn);

    // Step 3: Create or update custom domain in API Gateway
    await this.createOrUpdateDomainName();

    // Step 4: Create base path mapping
    await this.createBasePathMapping();
    
    // Step 5: Display DNS instructions for pointing domain to API Gateway
    await this.displayDomainMappingInstructions();
  }

  /**
   * Clean up old base path mappings for this API (in case custom domain changed)
   */
  private async cleanupOldBasePathMappings(): Promise<void> {
    if (!this.apiId) return;

    try {
      const getDomainsCommand = new GetDomainNamesCommand({});
      const domainsResponse = await this.apiGatewayClient.send(getDomainsCommand);
      
      if (domainsResponse.items) {
        for (const domain of domainsResponse.items) {
          // Skip the current custom domain - we want to keep/update that mapping
          if (domain.domainName === this.customDomain) continue;
          
          if (domain.domainName) {
            try {
              const getMappingsCommand = new GetBasePathMappingsCommand({
                domainName: domain.domainName,
              });
              const mappingsResponse = await this.apiGatewayClient.send(getMappingsCommand);
              
              if (mappingsResponse.items) {
                for (const mapping of mappingsResponse.items) {
                  if (mapping.restApiId === this.apiId) {
                    const deleteMappingCommand = new DeleteBasePathMappingCommand({
                      domainName: domain.domainName,
                      basePath: mapping.basePath || '(none)',
                    });
                    await this.apiGatewayClient.send(deleteMappingCommand);
                    console.log(`  SUCCESS Removed old base path mapping from: ${domain.domainName}`);
                  }
                }
              }
            } catch (error: any) {
              // Ignore errors for individual domains
              if (error.name !== 'NotFoundException') {
                console.warn(`  WARNING Failed to check mappings for ${domain.domainName}`);
              }
            }
          }
        }
      }
    } catch (error: any) {
      // Don't fail the whole operation if cleanup fails
      console.warn(`  WARNING Failed to cleanup old base path mappings: ${error.message}`);
    }
  }

  /**
   * Display instructions for mapping custom domain to API Gateway
   */
  private async displayDomainMappingInstructions(): Promise<void> {
    // Get the domain details to find the regional domain name
    const getCommand = new GetDomainNameCommand({
      domainName: this.customDomain!,
    });
    const response = await this.apiGatewayClient.send(getCommand);
    
    // Save the regional domain name for use in getDefaultUrl()
    this.regionalDomainName = response.regionalDomainName;
    const regionalHostedZoneId = response.regionalHostedZoneId;
    
    console.log(`\n  📋 DNS Configuration for Custom Domain:`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  Add this DNS record to point your domain to API Gateway:\n`);
    console.log(`  Domain: ${this.customDomain}`);
    console.log(`  Type:   A (Alias) or CNAME`);
    console.log(`  Value:  ${this.regionalDomainName}`);
    
    if (regionalHostedZoneId) {
      console.log(`\n  For Route53 Alias record:`);
      console.log(`  Hosted Zone ID: ${regionalHostedZoneId}`);
    }
    
    console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  WARNING: Your API won't be accessible at ${this.customDomain} until`);
    console.log(`      you add this DNS record to your domain provider.`);
    console.log(`\n  Custom domain setup complete!\n`);
  }

  /**
   * Find existing certificate or create new one
   */
  private async findOrCreateCertificate(domain: string): Promise<string> {
    // Check for existing certificate
    const listCommand = new ListCertificatesCommand({});
    const response = await this.acmClient.send(listCommand);

    if (response.CertificateSummaryList) {
      for (const cert of response.CertificateSummaryList) {
        if (cert.DomainName === domain && cert.CertificateArn) {
          console.log(`  SUCCESS Found existing certificate: ${cert.CertificateArn}`);
          
          // Check if certificate is still pending validation
          const describeCommand = new DescribeCertificateCommand({
            CertificateArn: cert.CertificateArn,
          });
          const certDetails = await this.acmClient.send(describeCommand);
          
          if (certDetails.Certificate?.Status === 'PENDING_VALIDATION') {
            console.log(`  INFO  Certificate is pending DNS validation`);
            await this.displayValidationRecords(cert.CertificateArn);
          }
          
          return cert.CertificateArn;
        }
      }
    }

    // Create new certificate
    console.log(`  📜 Requesting new ACM certificate for ${domain}...`);
    const requestCommand = new RequestCertificateCommand({
      DomainName: domain,
      ValidationMethod: 'DNS',
    });

    const certResponse = await this.acmClient.send(requestCommand);
    const certArn = certResponse.CertificateArn!;

    console.log(`  SUCCESS Certificate requested: ${certArn}`);

    // Get validation records
    await this.displayValidationRecords(certArn);

    return certArn;
  }

  /**
   * Display DNS validation records and wait for user confirmation
   */
  private async displayValidationRecords(certificateArn: string): Promise<void> {
    // Wait for validation records to be generated (can take up to 30 seconds)
    let attempts = 0;
    let validationRecords = null;
    
    while (attempts < 15 && !validationRecords) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const describeCommand = new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      });
      const response = await this.acmClient.send(describeCommand);

      if (response.Certificate?.DomainValidationOptions) {
        // Check if any validation option has a resource record
        for (const validation of response.Certificate.DomainValidationOptions) {
          if (validation.ResourceRecord) {
            validationRecords = response.Certificate.DomainValidationOptions;
            break;
          }
        }
      }
      
      attempts++;
    }

    if (!validationRecords) {
      throw new Error('Failed to retrieve DNS validation records from ACM');
    }

    console.log(`\n  📋 DNS Validation Records:`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    for (const validation of validationRecords) {
      if (validation.ResourceRecord) {
        console.log(`\n  Domain: ${validation.DomainName}`);
        console.log(`  Type:   ${validation.ResourceRecord.Type}`);
        console.log(`  Name:   ${validation.ResourceRecord.Name}`);
        console.log(`  Value:  ${validation.ResourceRecord.Value}`);
      }
    }

    console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  WARNING: Add the above DNS records to your domain's DNS settings.`);

    // Wait for user to press Enter
    await this.waitForUserInput();
  }

  /**
   * Wait for user to press Enter
   */
  private async waitForUserInput(): Promise<void> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('\n  Press Enter to continue once the DNS records are added... ', () => {
        rl.close();
        resolve();
      });
    });
  }

  /**
   * Wait for certificate to be validated
   */
  private async waitForCertificateValidation(certificateArn: string): Promise<void> {
    console.log(`\n  WAITING Waiting for certificate validation...`);

    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max

    while (attempts < maxAttempts) {
      const describeCommand = new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      });
      const response = await this.acmClient.send(describeCommand);

      if (response.Certificate?.Status === 'ISSUED') {
        console.log(`  SUCCESS Certificate validated and issued!`);
        return;
      }

      if (response.Certificate?.Status === 'FAILED') {
        throw new Error(`Certificate validation failed: ${response.Certificate.FailureReason}`);
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
      attempts++;
    }

    throw new Error('Certificate validation timed out after 10 minutes');
  }

  /**
   * Create or update custom domain name in API Gateway
   */
  private async createOrUpdateDomainName(): Promise<void> {
    try {
      // Check if domain already exists
      const getCommand = new GetDomainNameCommand({
        domainName: this.customDomain!,
      });
      await this.apiGatewayClient.send(getCommand);
      console.log(`  SUCCESS Custom domain already exists`);
    } catch (error: any) {
      if (error.name === 'NotFoundException') {
        // Create new domain
        const createCommand = new CreateDomainNameCommand({
          domainName: this.customDomain!,
          regionalCertificateArn: this.certificateArn,
          endpointConfiguration: {
            types: ['REGIONAL'],
          },
        });
        await this.apiGatewayClient.send(createCommand);
        console.log(`  SUCCESS Custom domain created`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create base path mapping
   */
  private async createBasePathMapping(): Promise<void> {
    try {
      const command = new CreateBasePathMappingCommand({
        domainName: this.customDomain!,
        restApiId: this.apiId!,
        stage: this.stage,
        basePath: '', // Empty string for root path
      });
      await this.apiGatewayClient.send(command);
      console.log(`  SUCCESS Base path mapping created`);
    } catch (error: any) {
      if (error.name === 'ConflictException') {
        console.log(`  INFO  Base path mapping already exists`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get root resource ID
   */
  private async getRootResourceId(): Promise<string> {
    const command = new GetResourcesCommand({ restApiId: this.apiId });
    const response = await this.apiGatewayClient.send(command);
    const rootResource = response.items?.find((item: any) => item.path === '/');
    
    if (!rootResource?.id) {
      throw new Error('Root resource not found');
    }
    
    return rootResource.id;
  }

  /**
   * Build a map of existing resources for idempotent updates
   */
  private async buildResourceMap(): Promise<Map<string, string>> {
    const resourceMap = new Map<string, string>();
    
    const command = new GetResourcesCommand({ restApiId: this.apiId });
    const response = await this.apiGatewayClient.send(command);
    
    if (response.items) {
      for (const item of response.items) {
        if (item.path && item.id) {
          resourceMap.set(item.path, item.id);
        }
      }
    }
    
    return resourceMap;
  }

  /**
   * Find existing API by name
   */
  private async findExistingApi(): Promise<{ id: string; name: string } | null> {
    try {
      const command = new GetRestApisCommand({ limit: 500 });
      const response = await this.apiGatewayClient.send(command);
      
      const api = response.items?.find(item => item.name === this.name);
      
      if (api && api.id && api.name) {
        return { id: api.id, name: api.name };
      }
      
      return null;
    } catch (error) {
      console.warn('Error checking for existing API:', error);
      return null;
    }
  }

  /**
   * Provision API Gateway authorizers
   */
  private async provisionAuthorizers(): Promise<void> {
    if (this.authorizers.length === 0) return;

    // Get existing authorizers
    const getAuthorizersCommand = new GetAuthorizersCommand({
      restApiId: this.apiId,
    });

    let existingAuthorizers: any[] = [];
    try {
      const response = await this.apiGatewayClient.send(getAuthorizersCommand);
      existingAuthorizers = response.items || [];
    } catch (error) {
      // No authorizers exist yet
    }

    for (const authorizer of this.authorizers) {
      // Check if authorizer already exists
      const existing = existingAuthorizers.find(a => a.name === authorizer.name);
      if (existing) {
        this.authorizerIds.set(authorizer.name, existing.id);
        console.log(`  INFO  Authorizer "${authorizer.name}" already exists`);
        continue;
      }

      const functionName = `${this.name}-authorizer-${authorizer.name}`;
      const func = this.functions.get(functionName)!;
      const functionArn = func.getArn();

      const createAuthorizerCommand = new CreateAuthorizerCommand({
        restApiId: this.apiId,
        name: authorizer.name,
        type: authorizer.type,
        authorizerUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`,
        authorizerResultTtlInSeconds: authorizer.authorizerResultTtlInSeconds || 300,
        identitySource: authorizer.identitySource || 'method.request.header.Authorization',
      });

      const response = await this.apiGatewayClient.send(createAuthorizerCommand);
      this.authorizerIds.set(authorizer.name, response.id!);

      // Add API Gateway permission to invoke the authorizer lambda
      const sourceArn = `arn:aws:execute-api:${this.region}:${this.accountId}:${this.apiId}/authorizers/*`;
      await func.addApiGatewayPermission(this.apiId!, sourceArn);

      console.log(`  Created authorizer: ${authorizer.name}`);
    }
  }

  /**
   * Provision a single route
   */
  private async provisionRoute(
    route: RouteConfig,
    resourceMap: Map<string, string>
  ): Promise<void> {
    const resourceId = await this.getOrCreateResource(route.path, resourceMap);
    const functionName = this.generateFunctionName(route.method, route.path);
    const func = this.functions.get(functionName)!;
    const functionArn = func.getArn();

    // Log the endpoint mapping
    console.log(`  ${route.method} ${route.path} → ${func.getName()}`);

    // Get authorizer ID if route uses one
    const authorizerId = route.authorizerId ? this.authorizerIds.get(route.authorizerId) : undefined;

    // Create method
    await this.createMethod(
      resourceId,
      route.method,
      route.authorizationType || 'NONE',
      authorizerId
    );

    // Create method response
    await this.createMethodResponse(resourceId, route.method);

    // Create Lambda integration
    await this.createLambdaIntegration(resourceId, route.method, functionArn);

    // Create integration response
    await this.createIntegrationResponse(resourceId, route.method);

    // Add API Gateway permission
    const sourceArn = `arn:aws:execute-api:${this.region}:${this.accountId}:${this.apiId}/*/${route.method}${route.path}`;
    await func.addApiGatewayPermission(this.apiId!, sourceArn);

    // Enable CORS if requested
    if (route.cors) {
      await this.enableCors(resourceId, route.method);
    }
  }

  /**
   * Get or create a resource for a path
   */
  private async getOrCreateResource(
    path: string,
    resourceMap: Map<string, string>
  ): Promise<string> {
    if (resourceMap.has(path)) {
      return resourceMap.get(path)!;
    }

    const segments = path.split('/').filter(s => s.length > 0);
    let currentPath = '';
    let parentId = resourceMap.get('/')!;

    for (const segment of segments) {
      currentPath += '/' + segment;
      
      if (resourceMap.has(currentPath)) {
        parentId = resourceMap.get(currentPath)!;
        continue;
      }

      // Convert :parameter syntax to {parameter} syntax for API Gateway
      const pathPart = segment.startsWith(':') ? `{${segment.slice(1)}}` : segment;
      
      const command = new CreateResourceCommand({
        restApiId: this.apiId,
        parentId,
        pathPart,
      });

      const response = await this.apiGatewayClient.send(command);
      const resourceId = response.id!;
      
      resourceMap.set(currentPath, resourceId);
      parentId = resourceId;
    }

    return parentId;
  }

  /**
   * Create or update a method
   */
  private async createMethod(
    resourceId: string,
    method: HttpMethod,
    authorizationType: string,
    authorizerId?: string
  ): Promise<void> {
    // Check if method already exists
    try {
      const getCommand = new GetMethodCommand({
        restApiId: this.apiId,
        resourceId,
        httpMethod: method,
      });
      await this.apiGatewayClient.send(getCommand);
      // Method exists, no need to create it again
      return;
    } catch (error: any) {
      // Method doesn't exist, create it
      if (error.name === 'NotFoundException') {
        const command = new PutMethodCommand({
          restApiId: this.apiId,
          resourceId,
          httpMethod: method,
          authorizationType,
          authorizerId,
          apiKeyRequired: false,
        });

        await this.apiGatewayClient.send(command);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create Lambda integration
   */
  private async createLambdaIntegration(
    resourceId: string,
    method: HttpMethod,
    functionArn: string
  ): Promise<void> {
    const command = new PutIntegrationCommand({
      restApiId: this.apiId,
      resourceId,
      httpMethod: method,
      type: IntegrationType.AWS_PROXY,
      integrationHttpMethod: 'POST',
      uri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`,
    });

    await this.apiGatewayClient.send(command);
  }

  /**
   * Create method response
   */
  private async createMethodResponse(
    resourceId: string,
    method: HttpMethod
  ): Promise<void> {
    try {
      const command = new PutMethodResponseCommand({
        restApiId: this.apiId,
        resourceId,
        httpMethod: method,
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': false,
        },
      });

      await this.apiGatewayClient.send(command);
    } catch (error: any) {
      // Method response might already exist, ignore
      if (error.name !== 'ConflictException') {
        throw error;
      }
    }
  }

  /**
   * Create integration response
   */
  private async createIntegrationResponse(
    resourceId: string,
    method: HttpMethod
  ): Promise<void> {
    try {
      const command = new PutIntegrationResponseCommand({
        restApiId: this.apiId,
        resourceId,
        httpMethod: method,
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': "'*'",
        },
      });

      await this.apiGatewayClient.send(command);
    } catch (error: any) {
      // Integration response might already exist, ignore
      if (error.name !== 'ConflictException') {
        throw error;
      }
    }
  }

  /**
   * Enable CORS for a resource
   */
  private async enableCors(resourceId: string, method: HttpMethod): Promise<void> {
    try {
      await this.createMethod(resourceId, 'OPTIONS', 'NONE');

      const command = new PutIntegrationCommand({
        restApiId: this.apiId,
        resourceId,
        httpMethod: 'OPTIONS',
        type: IntegrationType.MOCK,
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      });

      await this.apiGatewayClient.send(command);
    } catch (error) {
      // OPTIONS might already exist, ignore
    }
  }

  /**
   * Deploy the API
   */
  private async deployApi(): Promise<void> {
    const command = new CreateDeploymentCommand({
      restApiId: this.apiId,
      stageName: this.stage,
      description: `Deployed by Nimbus at ${new Date().toISOString()}`,
    });

    await this.apiGatewayClient.send(command);

    // Configure X-Ray tracing if enabled
    if (this.tracing) {
      await this.enableXRayTracing();
    }
  }

  /**
   * Enable X-Ray tracing for the API Gateway stage
   */
  private async enableXRayTracing(): Promise<void> {
    // Wait a moment for the stage to be fully created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const updateStageCommand = new UpdateStageCommand({
        restApiId: this.apiId,
        stageName: this.stage,
        patchOps: [
          {
            op: 'replace',
            path: '/tracingConfig/tracingEnabled',
            value: 'true',
          },
        ],
      } as any); // Type assertion needed due to AWS SDK type limitations

      await this.apiGatewayClient.send(updateStageCommand);
      console.log(`  SUCCESS X-Ray tracing enabled for API Gateway stage: ${this.stage}`);
    } catch (error: any) {
      console.warn(`  WARNING Failed to enable X-Ray tracing for API Gateway: ${error?.message || 'Unknown error'}`);
      console.warn(`  INFO You can enable it manually in the AWS console`);
    }
  }

  /**
   * Get API URL
   */
  getUrl(): string {
    if (!this.url) {
      throw new Error('API has not been provisioned yet');
    }
    return this.url;
  }

  /**
   * Get default API Gateway URL (without custom domain)
   */
  getDefaultUrl(): string {
    if (!this.apiId) {
      throw new Error('API has not been provisioned yet');
    }
    
    // Always return the standard API Gateway URL
    return `https://${this.apiId}.execute-api.${this.region}.amazonaws.com/${this.stage}`;
  }

  /**
   * Get custom domain if configured
   */
  getCustomDomain(): string | undefined {
    return this.customDomain;
  }

  /**
   * Get API ID
   */
  getId(): string | undefined {
    return this.apiId;
  }

  /**
   * Get API name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Destroy the API Gateway and its functions
   */
  async destroy(): Promise<void> {
    // Delete all functions
    for (const func of this.getFunctions()) {
      await func.destroy();
    }

    // Delete API Gateway
    if (this.apiId) {
      try {
        // Find and delete all base path mappings for this API across all domains
        try {
          const getDomainsCommand = new GetDomainNamesCommand({});
          const domainsResponse = await this.apiGatewayClient.send(getDomainsCommand);
          
          if (domainsResponse.items) {
            for (const domain of domainsResponse.items) {
              if (domain.domainName) {
                try {
                  const getMappingsCommand = new GetBasePathMappingsCommand({
                    domainName: domain.domainName,
                  });
                  const mappingsResponse = await this.apiGatewayClient.send(getMappingsCommand);
                  
                  if (mappingsResponse.items) {
                    for (const mapping of mappingsResponse.items) {
                      if (mapping.restApiId === this.apiId) {
                        const deleteMappingCommand = new DeleteBasePathMappingCommand({
                          domainName: domain.domainName,
                          basePath: mapping.basePath || '(none)',
                        });
                        await this.apiGatewayClient.send(deleteMappingCommand);
                        console.log(`  SUCCESS Deleted base path mapping for: ${domain.domainName}`);
                      }
                    }
                  }
                } catch (error: any) {
                  // Ignore errors for individual domains
                  if (error.name !== 'NotFoundException') {
                    console.warn(`  WARNING Failed to check mappings for ${domain.domainName}: ${error.message}`);
                  }
                }
              }
            }
          }
        } catch (error: any) {
          console.warn(`  WARNING Failed to enumerate domains for base path mapping cleanup: ${error.message}`);
        }

        const command = new DeleteRestApiCommand({ restApiId: this.apiId });
        await this.apiGatewayClient.send(command);
        console.log(`  SUCCESS Deleted API: ${this.name}`);
      } catch (error: any) {
        if (error.name === 'NotFoundException') {
          // API already deleted
          return;
        }
        throw error;
      }
    }
  }
}
