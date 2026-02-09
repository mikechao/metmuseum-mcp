import type { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import type { OpenMetExplorerAppResource } from '../ui/OpenMetExplorerAppResource.js';

const MET_EXPLORER_CSP_RESOURCE_DOMAINS = [
  'https://images.metmuseum.org',
  'data:',
];

export class ReadResourceHandler {
  private openMetExplorerAppResource: OpenMetExplorerAppResource;

  constructor(openMetExplorerAppResource: OpenMetExplorerAppResource) {
    this.openMetExplorerAppResource = openMetExplorerAppResource;
  }

  public async handleReadResource(request: ReadResourceRequest) {
    const uri = request.params.uri;
    if (uri === this.openMetExplorerAppResource.uri) {
      const html = await this.openMetExplorerAppResource.getHtml();
      return {
        contents: [{
          uri,
          mimeType: this.openMetExplorerAppResource.mimeType,
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
