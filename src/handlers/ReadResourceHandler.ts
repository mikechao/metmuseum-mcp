import type { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import type { GetObjectTool } from '../tools/GetObjectTool.js';
import type { OpenMetExplorerAppResource } from '../ui/OpenMetExplorerAppResource.js';

const MET_EXPLORER_CSP_RESOURCE_DOMAINS = [
  'https://images.metmuseum.org',
  'data:',
];

export class ReadResourceHandler {
  private getObjectTool: GetObjectTool;
  private openMetExplorerAppResource: OpenMetExplorerAppResource;

  constructor(getObjectTool: GetObjectTool, openMetExplorerAppResource: OpenMetExplorerAppResource) {
    this.getObjectTool = getObjectTool;
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

    if (uri.startsWith('met-image://')) {
      const title = uri.split('://')[1];
      const image = this.getObjectTool.imageByTitle.get(title);
      if (image) {
        return {
          contents: [{
            uri,
            mimeType: 'image/jpeg',
            blob: image,
          }],
        };
      }
    }
    return {
      content: [{ type: 'text', text: `Resource not found: ${uri}` }],
      isError: true,
    };
  }
}
