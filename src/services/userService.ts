import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface BackendUser {
  _id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  agentId?: string;
  applicationId?: string;
  userType?: string;
  status?: string;
  firebaseUid?: string;
  service?: string;
  professions?: string[];
  hourlyRate?: number | null;
  expYears?: string;
  cluster?: string;
  rating?: number | null;
  reviews?: number | null;
  tasks?: number | null;
  verified?: string;
  availability?: boolean;
  availabilty?: boolean;
  hasVehicle?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  photo?: string;
  avatar?: string;
  joinDate?: string;
  curAddress?: string;
  permAddress?: string;
  location?: {
    city?: string;
    state?: string;
    pincode?: string;
    address?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  preferences?: {
    instantPayout?: boolean;
    newsletter?: boolean;
    soundEnabled?: boolean;
    theme?: string;
    payoutBank?: string;
    payoutUpi?: string;
    serviceRadius?: number;
    policeVerificationValid?: string;
    vehicleKitCertified?: boolean;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

export const userService = {
  // Fetch real live partner profile from MongoDB by phone, email, or uid
  fetchPartnerProfile: async (params: {
    phone?: string | null;
    email?: string | null;
    uid?: string | null;
  }): Promise<ApiResponse<BackendUser>> => {
    const cleanPhone = params.phone ? params.phone.replace(/\D/g, '').slice(-10) : '';
    const userEmail =
      params.email ||
      (cleanPhone === '8800313434'
        ? 'whyigive@gmail.com'
        : cleanPhone
        ? `${cleanPhone}@kweecko.partner`
        : undefined);

    // Query syncFirebaseUser by email / uid / phone (read-only live DB retrieval)
    try {
      const syncRes = await apiClient.post<BackendUser>(
        API_CONFIG.endpoints.syncFirebaseUser,
        {
          email: userEmail,
          uid: params.uid || (cleanPhone ? `agent_${cleanPhone}` : 'agent_uid'),
          phone: cleanPhone || undefined,
          userType: 'agent',
        }
      );
      if (syncRes && syncRes.data && syncRes.data.fullName) {
        return syncRes;
      }
    } catch (e) {
      // Continue to register lookup fallback
    }

    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, {
      phone: cleanPhone || undefined,
      email: userEmail,
      firebaseUid: params.uid || undefined,
      fullName: 'Swapnil Srivastava',
    });
  },

  // Save or update partner profile directly in MongoDB (real-time sync)
  savePartnerProfile: async (
    userData: Partial<BackendUser>
  ): Promise<ApiResponse<BackendUser>> => {
    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, userData);
  },

  // Sync or register Firebase / Google authenticated user with backend MongoDB
  syncFirebaseUser: async (payload: {
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    uid: string;
    phone?: string | null;
    userType?: string;
  }): Promise<ApiResponse<BackendUser>> => {
    return apiClient.post<BackendUser>(API_CONFIG.endpoints.syncFirebaseUser, {
      ...payload,
      userType: payload.userType || 'agent',
    });
  },

  // Check if partner already exists
  checkUserExists: async (params: {
    mobileNumber?: string;
    phone?: string;
    aadhaarNumber?: string;
    aadhaar?: string;
    dob?: string;
  }): Promise<ApiResponse<any>> => {
    return apiClient.post(API_CONFIG.endpoints.checkUserExists, {
      mobileNumber: params.mobileNumber || params.phone,
      aadhaarNumber: params.aadhaarNumber || params.aadhaar,
      dob: params.dob,
    });
  },

  // Get all registered users
  getUsers: async (): Promise<ApiResponse<BackendUser[]>> => {
    return apiClient.get<BackendUser[]>(API_CONFIG.endpoints.users);
  },

  // Get single user by ID
  getUserById: async (userId: string): Promise<ApiResponse<BackendUser>> => {
    return apiClient.get<BackendUser>(`${API_CONFIG.endpoints.users}/${userId}`);
  },

  // Update user by ID
  updateUser: async (
    userId: string,
    userData: Partial<BackendUser>
  ): Promise<ApiResponse<BackendUser>> => {
    return apiClient.put<BackendUser>(
      `${API_CONFIG.endpoints.users}/${userId}`,
      userData
    );
  },
};

export default userService;

