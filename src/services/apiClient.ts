import { Platform } from 'react-native';
import { API_CONFIG } from '../config/api';

export interface ApiResponse<T = any> {
  success?: boolean;
  status?: string;
  isPending?: boolean;
  isBlocked?: boolean;
  matched?: boolean;
  isMatched?: boolean;
  confidence?: number;
  threshold?: number;
  error?: string;
  reason?: string;
  pendingReason?: string;
  data?: T;
  count?: number;
  message?: string;
  token?: string;
  checklist?: {
    picture?: { submitted?: boolean; photo?: string };
    bankDetails?: {
      submitted?: boolean;
      accountHolderName?: string;
      accountNumber?: string;
      ifscCode?: string;
      bankName?: string;
      branchName?: string;
      upiId?: string;
      hasDocument?: boolean;
      verified?: boolean;
    };
    policeVerification?: {
      submitted?: boolean;
      status?: string;
      certificateNumber?: string;
      hasDocument?: boolean;
    };
    allSubmitted?: boolean;
    missingItems?: string[];
  };
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
  private authToken: string | null = null;
  private userPhone: string | null = null;
  private userId: string | null = null;

  constructor() {
    this.baseUrl = typeof __DEV__ !== 'undefined' && __DEV__
      ? this.getFallbackBaseUrl()
      : API_CONFIG.baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setUserSession(session: {
    phone?: string | null;
    userId?: string | null;
    token?: string | null;
  }) {
    if (session.phone !== undefined) {
      this.userPhone = session.phone ? session.phone.replace(/\D/g, '').slice(-10) : null;
    }
    if (session.userId !== undefined) {
      this.userId = session.userId || null;
    }
    if (session.token !== undefined) {
      this.authToken = session.token || null;
    }
  }

  public setSession(session: {
    phone?: string | null;
    userId?: string | null;
    token?: string | null;
  }) {
    this.setUserSession(session);
  }

  public getUserPhone(): string | null {
    return this.userPhone;
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public setAuthToken(token: string | null) {
    this.authToken = token;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  private getFallbackBaseUrl(): string {
    return Platform.OS === 'android'
      ? API_CONFIG.androidEmulatorUrl
      : API_CONFIG.localDevUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    return this.executeRequest<T>(this.baseUrl, endpoint, options, true);
  }

  private async executeRequest<T>(
    base: string,
    endpoint: string,
    options: RequestInit = {},
    allowFallback: boolean = true
  ): Promise<ApiResponse<T>> {
    const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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

    if (this.userPhone) {
      defaultHeaders['x-user-phone'] = this.userPhone;
    }

    if (this.userId) {
      defaultHeaders['x-user-id'] = this.userId;
    }

    if (this.authToken) {
      defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;
      defaultHeaders['x-auth-token'] = this.authToken;
    } else if (this.userPhone) {
      defaultHeaders['Authorization'] = `Bearer mock-jwt-${this.userPhone}`;
      defaultHeaders['x-auth-token'] = `mock-jwt-${this.userPhone}`;
    }

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

      // If the production server returned 404 (e.g. newly deployed route not yet on prod)
      // and we are allowed fallback, try local development endpoint
      if (
        response.status === 404 &&
        allowFallback &&
        base === API_CONFIG.baseUrl
      ) {
        const fallbackBase = this.getFallbackBaseUrl();
        try {
          return await this.executeRequest<T>(
            fallbackBase,
            endpoint,
            options,
            false
          );
        } catch {
          // Fall back to original response error
        }
      }

      if (!response.ok) {
        const err: any = new Error(
          json?.message || `API error (${response.status}): ${response.statusText}`
        );
        err.status = json?.status || response.status;
        err.reason = json?.reason;
        err.isBlocked = json?.isBlocked;
        err.isPending = json?.isPending;
        err.data = json?.data;
        err.response = json;
        throw err;
      }

      return json;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Network fallback attempt
      if (allowFallback) {
        try {
          const fallbackBase =
            base === API_CONFIG.baseUrl
              ? this.getFallbackBaseUrl()
              : API_CONFIG.baseUrl;
          return await this.executeRequest<T>(
            fallbackBase,
            endpoint,
            options,
            false
          );
        } catch {
          // ignore fallback error and throw main error
        }
      }

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${API_CONFIG.timeoutMs / 1000}s`);
      }
      throw error;
    }
  }

  public async get<T>(
    endpoint: string,
    params?: Record<string, any>,
    options: RequestInit = {}
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
    return this.request<T>(finalUrl, { ...options, method: 'GET' });
  }

  public async post<T>(
    endpoint: string,
    body?: any,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T>(
    endpoint: string,
    body?: any,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;

