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
  selfie?: string;
  documents?: any[];
  checklist?: any;
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
  onetimePaymentstatus?: boolean;
  paymentDetails?: any;
  transactionDetails?: any;
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
  selfie?: string;
  documents?: any[];
  checklist?: any;
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

export interface FaceMatchResponse {
  success?: boolean;
  matched?: boolean;
  isMatched?: boolean;
  confidence?: number;
  threshold?: number;
  message?: string;
  error?: string;
  data?: {
    user?: Partial<BackendUser>;
    confidence?: number;
    thresholds?: Record<string, number>;
    [key: string]: any;
  };
}

export interface AgentStatusResponse {
  success?: boolean;
  status?: 'Active' | 'Pending' | 'Blocked' | string;
  onetimePaymentstatus?: boolean;
  onetimefee?: number;
  agentId?: string;
  applicationId?: string;
  agentName?: string;
  number?: string;
  transactionDetails?: any;
  paymentDetails?: any;
  data?: {
    applicationId?: string;
    agentName?: string;
    number?: string;
    status?: string;
    agentId?: string;
    onetimefee?: number;
    onetimePaymentstatus?: boolean;
    transactionDetails?: any;
    paymentDetails?: any;
    updatedAt?: string;
    [key: string]: any;
  };
  message?: string;
  error?: string;
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
      (cleanPhone ? `${cleanPhone}@kweecko.partner` : undefined);

    // Query syncFirebaseUser by email / uid / phone (read-only live DB retrieval - do NOT pass userType so backend does not create user)
    try {
      const syncRes = await apiClient.post<BackendUser>(
        API_CONFIG.endpoints.syncFirebaseUser,
        {
          email: userEmail,
          uid: params.uid || (cleanPhone ? `agent_${cleanPhone}` : undefined),
          phone: cleanPhone || undefined,
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

    // Do NOT auto-register unregistered users! Throw error so caller knows user is not in database
    throw new Error('Partner account not found in database');
  },

  // Save or update partner profile directly in backend database (real-time sync)
  savePartnerProfile: async (
    userData: Partial<BackendUser>
  ): Promise<ApiResponse<BackendUser>> => {
    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, userData);
  },

  // Update partner duty / availability status in backend database (real-time toggle)
  updateDutyStatus: async (params: {
    phone?: string | null;
    userId?: string | null;
    email?: string | null;
    fullName?: string | null;
    isOnDuty: boolean;
  }): Promise<ApiResponse<BackendUser>> => {
    const cleanPhone = params.phone ? params.phone.replace(/\D/g, '').slice(-10) : '';
    const payload: any = {
      phone: cleanPhone || undefined,
      email: params.email || undefined,
      fullName: params.fullName || undefined,
      availability: params.isOnDuty,
      availabilty: params.isOnDuty,
      isOnDuty: params.isOnDuty,
      dutyStatus: params.isOnDuty ? 'ON' : 'OFF',
      preferences: {
        isOnDuty: params.isOnDuty,
      },
    };

    // 1. Try PUT /api/users/:id if userId exists (e.g. MongoDB _id or agentId)
    if (params.userId) {
      try {
        const putRes = await apiClient.put<BackendUser>(
          `${API_CONFIG.endpoints.users}/${params.userId}`,
          payload
        );
        if (putRes && (putRes.success || putRes.data)) {
          return putRes;
        }
      } catch {
        // Fallback to register / sync endpoint below
      }
    }

    // 2. Also sync to POST /api/users/register (updates or registers in MongoDB)
    return apiClient.post<BackendUser>(API_CONFIG.endpoints.registerUser, payload);
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
      userType: payload.userType,
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

  // Match camera photo with Aadhaar document via Face++ API
  faceMatch: async (
    image: string,
    tokenOrUid?: string
  ): Promise<ApiResponse<FaceMatchResponse>> => {
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
    return apiClient.post<FaceMatchResponse>(
      API_CONFIG.endpoints.faceMatch,
      { image },
      { headers }
    );
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

  // Check if partner already exists by email, phone, Aadhaar, or DOB
  checkUserExists: async (params: {
    email?: string | null;
    mobileNumber?: string;
    phone?: string;
    aadhaarNumber?: string;
    aadhaar?: string;
    dob?: string;
  }): Promise<{
    success?: boolean;
    exists?: boolean;
    message?: string;
    user?: BackendUser;
    data?: BackendUser;
    details?: any;
    [key: string]: any;
  }> => {
    const payload: Record<string, any> = {};
    if (params.email) {
      payload.email = params.email.trim().toLowerCase();
    }
    const phone = params.mobileNumber || params.phone;
    if (phone) {
      payload.mobileNumber = phone;
      payload.phone = phone;
    }
    const aadhaar = params.aadhaarNumber || params.aadhaar;
    if (aadhaar) {
      payload.aadhaarNumber = aadhaar;
    }
    if (params.dob) {
      payload.dob = params.dob;
    }
    return apiClient.post(API_CONFIG.endpoints.checkUserExists, payload);
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

  // Fetch live agent lifecycle status & one-time payment status
  getAgentStatus: async (tokenOrUid?: string): Promise<ApiResponse<AgentStatusResponse>> => {
    return apiClient.get<AgentStatusResponse>(API_CONFIG.endpoints.agentStatus);
  },

  // Update agent one-time payment status and transaction details
  updateAgentPayment: async (
    payload: {
      onetimePaymentstatus: boolean;
      paymentDetails?: any;
      transactionDetails?: any;
      transactionId?: string;
      amount?: number;
    },
    tokenOrUid?: string
  ): Promise<ApiResponse<any>> => {
    return apiClient.put<any>(API_CONFIG.endpoints.agentPayment, payload);
  },
};

export default userService;

