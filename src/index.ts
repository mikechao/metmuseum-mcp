#!/usr/bin/env node

import process from 'node:process';
import { MetMuseumServer } from './MetMuseumServer.js';

const server = new MetMuseumServer();
server.run().catch((error) => {
  console.error('[MCP Server Error]', error);
  process.exit(1);
});
