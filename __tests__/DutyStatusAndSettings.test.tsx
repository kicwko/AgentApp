import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { userService } from '../src/services/userService';
import apiClient from '../src/services/apiClient';

jest.mock('../src/services/firebaseAuth', () => ({
  subscribeToAuthState: jest.fn(),
  signOutFirebase: jest.fn(),
}));

jest.mock('../src/services/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('Duty Status Service & Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updateDutyStatus calls put endpoint with correct payload when userId is provided', async () => {
    (apiClient.put as jest.Mock).mockResolvedValueOnce({
      success: true,
      message: 'Partner record updated successfully',
      data: {
        _id: '6adb14a59137b738c13a767b',
        availability: true,
        dutyStatus: 'ON',
      },
    });

    const res = await userService.updateDutyStatus({
      phone: '9876543210',
      userId: '6adb14a59137b738c13a767b',
      email: 'test@example.com',
      fullName: 'Test Agent',
      isOnDuty: true,
    });

    expect(apiClient.put).toHaveBeenCalledWith(
      '/users/6adb14a59137b738c13a767b',
      expect.objectContaining({
        availability: true,
        availabilty: true,
        isOnDuty: true,
        dutyStatus: 'ON',
        preferences: { isOnDuty: true },
        fullName: 'Test Agent',
      })
    );
    expect(res.success).toBe(true);
  });

  it('updateDutyStatus falls back to register endpoint if PUT fails', async () => {
    (apiClient.put as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      success: true,
      message: 'Service partner updated successfully',
      data: {
        _id: '6adb14a59137b738c13a767b',
        availability: false,
        dutyStatus: 'OFF',
      },
    });

    const res = await userService.updateDutyStatus({
      phone: '9876543210',
      userId: '6adb14a59137b738c13a767b',
      isOnDuty: false,
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/users/register',
      expect.objectContaining({
        availability: false,
        availabilty: false,
        isOnDuty: false,
        dutyStatus: 'OFF',
        preferences: { isOnDuty: false },
      })
    );
    expect(res.success).toBe(true);
  });

  describe('SettingsScreen Gradient CTAs', () => {
    it('renders all 4 requested gradient CTAs with correct labels', async () => {
      const { SettingsScreen } = require('../src/screens/SettingsScreen');
      const mockUser = {
        uid: 'test-agent',
        email: 'agent@kwiqo.com',
        phoneNumber: '+919625650723',
        displayName: 'Sanjana Partner',
      };

      (apiClient.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          fullName: 'Sanjana Partner',
          phone: '9625650723',
          professions: ['Electrician'],
          service: 'Electrician',
        },
      });

      let root: any;
      await ReactTestRenderer.act(async () => {
        root = ReactTestRenderer.create(
          <SettingsScreen
            user={mockUser as any}
            isOnDuty={true}
            onToggleDuty={jest.fn()}
            onSignOut={jest.fn()}
          />
        );
        await Promise.resolve();
      });

      const findByProp = (prop: string, val: any) =>
        root.root.findAll((node: any) => node.props && node.props[prop] === val);

      // 1. Profession label CTA
      expect(findByProp('accessibilityLabel', 'Profession Skills').length).toBeGreaterThan(0);
      // 2. View card CTA
      expect(findByProp('accessibilityLabel', 'View Police Verification Card').length).toBeGreaterThan(0);
      // 3. Badge CTA
      expect(findByProp('accessibilityLabel', 'Service Badges Count').length).toBeGreaterThan(0);
      // 4. Add details CTA
      expect(findByProp('accessibilityLabel', 'Add Bank Details').length).toBeGreaterThan(0);

      await ReactTestRenderer.act(async () => {
        root.unmount();
      });
    });
  });
});
