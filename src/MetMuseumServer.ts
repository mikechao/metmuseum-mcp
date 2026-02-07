import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ListResourcesHandler } from './handlers/ListResourcesHandler.js';
import { ReadResourceHandler } from './handlers/ReadResourceHandler.js';
import { GetObjectTool } from './tools/GetObjectTool.js';
import { ListDepartmentsTool } from './tools/ListDepartmentsTool.js';
import { OpenMetExplorerTool } from './tools/OpenMetExplorerTool.js';
import { SearchMuseumObjectsTool } from './tools/SearchMuseumObjectsTool.js';
import { OpenMetExplorerAppResource } from './ui/OpenMetExplorerAppResource.js';

export class MetMuseumServer {
  private server: McpServer;
  private listResourcesHandler: ListResourcesHandler;
  private readResourceHandler: ReadResourceHandler;
  private listDepartments: ListDepartmentsTool;
  private search: SearchMuseumObjectsTool;
  private getMuseumObject: GetObjectTool;
  private openMetExplorer: OpenMetExplorerTool;
  private openMetExplorerAppResource: OpenMetExplorerAppResource;

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
    this.listDepartments = new ListDepartmentsTool();
    this.search = new SearchMuseumObjectsTool();
    this.getMuseumObject = new GetObjectTool(this.server);
    this.openMetExplorer = new OpenMetExplorerTool();
    this.openMetExplorerAppResource = new OpenMetExplorerAppResource();
    this.listResourcesHandler = new ListResourcesHandler(
      this.getMuseumObject,
    );
    this.readResourceHandler = new ReadResourceHandler(
      this.getMuseumObject,
      this.openMetExplorerAppResource,
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
    this.server.registerTool(
      this.getMuseumObject.name,
      {
        description: this.getMuseumObject.description,
        inputSchema: this.getMuseumObject.inputSchema,
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
    // Note: Tool call handling is done automatically by registerTool() above.
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
