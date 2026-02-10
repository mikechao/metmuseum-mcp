import z from 'zod';

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

  public async execute(args: z.infer<typeof this.inputSchema>) {
    return {
      content: [{
        type: 'text' as const,
        text: `Opening Met Explorer UI.

The explorer app automatically provides its search results in your context. When the user says "these results," "the results," "what I see," or asks for curation/summaries, they mean the explorer's results already in your context.
- Do NOT call search-museum-objects while the explorer app is open. The app's results are your data source.
- Use the explorer's context data directly for curation, summaries, must-see lists, and walkthrough requests.
- Treat titles and object IDs from the explorer as source of truth. Do not invent IDs or titles.
- Call get-museum-object only when the user asks to go deeper on a specific item or requests image-level detail.
- Ask the user to click "Add to context" when they want a selected object used in chat.
- If image context is missing, call get-museum-object with {"objectId": <id>, "returnImage": true}.`,
      }],
      structuredContent: {
        initialState: args,
      },
      isError: false,
    };
  }
}
