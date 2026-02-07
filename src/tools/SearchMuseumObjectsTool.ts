import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import z from 'zod';

export const SearchInputSchema = z.object({
  q: z.string().describe(`The search query, Returns a listing of all Object IDs for objects that contain the search query within the object's data`),
  hasImages: z.boolean().optional().default(false).describe(`Only returns objects that have images`),
  title: z.boolean().optional().default(false).describe(`This should be set to true if you want to search for objects by title`),
  departmentId: z.number().optional().describe(`Returns objects that are in the specified department. The departmentId should come from the 'list-departments' tool.`),
  page: z.number().int().positive().optional().default(1).describe(`1-based page number for paginated object IDs`),
  pageSize: z.number().int().positive().max(100).optional().default(24).describe(`Number of object IDs to return per page (max 100)`),
});

/**
 * Tool for searching objects in the Met Museum
 */
export class SearchMuseumObjectsTool {
  // Define public tool properties
  public readonly name: string = 'search-museum-objects';
  public readonly description: string = 'Search for objects in the Metropolitan Museum of Art (Met Museum). Will return Total objects found, '
    + 'followed by a paginated list of Object Ids.'
    + 'The parameter title should be set to true if you want to search for objects by title.'
    + 'The parameter hasImages is false by default, but can be set to true to return only objects with images.'
    + 'If the parameter hasImages is true, the parameter title should be false.'
    + 'Use page and pageSize to paginate results.';

  // Define the input schema
  public readonly inputSchema = SearchInputSchema;

  private readonly apiClient: MetMuseumApiClient;

  constructor(apiClient: MetMuseumApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Execute the search operation
   */
  public async execute({ q, hasImages, title, departmentId, page, pageSize }: z.infer<typeof this.inputSchema>) {
    try {
      const searchResult = await this.apiClient.searchObjects({
        q,
        hasImages,
        title,
        departmentId,
      });

      if (searchResult.total === 0 || !searchResult.objectIDs) {
        return {
          content: [{ type: 'text' as const, text: 'No objects found' }],
          structuredContent: {
            total: 0,
            page: 1,
            pageSize,
            totalPages: 0,
            objectIDs: [],
          },
          isError: false,
        };
      }

      const total = searchResult.total;
      const allObjectIds = searchResult.objectIDs;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      const objectIDs = allObjectIds.slice(start, start + pageSize);
      const text = `Total objects found: ${total}\nPage: ${safePage}/${totalPages}\nObject IDs: ${objectIDs.join(', ')}`;
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: {
          total,
          page: safePage,
          pageSize,
          totalPages,
          objectIDs,
        },
        isError: false,
      };
    }
    catch (error) {
      console.error('Error searching museum objects:', error);
      return {
        content: [{ type: 'text' as const, text: `Error searching museum objects: ${error}` }],
        isError: true,
      };
    }
  }
}
