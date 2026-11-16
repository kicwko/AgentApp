import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface GeocodeResult {
  house?: string;
  road?: string;
  street?: string;
  neighbourhood?: string;
  city?: string;
  state?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  pincode?: string;
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export const locationService = {
  // Reverse geocode latitude and longitude to full address
  lookupLocation: async (
    lat: number,
    lng: number
  ): Promise<ApiResponse<GeocodeResult>> => {
    return apiClient.get<GeocodeResult>(API_CONFIG.endpoints.locationGeocode, {
      lat,
      lng,
    });
  },
};

export default locationService;

