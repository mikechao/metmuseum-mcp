import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MetMuseumApiClient } from '../api/MetMuseumApiClient.js';
import type { DepartmentsSchema } from '../types/types.js';
import z from 'zod';
import { MetMuseumApiError } from '../api/MetMuseumApiClient.js';

type ListDepartmentsStructuredContent = z.infer<typeof DepartmentsSchema>;

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
      const structuredContent: ListDepartmentsStructuredContent = {
        departments,
      };
      const text = departments.map((department) => {
        return `Department ID: ${department.departmentId}, Display Name: ${department.displayName}`;
      }).join('\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent,
        isError: false,
      };
    }
    catch (error) {
      // Note: Error is returned to user in the tool response below.
      // No need to log to stderr as it would leak implementation details in stdio mode.
      const message = error instanceof MetMuseumApiError && error.isUserFriendly
        ? error.message
        : `Error listing departments: ${error}`;
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  }
}
