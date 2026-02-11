import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import z from 'zod';

export const SearchInputSchema = z.object({
  q: z.string().describe(`The search query, Returns a listing of all Object IDs for objects that contain the search query within the object's data`),
  hasImages: z.boolean().optional().default(false).describe(`Only returns objects that have images`),
  title: z.boolean().optional().default(false).describe(`This should be set to true if you want to search for objects by title`),
  isHighlight: z.boolean().optional().default(false).describe(`Only returns objects designated as highlights`),
  tags: z.boolean().optional().default(false).describe(`Only returns objects that have subject keyword tags`),
  isOnView: z.boolean().optional().default(false).describe(`Only returns objects currently on view`),
  artistOrCulture: z.boolean().optional().default(false).describe(`When true, q is matched against artist or culture`),
  departmentId: z.number().optional().describe(`Returns objects that are in the specified department. The departmentId should come from the 'list-departments' tool.`),
  medium: z.string().optional().describe(`Restricts search to objects with the specified medium`),
  geoLocation: z.string().optional().describe(`Restricts search to objects with the specified geographic location`),
  dateBegin: z.number().int().optional().describe(`Restricts search to objects with an object date on or after this year`),
  dateEnd: z.number().int().optional().describe(`Restricts search to objects with an object date on or before this year`),
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
    + 'followed by a paginated list of Object Ids. '
    + 'If the Met Explorer app (open-met-explorer) is open and the user is referring to its existing results, prefer using those results from context instead of calling this tool. '
    + 'The parameter title should be set to true if you want to search for objects by title. '
    + 'The parameter hasImages is false by default, but can be set to true to return only objects with images. '
    + 'Additional optional filters are available for highlights, tags, on-view status, artist/culture match, medium, '
    + 'geographic location, and date range. '
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
  public async execute({
    q,
    hasImages,
    title,
    isHighlight,
    tags,
    isOnView,
    artistOrCulture,
    departmentId,
    medium,
    geoLocation,
    dateBegin,
    dateEnd,
    page,
    pageSize,
  }: z.infer<typeof this.inputSchema>): Promise<CallToolResult> {
    try {
      const searchResult = await this.apiClient.searchObjects({
        q,
        hasImages,
        title,
        isHighlight,
        tags,
        isOnView,
        artistOrCulture,
        departmentId,
        medium,
        geoLocation,
        dateBegin,
        dateEnd,
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
