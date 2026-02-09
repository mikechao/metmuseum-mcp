import z from 'zod';

export class OpenMetExplorerTool {
  public readonly name: string = 'open-met-explorer';
  public readonly description: string = 'Open an interactive Met Museum explorer app with search, filtering, and object details';
  public readonly resourceUri: string = 'ui://met/explorer.html';

  public readonly inputSchema = z.object({
    q: z.string().optional().describe('Optional initial search query to seed the explorer'),
    hasImages: z.boolean().optional().default(true).describe('Whether the initial search should prioritize objects with images'),
    title: z.boolean().optional().default(false).describe('Whether the initial query should search only object titles'),
    departmentId: z.number().optional().describe('Optional department id to pre-select in the explorer'),
    objectId: z.number().optional().describe('Optional object id to open directly in the details panel'),
  }).describe('Open the Met Museum explorer app UI');

  public async execute(args: z.infer<typeof this.inputSchema>) {
    return {
      content: [{
        type: 'text' as const,
        text: `Opening Met Explorer UI.

Use this app to search, filter, paginate, and inspect Met objects.
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
