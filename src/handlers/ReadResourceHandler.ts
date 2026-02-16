import type { ReadResourceRequest, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppResource } from '../types/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const APP_CSP_RESOURCE_DOMAINS = [
  'https://images.metmuseum.org',
  'data:',
];

const MISSING_UI_BUNDLE_ERROR_PREFIX = 'UI bundle is missing.';
const MISSING_UI_BUNDLE_USER_MESSAGE = 'This interactive view is temporarily unavailable because required UI files are missing on the server. Please contact your server administrator.';
const READ_RESOURCE_ERROR_MESSAGE = 'Unable to load this interactive view right now. Please try again later.';

export class ReadResourceHandler {
  private readonly appResources: AppResource[];

  constructor(appResources: AppResource[]) {
    this.appResources = appResources;
  }

  public async handleReadResource(request: ReadResourceRequest): Promise<ReadResourceResult> {
    const uri = request.params.uri;
    const resource = this.appResources.find(candidate => candidate.uri === uri);

    if (!resource) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
    }

    let html: string;
    try {
      html = await resource.getHtml();
    }
    catch (error) {
      if (error instanceof Error && error.message.startsWith(MISSING_UI_BUNDLE_ERROR_PREFIX)) {
        console.error('[ReadResourceHandler] Missing UI bundle while reading resource:', {
          uri,
          cause: error.message,
        });
        throw new McpError(ErrorCode.InternalError, MISSING_UI_BUNDLE_USER_MESSAGE);
      }

      console.error('[ReadResourceHandler] Failed to read resource:', { uri, error });
      throw new McpError(ErrorCode.InternalError, READ_RESOURCE_ERROR_MESSAGE);
    }

    return {
      contents: [{
        uri,
        mimeType: resource.mimeType,
        text: html,
        _meta: {
          ui: {
            csp: {
              resourceDomains: APP_CSP_RESOURCE_DOMAINS,
            },
          },
        },
      }],
    };
  }
}
