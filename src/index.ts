#!/usr/bin/env node

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import process from 'node:process';
import { createMetMuseumServer } from './MetMuseumServer.js';
import { startServer } from './server-utils.js';

function createServer(): McpServer {
  return createMetMuseumServer();
}

const http = process.argv.includes('--http');

startServer(createServer, http).catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
