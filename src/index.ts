import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpAgent } from 'agents/mcp';
import { CallToolRequestHandler } from './handlers/CallToolHandler.js';
import { ListResourcesHandler } from './handlers/ListResourcesHandler.js';
import { ReadResourceHandler } from './handlers/ReadResourceHandler.js';
import { GetObjectTool } from './tools/GetObjectTool.js';
import { ListDepartmentsTool } from './tools/ListDepartmentsTool.js';
import { SearchMuseumObjectsTool } from './tools/SearchMuseumObjectsTool.js';

export class MetMuseumServer extends McpAgent {
  private callToolHandler!: CallToolRequestHandler;
  private listResourcesHandler!: ListResourcesHandler;
  private readResourceHandler!: ReadResourceHandler;
  private listDepartments!: ListDepartmentsTool;
  private search!: SearchMuseumObjectsTool;
  private getMuseumObject!: GetObjectTool;

  server = new McpServer(
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

  async init() {
    this.listDepartments = new ListDepartmentsTool();
    this.search = new SearchMuseumObjectsTool();
    this.getMuseumObject = new GetObjectTool(this.server);
    this.callToolHandler = new CallToolRequestHandler(this.listDepartments, this.search, this.getMuseumObject);
    this.listResourcesHandler = new ListResourcesHandler(this.getMuseumObject);
    this.readResourceHandler = new ReadResourceHandler(this.getMuseumObject);
    this.setupErrorHandling();
    this.setupTools();
    this.setupRequestHandlers();
  }

  private setupTools(): void {
    this.server.tool(
      this.listDepartments.name,
      this.listDepartments.description,
      this.listDepartments.inputSchema.shape,
      this.listDepartments.execute.bind(this.listDepartments),
    );
    this.server.tool(
      this.search.name,
      this.search.description,
      this.search.inputSchema.shape,
      this.search.execute.bind(this.search),
    );
    this.server.tool(
      this.getMuseumObject.name,
      this.getMuseumObject.description,
      this.getMuseumObject.inputSchema.shape,
      this.getMuseumObject.execute.bind(this.getMuseumObject),
    );
  }

  private setupRequestHandlers(): void {
    this.server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.callToolHandler.handleCallTool(request);
    });
    this.server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return await this.listResourcesHandler.handleListResources();
    });
    this.server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await this.readResourceHandler.handleReadResource(request);
    });
  }

  private setupErrorHandling(): void {
    this.server.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === '/sse' || url.pathname === '/sse/message') {
      return MetMuseumServer.serveSSE('/sse').fetch(request, env, ctx);
    }

    if (url.pathname === '/mcp') {
      return MetMuseumServer.serve('/mcp').fetch(request, env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },
};
