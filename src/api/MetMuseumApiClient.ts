import type z from 'zod';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { DEFAULT_MET_API_TIMEOUT_MS } from '../constants.js';
import {
  DepartmentsSchema,
  ObjectResponseSchema,
  SearchResponseSchema,
} from '../types/types.js';
import { metMuseumRateLimiter } from '../utils/RateLimiter.js';

function normalizeNulls<T>(value: T): T {
  if (value === null) {
    return undefined as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeNulls(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, normalizeNulls(val)]),
    ) as T;
  }
  return value;
}

function getMetApiTimeoutMs(): number {
  const rawTimeout = process.env.MET_API_TIMEOUT_MS;
  if (!rawTimeout) {
    return DEFAULT_MET_API_TIMEOUT_MS;
  }

  const parsedTimeout = Number.parseInt(rawTimeout, 10);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    // Note: Silently use default timeout. Invalid configuration is a developer
    // error and logging would leak implementation details in stdio mode.
    return DEFAULT_MET_API_TIMEOUT_MS;
  }

  return parsedTimeout;
}

function createUnexpectedResponseError(endpointName: string): MetMuseumApiError {
  return new MetMuseumApiError(
    `The Met Museum API returned an unexpected ${endpointName} response. Please try again later.`,
    undefined,
    true,
  );
}

export class MetMuseumApiError extends Error {
  public readonly status: number | undefined;
  public readonly isUserFriendly: boolean;

  constructor(message: string, status?: number, isUserFriendly: boolean = false) {
    super(message);
    this.name = 'MetMuseumApiError';
    this.status = status;
    this.isUserFriendly = isUserFriendly;
  }
}

export class MetMuseumApiClient {
  private readonly departmentsUrl: string = 'https://collectionapi.metmuseum.org/public/collection/v1/departments';
  private readonly searchUrl: string = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
  private readonly objectBaseUrl: string = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';
  private readonly requestTimeoutMs: number = getMetApiTimeoutMs();

  public async listDepartments(): Promise<z.infer<typeof DepartmentsSchema>['departments']> {
    const data = await this.fetchAndParse(this.departmentsUrl, DepartmentsSchema, 'departments');
    return data.departments;
  }

  public async searchObjects({
    q,
    hasImages,
    title,
    departmentId,
    isHighlight,
    tags,
    isOnView,
    artistOrCulture,
    medium,
    geoLocation,
    dateBegin,
    dateEnd,
  }: {
    q: string;
    hasImages?: boolean;
    title?: boolean;
    departmentId?: number;
    isHighlight?: boolean;
    tags?: boolean;
    isOnView?: boolean;
    artistOrCulture?: boolean;
    medium?: string;
    geoLocation?: string;
    dateBegin?: number;
    dateEnd?: number;
  }): Promise<z.infer<typeof SearchResponseSchema>> {
    if ((dateBegin === undefined) !== (dateEnd === undefined)) {
      throw new MetMuseumApiError(
        'Both dateBegin and dateEnd are required when filtering by date range.',
        undefined,
        true,
      );
    }

    const url = new URL(this.searchUrl);
    url.searchParams.set('q', q);
    if (hasImages) {
      url.searchParams.set('hasImages', 'true');
    }
    if (title) {
      url.searchParams.set('title', 'true');
    }
    if (typeof departmentId === 'number') {
      url.searchParams.set('departmentId', departmentId.toString());
    }
    if (isHighlight) {
      url.searchParams.set('isHighlight', 'true');
    }
    if (tags) {
      url.searchParams.set('tags', 'true');
    }
    if (isOnView) {
      url.searchParams.set('isOnView', 'true');
    }
    if (artistOrCulture) {
      url.searchParams.set('artistOrCulture', 'true');
    }
    if (medium) {
      url.searchParams.set('medium', medium);
    }
    if (geoLocation) {
      url.searchParams.set('geoLocation', geoLocation);
    }
    if (typeof dateBegin === 'number') {
      url.searchParams.set('dateBegin', dateBegin.toString());
    }
    if (typeof dateEnd === 'number') {
      url.searchParams.set('dateEnd', dateEnd.toString());
    }
    return await this.fetchAndParse(url.toString(), SearchResponseSchema, 'search');
  }

  public async getObject(objectId: number): Promise<z.infer<typeof ObjectResponseSchema>> {
    const url = `${this.objectBaseUrl}${objectId}`;
    const rawData = await this.fetchJson(url);
    const normalizedData = normalizeNulls(rawData);
    const parseResult = ObjectResponseSchema.safeParse(normalizedData);
    if (!parseResult.success) {
      throw createUnexpectedResponseError('object');
    }
    return parseResult.data;
  }

  public async getImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    let response: Response;
    try {
      response = await metMuseumRateLimiter.fetch(imageUrl, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    }
    catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new MetMuseumApiError(
          'The artwork image is taking too long to load. Please try again.',
          undefined,
          true,
        );
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new MetMuseumApiError(
          'The artwork image is unreachable right now. Please try again.',
          undefined,
          true,
        );
      }
      throw error;
    }

    if (!response.ok) {
      let userMessage = 'Unable to load the artwork image right now.';
      if (response.status === 404) {
        userMessage = 'The artwork image was not found.';
      }
      else if (response.status === 429) {
        userMessage = 'Too many requests while loading the artwork image. Please wait a moment and try again.';
      }
      else if (response.status >= 500) {
        userMessage = 'The image host is experiencing issues. Please try again later.';
      }
      throw new MetMuseumApiError(userMessage, response.status, true);
    }

    const mimeTypeHeader = response.headers.get('content-type') ?? '';
    const parsedMimeType = mimeTypeHeader.split(';')[0]?.trim();
    const mimeType = parsedMimeType?.startsWith('image/') ? parsedMimeType : 'image/jpeg';

    const imageBytes = await response.arrayBuffer();
    return {
      data: Buffer.from(imageBytes).toString('base64'),
      mimeType,
    };
  }

  private async fetchAndParse<T>(
    url: string,
    schema: z.ZodType<T>,
    endpointName: string,
  ): Promise<T> {
    const data = await this.fetchJson(url);
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      throw createUnexpectedResponseError(endpointName);
    }
    return parseResult.data;
  }

  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await metMuseumRateLimiter.fetch(url, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    }
    catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new MetMuseumApiError(
          `The Met Museum API is taking too long to respond. Please try again.`,
          undefined,
          true, // isUserFriendly
        );
      }
      // Network errors (DNS, connection refused, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new MetMuseumApiError(
          `The Met Museum API is unreachable. Please check your internet connection and try again.`,
          undefined,
          true, // isUserFriendly
        );
      }
      throw error;
    }

    if (!response.ok) {
      let userMessage = `The Met Museum API returned an error`;
      if (response.status === 404) {
        userMessage = 'The requested object or department was not found.';
      }
      else if (response.status === 429) {
        userMessage = 'Too many requests to the Met Museum API. Please wait a moment and try again.';
      }
      else if (response.status >= 500) {
        userMessage = 'The Met Museum API is experiencing issues. Please try again later.';
      }
      else if (response.status >= 400) {
        userMessage = `The Met Museum API rejected the request (HTTP ${response.status}).`;
      }
      throw new MetMuseumApiError(userMessage, response.status, true);
    }
    return await response.json();
  }
}
