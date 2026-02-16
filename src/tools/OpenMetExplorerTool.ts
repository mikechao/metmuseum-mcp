import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { OpenMetExplorerStructuredContentSchema } from '../types/types.js';
import z from 'zod';

type OpenMetExplorerStructuredContent = z.infer<typeof OpenMetExplorerStructuredContentSchema>;

export class OpenMetExplorerTool {
  public readonly name: string = 'open-met-explorer';
  public readonly description: string = 'Open an interactive Met Museum explorer app with search, filtering, and object details. '
    + 'For exploration intents, pass q so the app can load live results on open. '
    + 'Use this tool to launch/browse; for per-item details after IDs are known, prefer get-museum-object.';

  public readonly resourceUri: string = 'ui://met/explorer.html';

  public readonly inputSchema = z.object({
    q: z.string().optional().describe('Optional initial search query to seed the explorer. If provided, the app automatically executes the search on launch'),
    hasImages: z.boolean().optional().default(true).describe('Whether the initial search should prioritize objects with images'),
    title: z.boolean().optional().default(false).describe('Whether the initial query should search only object titles'),
    departmentId: z.number().optional().describe('Optional department id to pre-select in the explorer'),
  }).describe('Open the Met Museum explorer app UI');

  public async execute(args: z.infer<typeof this.inputSchema>): Promise<CallToolResult> {
    const structuredContent: OpenMetExplorerStructuredContent = {
      initialState: args,
    };

    return {
      content: [{
        type: 'text',
        text: `Opening Met Explorer UI.

The explorer app attempts to provide visible search results in context while users browse (host capabilities vary).
- When results context is present, and the user refers to "these results," "the results," or "what I see," use that explorer data directly without additional tool calls.
- For curation, summaries, must-see lists, or walkthrough requests, default to the explorer's context data unless the user explicitly asks for a new or different search.
- Treat titles and object IDs from the explorer as source of truth. Do not invent IDs or titles not present in the context.
- Call get-museum-object only when the user asks to go deeper on a specific item or requests image-level detail.
- Ask the user to click "Add to conversation" when they want a selected object used in chat.
- If image context is missing, call get-museum-object with {"objectId": <id>, "returnImage": true}.`,
      }],
      structuredContent,
      isError: false,
    };
  }
}
