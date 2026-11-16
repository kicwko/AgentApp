import { API_CONFIG } from '../config/api';

export interface ApiResponse<T = any> {
  success?: boolean;
  status?: string;
  data?: T;
  count?: number;
  message?: string;
  stats?: {
    total: number;
    pending: number;
    inTransit: number;
    inProgress: number;
    done: number;
    canceled: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);

    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-admin-email': API_CONFIG.defaultAdminEmail,
      'x-user-role': API_CONFIG.defaultAdminRole,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers as Record<string, string>),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let json: any = {};
      if (contentType.includes('application/json')) {
        json = await response.json();
      } else {
        const text = await response.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = { message: text };
        }
      }

      if (!response.ok) {
        throw new Error(
          json?.message || `API error (${response.status}): ${response.statusText}`
        );
      }

      return json;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${API_CONFIG.timeoutMs / 1000}s`);
      }
      throw error;
    }
  }

  public async get<T>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    let finalUrl = endpoint;
    if (params && Object.keys(params).length > 0) {
      const queryParts = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      if (queryParts.length > 0) {
        finalUrl += (endpoint.includes('?') ? '&' : '?') + queryParts.join('&');
      }
    }
    return this.request<T>(finalUrl, { method: 'GET' });
  }

  public async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;

