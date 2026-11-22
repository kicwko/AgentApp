import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppHeader } from '../src/components/AppHeader';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('AppHeader Component', () => {
  it('renders logo and on/off duty button without avatar icon', () => {
    let toggleCalled = false;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppHeader
          isOnDuty={true}
          onToggleDuty={() => {
            toggleCalled = true;
          }}
        />
      );
    });

    const root = renderer!.root;

    // Check duty button exists with 'ON DUTY' text
    const textNodes = root.findAllByType('Text' as any);
    const dutyText = textNodes.find(n => n.props.children === 'ON DUTY');
    expect(dutyText).toBeDefined();

    // Verify avatar icon 👤 is NOT present
    const avatarGlyph = textNodes.find(n => n.props.children === '👤');
    expect(avatarGlyph).toBeUndefined();

    // Verify no "User profile" accessibility button
    const buttons = root.findAllByProps({ accessibilityLabel: 'User profile' });
    expect(buttons.length).toBe(0);

    // Verify toggle duty button is accessible and works
    const dutyBtn = root.findByProps({ accessibilityLabel: 'Toggle Duty Status' });
    expect(dutyBtn).toBeDefined();
    ReactTestRenderer.act(() => {
      dutyBtn.props.onPress();
    });
    expect(toggleCalled).toBe(true);
  });

  it('renders OFF DUTY when isOnDuty is false', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<AppHeader isOnDuty={false} />);
    });

    const textNodes = renderer!.root.findAllByType('Text' as any);
    const dutyText = textNodes.find(n => n.props.children === 'OFF DUTY');
    expect(dutyText).toBeDefined();
  });
});
