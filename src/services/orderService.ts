import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface BackendOrder {
  _id: string;
  orderId: string;
  transactionId?: string;
  agentId?: string;
  agent?: string | null;
  agentName?: string;
  agentPhone?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    userId?: string;
  };
  taskCategoryIds?: string[];
  taskCategoryNames?: string[];
  taskTitle: string;
  taskDescription?: string;
  totalPrice: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  agentPayment?: {
    amount?: number;
    status?: string;
    payoutMethod?: string;
    paidAt?: string | null;
  };
  rating?: {
    stars?: number | null;
    comment?: string;
    ratedAt?: string | null;
  };
  cancellation?: {
    reason?: string;
    canceledBy?: string;
    canceledAt?: string | null;
  };
  status: 'Pending' | 'In Transit' | 'In Progress' | 'Done' | 'Canceled';
  location?: {
    address?: string;
    flat?: string;
    street?: string;
    cluster?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  scheduledDate?: string;
  scheduledTimeSlot?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetOrdersParams {
  agentId?: string;
  status?: string;
  customerPhone?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PollOrdersParams {
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  since?: number | string;
  lastOrderId?: string;
  role?: 'agent' | 'customer' | 'any';
  limit?: number;
  phone?: string;
  userId?: string;
}

export interface PollOrdersResponse {
  success: boolean;
  hasNewOrder?: boolean;
  newOrdersCount?: number;
  totalPendingCount?: number;
  polledAt?: string;
  timestamp?: number;
  latestOrder?: BackendOrder;
  orders?: BackendOrder[];
  data?: BackendOrder[];
  user?: any;
}

export const orderService = {
  // Query orders with optional filters
  getOrders: async (params?: GetOrdersParams): Promise<ApiResponse<BackendOrder[]>> => {
    return apiClient.get<BackendOrder[]>(API_CONFIG.endpoints.orders, params);
  },

  // Poll new pending orders (every 15s with lat & lng + robust fallback)
  pollOrders: async (
    params?: PollOrdersParams
  ): Promise<ApiResponse<PollOrdersResponse>> => {
    const cleanPhone = params?.phone
      ? params.phone.replace(/\D/g, '').slice(-10)
      : apiClient.getUserPhone() || undefined;

    const customHeaders: Record<string, string> = {};
    if (cleanPhone) {
      customHeaders['x-user-phone'] = cleanPhone;
      customHeaders['x-auth-token'] = `mock-jwt-${cleanPhone}`;
      if (!apiClient.getAuthToken()) {
        customHeaders['Authorization'] = `Bearer mock-jwt-${cleanPhone}`;
      }
    }
    const resolvedUserId = params?.userId || apiClient.getUserId();
    if (resolvedUserId) {
      customHeaders['x-user-id'] = resolvedUserId;
    }

    try {
      const res = await apiClient.get<PollOrdersResponse>(
        API_CONFIG.endpoints.ordersPoll,
        params,
        { headers: customHeaders }
      );
      if (res.success && res.data) {
        return res;
      }
      throw new Error(res.error || 'Primary poll unsuccessful');
    } catch {
      // Robust Fallback: query active pending orders directly
      try {
        const ordersRes = await apiClient.get<BackendOrder[]>(
          API_CONFIG.endpoints.orders,
          { status: 'Pending', limit: 20 },
          { headers: customHeaders }
        );
        const orderList = Array.isArray(ordersRes.data) ? ordersRes.data : [];
        return {
          success: true,
          data: {
            success: true,
            hasNewOrder: orderList.length > 0,
            newOrdersCount: orderList.length,
            totalPendingCount: orderList.length,
            latestOrder: orderList[0],
            orders: orderList,
          },
        };
      } catch (fallbackErr: any) {
        return {
          success: false,
          error: fallbackErr?.message || 'Failed to poll orders',
        };
      }
    }
  },

  // Get single order details
  getOrderById: async (orderId: string): Promise<ApiResponse<BackendOrder>> => {
    return apiClient.get<BackendOrder>(`${API_CONFIG.endpoints.orders}/${orderId}`);
  },

  // Create task / order
  createOrder: async (orderData: Partial<BackendOrder>): Promise<ApiResponse<BackendOrder>> => {
    return apiClient.post<BackendOrder>(API_CONFIG.endpoints.orders, orderData);
  },

  // Update order status: 'In Transit' | 'In Progress' | 'Done' | 'Canceled'
  updateOrderStatus: async (
    orderId: string,
    payload: { status: string; reason?: string; canceledBy?: string }
  ): Promise<ApiResponse<BackendOrder>> => {
    // 1. Primary: /api/orders/:id/status
    try {
      const res = await apiClient.put<BackendOrder>(
        `${API_CONFIG.endpoints.orders}/${orderId}/status`,
        payload
      );
      if (res && res.success) {
        return res;
      }
    } catch {
      // Fallback
    }

    // 2. Secondary: /api/orders/:id
    try {
      const res = await apiClient.put<BackendOrder>(
        `${API_CONFIG.endpoints.orders}/${orderId}`,
        payload
      );
      if (res && res.success) {
        return res;
      }
    } catch {
      // Fallback
    }

    // 3. Tertiary: /api/orders/update/:id
    return apiClient.put<BackendOrder>(
      `${API_CONFIG.endpoints.orders}/update/${orderId}`,
      payload
    );
  },

  // Update agent payment
  updateAgentPayment: async (
    orderId: string,
    payload: { status: string; amount?: number; payoutMethod?: string }
  ): Promise<ApiResponse<BackendOrder>> => {
    return apiClient.put<BackendOrder>(
      `${API_CONFIG.endpoints.orders}/${orderId}/agent-payment`,
      payload
    );
  },

  // Submit consumer review & rating
  submitRating: async (
    orderId: string,
    payload: { stars: number; comment?: string }
  ): Promise<ApiResponse<BackendOrder>> => {
    return apiClient.post<BackendOrder>(
      `${API_CONFIG.endpoints.orders}/${orderId}/rating`,
      payload
    );
  },

  // Delete order
  deleteOrder: async (orderId: string): Promise<ApiResponse<any>> => {
    return apiClient.delete(`${API_CONFIG.endpoints.orders}/${orderId}`);
  },
};

export default orderService;

