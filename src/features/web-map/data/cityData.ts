import type { CitySummary, CuratedCity } from '../places';
import { CityNotFoundError } from './adapt';
import { fetchApiCity, fetchApiCitySummaries } from './apiCities';

export { CityNotFoundError };

let summariesRequest: Promise<CitySummary[]> | null = null;
const cityRequests = new Map<string, Promise<CuratedCity>>();

export function loadCitySummaries(): Promise<CitySummary[]> {
  if (!summariesRequest) {
    summariesRequest = fetchApiCitySummaries();
    // A failed request is dropped so the next call retries instead of replaying the error.
    summariesRequest.catch(() => {
      summariesRequest = null;
    });
  }
  return summariesRequest;
}

export function loadCity(cityId: string): Promise<CuratedCity> {
  let request = cityRequests.get(cityId);
  if (!request) {
    request = fetchApiCity(cityId);
    cityRequests.set(cityId, request);
    request.catch(() => cityRequests.delete(cityId));
  }
  return request;
}

export function defaultCityId(cities: CitySummary[]) {
  return cities.some((city) => city.id === 'barcelona') ? 'barcelona' : (cities[0]?.id ?? null);
}
