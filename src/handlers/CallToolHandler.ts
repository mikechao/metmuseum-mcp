import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { GetObjectTool } from '../tools/GetObjectTool.js';
import type { ListDepartmentsTool } from '../tools/ListDepartmentsTool.js';
import type { OpenMetExplorerTool } from '../tools/OpenMetExplorerTool.js';
import type { SearchMuseumObjectsTool } from '../tools/SearchMuseumObjectsTool.js';

export class CallToolRequestHandler {
  private listDepartments: ListDepartmentsTool;
  private search: SearchMuseumObjectsTool;
  private getMuseumObject: GetObjectTool;
  private openMetExplorer: OpenMetExplorerTool;

  constructor(
    listDepartments: ListDepartmentsTool,
    search: SearchMuseumObjectsTool,
    getMuseumObject: GetObjectTool,
    openMetExplorer: OpenMetExplorerTool,
  ) {
    this.listDepartments = listDepartments;
    this.search = search;
    this.getMuseumObject = getMuseumObject;
    this.openMetExplorer = openMetExplorer;
  }

  public async handleCallTool(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case this.listDepartments.name:
          return await this.listDepartments.execute();
        case this.search.name: {
          const parsedArgs = this.search.inputSchema.safeParse(args);
          if (!parsedArgs.success) {
            throw new Error(`Invalid arguments for search: ${JSON.stringify(parsedArgs.error.issues, null, 2)}`);
          }
          const { q, hasImages, title, departmentId } = parsedArgs.data;
          return await this.search.execute({ q, hasImages, title, departmentId });
        }
        case this.getMuseumObject.name: {
          const parsedArgs = this.getMuseumObject.inputSchema.safeParse(args);
          if (!parsedArgs.success) {
            throw new Error(`Invalid arguments for getMuseumObject: ${JSON.stringify(parsedArgs.error.issues, null, 2)}`);
          }
          const { objectId, returnImage } = parsedArgs.data;
          return await this.getMuseumObject.execute({ objectId, returnImage });
        }
        case this.openMetExplorer.name: {
          const parsedArgs = this.openMetExplorer.inputSchema.safeParse(args ?? {});
          if (!parsedArgs.success) {
            throw new Error(`Invalid arguments for openMetExplorer: ${JSON.stringify(parsedArgs.error.issues, null, 2)}`);
          }
          return await this.openMetExplorer.execute(parsedArgs.data);
        }
        default:
          throw new Error(`Unknown tool name: ${name}`);
      }
    }
    catch (error) {
      console.error(`Error handling tool call: ${error}`);
      return {
        content: [{ type: 'text', text: `Error handling tool call: ${error}` }],
        isError: true,
      };
    }
  }
}
