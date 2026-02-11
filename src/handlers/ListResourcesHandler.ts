import type { AppResource } from '../types/types.js';

export class ListResourcesHandler {
  private readonly appResources: AppResource[];

  constructor(appResources: AppResource[]) {
    this.appResources = appResources;
  }

  public async handleListResources() {
    return {
      resources: this.appResources.map(resource => ({
        uri: resource.uri,
        mimeType: resource.mimeType,
        name: resource.name,
      })),
    };
  }
}
