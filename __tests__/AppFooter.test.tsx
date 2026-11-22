import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AppFooter } from '../src/components/AppFooter';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
}));

describe('AppFooter Component', () => {
  it('renders all three navigation tabs with correct labels', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppFooter activeTab="dashboard" onSelectTab={jest.fn()} />
      );
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text);
    const labels = textNodes.map(n => n.props.children);

    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Orders');
    expect(labels).toContain('Settings');
  });

  it('triggers onSelectTab when a tab is pressed', () => {
    const onSelectTabMock = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppFooter activeTab="dashboard" onSelectTab={onSelectTabMock} />
      );
    });

    const root = renderer!.root;
    const ordersBtn = root.findByProps({ accessibilityLabel: 'Orders' });
    const settingsBtn = root.findByProps({ accessibilityLabel: 'Settings' });

    expect(ordersBtn).toBeDefined();
    expect(settingsBtn).toBeDefined();

    // Press the Orders tab
    ReactTestRenderer.act(() => {
      ordersBtn.props.onPress();
    });
    expect(onSelectTabMock).toHaveBeenCalledWith('orders');

    // Press the Settings tab
    ReactTestRenderer.act(() => {
      settingsBtn.props.onPress();
    });
    expect(onSelectTabMock).toHaveBeenCalledWith('settings');
  });

  it('renders orders badge when ordersBadgeCount > 0', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppFooter activeTab="dashboard" onSelectTab={jest.fn()} ordersBadgeCount={3} />
      );
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text);
    const badgeNode = textNodes.find(n => n.props.children === 3);

    expect(badgeNode).toBeDefined();
    expect(badgeNode!.props.children).toBe(3);
  });

  it('does not render orders badge when ordersBadgeCount is 0 or undefined', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppFooter activeTab="dashboard" onSelectTab={jest.fn()} ordersBadgeCount={0} />
      );
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text);
    const badgeNode = textNodes.find(n => n.props.children === 0);

    expect(badgeNode).toBeUndefined();
  });
});
