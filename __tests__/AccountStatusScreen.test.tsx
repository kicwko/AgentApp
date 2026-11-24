import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AccountStatusScreen } from '../src/screens/AccountStatusScreen';
import { userService } from '../src/services/userService';

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
        bankDetails: { submitted: false },
        policeVerification: { submitted: false },
      },
    }),
    updatePendingDocuments: jest.fn().mockResolvedValue({
      success: true,
      message: 'Documents submitted successfully',
      status: 'Pending',
      pendingReason: 'All 3 mandatory verification documents submitted.',
      checklist: {
        picture: { submitted: true },
        bankDetails: { submitted: true },
        policeVerification: { submitted: true },
      },
    }),
    faceMatch: jest.fn().mockResolvedValue({
      success: true,
      matched: true,
      isMatched: true,
      confidence: 88.42,
      threshold: 69.10,
      message: 'Face verified successfully with Aadhaar document! Profile photo has been updated in database.',
    }),
  },
}));

function extractAllText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(' ');
  if (node.children) return node.children.map(extractAllText).join(' ');
  if (node.props && node.props.children) return extractAllText(node.props.children);
  return '';
}

describe('AccountStatusScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('renders blocked account with Red Matte theme and reason', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Blocked',
            reason: 'Account suspended by administration. Policy violation.',
            userName: 'Blocked Agent',
            phone: '9999999999',
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    expect(joined).toContain('Account Blocked');
    expect(joined).toContain('Account suspended by administration. Policy violation.');
    expect(joined).toContain('1800-KWICKO-GATE');
  });

  it('renders Sign Out button in header for Pending/Blocked user and triggers onSignOut', async () => {
    const onSignOutMock = jest.fn();
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9876543210',
          }}
          onSignOut={onSignOutMock}
        />
      );
    });

    const root = renderer.root;
    const signOutBtn = root.findByProps({ accessibilityLabel: 'Sign Out' });
    expect(signOutBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      signOutBtn.props.onPress();
    });

    expect(onSignOutMock).toHaveBeenCalled();
  });

  it('renders pending account with the 3 mandatory documents without redundant 1st header', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            reason: 'Your uploaded documents are pending verification.',
            userName: 'Pending Partner',
            phone: '9863517683',
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    expect(joined).not.toContain('ACCOUNT PENDING VERIFICATION');
    expect(joined).toContain('Pending Verification');
    expect(joined).toContain('Capture Selfie Photo');
    expect(joined).toContain('Bank Details & Cancelled Cheque');
    expect(joined).toContain('Police Verification Certificate');
    expect(joined).toContain('Submit');
    expect(joined).toContain('Refresh');
  });

  it('validates account number mismatch correctly', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const inputs = root.findAllByType('TextInput');

    // inputs[0] is Account Number, inputs[1] is Re-enter Account Number
    await ReactTestRenderer.act(async () => {
      inputs[0].props.onChangeText('123456789012');
      inputs[1].props.onChangeText('123456789999'); // Mismatch
    });

    let textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    let joined = textNodes.join(' ');
    expect(joined).toContain('Account numbers do not match');

    // Now fix mismatch
    await ReactTestRenderer.act(async () => {
      inputs[1].props.onChangeText('123456789012'); // Matched
    });

    textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    joined = textNodes.join(' ');
    expect(joined).toContain('Account numbers match perfectly');
  });

  it('shows only bottom submit button and removes individual upload details buttons from cards', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const uploadDetailsOccurrences = textNodes.filter((t: string) => t.includes('Upload Details'));

    // Should have NO individual "Upload Details" buttons - only bottom submit button
    expect(uploadDetailsOccurrences.length).toBe(0);
    expect(textNodes.some((t: string) => t.trim() === 'Submit')).toBe(true);
  });

  it('reduces height and shows compact cards when documents are already submitted', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: true, photo: 'data:image/jpeg;base64,sample' },
              bankDetails: { submitted: true, accountNumber: '123456789012' },
              policeVerification: { submitted: true, certificateNumber: 'POL-123' },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    // Freeze badge is shown for validated photo (update CTA removed) while Edit/Change remain for bank/police
    expect(joined).toContain('Freeze');
    expect(joined).toContain('Edit');
    expect(joined).toContain('Change');
    expect(joined).toContain('Photo Captured & Validated');
    expect(joined).toContain('Cheque Uploaded');

    // "Upload Details" buttons should NOT be present when all 3 are already done
    const uploadDetailsOccurrences = textNodes.filter((t: string) => t.includes('Upload Details'));
    expect(uploadDetailsOccurrences.length).toBe(0);
  });

  it('does not display any police token or certificate number input field', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    expect(joined).not.toContain('Police Certificate / Token Number');
    expect(joined).not.toContain('POL-DEL-');
  });

  it('renders styled refresh buttons and triggers status refresh', async () => {
    const onRefreshMock = jest.fn().mockResolvedValue({
      status: 'Pending',
      reason: 'Documents under manual review.',
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
          onRefreshStatus={onRefreshMock}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    // Verify footer simple Refresh button is rendered and header mini refresh is removed
    expect(joined).toContain('Refresh');
    expect(joined).toContain('Submit');

    // Trigger footer Refresh button
    const pressables = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const refreshBtn = pressables.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.includes('Refresh') && !texts.includes('Sign Out');
    });

    expect(refreshBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      refreshBtn.props.onPress();
    });

    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables Submit button until user edits anything, and displays api pendingReason', async () => {
    (userService.getPendingDocuments as jest.Mock).mockResolvedValueOnce({
      success: true,
      pendingReason: 'Custom pending reason returned directly from API endpoint.',
      checklist: {
        picture: { submitted: false },
        bankDetails: { submitted: false },
        policeVerification: { submitted: false },
      },
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            pendingReason: 'Initial pending reason',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    // Verify API pendingReason is rendered
    expect(joined).toContain('Custom pending reason returned directly from API endpoint.');

    // Find the fixed footer Submit button
    const pressables = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const submitBtn = pressables.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.trim() === 'Submit';
    });
    expect(submitBtn).toBeDefined();
    // Initially disabled before user edits
    expect(submitBtn.props.disabled).toBe(true);

    // Edit Bank Account Number
    const inputs = root.findAllByType('TextInput');
    const accountInput = inputs[0];

    await ReactTestRenderer.act(async () => {
      accountInput.props.onChangeText('1234567890');
    });

    // Now Submit button should be enabled
    const submitBtnAfter = pressables.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.trim() === 'Submit';
    });
    expect(submitBtnAfter.props.disabled).toBe(false);
  });

  it('limits phone number input to max 10 characters and formats display phone', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '+919863517683',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;

    // Verify phone displays as 10-digit number without country code
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');
    expect(joined).toContain('9863517683');
    expect(joined).not.toContain('+919863517683');

    // Verify bank optional phone input has maxLength 10
    const inputs = root.findAllByType('TextInput');
    const phoneInput = inputs.find((inp: any) =>
      inp.props.placeholder?.includes('mobile number')
    );
    expect(phoneInput).toBeDefined();
    expect(phoneInput.props.maxLength).toBe(10);

    // Test typing more than 10 digits
    await ReactTestRenderer.act(async () => {
      phoneInput.props.onChangeText('123456789099999');
    });
  });

  it('notifies onDocumentsSubmitted with Active status when backend activates user', async () => {
    (userService.updatePendingDocuments as jest.Mock).mockResolvedValueOnce({
      success: true,
      status: 'Active',
      message: 'Account Activated successfully',
    });

    const onSubmittedMock = jest.fn();

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: true, photo: 'data:image/jpeg;base64,sample' },
              bankDetails: { submitted: false },
              policeVerification: { submitted: true },
            },
          }}
          onSignOut={jest.fn()}
          onDocumentsSubmitted={onSubmittedMock}
        />
      );
    });

    const root = renderer.root;
    const inputs = root.findAllByType('TextInput');
    const accInput = inputs[0];
    const confirmInput = inputs[1];
    const ifscInput = inputs[2];

    await ReactTestRenderer.act(async () => {
      accInput.props.onChangeText('9876543210');
      confirmInput.props.onChangeText('9876543210');
      ifscInput.props.onChangeText('HDFC0001234');
    });

    // Attach cheque photo via capture
    const captureBtns = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const openCaptureBtn = captureBtns.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.includes('Capture Cancelled Cheque Photo');
    });

    await ReactTestRenderer.act(async () => {
      openCaptureBtn.props.onPress();
    });

    const modalCameraBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.includes('Take Photo with Camera');
    });

    await ReactTestRenderer.act(async () => {
      modalCameraBtn.props.onPress();
    });

    // Submit documents
    const submitBtn = root.findAll((n: any) => typeof n.props?.onPress === 'function').find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.trim() === 'Submit';
    });

    await ReactTestRenderer.act(async () => {
      await submitBtn.props.onPress();
    });

    expect(onSubmittedMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Active' })
    );
  });

  it('handles face match success and displays verification badge on screen', async () => {
    (userService.faceMatch as jest.Mock).mockResolvedValueOnce({
      success: true,
      matched: true,
      isMatched: true,
      confidence: 88.42,
      threshold: 69.1,
      message: 'Face verified successfully with Aadhaar document!',
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Face Match Partner',
            phone: '9625650723',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: true },
              policeVerification: { submitted: true },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    // Find and press capture selfie
    const captureBtns = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const openCaptureBtn = captureBtns.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.includes('Capture Live Selfie');
    });

    expect(openCaptureBtn).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      await openCaptureBtn.props.onPress();
    });

    expect(userService.faceMatch).toHaveBeenCalledWith(
      expect.stringContaining('data:image/jpeg;base64,'),
      expect.anything()
    );

    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');
    expect(joined).toContain('Face Match Verified');
    expect(joined).toContain('88.4% Match');
    // Freeze title shown above image & update CTA removed
    expect(joined).toContain('Freeze');
    expect(joined).not.toContain('Face++');
    expect(joined).not.toContain('Validate Face');
  });

  it('handles face match failure and displays error message with retry button on screen', async () => {
    (userService.faceMatch as jest.Mock).mockResolvedValueOnce({
      success: false,
      matched: false,
      isMatched: false,
      confidence: 42.1,
      threshold: 69.1,
      message: 'Face did not match with Aadhaar card photo. Please upload a clear, front-facing picture.',
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Face Mismatch Partner',
            phone: '9625650723',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: true },
              policeVerification: { submitted: true },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const captureBtns = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const openCaptureBtn = captureBtns.find((btn: any) => {
      const texts = extractAllText(btn.props?.children);
      return texts.includes('Capture Live Selfie');
    });

    await ReactTestRenderer.act(async () => {
      await openCaptureBtn.props.onPress();
    });

    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');
    expect(joined).toContain('Face Verification Failed');
    expect(joined).toContain('Face did not match with Aadhaar card photo');
    expect(joined).toContain('Capture Live Selfie');
    expect(joined).not.toContain('Face++');
  });

  it('allows user to save bank details and police verification when face is not matched (single single submission)', async () => {
    (userService.updatePendingDocuments as jest.Mock).mockResolvedValueOnce({
      success: true,
      status: 'Pending',
      message: 'Bank Details updated successfully',
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Single Data Partner',
            phone: '9625650723',
            checklist: {
              picture: { submitted: false },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    // Find text inputs for Bank
    const inputs = root.findAllByType('TextInput');
    const accInput = inputs.find((i: any) => i.props.placeholder?.includes('Account Number'));
    const confirmAccInput = inputs.find((i: any) => i.props.placeholder?.includes('Re-enter'));
    const ifscInput = inputs.find((i: any) => i.props.placeholder?.includes('HDFC') || i.props.placeholder?.includes('IFSC'));

    await ReactTestRenderer.act(async () => {
      if (accInput) accInput.props.onChangeText('1234567890');
      if (confirmAccInput) confirmAccInput.props.onChangeText('1234567890');
      if (ifscInput) ifscInput.props.onChangeText('HDFC0001234');
    });

    // Click Save Bank Details button
    const allBtns = root.findAll((n: any) => typeof n.props?.onPress === 'function');
    const saveBankBtn = allBtns.find((b: any) => extractAllText(b.props?.children).includes('Save Bank Details'));

    expect(saveBankBtn).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      await saveBankBtn.props.onPress();
    });

    expect(userService.updatePendingDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        bankDetails: expect.objectContaining({
          accountNumber: '1234567890',
          ifscCode: 'HDFC0001234',
        }),
      }),
      expect.anything()
    );
  });

  it('enforces 30-second cooldown between refresh API calls', async () => {
    const onRefreshStatusMock = jest.fn().mockResolvedValue({
      status: 'Pending',
      pendingReason: 'Waiting for admin approval',
    });

    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Cooldown Partner',
            phone: '9863517683',
          }}
          onSignOut={jest.fn()}
          onRefreshStatus={onRefreshStatusMock}
        />
      );
    });

    const root = renderer.root;
    // Find the refresh button in the footer
    const refreshButtons = root.findAll((n: any) => {
      return (
        typeof n.props?.onPress === 'function' &&
        extractAllText(n.props?.children).includes('Refresh')
      );
    });

    const footerRefresh = refreshButtons[0];
    expect(footerRefresh).toBeTruthy();

    // 1st Refresh: Should call onRefreshStatusMock
    await ReactTestRenderer.act(async () => {
      await footerRefresh.props.onPress();
    });
    expect(onRefreshStatusMock).toHaveBeenCalledTimes(1);

    // 2nd Refresh immediately after: Must be throttled, so onRefreshStatusMock is NOT called again
    await ReactTestRenderer.act(async () => {
      await footerRefresh.props.onPress();
    });
    expect(onRefreshStatusMock).toHaveBeenCalledTimes(1);
  });

  it('does not display manual Save Selfie button and aligns Freeze, Verified Picture, and Picture', async () => {
    let renderer: any;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AccountStatusScreen
          accountData={{
            status: 'Pending',
            userName: 'Pending Partner',
            phone: '9863517683',
            checklist: {
              picture: { submitted: true, photo: 'data:image/jpeg;base64,verified-pic-sample' },
              bankDetails: { submitted: false },
              policeVerification: { submitted: false },
            },
          }}
          onSignOut={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType('Text').map((node: any) => extractAllText(node.props.children));
    const joined = textNodes.join(' ');

    // Must NOT contain manual Save Selfie button
    expect(joined).not.toContain('Save Selfie Picture');

    // Must contain Freeze and Verified Picture indicators in aligned header
    expect(joined).toContain('Freeze');
    expect(joined).toContain('Verified Picture');
  });
});
