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

Use this app to search, filter, paginate, and inspect Met objects.
- For exploration requests, pass q in this tool call so search runs automatically when the app opens.
- While the app is open, prefer guiding the user using app results.
- Treat titles and object IDs shown in the app as source of truth for follow-up navigation.
- Do not relaunch this tool for every individual artwork in a curated list.
- For each item in a walkthrough, call get-museum-object with the chosen objectId.
- Use search-museum-objects as a fallback when app interaction is unavailable or the user asks for raw ID lists.
- Explore in the UI first (instead of many raw tool calls).
- Ask the user to click "Add to context" when they want a selected object used in chat.
- After context is added, use that object's details.
- If image context is missing, call get-museum-object with {"objectId": <id>, "returnImage": true}.`,
      }],
      structuredContent: {
        initialState: args,
      },
      isError: false,
    };
  }
}
