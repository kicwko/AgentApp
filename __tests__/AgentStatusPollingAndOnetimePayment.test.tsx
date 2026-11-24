import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AccountStatusScreen } from '../src/screens/AccountStatusScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { userService } from '../src/services/userService';

jest.mock('../src/services/firebaseAuth', () => ({
  subscribeToAuthState: jest.fn(),
  signOutFirebase: jest.fn(),
  signOutUser: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('../src/services/userService', () => ({
  userService: {
    getPendingDocuments: jest.fn().mockResolvedValue({
      success: true,
      status: 'Pending',
      checklist: {
        picture: { submitted: false },
        bankDetails: { submitted: true, accountNumber: '123456789012', upiId: '8800313434@ptyes' },
        policeVerification: { submitted: false },
      },
    }),
    updatePendingDocuments: jest.fn().mockResolvedValue({
      success: true,
      status: 'Pending',
      message: 'Bank details saved successfully',
    }),
    fetchPartnerProfile: jest.fn().mockResolvedValue({
      success: true,
      data: {
        fullName: 'Ramesh Kumar',
        phone: '9876543210',
        email: 'ramesh@example.com',
      },
    }),
    getAgentStatus: jest.fn().mockResolvedValue({
      success: true,
      status: 'Active',
      onetimePaymentstatus: false,
      onetimefee: 500,
      agentId: 'KWK-AGNT-9876543210',
      applicationId: '#KWK-2026-4160',
    }),
    updateAgentPayment: jest.fn().mockResolvedValue({
      success: true,
      onetimePaymentstatus: true,
      message: 'Payment recorded',
    }),
    savePartnerProfile: jest.fn().mockResolvedValue({
      success: true,
      data: {
        fullName: 'Ramesh Kumar',
        phone: '9876543210',
        onetimePaymentstatus: true,
      },
    }),
  },
}));

const extractAllText = (children: any): string => {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractAllText).join('');
  }
  if (children.props?.children) {
    return extractAllText(children.props.children);
  }
  return '';
};

describe('Agent Status Polling, Bank UPI & One-Time Payment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Requirement 1: Keeps Bank Details form closed when details exist and provides "Change" button with UPI field', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Ramesh Kumar',
            phone: '9876543210',
            checklist: {
              bankDetails: {
                submitted: true,
                accountNumber: '987654321012',
                ifscCode: 'SBIN0001234',
                upiId: '8800313434@ptyes',
              },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    let textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    let joined = textNodes.join(' ');

    // 1. Bank form fields should NOT be open by default
    expect(joined).toContain('Bank Details & Payout Account');
    expect(joined).toContain('Change');
    expect(joined).toContain('•••• 9012');
    expect(joined).toContain('UPI: 8800313434@ptyes');

    // 2. Click "Change" button to open the form
    const changeBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.trim() === 'Change';
    });
    expect(changeBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      changeBtn.props.onPress();
    });

    // 3. Now the form is open: verify UPI input is present with placeholder 'e.g. 8800313434@ptyes'
    const inputs = root.findAllByType('TextInput');
    const upiInput = inputs.find((i: any) => i.props.placeholder?.includes('8800313434@ptyes'));
    expect(upiInput).toBeDefined();

    // 4. Edit UPI ID and save
    await ReactTestRenderer.act(async () => {
      upiInput.props.onChangeText('9876543210@paytm');
    });

    const saveBankBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      return extractAllText(btn.props?.children).includes('Save Bank Details');
    });
    expect(saveBankBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await saveBankBtn.props.onPress();
    });

    expect(userService.updatePendingDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        bankDetails: expect.objectContaining({
          upiId: '9876543210@paytm',
        }),
      }),
      expect.anything()
    );
  });

  it('Requirement 3: SettingsScreen displays One-Time Registration Fee card below user info card and allows payment', async () => {
    (userService.getAgentStatus as jest.Mock).mockResolvedValueOnce({
      success: true,
      status: 'Active',
      onetimePaymentstatus: false,
      onetimefee: 2,
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SettingsScreen
          user={{
            uid: 'usr-123',
            displayName: 'Ramesh Verma',
            phoneNumber: '9876543210',
            email: 'ramesh@example.com',
          } as any}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    let textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    let joined = textNodes.join(' ');

    // 1. One-time fee card is displayed with Pending state
    expect(joined).toContain('One-Time Registration Fee');
    expect(joined).toContain('Pending');
    expect(joined).toContain('Pay Now');

    // 2. Click "Pay Now" to open payment modal
    const payNowBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      return extractAllText(btn.props?.children).includes('Pay Now');
    });
    expect(payNowBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      payNowBtn.props.onPress();
    });

    textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    joined = textNodes.join(' ');
    expect(joined).toContain('ero@icici');
    expect(joined).toContain('Paytm');
    expect(joined).toContain('PhonePe');
    expect(joined).toContain('GPay');
    expect(joined).toContain('I Have Completed Payment');

    // 3. Confirm payment
    const confirmBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      return extractAllText(btn.props?.children).includes('I Have Completed Payment');
    });
    expect(confirmBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await confirmBtn.props.onPress();
    });

    expect(userService.updateAgentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        onetimePaymentstatus: true,
        paymentDetails: expect.objectContaining({
          upiId: 'ero@icici',
          amount: 2,
        }),
        transactionDetails: expect.objectContaining({
          upiId: 'ero@icici',
          amount: 2,
        }),
      })
    );
  });
});
