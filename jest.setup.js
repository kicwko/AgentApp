const mockStorage = {};

const mockAsyncStorage = {
  setItem: jest.fn((key, value) => {
    mockStorage[key] = value;
    return Promise.resolve(null);
  }),
  getItem: jest.fn((key) => {
    return Promise.resolve(mockStorage[key] || null);
  }),
  removeItem: jest.fn((key) => {
    delete mockStorage[key];
    return Promise.resolve(null);
  }),
  clear: jest.fn(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    return Promise.resolve(null);
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStorage))),
  multiGet: jest.fn((keys) =>
    Promise.resolve(keys.map((k) => [k, mockStorage[k] || null]))
  ),
  multiSet: jest.fn((kvPairs) => {
    kvPairs.forEach(([k, v]) => {
      mockStorage[k] = v;
    });
    return Promise.resolve(null);
  }),
  multiRemove: jest.fn((keys) => {
    keys.forEach((k) => delete mockStorage[k]);
    return Promise.resolve(null);
  }),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
  ...mockAsyncStorage,
}));
