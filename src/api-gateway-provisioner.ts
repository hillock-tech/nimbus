import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  IntegrationType,
} from '@aws-sdk/client-api-gateway';
import { LambdaProvisioner } from './lambda-provisioner';
import {
  ApiGatewayConfig,
  ApiEndpoint,
  HttpMethod,
  ProvisioningResult,
} from './types';

/**
 * Manages API Gateway provisioning and configuration
 */
export class ApiGatewayProvisioner {
  private apiGatewayClient: APIGatewayClient;
  private lambdaProvisioner: LambdaProvisioner;
  private region: string;

  constructor(region: string = 'us-east-1') {
    this.region = region;
    this.apiGatewayClient = new APIGatewayClient({ region });
    this.lambdaProvisioner = new LambdaProvisioner(region);
  }

  /**
   * Provision a complete API Gateway with endpoints and Lambda integrations
   */
  async provision(config: ApiGatewayConfig): Promise<ProvisioningResult> {
    // Create REST API
    const createApiCommand = new CreateRestApiCommand({
      name: config.apiName,
      description: config.description || `API created by Nimbus`,
      endpointConfiguration: {
        types: ['REGIONAL'],
      },
    });

    const apiResponse = await this.apiGatewayClient.send(createApiCommand);
    const apiId = apiResponse.id!;
    const rootResourceId = await this.getRootResourceId(apiId);

    const result: ProvisioningResult = {
      apiId,
      apiArn: `arn:aws:apigateway:${this.region}::/restapis/${apiId}`,
      rootResourceId,
      lambdaFunctions: [],
      resources: [],
    };

    // Create resources and methods for each endpoint
    const resourceMap = new Map<string, string>();
    resourceMap.set('/', rootResourceId);

    for (const endpoint of config.endpoints) {
      await this.provisionEndpoint(
        apiId,
        endpoint,
        resourceMap,
        result
      );
    }

    // Deploy the API
    const stageName = config.stageName || 'dev';
    await this.deployApi(apiId, stageName);
    
    result.endpointUrl = `https://${apiId}.execute-api.${this.region}.amazonaws.com/${stageName}`;

    return result;
  }

  /**
   * Get the root resource ID for the API
   */
  private async getRootResourceId(apiId: string): Promise<string> {
    const command = new GetResourcesCommand({ restApiId: apiId });
    const response = await this.apiGatewayClient.send(command);
    const rootResource = response.items?.find(item => item.path === '/');
    
    if (!rootResource?.id) {
      throw new Error('Root resource not found');
    }
    
    return rootResource.id;
  }

  /**
   * Provision a single endpoint with Lambda integration
   */
  private async provisionEndpoint(
    apiId: string,
    endpoint: ApiEndpoint,
    resourceMap: Map<string, string>,
    result: ProvisioningResult
  ): Promise<void> {
    // Get or create resource for the path
    const resourceId = await this.getOrCreateResource(
      apiId,
      endpoint.path,
      resourceMap
    );

    // Provision Lambda function
    const functionArn = await this.lambdaProvisioner.provisionFunction(
      endpoint.functionConfig
    );

    // Add API Gateway permission to invoke Lambda
    const sourceArn = `arn:aws:execute-api:${this.region}:*:${apiId}/*/${endpoint.method}${endpoint.path}`;
    await this.lambdaProvisioner.addApiGatewayPermission(
      endpoint.functionConfig.functionName,
      apiId,
      sourceArn
    );

    // Create method
    await this.createMethod(
      apiId,
      resourceId,
      endpoint.method,
      endpoint.authorizationType || 'NONE'
    );

    // Create Lambda integration
    await this.createLambdaIntegration(
      apiId,
      resourceId,
      endpoint.method,
      functionArn
    );

    // Add CORS if enabled
    if (endpoint.cors) {
      await this.enableCors(apiId, resourceId, endpoint.method);
    }

    // Add to results
    result.lambdaFunctions.push({
      functionName: endpoint.functionConfig.functionName,
      functionArn,
      path: endpoint.path,
      method: endpoint.method,
    });

    if (!result.resources.find(r => r.path === endpoint.path)) {
      result.resources.push({
        resourceId,
        path: endpoint.path,
      });
    }
  }

  /**
   * Get or create a resource for a given path
   */
  private async getOrCreateResource(
    apiId: string,
    path: string,
    resourceMap: Map<string, string>
  ): Promise<string> {
    if (resourceMap.has(path)) {
      return resourceMap.get(path)!;
    }

    // Parse path segments
    const segments = path.split('/').filter(s => s.length > 0);
    let currentPath = '';
    let parentId = resourceMap.get('/')!;

    for (const segment of segments) {
      currentPath += '/' + segment;
      
      if (resourceMap.has(currentPath)) {
        parentId = resourceMap.get(currentPath)!;
        continue;
      }

      // Create resource
      const command = new CreateResourceCommand({
        restApiId: apiId,
        parentId,
        pathPart: segment,
      });

      const response = await this.apiGatewayClient.send(command);
      const resourceId = response.id!;
      
      resourceMap.set(currentPath, resourceId);
      parentId = resourceId;
    }

    return parentId;
  }

  /**
   * Create a method on a resource
   */
  private async createMethod(
    apiId: string,
    resourceId: string,
    method: HttpMethod,
    authorizationType: string
  ): Promise<void> {
    const command = new PutMethodCommand({
      restApiId: apiId,
      resourceId,
      httpMethod: method,
      authorizationType,
      apiKeyRequired: false,
    });

    await this.apiGatewayClient.send(command);
  }

  /**
   * Create Lambda integration for a method
   */
  private async createLambdaIntegration(
    apiId: string,
    resourceId: string,
    method: HttpMethod,
    functionArn: string
  ): Promise<void> {
    const integrationCommand = new PutIntegrationCommand({
      restApiId: apiId,
      resourceId,
      httpMethod: method,
      type: IntegrationType.AWS_PROXY,
      integrationHttpMethod: 'POST',
      uri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`,
    });

    await this.apiGatewayClient.send(integrationCommand);
  }

  /**
   * Enable CORS for a resource
   */
  private async enableCors(
    apiId: string,
    resourceId: string,
    method: HttpMethod
  ): Promise<void> {
    // Create OPTIONS method for CORS preflight
    await this.createMethod(apiId, resourceId, 'OPTIONS', 'NONE');

    // Add mock integration for OPTIONS
    const integrationCommand = new PutIntegrationCommand({
      restApiId: apiId,
      resourceId,
      httpMethod: 'OPTIONS',
      type: IntegrationType.MOCK,
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
    });

    await this.apiGatewayClient.send(integrationCommand);
  }

  /**
   * Deploy the API to a stage
   */
  private async deployApi(apiId: string, stageName: string): Promise<void> {
    const command = new CreateDeploymentCommand({
      restApiId: apiId,
      stageName,
      description: `Deployment created by Nimbus at ${new Date().toISOString()}`,
    });

    await this.apiGatewayClient.send(command);
  }
}
