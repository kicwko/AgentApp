/**
 * Global API Configuration.
 * Connects to the production Kweecko API backend (https://kweecko.com/api)
 * with automatic local development fallbacks.
 */
export const PRODUCTION_API_URL = 'https://kweecko.com/api';
export const LOCAL_DEV_API_URL = 'http://localhost:6001/api';
export const ANDROID_EMULATOR_API_URL = 'http://10.0.2.2:6001/api';

export const API_CONFIG = {
  baseUrl: PRODUCTION_API_URL,
  localDevUrl: LOCAL_DEV_API_URL,
  androidEmulatorUrl: ANDROID_EMULATOR_API_URL,
  timeoutMs: 60000,
  defaultAdminEmail: 'admin@kwiqo.com',
  defaultAdminRole: 'admin',
  endpoints: {
    health: '/health',
    orders: '/orders',
    ordersPoll: '/orders/poll',
    categories: '/categories',
    users: '/users',
    registerUser: '/users/register',
    syncFirebaseUser: '/users/sync-firebase',
    checkUserExists: '/users/check-exists',
    loginSendOtp: '/users/login/send-otp',
    loginVerifyOtp: '/users/login/verify-otp',
    loginUser: '/users/login',
    pendingDocuments: '/users/me/pending-documents',
    faceMatch: '/users/face-match',
    locationGeocode: '/location/geocode',
  },
};
