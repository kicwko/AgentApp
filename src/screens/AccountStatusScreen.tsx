import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { GradientButton } from '../components/GradientButton';
import { mediaPickerService, type PickedMediaResult } from '../services/mediaPickerService';
import { userService, type PendingDocumentsPayload } from '../services/userService';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// ============================================================================
// PROJECT THEME (INSTITUTIONAL SAAS DESIGN SYSTEM - NO YELLOW / NO RED)
// ============================================================================
const projectTheme = {
  bg: colors.surface, // '#FAF8FF' - official clean SaaS background
  cardBg: colors.surfaceContainerLowest, // '#FFFFFF' - pure elevated white
  cardBgSubtle: colors.surfaceContainerLow, // '#F2F3FF' - soft container
  border: colors.border, // '#EAEDFF' - subtle card border
  borderMedium: colors.outlineVariant, // '#C7C4D8'
  borderFocus: colors.primary, // '#4F46E5'

  // Primary Accent & Buttons (Indigo / Cobalt)
  primary: colors.primary, // '#4F46E5'
  primaryDark: colors.colorPrimary, // '#3525CD'
  primaryHover: colors.primaryHover, // '#4338CA'
  buttonPrimary: colors.buttonPrimary, // '#4555DC'
  buttonPrimaryText: '#FFFFFF',

  // Status Badge & Info Containers
  badgeBg: colors.badgeInfoBg, // '#EEF2FF'
  badgeBorder: colors.badgeInfoBorder, // '#C7D2FE'
  badgeText: colors.badgeInfoText, // '#4338CA'

  // Typography
  textPrimary: colors.onSurface, // '#131B2E' - dark slate
  textMuted: colors.onSurfaceVariant, // '#464555' - muted
  textDim: colors.outline, // '#777587' - subtle captions

  // Inputs
  inputBg: colors.bgInput, // '#FFFFFF'
  inputBorder: '#E2E8F0', // clean neutral border

  // Success / Verified
  successBg: colors.badgeActiveBg, // '#ECFDF5'
  successBorder: colors.badgeActiveBorder, // '#A7F3D0'
  successText: colors.badgeActiveText, // '#047857'
  successIcon: colors.colorSecondaryTeal, // '#00C49F'
};

export interface AccountStatusData {
  status: 'Blocked' | 'Pending' | string;
  reason?: string;
  pendingReason?: string;
  blockReason?: string;
  userName?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  userId?: string;
  token?: string;
  applicationId?: string;
  checklist?: {
    picture?: { submitted?: boolean; photo?: string };
    bank?: {
      submitted?: boolean;
      accountHolderName?: string;
      accountNumber?: string;
      rawAccountNumber?: string;
      ifscCode?: string;
      bankName?: string;
      branchName?: string;
      upiId?: string;
      phone?: string;
      hasDocument?: boolean;
      cancelChequeDoc?: string;
      cancelChequeName?: string;
      verified?: boolean;
    };
    bankDetails?: {
      submitted?: boolean;
      accountHolderName?: string;
      accountNumber?: string;
      rawAccountNumber?: string;
      ifscCode?: string;
      bankName?: string;
      branchName?: string;
      upiId?: string;
      phone?: string;
      hasDocument?: boolean;
      cancelChequeDoc?: string;
      cancelChequeName?: string;
      verified?: boolean;
    };
    policeVerification?: {
      submitted?: boolean;
      status?: string;
      certificateNumber?: string;
      hasDocument?: boolean;
      documentData?: string;
      documentName?: string;
    };
    allSubmitted?: boolean;
    missingItems?: string[];
  };
}

type Props = {
  accountData: AccountStatusData;
  onSignOut: () => void;
  onRefreshStatus?: () => Promise<any> | any;
  onDocumentsSubmitted?: (updatedData: any) => void;
};

export function AccountStatusScreen({
  accountData,
  onSignOut,
  onRefreshStatus,
  onDocumentsSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const isBlocked = (accountData.status || '').toLowerCase() === 'blocked';
  const theme = projectTheme;

  // 30-second cooldown to prevent accidental / rapid duplicate refresh calls
  const REFRESH_COOLDOWN_MS = 30 * 1000;
  const lastRefreshTimeRef = useRef<number>(0);

  // Form states for the 3 Pending Documents
  // 1. Selfie
  const [selfiePhoto, setSelfiePhoto] = useState<string>(
    accountData.checklist?.picture?.photo || ''
  );
  const [selfieSubmitted, setSelfieSubmitted] = useState<boolean>(
    Boolean(accountData.checklist?.picture?.submitted)
  );
  const [uploadingSelfie, setUploadingSelfie] = useState<boolean>(false);
  const [faceValidating, setFaceValidating] = useState<boolean>(false);
  const [faceMatchResult, setFaceMatchResult] = useState<{
    status: 'idle' | 'validating' | 'success' | 'error';
    matched?: boolean;
    confidence?: number;
    threshold?: number;
    message?: string;
    error?: string;
  } | null>(null);

  // 2. Bank Details
  const [accountHolderName, setAccountHolderName] = useState<string>(
    accountData.fullName || accountData.userName || ''
  );
  const [accountNumber, setAccountNumber] = useState<string>(
    accountData.checklist?.bankDetails?.accountNumber || ''
  );
  const [confirmAccountNumber, setConfirmAccountNumber] = useState<string>(
    accountData.checklist?.bankDetails?.accountNumber || ''
  );
  const [ifscCode, setIfscCode] = useState<string>(
    accountData.checklist?.bankDetails?.ifscCode || ''
  );
  const [upiId, setUpiId] = useState<string>(
    accountData.checklist?.bankDetails?.upiId || ''
  );
  const [optionalPhone, setOptionalPhone] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [chequePhoto, setChequePhoto] = useState<string>('');
  const [chequeFileName, setChequeFileName] = useState<string>('cancelled_cheque.jpg');
  const [bankDetailsSubmitted, setBankDetailsSubmitted] = useState<boolean>(
    Boolean(accountData.checklist?.bankDetails?.submitted)
  );
  const [isEditingBank, setIsEditingBank] = useState<boolean>(false);
  const [uploadingBank, setUploadingBank] = useState<boolean>(false);

  // 3. Police Verification (document only - no token/number input)
  const [policeDocData, setPoliceDocData] = useState<string>('');
  const [policeDocName, setPoliceDocName] = useState<string>('');
  const [policeSubmitted, setPoliceSubmitted] = useState<boolean>(
    Boolean(accountData.checklist?.policeVerification?.submitted)
  );
  const [uploadingPolice, setUploadingPolice] = useState<boolean>(false);

  // Master Submission & loading state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentReason, setCurrentReason] = useState<string>(
    accountData.pendingReason ||
      accountData.reason ||
      accountData.blockReason ||
      (isBlocked
        ? 'Account suspended by administration. Policy compliance review required.'
        : 'Your uploaded documents (Aadhaar / KYC) are pending verification and approval by the society administrator.')
  );

  // Baseline tracker for change detection to enable "Submit" button only on changes
  const baselineRef = React.useRef({
    selfiePhoto: accountData.checklist?.picture?.photo || '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    upiId: '',
    optionalPhone: '',
    chequePhoto: '',
    policeDocData: '',
  });

  const [hasUserEdited, setHasUserEdited] = useState<boolean>(false);

  // Freeze image state: true when photo is verified with Aadhaar (locks image & removes update CTA)
  const isImageValidated = Boolean(
    faceMatchResult?.status === 'success' ||
      faceMatchResult?.matched === true ||
      (selfieSubmitted && Boolean(selfiePhoto) && faceMatchResult?.status !== 'error')
  );

  const isDirty = React.useMemo(() => {
    const b = baselineRef.current;
    const valuesChanged =
      (selfiePhoto || '') !== (b.selfiePhoto || '') ||
      (accountNumber || '') !== (b.accountNumber || '') ||
      (confirmAccountNumber || '') !== (b.confirmAccountNumber || '') ||
      (ifscCode || '') !== (b.ifscCode || '') ||
      (upiId || '') !== (b.upiId || '') ||
      (optionalPhone || '') !== (b.optionalPhone || '') ||
      (chequePhoto || '') !== (b.chequePhoto || '') ||
      (policeDocData || '') !== (b.policeDocData || '');
    return Boolean(hasUserEdited || valuesChanged);
  }, [
    hasUserEdited,
    selfiePhoto,
    accountNumber,
    confirmAccountNumber,
    ifscCode,
    upiId,
    optionalPhone,
    chequePhoto,
    policeDocData,
  ]);

  // Modal helper for photo / file capture
  const [captureModalVisible, setCaptureModalVisible] = useState<boolean>(false);
  const [captureTarget, setCaptureTarget] = useState<'selfie' | 'cheque' | 'police' | null>(
    null
  );

  // Fetch live pending documents checklist on mount if in pending state
  useEffect(() => {
    if (!isBlocked) {
      loadPendingChecklist();
    }
  }, [isBlocked]);

  // Sync state when accountData prop updates from parent refresh
  useEffect(() => {
    if (accountData.pendingReason) {
      setCurrentReason(accountData.pendingReason);
    } else if (accountData.reason || accountData.blockReason) {
      setCurrentReason(
        accountData.reason ||
          accountData.blockReason ||
          currentReason
      );
    }
    if (accountData.checklist) {
      if (accountData.checklist.picture?.submitted !== undefined) {
        setSelfieSubmitted(Boolean(accountData.checklist.picture.submitted));
        if (accountData.checklist.picture.photo) {
          setSelfiePhoto(accountData.checklist.picture.photo);
          baselineRef.current.selfiePhoto = accountData.checklist.picture.photo;
        }
      }
      if (accountData.checklist.bankDetails?.submitted !== undefined) {
        setBankDetailsSubmitted(Boolean(accountData.checklist.bankDetails.submitted));
      }
      if (accountData.checklist.bankDetails?.accountNumber) {
        setAccountNumber(accountData.checklist.bankDetails.accountNumber);
        setConfirmAccountNumber(accountData.checklist.bankDetails.accountNumber);
        baselineRef.current.accountNumber = accountData.checklist.bankDetails.accountNumber;
        baselineRef.current.confirmAccountNumber = accountData.checklist.bankDetails.accountNumber;
      }
      if (accountData.checklist.bankDetails?.ifscCode) {
        setIfscCode(accountData.checklist.bankDetails.ifscCode);
        baselineRef.current.ifscCode = accountData.checklist.bankDetails.ifscCode;
      }
      if (accountData.checklist.bankDetails?.upiId) {
        setUpiId(accountData.checklist.bankDetails.upiId);
        baselineRef.current.upiId = accountData.checklist.bankDetails.upiId;
      }
      if (accountData.checklist.policeVerification?.submitted !== undefined) {
        setPoliceSubmitted(Boolean(accountData.checklist.policeVerification.submitted));
      }
    }
  }, [accountData]);

  const loadPendingChecklist = async () => {
    try {
      const token =
        accountData.userId || accountData.token || accountData.phone || accountData.email;
      const res = await userService.getPendingDocuments(token);
      const checklist: any = (res as any)?.checklist;
      if (checklist) {
        const pic = checklist.picture;
        if (pic?.submitted && pic?.photo) {
          setSelfiePhoto(pic.photo);
          setSelfieSubmitted(true);
        } else if (pic?.submitted) {
          setSelfieSubmitted(true);
        } else if (pic?.submitted === false && !accountData.checklist?.picture?.submitted) {
          setSelfiePhoto('');
          setSelfieSubmitted(false);
        }

        const bank = checklist.bankDetails || checklist.bank;
        if (bank) {
          if (bank.submitted) {
            setBankDetailsSubmitted(true);
          } else if (bank.rawAccountNumber || bank.accountNumber) {
            // If bank account already exists, treat as submitted/saved so form is not open by default
            setBankDetailsSubmitted(true);
          } else if (bank.submitted === false && !accountData.checklist?.bankDetails?.submitted) {
            setBankDetailsSubmitted(false);
          }
          if (bank.accountHolderName) setAccountHolderName(bank.accountHolderName);
          if (bank.rawAccountNumber || bank.accountNumber) {
            setAccountNumber(bank.rawAccountNumber || bank.accountNumber);
            setConfirmAccountNumber(bank.rawAccountNumber || bank.accountNumber);
          }
          if (bank.ifscCode) setIfscCode(bank.ifscCode);
          if (bank.upiId) setUpiId(bank.upiId);
          if (bank.bankName) setBankName(bank.bankName);
          if (bank.phone) setOptionalPhone(bank.phone);
          if (bank.cancelChequeDoc || bank.documentData) setChequePhoto(bank.cancelChequeDoc || bank.documentData);
          if (bank.cancelChequeName || bank.documentName) setChequeFileName(bank.cancelChequeName || bank.documentName);
        }

        const police = checklist.policeVerification;
        if (police) {
          if (police.submitted) {
            setPoliceSubmitted(true);
          } else if (police.submitted === false && !accountData.checklist?.policeVerification?.submitted) {
            setPoliceSubmitted(false);
          }
          if (police.documentData) setPoliceDocData(police.documentData);
          if (police.documentName) setPoliceDocName(police.documentName);
        }

        const apiPendingReason =
          (res as any)?.pendingReason ||
          (res as any)?.data?.pendingReason ||
          (res as any)?.reason ||
          (res as any)?.data?.reason;
        if (apiPendingReason) {
          setCurrentReason(apiPendingReason);
        }

        baselineRef.current = {
          selfiePhoto: pic?.photo || '',
          accountNumber: bank?.rawAccountNumber || bank?.accountNumber || '',
          confirmAccountNumber: bank?.rawAccountNumber || bank?.accountNumber || '',
          ifscCode: bank?.ifscCode || '',
          upiId: bank?.upiId || '',
          optionalPhone: bank?.phone || '',
          chequePhoto: bank?.cancelChequeDoc || bank?.documentData || '',
          policeDocData: police?.documentData || '',
        };
      }
    } catch (err) {
      console.warn('[AccountStatus] loadPendingChecklist notice:', err);
    }
  };

  // Mismatch check for bank account number
  const isAccountMismatch =
    confirmAccountNumber.length > 0 && accountNumber !== confirmAccountNumber;
  const isAccountMatched =
    accountNumber.length >= 6 && accountNumber === confirmAccountNumber;

  // Open capture modal - for selfie, exclusively open front camera (no gallery/file upload allowed)
  const handleOpenCapture = (target: 'selfie' | 'cheque' | 'police') => {
    if (target === 'selfie') {
      // Point 3: For Selfie Camera allow ONLY front camera, DO NOT allow file upload/back camera
      handleApplyCapture('camera', 'selfie');
      return;
    }
    setCaptureTarget(target);
    setCaptureModalVisible(true);
  };

  // Confirm capture action using real camera & file picker
  const handleApplyCapture = async (
    type: 'camera' | 'gallery',
    explicitTarget?: 'selfie' | 'cheque' | 'police'
  ) => {
    const target = explicitTarget || captureTarget;
    setCaptureModalVisible(false);
    setCaptureTarget(null);

    try {
      let result: PickedMediaResult | null = null;
      if (type === 'camera') {
        // Point 3: Force front camera for selfie
        result = await mediaPickerService.takePhoto({ isSelfie: target === 'selfie' });
      } else {
        // Point 3: Disallow file/gallery upload for selfie
        if (target === 'selfie') {
          Alert.alert('Live Camera Required', 'Selfie must be taken live with front camera. File upload is not allowed.');
          return;
        }
        if (target === 'police') {
          result = await mediaPickerService.pickDocument('application/pdf,image/*');
        } else {
          result = await mediaPickerService.pickImage();
        }
      }

      if (!result) return;

      const fileData = result.dataUri || result.uri;
      const fileName = result.fileName || (target === 'selfie' ? 'selfie.jpg' : 'document.jpg');

      if (target === 'selfie') {
        // Point 2: DO NOT save selfiePhoto immediately.
        // Wait until we get face match response from server!
        validateFaceMatch(fileData);
      } else if (target === 'cheque') {
        setHasUserEdited(true);
        setChequePhoto(fileData);
        setChequeFileName(fileName);
      } else if (target === 'police') {
        setHasUserEdited(true);
        setPoliceDocData(fileData);
        setPoliceDocName(fileName);
      }
    } catch (err: any) {
      console.warn('[AccountStatus] Picker error:', err?.message);
      Alert.alert('Media Picker', err?.message || 'Failed to select media. Please try again.');
    }
  };

  // Call Face Match API (/api/users/face-match) to compare clicked photo with Aadhaar document
  const validateFaceMatch = async (imageData: string) => {
    if (!imageData) return;
    setFaceValidating(true);
    setFaceMatchResult({
      status: 'validating',
      message: 'Matching front camera selfie with Aadhaar document...',
    });

    try {
      const token =
        accountData.userId || accountData.token || accountData.phone || accountData.email;
      const res = await userService.faceMatch(imageData, token);

      const isMatch = Boolean(
        res &&
          (res.matched === true ||
            res.isMatched === true ||
            (res.success && (res as any)?.data?.matched !== false && !(res as any)?.error))
      );

      const confidence = res?.confidence ?? (res as any)?.data?.confidence;
      const threshold = res?.threshold ?? (res as any)?.data?.thresholds?.['1e-4'];
      const apiMessage =
        res?.message ||
        (isMatch
          ? 'Face verified successfully with Aadhaar document!'
          : (res as any)?.error || 'Face did not match with Aadhaar card photo. Please capture a clear front-facing picture.');

      if (isMatch) {
        // Point 2: Auto-save verified selfie immediately (no manual button required)
        const finalPhoto = (res as any)?.data?.user?.photo || imageData;
        setSelfiePhoto(finalPhoto);
        setFaceMatchResult({
          status: 'success',
          matched: true,
          confidence,
          threshold,
          message: apiMessage,
        });

        setUploadingSelfie(true);
        try {
          const token =
            accountData.token || accountData.userId || accountData.phone || accountData.email;
          const saveRes = await userService.updatePendingDocuments({ picture: finalPhoto }, token);
          if (saveRes && (saveRes.success || saveRes.status)) {
            setSelfieSubmitted(true);
            setHasUserEdited(true);
            const nextReason = (saveRes as any)?.pendingReason || (saveRes as any)?.data?.pendingReason;
            if (nextReason) setCurrentReason(nextReason);
            if (onRefreshStatus) onRefreshStatus();
            if (onDocumentsSubmitted) onDocumentsSubmitted(saveRes);
            Alert.alert(
              'Face Match Verified & Saved! ✓',
              confidence
                ? `${apiMessage}\n\nConfidence: ${confidence.toFixed(1)}% (Threshold: ${threshold ? threshold.toFixed(1) + '%' : 'Passed'})\n\nYour verified selfie has been saved automatically.`
                : `${apiMessage}\n\nYour verified selfie has been saved automatically.`
            );
          } else {
            throw new Error(saveRes?.message || 'Failed to auto-save verified selfie photo.');
          }
        } catch (saveErr: any) {
          console.warn('[AccountStatus] Auto-save selfie error:', saveErr);
          Alert.alert('Save Error', saveErr?.message || 'Face matched, but auto-saving photo failed. Please try again.');
        } finally {
          setUploadingSelfie(false);
        }
      } else {
        // Point 2: Face did not match - DO NOT save selfie!
        const errorMsg =
          res?.message ||
          (res as any)?.error ||
          'Face verification did not match your Aadhaar document. Please ensure good lighting and face the front camera directly.';
        
        // Ensure unverified selfie is NOT saved in selfiePhoto
        setFaceMatchResult({
          status: 'error',
          matched: false,
          confidence,
          threshold,
          message: errorMsg,
          error: (res as any)?.error,
        });
        Alert.alert(
          'Face Verification Failed',
          confidence
            ? `${errorMsg}\n\nConfidence: ${confidence.toFixed(1)}% (Required: ${threshold ? threshold.toFixed(1) + '%' : '69.1%'})`
            : errorMsg
        );
      }
    } catch (err: any) {
      // Point 2: If face match API gives any error, DO NOT save selfie!
      console.warn('[AccountStatus] faceMatch error:', err);
      const errMsg =
        err?.message ||
        'Failed to connect to face verification service. Please try again.';
      setFaceMatchResult({
        status: 'error',
        matched: false,
        message: errMsg,
      });
      Alert.alert('Face Match Error', errMsg);
    } finally {
      setFaceValidating(false);
    }
  };

  // --------------------------------------------------------------------------
  // PER-CARD "UPLOAD DETAILS" ACTIONS
  // --------------------------------------------------------------------------

  // 1. Upload Selfie Details
  const handleUploadSelfieDetails = async () => {
    if (!selfiePhoto || faceMatchResult?.status === 'error' || faceMatchResult?.matched === false) {
      handleOpenCapture('selfie');
      return;
    }
    setUploadingSelfie(true);
    try {
      const token = accountData.token || accountData.userId || accountData.phone;
      const res = await userService.updatePendingDocuments({ picture: selfiePhoto }, token);
      if (res && (res.success || res.status)) {
        setSelfieSubmitted(true);
        Alert.alert('Selfie Uploaded', 'Your selfie picture has been uploaded successfully.');
        const nextReason = (res as any)?.pendingReason || (res as any)?.data?.pendingReason;
        if (nextReason) setCurrentReason(nextReason);
      } else {
        throw new Error(res?.message || 'Failed to upload selfie photo.');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload selfie photo.');
    } finally {
      setUploadingSelfie(false);
    }
  };

  // 2. Upload Bank Details
  const handleUploadBankDetails = async () => {
    if (!accountNumber || accountNumber.trim().length < 6) {
      Alert.alert('Account Number Required', 'Please enter your bank account number (minimum 6 digits).');
      return;
    }
    if (accountNumber !== confirmAccountNumber) {
      Alert.alert(
        'Account Number Mismatch',
        'The re-entered account number does not match. Please verify and re-type carefully.'
      );
      return;
    }
    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!cleanIfsc || cleanIfsc.length < 5) {
      Alert.alert('IFSC Code Required', 'Please enter a valid Bank IFSC code.');
      return;
    }

    setUploadingBank(true);
    try {
      const token = accountData.token || accountData.userId || accountData.phone;
      const payload: PendingDocumentsPayload = {
        bankDetails: {
          accountHolderName: accountHolderName || accountData.fullName || 'Agent Partner',
          accountNumber: accountNumber.trim(),
          ifscCode: cleanIfsc,
          upiId: upiId.trim() || undefined,
          bankName: bankName.trim() || undefined,
          phone: optionalPhone.trim() || undefined,
          documentData: chequePhoto || undefined,
          documentName: chequeFileName || 'cancelled_cheque.jpg',
        },
      };
      const res = await userService.updatePendingDocuments(payload, token);
      if (res && (res.success || res.status)) {
        setBankDetailsSubmitted(true);
        setIsEditingBank(false);
        Alert.alert(
          'Bank Details Uploaded',
          'Your bank account information has been saved successfully.'
        );
        const nextReason = (res as any)?.pendingReason || (res as any)?.data?.pendingReason;
        if (nextReason) setCurrentReason(nextReason);
      } else {
        throw new Error(res?.message || 'Failed to upload bank details.');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload bank details.');
    } finally {
      setUploadingBank(false);
    }
  };

  // 3. Upload Police Details (Document only - no token/certificate number)
  const handleUploadPoliceDetails = async () => {
    if (!policeDocData && !policeSubmitted) {
      handleOpenCapture('police');
      return;
    }
    setUploadingPolice(true);
    try {
      const token = accountData.token || accountData.userId || accountData.phone;
      const payload: PendingDocumentsPayload = {
        policeVerification: {
          documentData: policeDocData || undefined,
          documentName: policeDocName || 'police-clearance-certificate.pdf',
          status: 'Pending',
        },
      };
      const res = await userService.updatePendingDocuments(payload, token);
      if (res && (res.success || res.status)) {
        setPoliceSubmitted(true);
        Alert.alert(
          'Police Verification Uploaded',
          'Your Police Clearance Certificate (PCC) document has been uploaded successfully.'
        );
        const nextReason = (res as any)?.pendingReason || (res as any)?.data?.pendingReason;
        if (nextReason) setCurrentReason(nextReason);
      } else {
        throw new Error(res?.message || 'Failed to upload police verification.');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Could not upload police verification.');
    } finally {
      setUploadingPolice(false);
    }
  };

  // --------------------------------------------------------------------------
  // MASTER SUBMIT: SAVE AVAILABLE DOCUMENTS (SINGLE OR MULTIPLE AT ANY TIME)
  // --------------------------------------------------------------------------
  const handleSubmitDocuments = async () => {
    // Point 1: If face do not matched or user not clicked selfie then save other data like Bank data or police verification means user can submit single single data any time.
    const payload: PendingDocumentsPayload = {};
    const savedItems: string[] = [];

    // 1. Bank Details Check: If user entered an account number, validate and include
    const cleanAcc = (accountNumber || '').trim();
    if (cleanAcc.length > 0) {
      if (cleanAcc.length < 6) {
        Alert.alert('Bank Details Error', 'Account number must be at least 6 digits.');
        return;
      }
      if (cleanAcc !== (confirmAccountNumber || '').trim()) {
        Alert.alert(
          'Account Number Mismatch',
          'The re-entered account number does not match. Please verify and re-type.'
        );
        return;
      }
      const cleanIfsc = (ifscCode || '').trim().toUpperCase();
      if (!cleanIfsc || cleanIfsc.length < 5) {
        Alert.alert('IFSC Code Required', 'Please enter a valid Bank IFSC code.');
        return;
      }
      payload.bankDetails = {
        accountHolderName: accountHolderName || accountData.fullName || 'Agent Partner',
        accountNumber: cleanAcc,
        ifscCode: cleanIfsc,
        upiId: upiId.trim() || undefined,
        bankName: bankName.trim() || undefined,
        phone: optionalPhone.trim() || undefined,
        documentData: chequePhoto || undefined,
        documentName: chequeFileName || 'cancelled_cheque.jpg',
      };
      savedItems.push('Bank Details');
    }

    // 2. Police Verification Check: If user attached a document, include it
    if (policeDocData) {
      payload.policeVerification = {
        documentData: policeDocData,
        documentName: policeDocName || 'police-clearance-certificate.pdf',
        status: 'Pending',
      };
      savedItems.push('Police Verification');
    }

    // 3. Selfie Photo:
    // Point 2: If face match API gave error or not matched, DO NOT save selfie!
    // ONLY include selfie if face match succeeded and photo is verified!
    const isFaceVerified =
      Boolean(selfiePhoto) &&
      (faceMatchResult?.status === 'success' ||
        faceMatchResult?.matched === true ||
        (selfieSubmitted && faceMatchResult?.status !== 'error'));

    if (isFaceVerified && selfiePhoto) {
      payload.picture = selfiePhoto;
      savedItems.push('Selfie Photo');
    }

    // 4. Validate that user has provided at least one piece of data
    if (savedItems.length === 0) {
      Alert.alert(
        'Nothing to Save',
        'Please enter your Bank Details, attach a Police Verification Certificate, or capture your Selfie to submit.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = accountData.token || accountData.userId || accountData.phone;
      const res = await userService.updatePendingDocuments(payload, token);

      if (res && (res.success || res.status)) {
        const nextStatus = (res.status || (res as any)?.data?.status || (res as any)?.user?.status || '').trim();
        if (nextStatus.toLowerCase() === 'active') {
          setHasUserEdited(false);
          Alert.alert(
            'Account Activated! 🎉',
            'Your documents have been verified and your account is now Active.'
          );
          if (onDocumentsSubmitted) {
            onDocumentsSubmitted(res);
          }
          return;
        }

        if (payload.bankDetails) setBankDetailsSubmitted(true);
        if (payload.policeVerification) setPoliceSubmitted(true);
        if (payload.picture) setSelfieSubmitted(true);

        const updatedReason =
          res.pendingReason ||
          (res as any)?.data?.pendingReason ||
          res.message ||
          'Verification data saved successfully.';
        setCurrentReason(updatedReason);
        setHasUserEdited(false);
        baselineRef.current = {
          selfiePhoto: payload.picture ? selfiePhoto : baselineRef.current.selfiePhoto,
          accountNumber,
          confirmAccountNumber,
          ifscCode,
          upiId,
          optionalPhone,
          chequePhoto,
          policeDocData,
        };

        Alert.alert(
          'Saved Successfully! ✓',
          `Your ${savedItems.join(' and ')} ${savedItems.length > 1 ? 'have' : 'has'} been saved successfully.\n\nYou can complete and submit any remaining verifications at any time.`,
          [{ text: 'OK' }]
        );

        if (onDocumentsSubmitted) {
          onDocumentsSubmitted(res);
        }
      } else {
        throw new Error(res?.message || 'Failed to submit documents.');
      }
    } catch (err: any) {
      Alert.alert(
        'Submission Error',
        err?.message || 'Could not save verification documents. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Re-check account status with 30s throttling condition
  const handleRefresh = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRefreshTimeRef.current;
    if (timeSinceLast < REFRESH_COOLDOWN_MS && lastRefreshTimeRef.current !== 0) {
      const remainingSec = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLast) / 1000);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          `Please wait ${remainingSec}s before refreshing again`,
          ToastAndroid.SHORT
        );
      }
      setRefreshing(false);
      return;
    }

    lastRefreshTimeRef.current = now;
    setRefreshing(true);
    try {
      // 1. Fetch live pending checklist & documents
      await loadPendingChecklist();

      // 2. Refresh overall account status with backend
      let result: any = null;
      if (onRefreshStatus) {
        result = await onRefreshStatus();
      }

      const activeStatus = (result?.status || accountData.status || '').toLowerCase();
      const apiPendingReason =
        result?.pendingReason ||
        result?.data?.pendingReason ||
        result?.reason ||
        result?.data?.reason;
      if (apiPendingReason) {
        setCurrentReason(apiPendingReason);
      }
      if (activeStatus === 'active') {
        Alert.alert(
          'Account Activated! 🎉',
          'Your documents have been verified and your account is now Active.'
        );
      }
    } catch (err: any) {
      console.warn('[AccountStatus] Refresh notice:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Quick call helpline
  const handleCallHelpline = () => {
    Linking.openURL('tel:1800594256').catch(() => {
      Alert.alert('Support Helpline', 'Society Helpline: 1800-KWICKO-GATE (Toll-Free)');
    });
  };

  // Quick email support
  const handleEmailSupport = () => {
    const subject = encodeURIComponent(
      `Account Issue [${accountData.applicationId || accountData.phone || 'Agent'}]`
    );
    Linking.openURL(`mailto:support@kweecko.com?subject=${subject}`).catch(() => {
      Alert.alert('Support Email', 'Please write to: support@kweecko.com');
    });
  };

  const hasExistingBank = Boolean(
    bankDetailsSubmitted ||
      (baselineRef.current.accountNumber && baselineRef.current.accountNumber.trim().length >= 6) ||
      accountData.checklist?.bankDetails?.accountNumber
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Fixed Common App Header at Top with Sign Out for Pending / Blocked Account */}
      <AppHeader
        showDutyToggle={false}
        showSignOut={true}
        onSignOut={onSignOut}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 80 + Math.max(insets.bottom, 14) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }>
          {/* Hero Card */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.cardBg,
              borderColor: theme.border,
            },
          ]}>
          <View style={styles.heroHeaderRow}>
            <View
              style={[
                styles.heroIconCircle,
                {
                  backgroundColor: theme.badgeBg,
                  borderColor: theme.badgeBorder,
                },
              ]}>
              <Text style={styles.heroBigIcon}>{isBlocked ? '🛡️' : '⏳'}</Text>
            </View>
            <View style={styles.heroTitleWrap}>
              <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
                {isBlocked ? 'Account Blocked' : 'Pending Verification'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textMuted }]}>
                {isBlocked
                  ? 'Access to society bookings and tasks is currently disabled.'
                  : 'Submit the 3 pending documents below for administrator approval.'}
              </Text>
            </View>
          </View>

          {/* User Dossier Meta */}
          <View style={[styles.userMetaRow, { borderColor: theme.border }]}>
            <View style={styles.userMetaItem}>
              <Text style={[styles.metaLabel, { color: theme.textDim }]}>NAME</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>
                {accountData.fullName || accountData.userName || 'Service Partner'}
              </Text>
            </View>
            {accountData.phone ? (
              <View style={styles.userMetaItem}>
                <Text style={[styles.metaLabel, { color: theme.textDim }]}>PHONE</Text>
                <Text style={[styles.metaValue, { color: theme.textPrimary }]}>
                  {accountData.phone.replace(/\D/g, '').slice(-10)}
                </Text>
              </View>
            ) : null}
            <View style={styles.userMetaItem}>
              <Text style={[styles.metaLabel, { color: theme.textDim }]}>STATUS</Text>
              <Text style={[styles.metaValueBold, { color: theme.primary }]}>
                {accountData.status || (isBlocked ? 'Blocked' : 'Pending')}
              </Text>
            </View>
          </View>
        </View>

        {/* Reason Card */}
        <View
          style={[
            styles.reasonBox,
            {
              backgroundColor: theme.cardBg,
              borderColor: theme.border,
            },
          ]}>
          <View style={styles.reasonHeaderRow}>
            <Text style={styles.reasonIcon}>{isBlocked ? '⚠️' : 'ℹ️'}</Text>
            <Text style={[styles.reasonHeaderTitle, { color: theme.primaryDark }]}>
              {isBlocked ? 'REASON FOR SUSPENSION' : 'CURRENT STATUS & REASON'}
            </Text>
          </View>
          <Text style={[styles.reasonBody, { color: theme.textPrimary }]}>
            {currentReason}
          </Text>
          {!isBlocked && (
            <Text style={[styles.reasonTimeline, { color: theme.textDim }]}>
              ⏱️ Verification timeline: typically 24-48 business hours after document submission.
            </Text>
          )}
        </View>

        {/* ============================================================== */}
        {/* CONDITIONAL CONTENT: BLOCKED RESOLUTION VS PENDING 3 DOCUMENTS */}
        {/* ============================================================== */}
        {isBlocked ? (
          // =================== BLOCKED VIEW ===================
          <View style={styles.blockedSection}>
            <View
              style={[
                styles.resolutionCard,
                { backgroundColor: theme.cardBg, borderColor: theme.border },
              ]}>
              <Text style={[styles.resolutionHeading, { color: theme.textPrimary }]}>
                How to Resolve Account Suspension
              </Text>

              <View style={styles.resolutionStepRow}>
                <Text style={styles.stepNumberBadge}>1</Text>
                <View style={styles.stepTextWrap}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
                    Contact Society Admin Desk
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Visit the resident management desk or contact your cluster supervisor to request an account review.
                  </Text>
                </View>
              </View>

              <View style={styles.resolutionStepRow}>
                <Text style={styles.stepNumberBadge}>2</Text>
                <View style={styles.stepTextWrap}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
                    24/7 Security Support Helpline
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Call toll-free <Text style={{ color: theme.primary, fontWeight: '700' }}>1800-KWICKO-GATE</Text> with your registered mobile number.
                  </Text>
                </View>
              </View>

              <View style={styles.resolutionStepRow}>
                <Text style={styles.stepNumberBadge}>3</Text>
                <View style={styles.stepTextWrap}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
                    Email Compliance Desk
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Send an appeal to <Text style={{ color: theme.primary }}>support@kweecko.com</Text> along with your government ID.
                  </Text>
                </View>
              </View>
            </View>

            {/* Blocked Action Buttons */}
            <GradientButton
              title="📞 Call Society Helpline"
              onPress={handleCallHelpline}
              style={styles.primaryCtaButton}
              textStyle={styles.primaryCtaText}
            />

            <TouchableOpacity
              style={[
                styles.secondaryCtaButton,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderMedium,
                },
              ]}
              onPress={handleEmailSupport}
              activeOpacity={0.85}>
              <Text style={[styles.secondaryCtaText, { color: theme.textPrimary }]}>
                ✉️ Email Support Desk
              </Text>
            </TouchableOpacity>

            <GradientButton
              title="Refresh"
              icon={<Text style={styles.footerBtnIcon}>🔄</Text>}
              onPress={handleRefresh}
              disabled={refreshing}
              loading={refreshing}
              loadingText="Refreshing..."
              style={styles.refreshStatusButton}
              textStyle={styles.primaryCtaText}
            />

            <TouchableOpacity
              style={styles.switchAccountBtn}
              onPress={onSignOut}
              activeOpacity={0.8}>
              <Text style={[styles.switchAccountBtnText, { color: theme.textMuted }]}>
                Sign out of session
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          // =================== PENDING VIEW: 3 DOCUMENTS FORM ===================
          <View style={styles.pendingSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
                3 Mandatory Documents
              </Text>
              <Text style={[styles.sectionSubheading, { color: theme.textMuted }]}>
                Required for security verification & daily payouts
              </Text>
            </View>

            {/* Checklist summary chips */}
            <View style={styles.checklistSummaryRow}>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: selfieSubmitted ? theme.successBg : theme.badgeBg,
                    borderColor: selfieSubmitted ? theme.successBorder : theme.badgeBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: selfieSubmitted ? theme.successText : theme.badgeText },
                  ]}>
                  {selfieSubmitted ? '✓ 1. Selfie' : '○ 1. Selfie'}
                </Text>
              </View>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: bankDetailsSubmitted ? theme.successBg : theme.badgeBg,
                    borderColor: bankDetailsSubmitted ? theme.successBorder : theme.badgeBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: bankDetailsSubmitted ? theme.successText : theme.badgeText },
                  ]}>
                  {bankDetailsSubmitted ? '✓ 2. Bank & Cheque' : '○ 2. Bank & Cheque'}
                </Text>
              </View>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: policeSubmitted ? theme.successBg : theme.badgeBg,
                    borderColor: policeSubmitted ? theme.successBorder : theme.badgeBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: policeSubmitted ? theme.successText : theme.badgeText },
                  ]}>
                  {policeSubmitted ? '✓ 3. Police PCC' : '○ 3. Police PCC'}
                </Text>
              </View>
            </View>

            {/* ============================================================== */}
            {/* ============================================================== */}
            {/* DOCUMENT 1: SELFIE */}
            {/* ============================================================== */}
            {selfieSubmitted && !faceMatchResult && !faceValidating ? (
              // REDUCED HEIGHT COMPACT CARD (Already Done & no active face match result to display)
              <View style={[styles.compactCard, { backgroundColor: theme.cardBg, borderColor: '#A7F3D0' }]}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactDoneBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.compactDoneIcon, { color: '#047857' }]}>✓</Text>
                  </View>
                  {selfiePhoto ? (
                    <Image
                      source={{ uri: selfiePhoto }}
                      style={[styles.compactThumbnail, { borderColor: '#10B981' }]}
                      defaultSource={require('../assets/images/logo.png')}
                    />
                  ) : null}
                  <View style={styles.compactTexts}>
                    <Text style={[styles.compactTitle, { color: theme.textPrimary }]}>
                      Capture Selfie Photo
                    </Text>
                    <Text style={[styles.compactSub, { color: '#047857' }]}>
                      ✓ Photo Captured & Validated • Verified Picture
                    </Text>
                  </View>
                </View>
                <View style={styles.freezeBadge}>
                  <Text style={styles.freezeBadgeText}>🔒 Freeze</Text>
                </View>
              </View>
            ) : (
              // FULL PENDING CARD WITH FACE MATCH BIOMETRIC VALIDATION
              <View
                style={[
                  styles.docCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={styles.docHeader}>
                  <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.stepBadgeNum}>1</Text>
                  </View>
                  <View style={styles.docHeaderTexts}>
                    <Text style={[styles.docTitle, { color: theme.textPrimary }]}>
                      Capture Selfie Photo
                    </Text>
                    <Text style={[styles.docDesc, { color: theme.textMuted }]}>
                      Capture your clear front-facing picture. It will be validated against your Aadhaar card photo.
                    </Text>
                  </View>
                </View>

                {/* Validating Spinner Banner */}
                {faceValidating && (
                  <View style={[styles.faceMatchBox, styles.faceMatchValidatingBox]}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <View style={styles.faceMatchTextCol}>
                      <Text style={[styles.faceMatchTitle, { color: theme.primary }]}>
                        Verifying Face with Aadhaar...
                      </Text>
                      <Text style={[styles.faceMatchSub, { color: theme.textMuted }]}>
                        Matching your picture with Aadhaar card photo
                      </Text>
                    </View>
                  </View>
                )}

                {/* Face Match Success Box */}
                {!faceValidating && faceMatchResult?.status === 'success' && (
                  <View style={[styles.faceMatchBox, styles.faceMatchSuccessBox]}>
                    <View style={styles.faceMatchHeaderRow}>
                      <View style={styles.faceMatchIconCircleSuccess}>
                        <Text style={styles.faceMatchSuccessIcon}>✓</Text>
                      </View>
                      <View style={styles.faceMatchTextCol}>
                        <Text style={styles.faceMatchSuccessTitle}>
                          Face Match Verified ✓
                        </Text>
                        <Text style={styles.faceMatchSuccessSub}>
                          {faceMatchResult.message || 'Face matched successfully with Aadhaar document! Profile photo updated.'}
                        </Text>
                      </View>
                      {faceMatchResult.confidence ? (
                        <View style={styles.confidenceBadge}>
                          <Text style={styles.confidenceText}>
                            {`${faceMatchResult.confidence.toFixed(1)}% Match`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {faceMatchResult.threshold ? (
                      <View style={styles.faceMatchConfidenceRow}>
                        <Text style={styles.faceMatchConfidenceLabel}>
                          Confidence: <Text style={styles.faceMatchConfidenceVal}>{faceMatchResult.confidence?.toFixed(1)}%</Text>
                        </Text>
                        <Text style={styles.faceMatchThresholdLabel}>
                          Threshold: {faceMatchResult.threshold.toFixed(1)}% (Passed)
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Face Match Error Box (no duplicate buttons; user will use Retake near pic icon) */}
                {!faceValidating && faceMatchResult?.status === 'error' && (
                  <View style={[styles.faceMatchBox, styles.faceMatchErrorBox]}>
                    <View style={styles.faceMatchHeaderRow}>
                      <View style={styles.faceMatchIconCircleError}>
                        <Text style={styles.faceMatchErrorIcon}>⚠️</Text>
                      </View>
                      <View style={styles.faceMatchTextCol}>
                        <Text style={styles.faceMatchErrorTitle}>
                          Face Verification Failed
                        </Text>
                        <Text style={styles.faceMatchErrorSub}>
                          {faceMatchResult.message}
                        </Text>
                        {faceMatchResult.confidence ? (
                          <Text style={styles.confidenceErrorText}>
                            Confidence: {faceMatchResult.confidence.toFixed(1)}% (Required: {faceMatchResult.threshold ? faceMatchResult.threshold.toFixed(1) + '%' : '69.1%'})
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                )}

                {selfiePhoto ? (
                  <View
                    style={[
                      styles.previewContainerCol,
                      {
                        backgroundColor: theme.cardBgSubtle,
                        borderColor: isImageValidated ? '#A7F3D0' : theme.border,
                      },
                    ]}>
                    {/* Freeze & Status Header Row */}
                    <View style={styles.freezeHeaderRow}>
                      <View style={styles.freezeLabelGroup}>
                        <Text style={styles.freezeLockIcon}>{isImageValidated ? '🔒' : '📷'}</Text>
                        <Text style={[styles.freezeTitleText, { color: isImageValidated ? '#065F46' : theme.textPrimary }]}>
                          {isImageValidated ? 'Freeze' : 'Verification'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.freezeBadge,
                          {
                            backgroundColor: isImageValidated ? '#ECFDF5' : '#FEF3C7',
                            borderColor: isImageValidated ? '#A7F3D0' : '#FDE68A',
                          },
                        ]}>
                        <Text
                          style={[
                            styles.freezeBadgeText,
                            { color: isImageValidated ? '#047857' : '#B45309' },
                          ]}>
                          {isImageValidated ? '✓ Verified Picture' : 'Matching Aadhaar...'}
                        </Text>
                      </View>
                    </View>

                    {/* Perfectly Aligned Content Row: Picture + Details */}
                    <View style={styles.previewContentRow}>
                      <View style={styles.selfieImageWrapper}>
                        <Image
                          source={{ uri: selfiePhoto }}
                          style={[
                            styles.selfieImage,
                            { borderColor: isImageValidated ? '#10B981' : theme.primary },
                          ]}
                          defaultSource={require('../assets/images/logo.png')}
                        />
                        {isImageValidated && (
                          <View style={styles.verifiedCheckBadge}>
                            <Text style={styles.verifiedCheckIcon}>✓</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.previewMeta}>
                        <Text style={[styles.previewPictureTitle, { color: theme.textPrimary }]}>
                          Live Selfie Photo
                        </Text>
                        <Text
                          style={[
                            styles.attachedBadge,
                            {
                              color: isImageValidated
                                ? '#059669'
                                : faceMatchResult?.status === 'error'
                                ? colors.colorError
                                : theme.textMuted,
                            },
                          ]}>
                          {isImageValidated
                            ? '✓ Aadhaar Face Matched & Verified'
                            : faceMatchResult?.status === 'error'
                            ? '⚠️ Face Match Failed'
                            : '✓ Photo Selected'}
                        </Text>
                        {isImageValidated ? (
                          <Text style={[styles.freezeSubtext, { color: '#047857' }]}>
                            🔒 Picture is locked & automatically saved
                          </Text>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <TouchableOpacity
                              style={[
                                styles.retakeButton,
                                { borderColor: theme.borderMedium, backgroundColor: theme.cardBg },
                              ]}
                              onPress={() => {
                                setHasUserEdited(true);
                                handleOpenCapture('selfie');
                              }}>
                              <Text style={[styles.retakeText, { color: theme.primary }]}>
                                🔄 Retake
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Auto-Saving Spinner (if currently saving in background) */}
                    {uploadingSelfie && (
                      <View style={styles.autoSavingRow}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.autoSavingText, { color: theme.primary }]}>
                          Auto-saving verified selfie...
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.actionButtonGroup}>
                    <TouchableOpacity
                      style={[
                        styles.uploadButton,
                        {
                          backgroundColor: theme.cardBgSubtle,
                          borderColor: theme.borderMedium,
                        },
                      ]}
                      onPress={() => {
                        setHasUserEdited(true);
                        handleOpenCapture('selfie');
                      }}
                      activeOpacity={0.85}>
                      <Text style={styles.uploadIcon}>📷</Text>
                      <Text style={[styles.uploadText, { color: theme.primary }]}>
                        Capture Live Selfie
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ============================================================== */}
            {/* DOCUMENT 2: BANK DETAILS & CANCELLED CHEQUE */}
            {/* ============================================================== */}
            {hasExistingBank && !isEditingBank ? (
              // REDUCED HEIGHT COMPACT CARD (Already Done / Bank Details Present)
              <View style={[styles.compactCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactDoneBadge, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                    <Text style={[styles.compactDoneIcon, { color: theme.successText }]}>✓</Text>
                  </View>
                  <View style={styles.compactTexts}>
                    <Text style={[styles.compactTitle, { color: theme.textPrimary }]}>
                      Bank Details & Payout Account
                    </Text>
                    <Text style={[styles.compactSub, { color: theme.successText }]}>
                      ✓ {accountNumber ? `A/C •••• ${accountNumber.slice(-4)}` : 'Bank Account Saved'}
                      {ifscCode ? ` • ${ifscCode}` : ''}
                      {upiId ? ` • UPI: ${upiId}` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.compactActionBtn, { borderColor: theme.borderMedium }]}
                  onPress={() => {
                    setIsEditingBank(true);
                    setHasUserEdited(true);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Change Bank Details">
                  <Text style={[styles.compactActionText, { color: theme.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // FULL PENDING CARD WITH INPUTS & UPLOAD DETAILS BUTTON
              <View
                style={[
                  styles.docCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={styles.docHeader}>
                  <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.stepBadgeNum}>2</Text>
                  </View>
                  <View style={styles.docHeaderTexts}>
                    <Text style={[styles.docTitle, { color: theme.textPrimary }]}>
                      Bank Details & Cancelled Cheque
                    </Text>
                    <Text style={[styles.docDesc, { color: theme.textMuted }]}>
                      Enter your bank account number twice for mismatch verification & attach cancelled cheque.
                    </Text>
                  </View>
                </View>

                {/* Form inputs */}
                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                    Account Number *
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="Enter Bank Account Number"
                    placeholderTextColor={theme.textDim}
                    keyboardType="number-pad"
                    value={accountNumber}
                    onChangeText={text => {
                      setAccountNumber(text);
                      setHasUserEdited(true);
                    }}
                  />
                </View>

                {/* Re-enter Account Number for Mismatch Verification */}
                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                    Re-enter Account Number (Confirm) *
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: isAccountMismatch
                          ? colors.error
                          : isAccountMatched
                          ? colors.colorSecondaryHover
                          : theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="Re-enter Bank Account Number to verify"
                    placeholderTextColor={theme.textDim}
                    keyboardType="number-pad"
                    value={confirmAccountNumber}
                    onChangeText={text => {
                      setConfirmAccountNumber(text);
                      setHasUserEdited(true);
                    }}
                  />
                  {isAccountMismatch && (
                    <Text style={styles.mismatchAlert}>
                      ⚠️ Account numbers do not match! Please check carefully.
                    </Text>
                  )}
                  {isAccountMatched && (
                    <Text style={styles.matchSuccess}>
                      ✓ Account numbers match perfectly.
                    </Text>
                  )}
                </View>

                {/* IFSC Number */}
                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                    Bank IFSC Code *
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        color: theme.textPrimary,
                        textTransform: 'uppercase',
                      },
                    ]}
                    placeholder="e.g. HDFC0001234, SBIN0001234"
                    placeholderTextColor={theme.textDim}
                    autoCapitalize="characters"
                    maxLength={11}
                    value={ifscCode}
                    onChangeText={text => {
                      setIfscCode(text.toUpperCase());
                      setHasUserEdited(true);
                    }}
                  />
                </View>

                {/* Optional Mobile Number */}
                <View style={styles.formGroup}>
                  <View style={styles.optionalLabelRow}>
                    <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                      Bank Linked Mobile
                    </Text>
                    <Text style={[styles.optionalTag, { color: theme.textDim }]}>
                      (Optional)
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="10-digit mobile number linked to bank (optional)"
                    placeholderTextColor={theme.textDim}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={optionalPhone}
                    onChangeText={text => {
                      setOptionalPhone(text.replace(/\D/g, '').slice(0, 10));
                      setHasUserEdited(true);
                    }}
                  />
                </View>

                {/* UPI ID / Payment Link */}
                <View style={styles.formGroup}>
                  <View style={styles.optionalLabelRow}>
                    <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                      UPI ID / Link
                    </Text>
                    <Text style={[styles.optionalTag, { color: theme.textDim }]}>
                      (e.g. 8800313434@ptyes)
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="e.g. 8800313434@ptyes"
                    placeholderTextColor={theme.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={upiId}
                    onChangeText={text => {
                      setUpiId(text.trim());
                      setHasUserEdited(true);
                    }}
                  />
                </View>

                {/* Cancelled Cheque / Passbook Image Capture */}
                <View
                  style={[
                    styles.chequeCaptureContainer,
                    { borderTopColor: theme.border },
                  ]}>
                  <Text style={[styles.inputLabel, { color: theme.textPrimary }]}>
                    Picture of Cancelled Cheque / Passbook *
                  </Text>
                  <Text style={[styles.inputSubLabel, { color: theme.textMuted }]}>
                    Capture a clear photo showing your printed name, account number & IFSC.
                  </Text>

                  {chequePhoto ? (
                    <View
                      style={[
                        styles.chequePreviewRow,
                        {
                          backgroundColor: theme.cardBgSubtle,
                          borderColor: theme.border,
                        },
                      ]}>
                      <View style={styles.chequeIconWrap}>
                        <Text style={styles.chequeFileIcon}>🧾</Text>
                      </View>
                      <View style={styles.chequeMeta}>
                        <Text style={[styles.chequeFileName, { color: theme.textPrimary }]}>
                          {chequeFileName}
                        </Text>
                        <Text style={[styles.attachedBadge, { color: theme.successText }]}>
                          ✓ Cancelled Cheque Attached
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.smallChangeBtn,
                          { borderColor: theme.borderMedium, backgroundColor: theme.cardBg },
                        ]}
                        onPress={() => handleOpenCapture('cheque')}>
                        <Text style={[styles.smallChangeBtnText, { color: theme.primary }]}>
                          Change
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.actionButtonGroup}>
                      <TouchableOpacity
                        style={[
                          styles.uploadButton,
                          {
                            backgroundColor: theme.cardBgSubtle,
                            borderColor: theme.borderMedium,
                          },
                        ]}
                        onPress={() => handleOpenCapture('cheque')}
                        activeOpacity={0.85}>
                        <Text style={styles.uploadIcon}>📷</Text>
                        <Text style={[styles.uploadText, { color: theme.primary }]}>
                          Capture Cancelled Cheque Photo
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Single Submission Button for Bank Details (User can save single data any time) */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                    <TouchableOpacity
                      style={[
                        styles.cardActionSaveBtn,
                        hasExistingBank ? { flex: 1, marginRight: 8, marginTop: 0 } : { flex: 1, marginTop: 0 },
                        { backgroundColor: theme.primary },
                      ]}
                      onPress={handleUploadBankDetails}
                      disabled={uploadingBank}
                      activeOpacity={0.85}>
                      {uploadingBank ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.cardActionSaveBtnText}>💾 Save Bank Details</Text>
                      )}
                    </TouchableOpacity>
                    {hasExistingBank && (
                      <TouchableOpacity
                        style={{
                          borderRadius: 10,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: theme.borderMedium,
                          backgroundColor: theme.cardBgSubtle,
                        }}
                        onPress={() => setIsEditingBank(false)}
                        activeOpacity={0.85}>
                        <Text style={{ fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600', color: theme.textMuted }}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* ============================================================== */}
            {/* DOCUMENT 3: POLICE VERIFICATION (NO TOKEN NUMBER FIELD) */}
            {/* ============================================================== */}
            {policeSubmitted ? (
              // REDUCED HEIGHT COMPACT CARD (Already Done)
              <View style={[styles.compactCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactDoneBadge, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                    <Text style={[styles.compactDoneIcon, { color: theme.successText }]}>✓</Text>
                  </View>
                  <View style={styles.compactTexts}>
                    <Text style={[styles.compactTitle, { color: theme.textPrimary }]}>
                      Police Verification Certificate
                    </Text>
                    <Text style={[styles.compactSub, { color: theme.successText }]}>
                      ✓ {policeDocName || 'PCC Document'} Uploaded
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.compactActionBtn, { borderColor: theme.borderMedium }]}
                  onPress={() => {
                    setHasUserEdited(true);
                    handleOpenCapture('police');
                  }}
                  activeOpacity={0.7}>
                  <Text style={[styles.compactActionText, { color: theme.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // FULL PENDING CARD WITH UPLOAD DETAILS BUTTON
              <View
                style={[
                  styles.docCard,
                  {
                    backgroundColor: theme.cardBg,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={styles.docHeader}>
                  <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.stepBadgeNum}>3</Text>
                  </View>
                  <View style={styles.docHeaderTexts}>
                    <Text style={[styles.docTitle, { color: theme.textPrimary }]}>
                      Police Verification Certificate
                    </Text>
                    <Text style={[styles.docDesc, { color: theme.textMuted }]}>
                      Upload your Police Clearance Certificate (PCC) as PDF or capture document image.
                    </Text>
                  </View>
                </View>

                {/* Document upload / capture preview or actions (Token number input completely removed) */}
                {policeDocData ? (
                  <View
                    style={[
                      styles.chequePreviewRow,
                      {
                        backgroundColor: theme.cardBgSubtle,
                        borderColor: theme.border,
                      },
                    ]}>
                    <View style={styles.chequeIconWrap}>
                      <Text style={styles.chequeFileIcon}>📄</Text>
                    </View>
                    <View style={styles.chequeMeta}>
                      <Text style={[styles.chequeFileName, { color: theme.textPrimary }]}>
                        {policeDocName || 'police-clearance-certificate.pdf'}
                      </Text>
                      <Text style={[styles.attachedBadge, { color: theme.successText }]}>
                        ✓ Document Attached
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.smallChangeBtn,
                        { borderColor: theme.borderMedium, backgroundColor: theme.cardBg },
                      ]}
                      onPress={() => {
                        setHasUserEdited(true);
                        handleOpenCapture('police');
                      }}>
                      <Text style={[styles.smallChangeBtnText, { color: theme.primary }]}>
                        Change
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.actionButtonGroup}>
                    <TouchableOpacity
                      style={[
                        styles.uploadButton,
                        {
                          backgroundColor: theme.cardBgSubtle,
                          borderColor: theme.borderMedium,
                        },
                      ]}
                      onPress={() => {
                        setHasUserEdited(true);
                        handleOpenCapture('police');
                      }}
                      activeOpacity={0.85}>
                      <Text style={styles.uploadIcon}>📄</Text>
                      <Text style={[styles.uploadText, { color: theme.primary }]}>
                        Upload PDF / Capture Document Image
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Single Submission Button for Police Verification (User can save single data any time) */}
                {policeDocData ? (
                  <TouchableOpacity
                    style={[
                      styles.cardActionSaveBtn,
                      { backgroundColor: theme.primary, marginTop: 12 },
                    ]}
                    onPress={handleUploadPoliceDetails}
                    disabled={uploadingPolice}
                    activeOpacity={0.85}>
                    {uploadingPolice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.cardActionSaveBtnText}>💾 Save Police Verification</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ================================================================ */}
      {/* FIXED BOTTOM FOOTER (REFRESH & SUBMIT) */}
      {/* ================================================================ */}
      {!isBlocked && (
        <View
          style={[
            styles.fixedFooter,
            {
              backgroundColor: theme.cardBg,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}>
          <GradientButton
            title="Refresh"
            icon={<Text style={styles.footerBtnIcon}>🔄</Text>}
            onPress={handleRefresh}
            disabled={refreshing}
            loading={refreshing}
            loadingText="Refreshing..."
            style={styles.footerRefreshBtn}
            textStyle={styles.footerBtnText}
          />
          <GradientButton
            title="Submit"
            onPress={handleSubmitDocuments}
            disabled={!isDirty || submitting}
            loading={submitting}
            loadingText="Submitting..."
            style={styles.footerSubmitBtn}
            textStyle={styles.footerBtnText}
          />
        </View>
      )}
      </KeyboardAvoidingView>

      {/* ================================================================ */}
      {/* CAPTURE / UPLOAD PICKER MODAL */}
      {/* ================================================================ */}
      <Modal
        visible={captureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptureModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.cardBg,
                borderColor: theme.border,
              },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              {captureTarget === 'selfie'
                ? 'Capture Selfie Photo'
                : captureTarget === 'cheque'
                ? 'Capture Cancelled Cheque'
                : 'Attach Police Verification'}
            </Text>
            <Text style={[styles.modalDesc, { color: theme.textMuted }]}>
              {captureTarget === 'police'
                ? 'Capture document photo or upload a PDF/image.'
                : 'Select an option to capture with device camera or pick a file.'}
            </Text>

            <TouchableOpacity
              style={[
                styles.modalOptionBtn,
                {
                  backgroundColor: theme.cardBgSubtle,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => handleApplyCapture('camera')}>
              <Text style={styles.modalOptionIcon}>📷</Text>
              <View style={styles.modalOptionTexts}>
                <Text style={[styles.modalOptionTitle, { color: theme.textPrimary }]}>
                  Take Photo with Camera
                </Text>
                <Text style={[styles.modalOptionSub, { color: theme.textDim }]}>
                  Capture document or photo immediately
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalOptionBtn,
                {
                  backgroundColor: theme.cardBgSubtle,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => handleApplyCapture('gallery')}>
              <Text style={styles.modalOptionIcon}>
                {captureTarget === 'police' ? '📄' : '🖼️'}
              </Text>
              <View style={styles.modalOptionTexts}>
                <Text style={[styles.modalOptionTitle, { color: theme.textPrimary }]}>
                  {captureTarget === 'police' ? 'Upload PDF / Image File' : 'Choose from Gallery'}
                </Text>
                <Text style={[styles.modalOptionSub, { color: theme.textDim }]}>
                  Pick an existing document from device storage
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalCancelBtn,
                { borderColor: theme.borderMedium, backgroundColor: theme.cardBg },
              ]}
              onPress={() => setCaptureModalVisible(false)}>
              <Text style={[styles.modalCancelText, { color: theme.textDim }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================ */}
      {/* FULL PAGE LOADING OVERLAY ON SUBMIT / REFRESH */}
      {/* ================================================================ */}
      {(submitting || refreshing) && (
        <View style={styles.fullPageLoadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingTitle}>
              {submitting ? 'Submitting Documents...' : 'Refreshing Account Status...'}
            </Text>
            <Text style={styles.loadingSubtitle}>
              {submitting
                ? 'Uploading your verification documents to the society desk.'
                : 'Fetching latest partner status from the server.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 80,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusBadgeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statusBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    shadowColor: 'rgba(19, 27, 46, 0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 14,
  },
  heroBigIcon: {
    fontSize: 22,
  },
  heroTitleWrap: {
    flex: 1,
  },
  heroTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  userMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  userMetaItem: {
    flexDirection: 'column',
  },
  metaLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  metaValueBold: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  reasonBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
    shadowColor: 'rgba(19, 27, 46, 0.03)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  reasonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reasonIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  reasonHeaderTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  reasonBody: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  reasonTimeline: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 10,
    fontStyle: 'italic',
  },
  blockedSection: {
    marginTop: 4,
  },
  resolutionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  resolutionHeading: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  resolutionStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 10,
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  stepDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  pendingSection: {
    marginTop: 4,
  },
  sectionHeaderRow: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubheading: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 2,
  },
  checklistSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  // Full card (Pending state)
  docCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: 'rgba(19, 27, 46, 0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepBadgeNum: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  docHeaderTexts: {
    flex: 1,
  },
  docTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  docDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  // --------------------------------------------------------------------------
  // REDUCED HEIGHT COMPACT CARD (Already Done state)
  // --------------------------------------------------------------------------
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: 'rgba(19, 27, 46, 0.03)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  compactDoneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  compactDoneIcon: {
    fontSize: 14,
    fontWeight: '800',
  },
  compactThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    marginRight: 10,
  },
  compactTexts: {
    flex: 1,
  },
  compactTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  compactSub: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  compactActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  compactActionText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },

  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selfieImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    marginRight: 14,
  },
  previewMeta: {
    flex: 1,
  },
  attachedBadge: {
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 6,
  },
  retakeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  retakeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonGroup: {
    gap: 8,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  uploadIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  uploadText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputSubLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginBottom: 8,
  },
  optionalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  optionalTag: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontStyle: 'italic',
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  mismatchAlert: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  matchSuccess: {
    color: colors.colorSecondaryHover,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  chequeCaptureContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  chequePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  chequeIconWrap: {
    marginRight: 10,
  },
  chequeFileIcon: {
    fontSize: 24,
  },
  chequeMeta: {
    flex: 1,
  },
  chequeFileName: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  smallChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallChangeBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  cardFooterAction: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardUploadDetailsBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardUploadDetailsBtnIcon: {
    fontSize: 16,
    marginRight: 8,
    color: '#FFFFFF',
  },
  cardUploadDetailsBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#FFFFFF',
  },
  fixedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    shadowColor: 'rgba(19, 27, 46, 0.08)',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 8,
  },
  footerRefreshBtn: {
    flex: 1,
    marginRight: 10,
    borderRadius: 999,
    paddingVertical: 13,
  },
  footerSubmitBtn: {
    flex: 1.2,
    borderRadius: 999,
    paddingVertical: 13,
  },
  footerBtnIcon: {
    fontSize: 16,
    marginRight: 6,
    color: '#FFFFFF',
  },
  footerBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#FFFFFF',
  },
  switchAccountBtn: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchAccountBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  primaryCtaButton: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(79, 70, 229, 0.25)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryCtaText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryCtaButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginTop: 10,
  },
  secondaryCtaText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  refreshStatusButton: {
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginTop: 12,
    shadowColor: 'rgba(26, 86, 219, 0.2)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 2,
  },
  refreshLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  refreshStatusText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusMetaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniRefreshText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 27, 46, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    shadowColor: 'rgba(19, 27, 46, 0.15)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  modalOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalOptionIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  modalOptionTexts: {
    flex: 1,
  },
  modalOptionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  modalOptionSub: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 2,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  modalCancelText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
  fullPageLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    zIndex: 99999,
    elevation: 99999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.25)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
    width: '100%',
    maxWidth: 320,
  },
  loadingTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 18,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Face Match Biometric Styles
  faceMatchBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginVertical: 10,
  },
  faceMatchValidatingBox: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  faceMatchSuccessBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  faceMatchErrorBox: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  faceMatchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  faceMatchIconCircleSuccess: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  faceMatchIconCircleError: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  faceMatchSuccessIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  faceMatchErrorIcon: {
    fontSize: 14,
  },
  faceMatchTextCol: {
    flex: 1,
  },
  faceMatchTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  faceMatchSub: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  faceMatchSuccessTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  faceMatchSuccessSub: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  faceMatchErrorTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  faceMatchErrorSub: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  confidenceBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  confidenceText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  confidenceErrorText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
    marginTop: 4,
  },
  faceMatchConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  faceMatchConfidenceLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#4B5563',
  },
  faceMatchConfidenceVal: {
    fontWeight: '800',
    color: '#047857',
  },
  faceMatchThresholdLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#6B7280',
  },
  freezeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  freezeTitleText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  freezeBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  freezeBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  previewContainerCol: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  freezeLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freezeLockIcon: {
    fontSize: 14,
  },
  previewContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  selfieImageWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#10B981',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  verifiedCheckIcon: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  previewPictureTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  freezeSubtext: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  autoSavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  autoSavingText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  cardActionSaveBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: 'rgba(79, 70, 229, 0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  cardActionSaveBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
