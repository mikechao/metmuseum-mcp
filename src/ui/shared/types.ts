import type { App } from '@modelcontextprotocol/ext-apps';

export interface ObjectData {
  objectID?: number | string;
  title?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  department?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  creditLine?: string;
  objectURL?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  tags?: Array<{ term?: string }>;
}

export type ToolInputParams = Parameters<NonNullable<App['ontoolinput']>>[0];
export type ToolResult = Awaited<ReturnType<App['callServerTool']>>;
export type ToolContentBlock = NonNullable<ToolResult['content']>[number];
export type HostContext = ReturnType<App['getHostContext']>;
