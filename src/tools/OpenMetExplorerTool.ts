import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { OpenMetExplorerStructuredContentSchema } from '../types/types.js';
import z from 'zod';

type OpenMetExplorerStructuredContent = z.infer<typeof OpenMetExplorerStructuredContentSchema>;

export class OpenMetExplorerTool {
  public readonly name: string = 'open-met-explorer';
  public readonly description: string = 'Open the interactive Met Explorer app for browsing and filtering objects. '
    + 'For exploration intents, pass q so the app can run a live search on open. '
    + 'After opening, keep your chat handoff short and UI-focused. '
    + 'For deeper details on a specific object ID, prefer get-museum-object.';

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

Assistant response style after opening this app:
- Keep the first response brief (1 short paragraph, optionally 2-3 bullets).
- Focus on what the user can do in this UI right now; avoid long art-history background unless the user explicitly asks for it.
- Mention only existing controls/features: search query, department filter, "Has images", "Title only", pagination, selecting a result card, and "Add to conversation".
- Do not claim unsupported features (for example timeline mode, side-by-side compare, zoom controls, date filter, medium filter, or on-view filter) unless they are actually present in context.
- If q was provided, acknowledge that the explorer is already seeded with that query.
- When visible results context is present, explicitly state that you can use the currently visible results to curate a shortlist.

Explorer context handling:
- The app attempts to provide visible search results in context while users browse (host capabilities vary).
- When results context is present, and the user refers to "these results," "the results," or "what I see," use that explorer data directly without additional tool calls.
- For curation, summaries, must-see lists, or walkthrough requests, default to the explorer's context data unless the user explicitly asks for a new or different search.
- For curated recommendations, prioritize the currently visible results first and name specific titles/object IDs from that context.
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
