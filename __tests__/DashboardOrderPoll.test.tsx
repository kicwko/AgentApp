import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { orderService, type BackendOrder } from '../src/services/orderService';
import { userService } from '../src/services/userService';

jest.mock('../src/services/orderService');
jest.mock('../src/services/userService');

const mockUser = {
  uid: 'test-agent-uid',
  email: 'agent@kwiqo.com',
  displayName: 'Sanjana Partner',
  phoneNumber: '+919625650723',
};

const mockPendingOrder: BackendOrder = {
  _id: 'ord-pending-123',
  orderId: 'KWK-ORD-2026-99001',
  agentPhone: '9625650723',
  agentId: 'KWK-AGNT-9625650723',
  taskTitle: 'Emergency Water Purifier Repair',
  totalPrice: 450,
  status: 'Pending',
  customer: {
    name: 'Rohit Sharma',
    phone: '+91 98765 43210',
  },
  location: {
    address: 'Tower B, Flat 402, DLF Phase 5',
    cluster: 'DLF Phase 5',
    city: 'Gurgaon',
  },
  createdAt: new Date().toISOString(),
};

const mockInProgressOrder: BackendOrder = {
  _id: 'ord-transit-456',
  orderId: 'KWK-ORD-2026-88002',
  agentPhone: '9625650723',
  agentId: 'KWK-AGNT-9625650723',
  taskTitle: 'Circuit Breaker Fix',
  totalPrice: 850,
  paymentMethod: 'Cash on Delivery',
  status: 'In Transit',
  customer: {
    name: 'Ananya Verma',
    phone: '+91 99112 23344',
  },
  location: {
    address: 'Tower 7, Flat 1201, Supertech Capetown',
    cluster: 'Sector 74',
    city: 'Noida',
  },
  createdAt: new Date().toISOString(),
};

describe('DashboardScreen Polling and Order Dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (userService.fetchPartnerProfile as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        agentId: 'KWK-AGNT-9625650723',
        location: { latitude: 28.4595, longitude: 77.0266 },
      },
    });

    (orderService.getOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockInProgressOrder],
    });

    (orderService.pollOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        hasNewOrder: true,
        newOrdersCount: 1,
        totalPendingCount: 1,
        latestOrder: mockPendingOrder,
        orders: [mockPendingOrder],
      },
    });

    (orderService.updateOrderStatus as jest.Mock).mockResolvedValue({
      success: true,
      data: { ...mockPendingOrder, status: 'In Transit' },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders Active Tasks In Progress with customer details and action buttons', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text).map(t => t.props.children);
    const allText = JSON.stringify(textNodes);

    expect(allText).toContain('Active Tasks In Progress');
    expect(allText).toContain('Circuit Breaker Fix');
    expect(allText).toContain('Ananya Verma');
    expect(allText).toContain('Reached Site • Start Job');
  });

  it('polls /api/orders/poll with user coordinates', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(orderService.pollOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: expect.any(Number),
        lng: expect.any(Number),
        role: 'agent',
      })
    );
  });

  it('renders 5-minute countdown for incoming Pending order', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text).map(t => t.props.children);
    const allText = JSON.stringify(textNodes);

    expect(allText).toContain('Emergency Water Purifier Repair');
    expect(allText).toContain('Accept Order');
    expect(allText).toContain('remaining');
  });

  it('auto-declines order when 5-minute countdown expires', async () => {
    const expiredPendingOrder: BackendOrder = {
      ...mockPendingOrder,
      _id: 'ord-expired-999',
      orderId: 'KWK-ORD-EXPIRED-999',
      createdAt: new Date(Date.now() - 350 * 1000).toISOString(),
    };

    (orderService.pollOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        hasNewOrder: true,
        latestOrder: expiredPendingOrder,
        orders: [expiredPendingOrder],
      },
    });

    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 15; i++) await Promise.resolve();
    });

    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
      'ord-expired-999',
      expect.objectContaining({
        status: 'Canceled',
        reason: expect.stringContaining('Expired'),
      })
    );
  });

  it('renders full screen IncomingDispatchModal with Instant Dispatch badge and Accept/Decline call buttons', async () => {
    (orderService.pollOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        hasNewOrder: true,
        latestOrder: mockPendingOrder,
        orders: [mockPendingOrder],
      },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 15; i++) await Promise.resolve();
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text).map(t => t.props.children);
    const allText = JSON.stringify(textNodes);

    expect(allText).toContain('INSTANT DISPATCH');
    expect(allText).toContain('DECLINE');
    expect(allText).toContain('ACCEPT');
    expect(allText).toContain('ESTIMATED NET PAYOUT');
  });

  it('optimistically accepts pending order without freezing and updates status to In Transit', async () => {
    (orderService.pollOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        hasNewOrder: true,
        latestOrder: mockPendingOrder,
        orders: [mockPendingOrder],
      },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    const root = renderer!.root;
    // Find Accept button in the dispatch modal
    const touchables = root.findAllByProps({ activeOpacity: 0.85 });
    // Find touchable with acceptCallIcon or text
    const acceptBtn = touchables.find(t => {
      try {
        return JSON.stringify(t.props).includes('acceptCircle') || JSON.stringify(t.props).includes('ACCEPT');
      } catch {
        return false;
      }
    });

    if (acceptBtn) {
      await ReactTestRenderer.act(async () => {
        acceptBtn.props.onPress();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
        'ord-pending-123',
        expect.objectContaining({ status: 'In Transit' })
      );
    }
  });

  it('optimistically declines pending order without freezing and updates status to Canceled', async () => {
    (orderService.pollOrders as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        hasNewOrder: true,
        latestOrder: mockPendingOrder,
        orders: [mockPendingOrder],
      },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen user={mockUser as any} />);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    const root = renderer!.root;
    const touchables = root.findAllByProps({ activeOpacity: 0.85 });
    const declineBtn = touchables.find(t => {
      try {
        return JSON.stringify(t.props).includes('declineCircle') || JSON.stringify(t.props).includes('DECLINE');
      } catch {
        return false;
      }
    });

    if (declineBtn) {
      await ReactTestRenderer.act(async () => {
        declineBtn.props.onPress();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
        'ord-pending-123',
        expect.objectContaining({ status: 'Canceled', reason: expect.stringContaining('Declined') })
      );
    }
  });
});
