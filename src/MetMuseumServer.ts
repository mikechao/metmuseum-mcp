import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MetMuseumApiClient } from './api/MetMuseumApiClient.js';
import { ListResourcesHandler } from './handlers/ListResourcesHandler.js';
import { ReadResourceHandler } from './handlers/ReadResourceHandler.js';
import { GetObjectTool } from './tools/GetObjectTool.js';
import { ListDepartmentsTool } from './tools/ListDepartmentsTool.js';
import { OpenMetExplorerTool } from './tools/OpenMetExplorerTool.js';
import { SearchMuseumObjectsTool } from './tools/SearchMuseumObjectsTool.js';
import { GetMuseumObjectAppResource } from './ui/GetMuseumObjectAppResource.js';
import { OpenMetExplorerAppResource } from './ui/OpenMetExplorerAppResource.js';

export class MetMuseumServer {
  private server: McpServer;
  private listResourcesHandler: ListResourcesHandler;
  private readResourceHandler: ReadResourceHandler;
  private metMuseumApiClient: MetMuseumApiClient;
  private listDepartments: ListDepartmentsTool;
  private search: SearchMuseumObjectsTool;
  private getMuseumObject: GetObjectTool;
  private openMetExplorer: OpenMetExplorerTool;
  private openMetExplorerAppResource: OpenMetExplorerAppResource;
  private getMuseumObjectAppResource: GetMuseumObjectAppResource;

  constructor() {
    this.server = new McpServer(
      {
        name: 'met-museum-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );
    this.metMuseumApiClient = new MetMuseumApiClient();
    this.listDepartments = new ListDepartmentsTool(this.metMuseumApiClient);
    this.search = new SearchMuseumObjectsTool(this.metMuseumApiClient);
    this.getMuseumObject = new GetObjectTool(this.metMuseumApiClient);
    this.openMetExplorer = new OpenMetExplorerTool();
    this.openMetExplorerAppResource = new OpenMetExplorerAppResource();
    this.getMuseumObjectAppResource = new GetMuseumObjectAppResource();
    this.listResourcesHandler = new ListResourcesHandler(
      [this.openMetExplorerAppResource, this.getMuseumObjectAppResource],
    );
    this.readResourceHandler = new ReadResourceHandler(
      [this.openMetExplorerAppResource, this.getMuseumObjectAppResource],
    );
    this.setupErrorHandling();
    this.setupTools();
    this.setupRequestHandlers();
  }

  private setupTools(): void {
    this.server.registerTool(
      this.listDepartments.name,
      {
        description: this.listDepartments.description,
        inputSchema: this.listDepartments.inputSchema,
      },
      this.listDepartments.execute.bind(this.listDepartments),
    );
    this.server.registerTool(
      this.search.name,
      {
        description: this.search.description,
        inputSchema: this.search.inputSchema,
      },
      this.search.execute.bind(this.search),
    );
    registerAppTool(
      this.server,
      this.getMuseumObject.name,
      {
        description: this.getMuseumObject.description,
        inputSchema: this.getMuseumObject.inputSchema.shape,
        _meta: {
          ui: {
            resourceUri: this.getMuseumObjectAppResource.uri,
          },
        },
      },
      this.getMuseumObject.execute.bind(this.getMuseumObject),
    );
    registerAppTool(
      this.server,
      this.openMetExplorer.name,
      {
        description: this.openMetExplorer.description,
        inputSchema: this.openMetExplorer.inputSchema.shape,
        _meta: {
          ui: {
            resourceUri: this.openMetExplorer.resourceUri,
          },
        },
      },
      this.openMetExplorer.execute.bind(this.openMetExplorer),
    );
  }

  private setupRequestHandlers(): void {
    // Note: Tool call handling is done automatically by registerTool/registerAppTool above.
    // We only need custom handlers for resources.
    this.server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => {
        return await this.listResourcesHandler.handleListResources();
      },
    );
    this.server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        return await this.readResourceHandler.handleReadResource(
          request,
        );
      },
    );
  }

  private setupErrorHandling(): void {
    this.server.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  get serverInstance(): McpServer {
    return this.server;
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
