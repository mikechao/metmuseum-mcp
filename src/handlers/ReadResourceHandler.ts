import type { ReadResourceRequest, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppResource } from '../types/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const APP_CSP_RESOURCE_DOMAINS = [
  'https://images.metmuseum.org',
  'data:',
];

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

    const html = await resource.getHtml();
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
