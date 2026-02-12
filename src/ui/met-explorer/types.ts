export interface SearchRequest {
  q: string;
  hasImages: boolean;
  title: boolean;
  departmentId?: number;
}

export interface ResultCard {
  objectID: number;
  title: string;
  artistDisplayName: string;
  department: string;
  primaryImageSmall: string;
}
