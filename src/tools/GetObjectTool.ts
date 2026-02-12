import type { CallToolResult, ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import imageToBase64 from 'image-to-base64';
import z from 'zod';
import { MetMuseumApiError } from '../api/MetMuseumApiClient.js';

export class GetObjectTool {
  public readonly name: string = 'get-museum-object';
  public readonly description: string = 'Get a museum object by its ID, from the Metropolitan Museum of Art Collection. '
    + 'Use this when the user asks for deeper details on a specific object ID.';

  public readonly inputSchema = z.object({
    objectId: z.number().describe('The ID of the museum object to retrieve'),
    returnImage: z.boolean().optional().default(true).describe('Whether to return the image (if available) of the object'),
  }).describe('Get a museum object by its ID');

  private readonly apiClient: MetMuseumApiClient;

  constructor(apiClient: MetMuseumApiClient) {
    this.apiClient = apiClient;
  }

  public async execute({ objectId, returnImage }: z.infer<typeof this.inputSchema>): Promise<CallToolResult> {
    try {
      const data = await this.apiClient.getObject(objectId);
      const text = `Object ID: ${data.objectID}\n`
        + `Title: ${data.title}\n`
        + `${data.artistDisplayName ? `Artist: ${data.artistDisplayName}\n` : ''}`
        + `${data.artistDisplayBio ? `Artist Bio: ${data.artistDisplayBio}\n` : ''}`
        + `${data.department ? `Department: ${data.department}\n` : ''}`
        + `${data.objectDate ? `Date: ${data.objectDate}\n` : ''}`
        + `${data.creditLine ? `Credit Line: ${data.creditLine}\n` : ''}`
        + `${data.medium ? `Medium: ${data.medium}\n` : ''}`
        + `${data.dimensions ? `Dimensions: ${data.dimensions}\n` : ''}`
        + `${data.primaryImage ? `Primary Image URL: ${data.primaryImage}\n` : ''}`
        + `${data.tags ? `Tags: ${data.tags.map(tag => tag.term).join(', ')}\n` : ''}`;

      const content: Array<TextContent | ImageContent> = [];
      content.push({
        type: 'text',
        text,
      });
      if (returnImage && data.primaryImageSmall) {
        try {
          const imageBase64 = await imageToBase64(data.primaryImageSmall);
          content.push({
            type: 'image',
            data: imageBase64,
            mimeType: 'image/jpeg',
          });
        }
        catch {
          // Note: Silently fall back to metadata-only. Image fetch failures are
          // transient network issues and logging would leak implementation details in stdio mode.
        }
      }

      return {
        content,
        structuredContent: {
          object: data,
        },
      };
    }
    catch (error) {
      if (error instanceof MetMuseumApiError) {
        const message = error.isUserFriendly
          ? error.message
          : error.status === 404
            ? `Museum object id ${objectId} was not found.`
            : `Error getting museum object id ${objectId}: ${error.message}`;
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        };
      }
      // Note: Error is already returned to user in the tool response.
      // No need to log to stderr as it would leak implementation details in stdio mode.
      return {
        content: [{ type: 'text', text: `Error getting museum object id ${objectId}: ${error}` }],
        isError: true,
      };
    }
  }
}
