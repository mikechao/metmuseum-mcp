import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export async function startServer(
  createServer: () => McpServer,
  isHttp: boolean = false,
): Promise<void> {
  try {
    if (isHttp) {
      await startStreamableHttpServer(createServer);
    }
    else {
      await startStdioServer(createServer);
    }
  }
  catch (error) {
    console.error('[MCP Server Error]', error);
    process.exit(1);
  }
}

export async function startStdioServer(
  createServer: () => McpServer,
): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Met Museum MCP server running on stdio');

  const shutdown = () => {
    server.close()
      .catch((error) => {
        console.error('[MCP Shutdown Error]', error);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function startStreamableHttpServer(
  createServer: () => McpServer,
): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '127.0.0.1';
  const allowedHostsEnv = process.env.ALLOWED_HOSTS;
  const defaultAllowedHosts = ['localhost', '127.0.0.1'];
  const allowedHosts = allowedHostsEnv
    ? allowedHostsEnv
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    : defaultAllowedHosts;

  const expressApp = createMcpExpressApp({
    host,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
  });

  expressApp.all('/mcp', async (
    req: IncomingMessage & { body?: unknown },
    res: ServerResponse,
  ) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
      console.error('[MCP HTTP Error]', error);
      if (!res.headersSent) {
        const body = JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(body);
      }
    }
  });

  const httpServer = expressApp.listen(port, host, () => {
    console.error(`Met Museum MCP server running on http://${host}:${port}/mcp`);
  });

  const shutdown = () => {
    console.error('\nShutting down...');
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
}
