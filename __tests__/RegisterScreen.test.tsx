import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { RegisterScreen } from '../src/screens/RegisterScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('RegisterScreen Webview Onboarding', () => {
  it('renders WebView pointing to kweecko.com/onboarding with isapp=true and without Signin or refresh buttons', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <RegisterScreen onBack={jest.fn()} />
      );
    });

    const root = renderer!.root;

    // Check title in header
    const textNodes = root.findAllByType('Text' as any).map(n => n.props.children);
    expect(textNodes).toContain('Partner Onboarding');
    expect(textNodes).toContain('kweecko.com/onboarding');

    // Verify Sign In button and refresh icon are NOT present in header
    expect(textNodes).not.toContain('Sign In');
    expect(textNodes).not.toContain('🔄');

    // Find the WebView mock component
    const webViews = root.findAll((n: any) => n.props && n.props.source && n.props.source.uri);
    expect(webViews.length).toBeGreaterThan(0);
    expect(webViews[0].props.source.uri).toBe('https://kweecko.com/onboarding?isapp=true');
  });

  it('triggers onBack when Back button is pressed', () => {
    const onBackMock = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <RegisterScreen onBack={onBackMock} />
      );
    });

    const root = renderer!.root;
    const backBtn = root.findByProps({ accessibilityLabel: 'Back' });
    expect(backBtn).toBeDefined();

    ReactTestRenderer.act(() => {
      backBtn.props.onPress();
    });

    expect(onBackMock).toHaveBeenCalled();
  });
});
