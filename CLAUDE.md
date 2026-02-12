# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides access to the Metropolitan Museum of Art Collection API. It exposes tools for searching and browsing artworks, plus an interactive MCP App for visual exploration.

## Development Commands

```bash
# Install dependencies (requires pnpm)
corepack enable
pnpm install

# Build the project (includes syncing versions and bundling UI apps)
pnpm run build

# Type checking
pnpm run typecheck

# Linting (with auto-fix)
pnpm run lint

# Run both lint and typecheck
pnpm run check
```

## Running the Server

- **Stdio mode (default)**: `node dist/index.js` or `npx -y metmuseum-mcp`
- **HTTP mode**: `node dist/index.js --http` (listens on `localhost:3001/mcp`)

Environment variables for HTTP mode:

- `PORT` (default: `3001`)
- `HOST` (default: `127.0.0.1`)
- `ALLOWED_HOSTS` (default: `localhost,127.0.0.1`)
- `MET_API_TIMEOUT_MS` (default: `10000`)

## Architecture

### Entry Point

- `src/index.ts` - Main entry point that determines transport (stdio or HTTP) and starts the server

### Server Setup

- `src/MetMuseumServer.ts` - Creates and configures the MCP server, registers tools and resources
- `src/server-utils.ts` - Transport layer utilities for stdio and streamable HTTP

### API Layer

- `src/api/MetMuseumApiClient.ts` - HTTP client for the Met Museum Collection API with rate limiting (80 req/s)

### Tools (MCP Protocol)

- `src/tools/ListDepartmentsTool.ts` - Lists all museum departments
- `src/tools/SearchMuseumObjectsTool.ts` - Searches objects with filters (department, images, dates, etc.)
- `src/tools/GetObjectTool.ts` - Fetches detailed object data including optional base64 image
- `src/tools/OpenMetExplorerTool.ts` - Launches the interactive explorer app

### MCP Apps (UI)

Two HTML/JavaScript apps bundled via esbuild:

- `src/ui/met-explorer/` - Main browsing app with search, filtering, pagination
- `src/ui/object-details/` - Standalone object detail view

Apps use `@modelcontextprotocol/ext-apps` runtime for tool calling and context sync.

### Resource Handlers

- `src/handlers/ListResourcesHandler.ts` - Lists available MCP App resources
- `src/handlers/ReadResourceHandler.ts` - Serves app HTML with CSP headers

### Build Process

- `scripts/sync-versions.mjs` - Syncs version from `package.json` to `manifest.json` and `MetMuseumServer.ts`
- `scripts/build-ui.mjs` - Bundles TypeScript apps into HTML templates using esbuild

## Important Patterns

### Adding a New Tool

1. Create tool class in `src/tools/` implementing `name`, `description`, `inputSchema` (zod), `execute()`
2. Instantiate in `MetMuseumServer.createMetMuseumServer()`
3. Register with `registerAppTool()` in `setupTools()` with annotations

### Adding a New MCP App

1. Create HTML template in `src/ui/<app-name>/mcp-app.html`
2. Create TypeScript logic in `src/ui/<app-name>/mcp-app.ts`
3. Create resource class in `src/ui/` implementing `AppResource` interface
4. Add to `APP_CONFIGS` in `scripts/build-ui.mjs`
5. Register in `MetMuseumServer.ts` handlers and tools

### Type Safety

- All Met API responses are validated with Zod schemas in `src/types/types.ts`
- The API client normalizes `null` values to `undefined` for consistency

### Rate Limiting

- `src/utils/RateLimiter.ts` implements token bucket limiting at 80 requests/second
- Used automatically by `MetMuseumApiClient` for all outbound requests

### Testing

- No automated test suite exists
- Manual testing via `npx -y metmuseum-mcp` and MCP clients
