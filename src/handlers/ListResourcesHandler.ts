import type { OpenMetExplorerAppResource } from '../ui/OpenMetExplorerAppResource.js';

export class ListResourcesHandler {
  private openMetExplorerAppResource: OpenMetExplorerAppResource;

  constructor(openMetExplorerAppResource: OpenMetExplorerAppResource) {
    this.openMetExplorerAppResource = openMetExplorerAppResource;
  }

  public async handleListResources() {
    return {
      resources: [
        {
          uri: this.openMetExplorerAppResource.uri,
          mimeType: this.openMetExplorerAppResource.mimeType,
          name: this.openMetExplorerAppResource.name,
        },
      ],
    };
  }
}
