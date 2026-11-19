import React, { useEffect, useState } from 'react';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { GradientButton } from '../components/GradientButton';
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
  const isBlocked = (accountData.status || '').toLowerCase() === 'blocked';
  const theme = projectTheme;

  // Form states for the 3 Pending Documents
  // 1. Selfie
  const [selfiePhoto, setSelfiePhoto] = useState<string>(
    accountData.checklist?.picture?.photo || ''
  );
  const [selfieSubmitted, setSelfieSubmitted] = useState<boolean>(
    Boolean(accountData.checklist?.picture?.submitted)
  );
  const [uploadingSelfie, setUploadingSelfie] = useState<boolean>(false);

  // 2. Bank Details
  const [accountHolderName, setAccountHolderName] = useState<string>(
    accountData.fullName || accountData.userName || ''
  );
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [optionalPhone, setOptionalPhone] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [chequePhoto, setChequePhoto] = useState<string>('');
  const [chequeFileName, setChequeFileName] = useState<string>('cancelled_cheque.jpg');
  const [bankDetailsSubmitted, setBankDetailsSubmitted] = useState<boolean>(
    Boolean(accountData.checklist?.bankDetails?.submitted)
  );
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
    optionalPhone: '',
    chequePhoto: '',
    policeDocData: '',
  });

  const [hasUserEdited, setHasUserEdited] = useState<boolean>(false);

  const isDirty = React.useMemo(() => {
    const b = baselineRef.current;
    const valuesChanged =
      (selfiePhoto || '') !== (b.selfiePhoto || '') ||
      (accountNumber || '') !== (b.accountNumber || '') ||
      (confirmAccountNumber || '') !== (b.confirmAccountNumber || '') ||
      (ifscCode || '') !== (b.ifscCode || '') ||
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
          setSelfieSubmitted(false);
        }

        const bank = checklist.bankDetails || checklist.bank;
        if (bank) {
          if (bank.submitted) {
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
          if (bank.bankName) setBankName(bank.bankName);
          if (bank.cancelChequeDoc) setChequePhoto(bank.cancelChequeDoc);
          if (bank.cancelChequeName) setChequeFileName(bank.cancelChequeName);
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
          optionalPhone: bank?.phone || '',
          chequePhoto: bank?.cancelChequeDoc || '',
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

  // Open capture modal
  const handleOpenCapture = (target: 'selfie' | 'cheque' | 'police') => {
    setCaptureTarget(target);
    setCaptureModalVisible(true);
  };

  // Confirm capture action
  const handleApplyCapture = (type: 'camera' | 'gallery') => {
    setHasUserEdited(true);
    if (captureTarget === 'selfie') {
      const photoUri = `data:image/jpeg;base64,camera_selfie_${Date.now()}`;
      setSelfiePhoto(photoUri);
    } else if (captureTarget === 'cheque') {
      const chequeUri = `data:image/jpeg;base64,camera_cheque_${Date.now()}`;
      setChequePhoto(chequeUri);
      setChequeFileName('cancelled_cheque.jpg');
    } else if (captureTarget === 'police') {
      const pdfUri = `data:application/pdf;base64,camera_police_pcc_${Date.now()}`;
      setPoliceDocData(pdfUri);
      setPoliceDocName(type === 'camera' ? 'police-clearance-photo.jpg' : 'police-clearance-certificate.pdf');
    }
    setCaptureModalVisible(false);
    setCaptureTarget(null);
  };

  // --------------------------------------------------------------------------
  // PER-CARD "UPLOAD DETAILS" ACTIONS
  // --------------------------------------------------------------------------

  // 1. Upload Selfie Details
  const handleUploadSelfieDetails = async () => {
    if (!selfiePhoto) {
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
    if (!chequePhoto && !bankDetailsSubmitted) {
      Alert.alert(
        'Cancelled Cheque Required',
        'Please capture or attach a clear photo of your cancelled cheque or passbook.'
      );
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
          bankName: bankName.trim() || undefined,
          phone: optionalPhone.trim() || undefined,
          documentData: chequePhoto || undefined,
          documentName: chequeFileName || 'cancelled_cheque.jpg',
        },
      };
      const res = await userService.updatePendingDocuments(payload, token);
      if (res && (res.success || res.status)) {
        setBankDetailsSubmitted(true);
        Alert.alert(
          'Bank Details Uploaded',
          'Your bank account information and cancelled cheque have been uploaded successfully.'
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
  // MASTER SUBMIT: ALL 3 PENDING DOCUMENTS
  // --------------------------------------------------------------------------
  const handleSubmitDocuments = async () => {
    // 1. Check Selfie
    if (!selfiePhoto && !selfieSubmitted) {
      Alert.alert('Selfie Required', 'Please capture your face picture for the security badge.');
      return;
    }

    // 2. Check Bank Details
    if (!accountNumber || accountNumber.trim().length < 6) {
      Alert.alert('Bank Details Required', 'Please enter your bank account number.');
      return;
    }
    if (accountNumber !== confirmAccountNumber) {
      Alert.alert(
        'Account Number Mismatch',
        'The re-entered account number does not match. Please verify and re-type.'
      );
      return;
    }
    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!cleanIfsc || cleanIfsc.length < 5) {
      Alert.alert('IFSC Code Required', 'Please enter a valid Bank IFSC code.');
      return;
    }
    if (!chequePhoto && !bankDetailsSubmitted) {
      Alert.alert(
        'Cancelled Cheque Required',
        'Please capture or upload a clear photo of your cancelled cheque or passbook.'
      );
      return;
    }

    // 3. Check Police Verification
    if (!policeDocData && !policeSubmitted) {
      Alert.alert(
        'Police Verification Required',
        'Please upload your Police Clearance Certificate (PDF/image) or capture document image.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload: PendingDocumentsPayload = {
        picture: selfiePhoto || undefined,
        bankDetails: {
          accountHolderName: accountHolderName || accountData.fullName || 'Agent Partner',
          accountNumber: accountNumber.trim(),
          ifscCode: cleanIfsc,
          bankName: bankName.trim() || undefined,
          phone: optionalPhone.trim() || undefined,
          documentData: chequePhoto || undefined,
          documentName: chequeFileName || 'cancelled_cheque.jpg',
        },
        policeVerification: {
          documentData: policeDocData || undefined,
          documentName: policeDocName || 'police-clearance-certificate.pdf',
          status: 'Pending',
        },
      };

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

        const updatedReason =
          res.pendingReason ||
          (res as any)?.data?.pendingReason ||
          res.message ||
          'All 3 mandatory verification documents submitted. Pending final administrator KYC verification.';
        setCurrentReason(updatedReason);
        setSelfieSubmitted(true);
        setBankDetailsSubmitted(true);
        setPoliceSubmitted(true);
        setHasUserEdited(false);
        baselineRef.current = {
          selfiePhoto,
          accountNumber,
          confirmAccountNumber,
          ifscCode,
          optionalPhone,
          chequePhoto,
          policeDocData,
        };

        Alert.alert(
          'Documents Submitted!',
          'Your selfie, bank details with cancelled cheque, and police clearance document have been submitted to the society security desk for approval.',
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
        err?.message || 'Could not submit verification documents. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Re-check account status
  const handleRefresh = async () => {
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Fixed Common App Header at Top */}
      <AppHeader
        showDutyToggle={false}
        onSignOut={onSignOut}
        onPressProfile={onSignOut}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
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
            {/* DOCUMENT 1: SELFIE */}
            {/* ============================================================== */}
            {selfieSubmitted ? (
              // REDUCED HEIGHT COMPACT CARD (Already Done)
              <View style={[styles.compactCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactDoneBadge, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                    <Text style={[styles.compactDoneIcon, { color: theme.successText }]}>✓</Text>
                  </View>
                  {selfiePhoto ? (
                    <Image
                      source={{ uri: selfiePhoto }}
                      style={[styles.compactThumbnail, { borderColor: theme.primary }]}
                      defaultSource={require('../assets/images/logo.png')}
                    />
                  ) : null}
                  <View style={styles.compactTexts}>
                    <Text style={[styles.compactTitle, { color: theme.textPrimary }]}>
                      Capture Selfie Photo
                    </Text>
                    <Text style={[styles.compactSub, { color: theme.successText }]}>
                      ✓ Photo Captured & Uploaded
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.compactActionBtn, { borderColor: theme.borderMedium }]}
                  onPress={() => {
                    setHasUserEdited(true);
                    handleOpenCapture('selfie');
                  }}
                  activeOpacity={0.7}>
                  <Text style={[styles.compactActionText, { color: theme.primary }]}>Retake</Text>
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
                    <Text style={styles.stepBadgeNum}>1</Text>
                  </View>
                  <View style={styles.docHeaderTexts}>
                    <Text style={[styles.docTitle, { color: theme.textPrimary }]}>
                      Capture Selfie Photo
                    </Text>
                    <Text style={[styles.docDesc, { color: theme.textMuted }]}>
                      Capture your clear front-facing picture for your security ID badge.
                    </Text>
                  </View>
                </View>

                {selfiePhoto ? (
                  <View
                    style={[
                      styles.previewContainer,
                      {
                        backgroundColor: theme.cardBgSubtle,
                        borderColor: theme.border,
                      },
                    ]}>
                    <Image
                      source={{ uri: selfiePhoto }}
                      style={[styles.selfieImage, { borderColor: theme.primary }]}
                      defaultSource={require('../assets/images/logo.png')}
                    />
                    <View style={styles.previewMeta}>
                      <Text style={[styles.attachedBadge, { color: theme.successText }]}>
                        ✓ Selfie Photo Selected
                      </Text>
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
                          Retake Selfie
                        </Text>
                      </TouchableOpacity>
                    </View>
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
            {bankDetailsSubmitted ? (
              // REDUCED HEIGHT COMPACT CARD (Already Done)
              <View style={[styles.compactCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactDoneBadge, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                    <Text style={[styles.compactDoneIcon, { color: theme.successText }]}>✓</Text>
                  </View>
                  <View style={styles.compactTexts}>
                    <Text style={[styles.compactTitle, { color: theme.textPrimary }]}>
                      Bank Details & Cancelled Cheque
                    </Text>
                    <Text style={[styles.compactSub, { color: theme.successText }]}>
                      ✓ {accountNumber ? `A/C •••• ${accountNumber.slice(-4)}` : 'Bank Account'} & Cheque Uploaded
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.compactActionBtn, { borderColor: theme.borderMedium }]}
                  onPress={() => {
                    setBankDetailsSubmitted(false);
                    setHasUserEdited(true);
                  }}
                  activeOpacity={0.7}>
                  <Text style={[styles.compactActionText, { color: theme.primary }]}>Edit</Text>
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
});
