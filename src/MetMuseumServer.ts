import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { CallToolRequestHandler } from './handlers/CallToolHandler.js';
import { ListResourcesHandler } from './handlers/ListResourcesHandler.js';
import { ReadResourceHandler } from './handlers/ReadResourceHandler.js';
import { GetObjectTool } from './tools/GetObjectTool.js';
import { ListDepartmentsTool } from './tools/ListDepartmentsTool.js';
import { SearchMuseumObjectsTool } from './tools/SearchMuseumObjectsTool.js';

export class MetMuseumServer {
  private server: McpServer;
  private callToolHandler: CallToolRequestHandler;
  private listResourcesHandler: ListResourcesHandler;
  private readResourceHandler: ReadResourceHandler;
  private listDepartments: ListDepartmentsTool;
  private search: SearchMuseumObjectsTool;
  private getMuseumObject: GetObjectTool;

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
    this.callToolHandler = new CallToolRequestHandler(
      this.listDepartments,
      this.search,
      this.getMuseumObject,
    );
    this.listResourcesHandler = new ListResourcesHandler(
      this.getMuseumObject,
    );
    this.readResourceHandler = new ReadResourceHandler(
      this.getMuseumObject,
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
  }

  private setupRequestHandlers(): void {
    this.server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        return await this.callToolHandler.handleCallTool(request);
      },
    );
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
