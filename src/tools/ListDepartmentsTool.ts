import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import z from 'zod';

export class ListDepartmentsTool {
  public readonly name: string = 'list-departments';
  public readonly description: string = 'List all departments in the Metropolitan Museum of Art (Met Museum)';
  public readonly inputSchema = z.object({}).describe('No input required');

  private readonly apiClient: MetMuseumApiClient;

  constructor(apiClient: MetMuseumApiClient) {
    this.apiClient = apiClient;
  }

  public async execute(): Promise<CallToolResult> {
    try {
      const departments = await this.apiClient.listDepartments();
      const text = departments.map((department) => {
        return `Department ID: ${department.departmentId}, Display Name: ${department.displayName}`;
      }).join('\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          departments,
        },
        isError: false,
      };
    }
    catch (error) {
      console.error('Error listing departments:', error);
      return {
        content: [{ type: 'text', text: `Error listing departments: ${error}` }],
        isError: true,
      };
    }
  }
}
