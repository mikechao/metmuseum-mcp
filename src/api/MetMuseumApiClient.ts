import type z from 'zod';
import process from 'node:process';
import {
  DepartmentsSchema,
  ObjectResponseSchema,
  SearchResponseSchema,
} from '../types/types.js';
import { metMuseumRateLimiter } from '../utils/RateLimiter.js';

const DEFAULT_MET_API_TIMEOUT_MS = 10_000;

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
    console.warn(
      `Invalid MET_API_TIMEOUT_MS value "${rawTimeout}". Using default ${DEFAULT_MET_API_TIMEOUT_MS}ms.`,
    );
    return DEFAULT_MET_API_TIMEOUT_MS;
  }

  return parsedTimeout;
}

export class MetMuseumApiError extends Error {
  public readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MetMuseumApiError';
    this.status = status;
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
      throw new MetMuseumApiError(`Invalid object response shape: ${JSON.stringify(parseResult.error.issues, null, 2)}`);
    }
    return parseResult.data;
  }

  private async fetchAndParse<T>(
    url: string,
    schema: z.ZodType<T>,
    endpointName: string,
  ): Promise<T> {
    const data = await this.fetchJson(url);
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      throw new MetMuseumApiError(`Invalid ${endpointName} response shape: ${JSON.stringify(parseResult.error.issues, null, 2)}`);
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
        throw new MetMuseumApiError(`Met Museum API request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      throw new MetMuseumApiError(`HTTP error! status: ${response.status}`, response.status);
    }
    return await response.json();
  }
}
