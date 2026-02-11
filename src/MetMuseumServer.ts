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

export function createMetMuseumServer(): McpServer {
  const server = new McpServer(
    {
      name: 'met-museum-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  const metMuseumApiClient = new MetMuseumApiClient();
  const listDepartments = new ListDepartmentsTool(metMuseumApiClient);
  const search = new SearchMuseumObjectsTool(metMuseumApiClient);
  const getMuseumObject = new GetObjectTool(metMuseumApiClient);
  const openMetExplorer = new OpenMetExplorerTool();
  const openMetExplorerAppResource = new OpenMetExplorerAppResource();
  const getMuseumObjectAppResource = new GetMuseumObjectAppResource();

  const listResourcesHandler = new ListResourcesHandler(
    [openMetExplorerAppResource, getMuseumObjectAppResource],
  );
  const readResourceHandler = new ReadResourceHandler(
    [openMetExplorerAppResource, getMuseumObjectAppResource],
  );

  setupErrorHandling(server);
  setupTools(
    server,
    listDepartments,
    search,
    getMuseumObject,
    openMetExplorer,
    getMuseumObjectAppResource,
  );
  setupRequestHandlers(server, listResourcesHandler, readResourceHandler);

  return server;
}

function setupTools(
  server: McpServer,
  listDepartments: ListDepartmentsTool,
  search: SearchMuseumObjectsTool,
  getMuseumObject: GetObjectTool,
  openMetExplorer: OpenMetExplorerTool,
  getMuseumObjectAppResource: GetMuseumObjectAppResource,
): void {
  server.registerTool(
    listDepartments.name,
    {
      description: listDepartments.description,
      inputSchema: listDepartments.inputSchema,
    },
    listDepartments.execute.bind(listDepartments),
  );
  server.registerTool(
    search.name,
    {
      description: search.description,
      inputSchema: search.inputSchema,
    },
    search.execute.bind(search),
  );
  registerAppTool(
    server,
    getMuseumObject.name,
    {
      description: getMuseumObject.description,
      inputSchema: getMuseumObject.inputSchema.shape,
      _meta: {
        ui: {
          resourceUri: getMuseumObjectAppResource.uri,
        },
      },
    },
    getMuseumObject.execute.bind(getMuseumObject),
  );
  registerAppTool(
    server,
    openMetExplorer.name,
    {
      description: openMetExplorer.description,
      inputSchema: openMetExplorer.inputSchema.shape,
      _meta: {
        ui: {
          resourceUri: openMetExplorer.resourceUri,
        },
      },
    },
    openMetExplorer.execute.bind(openMetExplorer),
  );
}

function setupRequestHandlers(
  server: McpServer,
  listResourcesHandler: ListResourcesHandler,
  readResourceHandler: ReadResourceHandler,
): void {
  // Note: Tool call handling is done automatically by registerTool/registerAppTool above.
  // We only need custom handlers for resources.
  server.server.setRequestHandler(
    ListResourcesRequestSchema,
    async () => {
      return await listResourcesHandler.handleListResources();
    },
  );
  server.server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request) => {
      return await readResourceHandler.handleReadResource(request);
    },
  );
}

function setupErrorHandling(server: McpServer): void {
  server.server.onerror = (error) => {
    console.error('[MCP Error]', error);
  };
}
