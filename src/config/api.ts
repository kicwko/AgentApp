/**
 * Global API Configuration.
 * Connects to the production Kweecko API backend (https://kweecko.com/api).
 */
export const PRODUCTION_API_URL = 'https://kweecko.com/api';

export const API_CONFIG = {
  baseUrl: PRODUCTION_API_URL,
  timeoutMs: 25000,
  defaultAdminEmail: 'admin@kwiqo.com',
  defaultAdminRole: 'admin',
  endpoints: {
    health: '/health',
    orders: '/orders',
    categories: '/categories',
    users: '/users',
    registerUser: '/users/register',
    syncFirebaseUser: '/users/sync-firebase',
    checkUserExists: '/users/check-exists',
    loginSendOtp: '/users/login/send-otp',
    loginVerifyOtp: '/users/login/verify-otp',
    locationGeocode: '/location/geocode',
  },
};
