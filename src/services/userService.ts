import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface BackendUser {
  _id: string;
  id?: string;
  fullName?: string;
  userName?: string;
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
  bankName?: string;
  accountNumber?: string;
  upiId?: string;
  bank?: {
    name?: string;
    accountNumber?: string;
    upiId?: string;
  };
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
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    branchName?: string;
    upiId?: string;
    phone?: string;
    documentData?: string;
    documentName?: string;
    verified?: boolean;
    updatedAt?: string;
  };
  policeVerification?: {
    status?: string;
    certificateNumber?: string;
    documentData?: string;
    documentName?: string;
    policeStation?: string;
    issuedDate?: string;
    expiryDate?: string;
    remarks?: string;
    updatedAt?: string;
  };
  blockReason?: string;
  pendingReason?: string;
  reason?: string;
  isBlocked?: boolean;
  isPending?: boolean;
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

export interface PendingDocumentsPayload {
  picture?: string;
  photo?: string;
  avatar?: string;
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    branchName?: string;
    upiId?: string;
    phone?: string;
    documentData?: string;
    documentName?: string;
  };
  policeVerification?: {
    certificateNumber?: string;
    documentData?: string;
    documentName?: string;
    policeStation?: string;
    issuedDate?: string;
    status?: string;
  };
}

export const userService = {
  // Fetch real live partner profile from backend by phone, email, or uid
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

      // Return immediately if user found, or if user is Blocked or Pending
      if (
        syncRes &&
        (syncRes.status === 'Pending' ||
          syncRes.status === 'Blocked' ||
          syncRes.isPending ||
          syncRes.isBlocked ||
          (syncRes.data && (syncRes.data.fullName || syncRes.data.status)))
      ) {
        return syncRes;
      }
    } catch (e: any) {
      if (e?.isBlocked || e?.status === 'Blocked' || e?.isPending || e?.status === 'Pending') {
        throw e;
      }
    }

    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, {
      phone: cleanPhone || undefined,
      email: userEmail,
      firebaseUid: params.uid || undefined,
      fullName: 'Agent Partner',
    });
  },

  // Save or update partner profile directly in backend database (real-time sync)
  savePartnerProfile: async (
    userData: Partial<BackendUser>
  ): Promise<ApiResponse<BackendUser>> => {
    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, userData);
  },

  // Sync or register Firebase / Google authenticated user with backend database
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

  // Fetch current user's 3 mandatory verification documents checklist
  getPendingDocuments: async (tokenOrUid?: string): Promise<ApiResponse<any>> => {
    const headers: Record<string, string> = {};
    if (tokenOrUid) {
      headers['Authorization'] = `Bearer ${tokenOrUid}`;
      if (tokenOrUid.match(/^[0-9a-fA-F]{24}$/)) {
        headers['x-user-id'] = tokenOrUid;
      }
      const rawDigits = tokenOrUid.replace(/\D/g, '').slice(-10);
      if (rawDigits.length === 10) {
        headers['x-user-phone'] = rawDigits;
      }
      if (tokenOrUid.includes('@')) {
        headers['x-user-email'] = tokenOrUid;
      }
    }
    return apiClient.get(API_CONFIG.endpoints.pendingDocuments, undefined, { headers });
  },

  // Submit or update the 3 mandatory verification documents (Selfie, Bank Details, Police Verification)
  updatePendingDocuments: async (
    payload: PendingDocumentsPayload,
    tokenOrUid?: string
  ): Promise<ApiResponse<any>> => {
    const headers: Record<string, string> = {};
    if (tokenOrUid) {
      headers['Authorization'] = `Bearer ${tokenOrUid}`;
      if (tokenOrUid.match(/^[0-9a-fA-F]{24}$/)) {
        headers['x-user-id'] = tokenOrUid;
      }
      const rawDigits = tokenOrUid.replace(/\D/g, '').slice(-10);
      if (rawDigits.length === 10) {
        headers['x-user-phone'] = rawDigits;
      }
      if (tokenOrUid.includes('@')) {
        headers['x-user-email'] = tokenOrUid;
      }
    }
    return apiClient.put(API_CONFIG.endpoints.pendingDocuments, payload, { headers });
  },

  // Send login OTP to mobile number
  loginSendOtp: async (mobile: string): Promise<ApiResponse<any>> => {
    return apiClient.post(API_CONFIG.endpoints.loginSendOtp, { mobile });
  },

  // Verify login OTP for mobile number
  loginVerifyOtp: async (mobile: string, otp: string): Promise<ApiResponse<any>> => {
    return apiClient.post(API_CONFIG.endpoints.loginVerifyOtp, { mobile, otp });
  },

  // Universal user login by email, mobile, or firebaseUid
  loginUser: async (payload: {
    email?: string;
    mobile?: string;
    firebaseUid?: string;
  }): Promise<ApiResponse<any>> => {
    return apiClient.post(API_CONFIG.endpoints.loginUser, payload);
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

