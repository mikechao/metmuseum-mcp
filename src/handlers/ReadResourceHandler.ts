import type { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import type { AppResource } from '../types/types.js';

const MET_EXPLORER_CSP_RESOURCE_DOMAINS = [
  'https://images.metmuseum.org',
  'data:',
];

export class ReadResourceHandler {
  private readonly appResources: AppResource[];

  constructor(appResources: AppResource[]) {
    this.appResources = appResources;
  }

  public async handleReadResource(request: ReadResourceRequest) {
    const uri = request.params.uri;
    const resource = this.appResources.find(candidate => candidate.uri === uri);

    if (resource) {
      const html = await resource.getHtml();
      return {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          text: html,
          _meta: {
            ui: {
              csp: {
                resourceDomains: MET_EXPLORER_CSP_RESOURCE_DOMAINS,
              },
            },
          },
        }],
      };
    }

    return {
      content: [{ type: 'text', text: `Resource not found: ${uri}` }],
      isError: true,
    };
  }
}
