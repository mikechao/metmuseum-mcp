import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import z from 'zod';
import { MetMuseumApiError } from '../api/MetMuseumApiClient.js';
import { DEFAULT_SEARCH_TOOL_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE } from '../constants.js';

const SearchInputBaseSchema = z.object({
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
  dateBegin: z.number().int().optional().describe(`Start year for a date range filter. Must be provided together with dateEnd.`),
  dateEnd: z.number().int().optional().describe(`End year for a date range filter. Must be provided together with dateBegin.`),
  page: z.number().int().positive().optional().default(1).describe(`1-based page number for paginated object IDs`),
  pageSize: z.number().int().positive().max(MAX_SEARCH_PAGE_SIZE).optional().default(DEFAULT_SEARCH_TOOL_PAGE_SIZE).describe(`Number of object IDs to return per page (max ${MAX_SEARCH_PAGE_SIZE})`),
});

export const SearchInputSchema = SearchInputBaseSchema.refine(
  ({ dateBegin, dateEnd }) => (dateBegin === undefined) === (dateEnd === undefined),
  {
    message: 'dateBegin and dateEnd must both be provided when filtering by date range.',
    path: ['dateBegin'],
  },
);

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

  // Define the MCP registration schema (must stay a ZodObject because server registration reads `.shape`).
  public readonly inputSchema = SearchInputBaseSchema;

  private readonly apiClient: MetMuseumApiClient;

  constructor(apiClient: MetMuseumApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Execute the search operation
   */
  public async execute(input: z.infer<typeof this.inputSchema>): Promise<CallToolResult> {
    try {
      const parsedInput = SearchInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return {
          content: [{
            type: 'text',
            text: 'Please provide both dateBegin and dateEnd when filtering by date range.',
          }],
          isError: true,
        };
      }

      const {
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
      } = parsedInput.data;

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
          content: [{ type: 'text', text: 'No objects found' }],
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
        content: [{ type: 'text', text }],
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
      // Note: Error is returned to user in the tool response below.
      // No need to log to stderr as it would leak implementation details in stdio mode.
      const message = error instanceof MetMuseumApiError && error.isUserFriendly
        ? error.message
        : `Error searching museum objects: ${error}`;
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  }
}
