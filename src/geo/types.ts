/** Flat [lon, lat, lon, lat, ...] ring. Longitudes are unwrapped by the bake step. */
export type FlatRing = number[];

/** One polygon: an outer ring followed by optional holes. */
export type Polygon = FlatRing[];

export type PolygonSet = Polygon[];

export interface LandData {
  polygons: PolygonSet;
}

export interface LakeData {
  polygons: PolygonSet;
}

export interface CountryData {
  name: string;
  iso: string;
  capital: string;
  capitalLat: number | null;
  capitalLon: number | null;
  /** A fallback seat of government used after the primary capital falls. */
  secondaryCapitalLat?: number | null;
  secondaryCapitalLon?: number | null;
  siteLat: number | null;
  siteLon: number | null;
  timezone: string;
  pop: number;
  polygons: PolygonSet;
}

export interface CountriesData {
  countries: CountryData[];
}

/** Flattened [lat, lon, population] triplets. */
export interface CitiesData {
  cities: number[];
}
