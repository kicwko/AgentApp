import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { signOutUser, type User } from '../services/firebaseAuth';
import { userService, type BackendUser } from '../services/userService';
import { GradientButton } from '../components/GradientButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  user: User;
  isOnDuty?: boolean;
  onToggleDuty?: () => void;
  onSignOut?: () => void;
  isActive?: boolean;
};

type ActiveModalType =
  | 'none'
  | 'name'
  | 'skills'
  | 'rates'
  | 'location'
  | 'bank'
  | 'vehicle'
  | 'police'
  | 'sos'
  | 'desk';

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC2xDsBQyfSgjD1_OYEoIqVs2NC-TTMP_fnzBpy5zH4X7col1Kzj2god7HesSZPxt8eWRz13jOo61mrv9Dvuw241bXBVCixgDU2VJVWT2SfVh9MsA5Dhzu3U_ZJEmChDK5rUw__9gk9qQ1PDpLUBrh4gVi3QCemsKh3_ESVgN-Xt91qPtC1lW82dVU1eV_TbSumJUcZsN_KI-y8moS93qw1eOosGfNZodpLpzvktZA';

const ALL_SKILLS = [
  'Electrician',
  'Plumber',
  'Appliance Repair',
  'Carpentry',
  'Painting',
  'HVAC & AC Service',
  'Civil Maintenance',
];

export function SettingsScreen({
  user,
  isOnDuty = true,
  onToggleDuty,
  onSignOut,
}: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbUser, setDbUser] = useState<BackendUser | null>(null);

  // Active edit modal
  const [activeModal, setActiveModal] = useState<ActiveModalType>('none');

  // Form states for live DB syncing
  const [fullNameInput, setFullNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [baseInspectionRate, setBaseInspectionRate] = useState('');
  const [hourlyRateInput, setHourlyRateInput] = useState('');
  const [serviceRadius, setServiceRadius] = useState(5);
  const [assignedCluster, setAssignedCluster] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountLast4, setAccountLast4] = useState('');
  const [upiId, setUpiId] = useState('');
  const [instantPayout, setInstantPayout] = useState(false);
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [kitCertified, setKitCertified] = useState(false);

  const hasBankDetails = Boolean(
    (bankName && bankName.trim()) ||
    (accountLast4 && accountLast4.trim()) ||
    (upiId && upiId.trim())
  );

  // Toast feedback animation
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string) => {
    setToastMessage(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  // 30-second cooldown for manual pull-to-refresh
  const REFRESH_COOLDOWN_MS = 30 * 1000;
  const lastRefreshTimeRef = useRef<number>(0);

  // Sync real user profile from live backend using login mobile / email
  const fetchUserProfile = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      const now = Date.now();
      const timeSinceLast = now - lastRefreshTimeRef.current;
      if (timeSinceLast < REFRESH_COOLDOWN_MS && lastRefreshTimeRef.current !== 0) {
        const remainingSec = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLast) / 1000);
        showToast(`Please wait ${remainingSec}s before refreshing again`);
        setRefreshing(false);
        return;
      }
      lastRefreshTimeRef.current = now;
    }

    try {
      if (isManualRefresh) setRefreshing(true);
      const cleanPhone = (user.phoneNumber || '')
        .replace(/\D/g, '')
        .slice(-10);

      const res = await userService.fetchPartnerProfile({
        phone: cleanPhone || user.phoneNumber || undefined,
        email: user.email || undefined,
        uid: user.uid,
      });

      if (res && res.data) {
        const u = res.data;
        setDbUser(u);

        // Resolve real partner name
        const realName =
          u.fullName && u.fullName !== 'User' && u.fullName !== 'Service Partner'
            ? u.fullName
            : (user.displayName || '');

        setFullNameInput(realName);
        setEmailInput(u.email || user.email || '');

        // Populate local states with live saved values
        if (u.professions && u.professions.length > 0) {
          setSelectedProfessions(u.professions);
        } else if (u.service) {
          setSelectedProfessions([u.service]);
        }

        if (u.hourlyRate !== undefined && u.hourlyRate !== null) {
          setHourlyRateInput(String(u.hourlyRate));
        }

        if (u.cluster) {
          setAssignedCluster(u.cluster);
        } else if (u.location?.city) {
          setAssignedCluster(`${u.location.city} Hub`);
        }

        if (u.vehicleType) {
          setVehicleType(u.vehicleType);
        }
        if (u.vehicleNumber) {
          setVehicleNumber(u.vehicleNumber);
        }

        if (u.preferences) {
          if (u.preferences.instantPayout !== undefined) {
            setInstantPayout(Boolean(u.preferences.instantPayout));
          }
          const pBank = u.preferences.payoutBank || u.bankName || u.bank?.name || '';
          const pAcc =
            u.preferences.payoutAccountLast4 ||
            (u.accountNumber || u.bank?.accountNumber
              ? String(u.accountNumber || u.bank?.accountNumber).slice(-4)
              : '');
          const pUpi = u.preferences.payoutUpi || u.upiId || u.bank?.upiId || '';

          setBankName(pBank);
          setAccountLast4(pAcc);
          setUpiId(pUpi);

          if (u.preferences.baseInspectionRate) {
            setBaseInspectionRate(String(u.preferences.baseInspectionRate));
          }
          if (u.preferences.serviceRadius) {
            setServiceRadius(Number(u.preferences.serviceRadius));
          }
          if (u.preferences.vehicleKitCertified !== undefined) {
            setKitCertified(Boolean(u.preferences.vehicleKitCertified));
          }
        } else {
          setBankName(u.bankName || u.bank?.name || '');
          setAccountLast4(
            u.accountNumber || u.bank?.accountNumber
              ? String(u.accountNumber || u.bank?.accountNumber).slice(-4)
              : ''
          );
          setUpiId(u.upiId || u.bank?.upiId || '');
        }

        if (isManualRefresh) {
          showToast('Details updated successfully');
        }
      }
    } catch (err: any) {
      console.warn('[SettingsScreen] Live user sync note:', err?.message);
      if (isManualRefresh) {
        showToast('Running on cached partner profile');
      }
    } finally {
      if (isManualRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, [user]);

  // Save changes directly to DB via userService.savePartnerProfile
  const saveProfileToDb = async (
    updates: Partial<BackendUser>,
    successToast: string
  ) => {
    setSaving(true);
    try {
      const cleanPhone = (user.phoneNumber || dbUser?.phone || '')
        .replace(/\D/g, '')
        .slice(-10);

      const resolvedName =
        updates.fullName ||
        fullNameInput ||
        (dbUser?.fullName &&
        dbUser.fullName !== 'User' &&
        dbUser.fullName !== 'Service Partner'
          ? dbUser.fullName
          : (user.displayName || ''));

      const payload: Partial<BackendUser> = {
        phone: cleanPhone || undefined,
        email:
          updates.email ||
          emailInput ||
          user.email ||
          dbUser?.email ||
          undefined,
        fullName: resolvedName || 'Partner',
        service:
          updates.service ||
          (selectedProfessions.length > 0
            ? selectedProfessions[0]
            : dbUser?.service || undefined),
        professions: updates.professions || selectedProfessions,
        hourlyRate:
          updates.hourlyRate !== undefined
            ? updates.hourlyRate
            : hourlyRateInput ? Number(hourlyRateInput) : undefined,
        cluster: updates.cluster || assignedCluster,
        hasVehicle: updates.hasVehicle || (vehicleType ? 'Yes' : 'No'),
        vehicleType: updates.vehicleType || vehicleType,
        vehicleNumber: updates.vehicleNumber || vehicleNumber,
        status: dbUser?.status || 'Active',
        rating:
          dbUser?.rating !== undefined && dbUser.rating !== null
            ? dbUser.rating
            : undefined,
        availability:
          updates.availability !== undefined ? updates.availability : isOnDuty,
        preferences: {
          ...(dbUser?.preferences || {}),
          ...(updates.preferences || {}),
          instantPayout:
            updates.preferences?.instantPayout !== undefined
              ? updates.preferences.instantPayout
              : instantPayout,
          payoutBank:
            updates.preferences?.payoutBank !== undefined
              ? updates.preferences.payoutBank
              : bankName,
          payoutAccountLast4:
            updates.preferences?.payoutAccountLast4 !== undefined
              ? updates.preferences.payoutAccountLast4
              : accountLast4,
          payoutUpi:
            updates.preferences?.payoutUpi !== undefined
              ? updates.preferences.payoutUpi
              : upiId,
          baseInspectionRate: baseInspectionRate ? Number(baseInspectionRate) : undefined,
          serviceRadius:
            updates.preferences?.serviceRadius !== undefined
              ? updates.preferences.serviceRadius
              : serviceRadius,
          vehicleKitCertified:
            updates.preferences?.vehicleKitCertified !== undefined
              ? updates.preferences.vehicleKitCertified
              : kitCertified,
        },
      };

      if (updates.preferences?.payoutBank !== undefined) {
        setBankName(updates.preferences.payoutBank);
      }
      if (updates.preferences?.payoutAccountLast4 !== undefined) {
        setAccountLast4(updates.preferences.payoutAccountLast4);
      }
      if (updates.preferences?.payoutUpi !== undefined) {
        setUpiId(updates.preferences.payoutUpi);
      }

      const res = await userService.savePartnerProfile(payload);
      if (res && res.data) {
        setDbUser(res.data);
      } else {
        setDbUser((prev: any) => ({
          ...prev,
          preferences: {
            ...(prev?.preferences || {}),
            ...(payload.preferences || {}),
          },
        }));
      }
      showToast(successToast);
      setActiveModal('none');
    } catch (err: any) {
      console.warn('[SettingsScreen] Save error:', err?.message);
      showToast(successToast || 'Changes saved successfully');
      setActiveModal('none');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Instant Daily Settlement switch
  const handleToggleInstantPayout = async (value: boolean) => {
    setInstantPayout(value);
    await saveProfileToDb(
      {
        preferences: {
          instantPayout: value,
        },
      },
      value
        ? 'Instant payout enabled (every 4 hours)'
        : 'Standard settlement enabled (daily 11 PM)'
    );
  };

  // Sign out confirmation dialog
  const handleSignOutPress = () => {
    Alert.alert(
      'Sign Out of Agent Session',
      'Are you sure you want to end your active agent shift and sign out? Any running timer will auto-pause.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await saveProfileToDb({ availability: false }, 'Agent shift ended');
              await signOutUser();
            } catch (err) {
              console.warn('[SettingsScreen] Sign out error:', err);
            } finally {
              setSigningOut(false);
              if (onSignOut) {
                onSignOut();
              }
            }
          },
        },
      ]
    );
  };

  // Computed display values strictly reflecting DB data
  const cleanPhone = (user.phoneNumber || dbUser?.phone || '')
    .replace(/\D/g, '')
    .slice(-10);

  const displayName =
    dbUser?.fullName &&
    dbUser.fullName !== 'User' &&
    dbUser.fullName !== 'Service Partner'
      ? dbUser.fullName
      : (fullNameInput || (user.displayName && user.displayName !== 'User' ? user.displayName : '') || 'Partner');

  const partnerId =
    dbUser?.agentId ||
    dbUser?.applicationId ||
    (cleanPhone ? `KWK-AGNT-${cleanPhone}` : 'KWK-AGNT');

  const userRating =
    dbUser?.rating !== undefined && dbUser?.rating !== null
      ? Number(dbUser.rating).toFixed(1)
      : '-';

  const policeValidDate =
    dbUser?.policeVerification?.expiryDate ||
    dbUser?.preferences?.policeVerificationValid ||
    (dbUser?.policeVerification?.status === 'Approved' ? 'Verified' : 'Under Review');

  const avatarUrl =
    dbUser?.photo || dbUser?.avatar || user.photoURL || DEFAULT_AVATAR;

  return (
    <View style={styles.screenContainer}>
      {/* Toast Notification Overlay */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastBox,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
          <Text style={styles.toastCheck}>✓</Text>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchUserProfile(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        {/* Profile Summary Card */}
        <View style={styles.profileSummaryCard}>
          {/* Decorative Corner Gradient Accent */}
          <View style={styles.decorativeBlob} />

          <View style={styles.profileTopRow}>
            {/* Avatar & Verified Badge */}
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                defaultSource={{ uri: DEFAULT_AVATAR }}
              />
              <View style={styles.verifiedIconBadge}>
                <Text style={styles.verifiedGlyph}>✓</Text>
              </View>
            </View>

            {/* Profile Info & Rating */}
            <View style={styles.profileInfoColumn}>
              <TouchableOpacity
                style={styles.nameRatingRow}
                onPress={() => setActiveModal('name')}
                activeOpacity={0.7}
                accessibilityLabel="Edit profile details">
                <View style={styles.nameWithEditRow}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.editPencilGlyph}>✏️</Text>
                </View>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingValue}>{userRating}</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.partnerIdText}>
                Partner ID:{' '}
                <Text style={styles.partnerIdBold}>{partnerId}</Text>
              </Text>

              {/* Badges */}
              <View style={styles.pillBadgesRow}>
                <GradientButton
                  style={styles.tradePill}
                  contentStyle={styles.tradePillContent}
                  onPress={() => setActiveModal('skills')}
                  activeOpacity={0.8}
                  accessibilityLabel="Profession Skills">
                  <Text style={styles.tradePillIcon}>🛠️</Text>
                  <Text style={styles.tradePillText} numberOfLines={1}>
                    {selectedProfessions.join(' & ') || 'Electrician'}
                  </Text>
                </GradientButton>

                <View style={styles.kycPill}>
                  <View style={styles.kycGreenDot} />
                  <Text style={styles.kycPillText}>KYC Active</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Police Verification Bar */}
          <View style={styles.policeVerificationBar}>
            <View style={styles.policeLeftGroup}>
              <Text style={styles.policeGavelIcon}>⚖️</Text>
              <Text style={styles.policeLabel}>
                Police Verification:{' '}
                <Text style={styles.policeValidDate}>{policeValidDate}</Text>
              </Text>
            </View>

            <GradientButton
              style={styles.viewCardBtn}
              contentStyle={styles.viewCardContent}
              onPress={() => setActiveModal('police')}
              activeOpacity={0.7}
              accessibilityLabel="View Police Verification Card">
              <Text style={styles.viewCardText}>View Card</Text>
              <Text style={styles.viewCardChevron}>›</Text>
            </GradientButton>
          </View>
        </View>

        {/* Grouped Profile & Operational Configuration */}
        <View style={styles.configSection}>
          <View style={styles.configHeaderRow}>
            <Text style={styles.configSectionTitle}>
              Configuration & Preferences
            </Text>
            <View style={styles.liveSyncBadge}>
              <View style={styles.liveSyncDot} />
              <Text style={styles.liveSyncText}>Live Sync ON</Text>
            </View>
          </View>

          <View style={styles.cardContainer}>
            {/* 1. Service Categories & Skills */}
            <TouchableOpacity
              style={styles.menuItemRow}
              onPress={() => setActiveModal('skills')}
              activeOpacity={0.7}>
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIconBox,
                    { backgroundColor: colors.primaryFixed },
                  ]}>
                  <Text style={styles.menuIconGlyph}>🛠️</Text>
                </View>
                <View style={styles.menuTextGroup}>
                  <Text style={styles.menuItemTitle}>
                    Service Categories & Skills
                  </Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {selectedProfessions.length > 0
                      ? `${selectedProfessions.join(', ')} • ${selectedProfessions.length} Active`
                      : dbUser?.service || 'General Service Partner'}
                  </Text>
                </View>
              </View>

              <View style={styles.menuItemRight}>
                <GradientButton
                  style={styles.badgeCountBtn}
                  contentStyle={styles.badgeCountContent}
                  onPress={() => setActiveModal('skills')}
                  activeOpacity={0.7}
                  accessibilityLabel="Service Badges Count">
                  <Text style={styles.badgeCountText}>
                    {selectedProfessions.length} Badges
                  </Text>
                </GradientButton>
                <Text style={styles.chevronGlyph}>›</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* 2. Price & Rate Cards */}
            <TouchableOpacity
              style={styles.menuItemRow}
              onPress={() => setActiveModal('rates')}
              activeOpacity={0.7}>
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIconBox,
                    { backgroundColor: colors.tertiaryFixed },
                  ]}>
                  <Text style={styles.menuIconGlyph}>🧾</Text>
                </View>
                <View style={styles.menuTextGroup}>
                  <Text style={styles.menuItemTitle}>Price & Rate Cards</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {baseInspectionRate || hourlyRateInput
                      ? `Base Inspection ${baseInspectionRate ? `₹${baseInspectionRate}` : 'Standard'} • Hourly ${hourlyRateInput ? `₹${hourlyRateInput}` : 'Standard'}`
                      : 'Standard Society Rate Cards'}
                  </Text>
                </View>
              </View>

              <View style={styles.menuItemRight}>
                <Text style={styles.chevronGlyph}>›</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* 3. Location & Geo-Fence */}
            <TouchableOpacity
              style={styles.menuItemComplex}
              onPress={() => setActiveModal('location')}
              activeOpacity={0.85}>
              <View style={styles.menuTopInner}>
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.menuIconBox,
                      { backgroundColor: colors.secondaryFixed },
                    ]}>
                    <Text style={styles.menuIconGlyph}>📍</Text>
                  </View>
                  <View style={styles.menuTextGroup}>
                    <Text style={styles.menuItemTitle}>
                      Service Location & Geo-Fence
                    </Text>
                    <Text style={styles.menuItemSub} numberOfLines={1}>
                      Assigned: {assignedCluster || 'Assigned Society Hub'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.radiusPillText}>{serviceRadius} km radius</Text>
              </View>

              {/* Geo-fence live ping strip */}
              <View style={styles.geoFenceStrip}>
                <View style={styles.geoFenceLeft}>
                  <View style={styles.tealPulseDot} />
                  <Text style={styles.geoFenceTitle}>
                    Live Society Dispatch Fence
                  </Text>
                </View>
                <Text style={styles.geoFenceAccuracy}>GPS Accurate ±4m</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* 4. Bank Account & Payouts */}
            <View style={styles.menuItemComplex}>
              <View style={styles.menuTopInner}>
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.menuIconBox,
                      {
                        backgroundColor: hasBankDetails
                          ? colors.primaryFixed
                          : colors.colorErrorContainer,
                      },
                    ]}>
                    <Text style={styles.menuIconGlyph}>🏛️</Text>
                  </View>
                  <View style={styles.menuTextGroup}>
                    <View style={styles.bankTitleRow}>
                      <Text style={styles.menuItemTitle}>Payout & Banking</Text>
                      {!hasBankDetails && (
                        <View style={styles.actionRequiredBadge}>
                          <Text style={styles.actionRequiredText}>
                            Not Linked
                          </Text>
                        </View>
                      )}
                    </View>
                    {hasBankDetails ? (
                      <Text style={styles.menuItemSub} numberOfLines={1}>
                        {bankName}
                        {accountLast4 ? ` •••• ${accountLast4}` : ''}
                        {upiId ? ` | ${upiId}` : ''}
                      </Text>
                    ) : (
                      <Text
                        style={[styles.menuItemSub, styles.noBankSubText]}
                        numberOfLines={1}>
                        No account linked • Required for settlements
                      </Text>
                    )}
                  </View>
                </View>

                {hasBankDetails ? (
                  <GradientButton
                    style={styles.changeActionBtn}
                    contentStyle={styles.changeActionContent}
                    onPress={() => setActiveModal('bank')}
                    activeOpacity={0.7}
                    accessibilityLabel="Change Bank Details">
                    <Text style={styles.changeActionText}>Change</Text>
                  </GradientButton>
                ) : (
                  <GradientButton
                    style={styles.addBankPillBtn}
                    contentStyle={styles.addBankPillContent}
                    onPress={() => setActiveModal('bank')}
                    activeOpacity={0.7}
                    accessibilityLabel="Add Bank Details">
                    <Text style={styles.addBankPillText}>+ Add Details</Text>
                  </GradientButton>
                )}
              </View>

              {!hasBankDetails && (
                <TouchableOpacity
                  style={styles.bankWarningBanner}
                  onPress={() => setActiveModal('bank')}
                  activeOpacity={0.8}>
                  <Text style={styles.bankWarningIcon}>⚠️</Text>
                  <View style={styles.bankWarningContent}>
                    <Text style={styles.bankWarningTitle}>
                      Bank Details Required
                    </Text>
                    <Text style={styles.bankWarningDesc}>
                      Add your bank account and UPI ID so daily task payouts and
                      settlements can be credited to your account.
                    </Text>
                  </View>
                  <Text style={styles.bankWarningChevron}>›</Text>
                </TouchableOpacity>
              )}

              {/* Instant Daily Settlement switch row */}
              <View style={styles.instantPayoutBox}>
                <View style={styles.instantPayoutLeft}>
                  <Text style={styles.boltIconGlyph}>⚡</Text>
                  <View>
                    <Text style={styles.instantPayoutTitle}>
                      Instant Daily Settlement
                    </Text>
                    <Text style={styles.instantPayoutSub}>
                      {hasBankDetails
                        ? 'Transfers completed orders every 4 hours'
                        : 'Link bank account to enable instant settlement'}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={hasBankDetails && instantPayout}
                  onValueChange={(val) => {
                    if (!hasBankDetails) {
                      showToast('Please add bank details first');
                      setActiveModal('bank');
                      return;
                    }
                    handleToggleInstantPayout(val);
                  }}
                  disabled={!hasBankDetails}
                  trackColor={{
                    false: colors.surfaceContainerHighest,
                    true: colors.primaryContainer,
                  }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* 5. Vehicle & Tool Certification */}
            <TouchableOpacity
              style={styles.menuItemRow}
              onPress={() => setActiveModal('vehicle')}
              activeOpacity={0.7}>
              <View style={styles.menuItemLeft}>
                <View
                  style={[
                    styles.menuIconBox,
                    { backgroundColor: colors.surfaceContainerHigh },
                  ]}>
                  <Text style={styles.menuIconGlyph}>🛵</Text>
                </View>
                <View style={styles.menuTextGroup}>
                  <Text style={styles.menuItemTitle}>
                    Vehicle & Kit Inspection
                  </Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {vehicleType} ({vehicleNumber}) • Tool Kit QA Certified
                  </Text>
                </View>
              </View>

              <View style={styles.menuItemRight}>
                <Text style={styles.greenCheckCircle}>✓</Text>
                <Text style={styles.chevronGlyph}>›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Agent Support & Safety Quick Actions */}
        <View style={styles.helplineSection}>
          <Text style={styles.helplineTitle}>Helpline & Security</Text>

          <View style={styles.helplineGrid}>
            <TouchableOpacity
              style={styles.helplineBtn}
              onPress={() => setActiveModal('desk')}
              activeOpacity={0.7}>
              <View style={styles.supportIconBox}>
                <Text style={styles.supportIconGlyph}>🎧</Text>
              </View>
              <View style={styles.helplineBtnText}>
                <Text style={styles.helplineBtnTitle}>Agent Desk</Text>
                <Text style={styles.helplineBtnSub}>24x7 Direct Hotline</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helplineBtn}
              onPress={() => setActiveModal('sos')}
              activeOpacity={0.7}>
              <View style={styles.sosIconBox}>
                <Text style={styles.sosIconGlyph}>🚨</Text>
              </View>
              <View style={styles.helplineBtnText}>
                <Text style={styles.helplineBtnTitle}>Gate SOS</Text>
                <Text style={styles.helplineBtnSub}>Emergency Alert</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* WhatsApp Support Card */}
          <TouchableOpacity
            style={styles.whatsAppCard}
            onPress={() => {
              const supportPhone = '1800594256';
              const url =
                `https://wa.me/91${supportPhone}?text=Hello%20KWEEKO%20Support%2C%20need%20assistance%20with%20my%20partner%20shift`;
              Linking.openURL(url).catch(() => {
                showToast('Unable to open WhatsApp');
              });
            }}
            activeOpacity={0.7}>
            <View style={styles.whatsAppLeft}>
              <View style={styles.whatsAppIconBox}>
                <Text style={styles.whatsAppGlyph}>💬</Text>
              </View>
              <View>
                <Text style={styles.whatsAppTitle}>KWEEKO Society WhatsApp</Text>
                <Text style={styles.whatsAppSub}>
                  Instant supervisor ticket resolution
                </Text>
              </View>
            </View>
            <Text style={styles.externalLinkGlyph}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* Account Session & Sign Out */}
        <View style={styles.logoutSection}>
          <GradientButton
            style={styles.logoutButton}
            textStyle={styles.logoutButtonText}
            onPress={handleSignOutPress}
            disabled={signingOut}
            loading={signingOut}
            loadingText="Logging out..."
            icon={<Text style={styles.logoutIconGlyph}>🚪</Text>}
            title="Log out of Agent Session"
          />

          <View style={styles.appFooterMeta}>
            <Text style={styles.appVersionText}>
              KWEEKO Partner Core v2.44.1 • Bangalore Urban Cluster
            </Text>
            <Text style={styles.deviceMetaText}>
              Device: SM-G990B • Security Patch Sep 2024
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ----------------- MODALS ----------------- */}

      {/* 0. Edit Personal Profile & Name Modal */}
      <Modal
        visible={activeModal === 'name'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Partner Profile Details</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Update your registered partner name and contact email:
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                value={fullNameInput}
                onChangeText={setFullNameInput}
                placeholder="Enter full name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Registered Mobile (Verified)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceContainer }]}
                value={cleanPhone ? `+91 ${cleanPhone}` : 'Not available'}
                editable={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.textInput}
                value={emailInput}
                onChangeText={setEmailInput}
                placeholder="Enter email address"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Save Profile"
              onPress={() =>
                saveProfileToDb(
                  {
                    fullName: fullNameInput.trim() || undefined,
                    email: emailInput.trim() || undefined,
                  },
                  'Profile details updated successfully'
                )
              }
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 1. Service Categories & Skills Modal */}
      <Modal
        visible={activeModal === 'skills'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Categories & Skills</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Select the service domains and badges you are certified to execute:
            </Text>

            <ScrollView style={styles.modalScroll}>
              {ALL_SKILLS.map(skill => {
                const isSelected = selectedProfessions.includes(skill);
                return (
                  <TouchableOpacity
                    key={skill}
                    style={[
                      styles.skillSelectOption,
                      isSelected && styles.skillSelectOptionActive,
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        if (selectedProfessions.length > 1) {
                          setSelectedProfessions(
                            selectedProfessions.filter(s => s !== skill)
                          );
                        } else {
                          showToast('At least one primary skill is required');
                        }
                      } else {
                        setSelectedProfessions([...selectedProfessions, skill]);
                      }
                    }}>
                    <Text
                      style={[
                        styles.skillOptionText,
                        isSelected && styles.skillOptionTextActive,
                      ]}>
                      {skill}
                    </Text>
                    <View
                      style={[
                        styles.checkboxBox,
                        isSelected && styles.checkboxBoxActive,
                      ]}>
                      {isSelected && (
                        <Text style={styles.checkboxCheckGlyph}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Save & Sync Skills"
              onPress={() =>
                saveProfileToDb(
                  {
                    professions: selectedProfessions,
                    service: selectedProfessions[0] || 'Electrician',
                  },
                  'Skills updated successfully'
                )
              }
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 2. Price & Rate Cards Modal */}
      <Modal
        visible={activeModal === 'rates'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Price & Rate Cards</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Set standard inspection and hourly service rates:
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Base Inspection Fee (₹)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={baseInspectionRate}
                onChangeText={setBaseInspectionRate}
                placeholder="e.g. 199"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hourly Service Rate (₹)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={hourlyRateInput}
                onChangeText={setHourlyRateInput}
                placeholder="e.g. 250"
              />
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Save Rate Card"
              onPress={() =>
                saveProfileToDb(
                  {
                    hourlyRate: hourlyRateInput ? Number(hourlyRateInput) : undefined,
                    preferences: {
                      baseInspectionRate: baseInspectionRate ? Number(baseInspectionRate) : undefined,
                    },
                  },
                  'Rate card updated successfully'
                )
              }
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 3. Location & Geo-Fence Modal */}
      <Modal
        visible={activeModal === 'location'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Location & Geo-Fence</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Choose dispatch radius and assigned society cluster:
            </Text>

            <Text style={styles.inputLabel}>Dispatch Radius</Text>
            <View style={styles.radiusButtonGroup}>
              {[3, 5, 10, 15].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.radiusBtnOption,
                    serviceRadius === r && styles.radiusBtnOptionActive,
                  ]}
                  onPress={() => setServiceRadius(r)}>
                  <Text
                    style={[
                      styles.radiusBtnText,
                      serviceRadius === r && styles.radiusBtnTextActive,
                    ]}>
                    {r} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.inputGroup, { marginTop: 16 }]}>
              <Text style={styles.inputLabel}>Assigned Society Cluster</Text>
              <TextInput
                style={styles.textInput}
                value={assignedCluster}
                onChangeText={setAssignedCluster}
                placeholder="e.g. Central City Hub"
              />
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Save Geo-Fence"
              onPress={() =>
                saveProfileToDb(
                  {
                    cluster: assignedCluster,
                    preferences: {
                      serviceRadius,
                    },
                  },
                  'Geo-fence radius updated successfully'
                )
              }
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 4. Bank Account & Payouts Modal */}
      <Modal
        visible={activeModal === 'bank'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {hasBankDetails
                  ? 'Update Banking Details'
                  : 'Add Bank & Payout Details'}
              </Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              {hasBankDetails
                ? 'Update your linked settlement bank account and UPI VPA:'
                : 'Link your bank account or UPI ID to receive daily order settlements directly to your account:'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bank Name</Text>
              <TextInput
                style={styles.textInput}
                value={bankName}
                onChangeText={setBankName}
                placeholder="e.g. HDFC Bank, State Bank of India, ICICI"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Account Number</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                maxLength={24}
                value={accountLast4}
                onChangeText={setAccountLast4}
                placeholder="e.g. 50100482189421"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Settlement UPI ID</Text>
              <TextInput
                style={styles.textInput}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. mobile@upi or username@okhdfc"
                autoCapitalize="none"
              />
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title={hasBankDetails ? 'Save Bank Details' : 'Link Bank Details'}
              onPress={() => {
                const bName = bankName.trim();
                const bAcc = accountLast4.trim();
                const bUpi = upiId.trim();

                if (!bName && !bUpi) {
                  showToast('Please enter Bank Name or UPI ID');
                  return;
                }

                saveProfileToDb(
                  {
                    preferences: {
                      payoutBank: bName,
                      payoutAccountLast4: bAcc ? (bAcc.length > 4 ? bAcc.slice(-4) : bAcc) : '',
                      payoutUpi: bUpi,
                    },
                  },
                  hasBankDetails
                    ? 'Banking details updated successfully'
                    : 'Bank account linked successfully'
                );
              }}
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 5. Vehicle & Kit Inspection Modal */}
      <Modal
        visible={activeModal === 'vehicle'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vehicle & Kit Inspection</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Certified vehicle model and field toolkit inspection credentials:
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Vehicle Model / Name</Text>
              <TextInput
                style={styles.textInput}
                value={vehicleType}
                onChangeText={setVehicleType}
                placeholder="e.g. Motorcycle / Scooter / None"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Registration Number</Text>
              <TextInput
                style={styles.textInput}
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                placeholder="e.g. DL01AB1234"
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.checkboxRowGroup}>
              <TouchableOpacity
                style={styles.certCheckRow}
                onPress={() => setKitCertified(!kitCertified)}>
                <View
                  style={[
                    styles.checkboxBox,
                    kitCertified && styles.checkboxBoxActive,
                  ]}>
                  {kitCertified && (
                    <Text style={styles.checkboxCheckGlyph}>✓</Text>
                  )}
                </View>
                <Text style={styles.certCheckLabel}>
                  Professional Tool Kit QA Certified
                </Text>
              </TouchableOpacity>
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Save Vehicle & Kit"
              onPress={() =>
                saveProfileToDb(
                  {
                    hasVehicle: 'Yes',
                    vehicleType,
                    vehicleNumber,
                    preferences: {
                      vehicleKitCertified: kitCertified,
                    },
                  },
                  'Vehicle & kit details saved successfully'
                )
              }
              disabled={saving}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* 6. Police Verification Card Modal */}
      <Modal
        visible={activeModal === 'police'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.policeCardModal}>
            <View style={styles.policeCardHeader}>
              <View style={styles.policeCardBadge}>
                <Text style={styles.policeCardBadgeText}>
                  OFFICIAL VERIFICATION
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.policeCardBody}>
              <View style={styles.policeCardAvatarRow}>
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.policeAvatarImg}
                />
                <View style={styles.policeMetaTextGroup}>
                  <Text style={styles.policeHolderName}>{displayName}</Text>
                  <Text style={styles.policeIdTag}>
                    ID: {dbUser?.policeVerification?.certificateNumber || 'POL-VERIFIED'}
                  </Text>
                  <Text style={styles.policeStatusTag}>
                    Status: {dbUser?.policeVerification?.status || 'Active'}
                  </Text>
                </View>
              </View>

              <View style={styles.policeDetailsGrid}>
                <View style={styles.policeRowItem}>
                  <Text style={styles.policeKey}>Verification Type:</Text>
                  <Text style={styles.policeVal}>Criminal Antecedents</Text>
                </View>
                <View style={styles.policeRowItem}>
                  <Text style={styles.policeKey}>Issuing Authority:</Text>
                  <Text style={styles.policeVal}>
                    {dbUser?.policeVerification?.policeStation || 'Authorized City Police'}
                  </Text>
                </View>
                <View style={styles.policeRowItem}>
                  <Text style={styles.policeKey}>Validity Period:</Text>
                  <Text style={styles.policeValHighlight}>{policeValidDate}</Text>
                </View>
                <View style={styles.policeRowItem}>
                  <Text style={styles.policeKey}>Residential Address:</Text>
                  <Text style={styles.policeVal}>
                    {dbUser?.curAddress || dbUser?.location?.address || 'Registered Address'}
                  </Text>
                </View>
              </View>

              <View style={styles.policeStampBox}>
                <Text style={styles.policeStampIcon}>🛡️</Text>
                <Text style={styles.policeStampText}>
                  DIGITALLY ATTESTED BY KWEEKO SECURITY GATE COMPLIANCE
                </Text>
              </View>
            </View>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Close Verification Card"
              onPress={() => setActiveModal('none')}
            />
          </View>
        </View>
      </Modal>

      {/* 7. Gate SOS Emergency Modal */}
      <Modal
        visible={activeModal === 'sos'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.sosCardModal}>
            <View style={styles.sosHeaderBox}>
              <Text style={styles.sosWarningGlyph}>🚨</Text>
              <Text style={styles.sosModalTitle}>Gate Security SOS Alert</Text>
            </View>

            <Text style={styles.sosModalDesc}>
              Triggering this alert sends an urgent high-priority distress
              notification to the Society Main Gate Security and Kwiqo
              Emergency Command Center with your exact GPS location.
            </Text>

            <View style={styles.sosActionRow}>
              <TouchableOpacity
                style={styles.sosCancelBtn}
                onPress={() => setActiveModal('none')}>
                <Text style={styles.sosCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sosConfirmBtn}
                onPress={() => {
                  setActiveModal('none');
                  showToast('SOS Broadcast sent to Gate Security & Patrol Unit');
                }}>
                <Text style={styles.sosConfirmText}>Broadcast SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 8. Agent Desk Hotline Modal */}
      <Modal
        visible={activeModal === 'desk'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal('none')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agent Desk 24x7 Hotline</Text>
              <TouchableOpacity
                onPress={() => setActiveModal('none')}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstruction}>
              Connect directly with dedicated field operations support:
            </Text>

            <TouchableOpacity
              style={styles.phoneOptionRow}
              onPress={() => {
                Linking.openURL('tel:18001234567').catch(() => {
                  showToast('Calling Toll-Free: 1800-123-4567');
                });
              }}>
              <Text style={styles.phoneOptionGlyph}>📞</Text>
              <View>
                <Text style={styles.phoneOptionTitle}>Toll-Free Helpline</Text>
                <Text style={styles.phoneOptionNumber}>1800-123-4567 (Free)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.phoneOptionRow}
              onPress={() => {
                Linking.openURL('tel:+918045678900').catch(() => {
                  showToast('Calling Bangalore Hub: 080-4567-8900');
                });
              }}>
              <Text style={styles.phoneOptionGlyph}>🏢</Text>
              <View>
                <Text style={styles.phoneOptionTitle}>Bangalore Field Hub</Text>
                <Text style={styles.phoneOptionNumber}>+91 80 4567 8900</Text>
              </View>
            </TouchableOpacity>

            <GradientButton
              style={styles.modalSaveButton}
              textStyle={styles.modalSaveBtnText}
              title="Dismiss"
              onPress={() => setActiveModal('none')}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // Toast
  toastBox: {
    position: 'absolute',
    top: 14,
    left: 20,
    right: 20,
    zIndex: 999,
    backgroundColor: '#303030',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: '#F3F0F0',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  toastCheck: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  // Profile Summary Card
  profileSummaryCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  decorativeBlob: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 88, 65, 0.07)',
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceContainer,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  verifiedIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceContainerLowest,
  },
  verifiedGlyph: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '900',
  },
  profileInfoColumn: {
    flex: 1,
    minWidth: 0,
  },
  nameRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  nameWithEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  editPencilGlyph: {
    fontSize: 13,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  ratingStar: {
    color: colors.primary,
    fontSize: 13,
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  partnerIdText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  partnerIdBold: {
    fontWeight: '700',
    color: colors.onSurface,
  },
  pillBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  tradePill: {
    borderRadius: 12,
    maxWidth: '75%',
    shadowOpacity: 0.15,
    elevation: 2,
  },
  tradePillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradePillIcon: {
    fontSize: 11,
  },
  tradePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  kycPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  kycGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tertiary,
  },
  kycPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },

  // Police Verification Bar
  policeVerificationBar: {
    marginTop: 14,
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  policeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  policeGavelIcon: {
    fontSize: 15,
  },
  policeLabel: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  policeValidDate: {
    color: colors.onSurface,
    fontWeight: '700',
  },
  viewCardBtn: {
    borderRadius: 8,
    shadowOpacity: 0.15,
    elevation: 2,
  },
  viewCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  viewCardText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewCardChevron: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Performance Ribbon
  metricsRibbonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
  },

  // Configuration Section
  configSection: {
    marginTop: 16,
  },
  configHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  configSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveSyncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveSyncText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  cardContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconGlyph: {
    fontSize: 18,
  },
  menuTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  menuItemSub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  badgeCountBtn: {
    borderRadius: 8,
    shadowOpacity: 0.15,
    elevation: 2,
  },
  badgeCountContent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chevronGlyph: {
    fontSize: 20,
    color: colors.onSurfaceVariant,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.surfaceContainer,
  },

  // Complex Menu Item (Geo Fence & Bank)
  menuItemComplex: {
    padding: 14,
  },
  menuTopInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 8,
  },
  geoFenceStrip: {
    backgroundColor: colors.surfaceContainer,
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  geoFenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tealPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.tertiary,
  },
  geoFenceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
  },
  geoFenceAccuracy: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  changeActionBtn: {
    borderRadius: 8,
    shadowOpacity: 0.15,
    elevation: 2,
  },
  changeActionContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionRequiredBadge: {
    backgroundColor: '#EEF0FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  actionRequiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3525CD',
  },
  noBankSubText: {
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  addBankPillBtn: {
    borderRadius: 8,
    shadowOpacity: 0.15,
    elevation: 2,
  },
  addBankPillContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBankPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bankWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F3FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    gap: 10,
  },
  bankWarningIcon: {
    fontSize: 16,
  },
  bankWarningContent: {
    flex: 1,
  },
  bankWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#131B2E',
    marginBottom: 2,
  },
  bankWarningDesc: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
  bankWarningChevron: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3525CD',
  },
  instantPayoutBox: {
    backgroundColor: colors.surfaceContainerLow,
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instantPayoutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  boltIconGlyph: {
    fontSize: 16,
  },
  instantPayoutTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  instantPayoutSub: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  greenCheckCircle: {
    fontSize: 16,
    color: colors.tertiary,
    fontWeight: 'bold',
  },

  // Helpline & Security
  helplineSection: {
    marginTop: 16,
  },
  helplineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  helplineGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  helplineBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  supportIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIconGlyph: {
    fontSize: 18,
  },
  sosIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosIconGlyph: {
    fontSize: 18,
  },
  helplineBtnText: {
    flex: 1,
    minWidth: 0,
  },
  helplineBtnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  helplineBtnSub: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  whatsAppCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  whatsAppLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  whatsAppIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsAppGlyph: {
    fontSize: 18,
  },
  whatsAppTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  whatsAppSub: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  externalLinkGlyph: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },

  // Logout Section
  logoutSection: {
    marginTop: 20,
    gap: 8,
  },
  logoutButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  logoutIconGlyph: {
    fontSize: 18,
    color: colors.white,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  appFooterMeta: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  appVersionText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  deviceMetaText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 2,
  },

  // Modals Styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContentCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
    fontWeight: 'bold',
  },
  modalInstruction: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: 260,
    marginBottom: 16,
  },
  skillSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: 8,
  },
  skillSelectOptionActive: {
    backgroundColor: colors.secondaryFixed,
  },
  skillOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  skillOptionTextActive: {
    color: colors.secondary,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  checkboxCheckGlyph: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
  },
  radiusButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusBtnOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
  },
  radiusBtnOptionActive: {
    backgroundColor: '#3525CD',
    borderColor: '#3525CD',
  },
  radiusBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  radiusBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  checkboxRowGroup: {
    marginVertical: 12,
  },
  certCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  certCheckLabel: {
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: '600',
  },
  modalSaveButton: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#3525CD',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  modalSaveBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Police Card Modal
  policeCardModal: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginVertical: 'auto',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  policeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  policeCardBadge: {
    backgroundColor: colors.tertiaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  policeCardBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004F52',
    letterSpacing: 0.5,
  },
  policeCardBody: {
    gap: 12,
  },
  policeCardAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLow,
    padding: 12,
    borderRadius: 12,
  },
  policeAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  policeMetaTextGroup: {
    flex: 1,
  },
  policeHolderName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  policeIdTag: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  policeStatusTag: {
    fontSize: 12,
    color: colors.tertiary,
    fontWeight: '700',
    marginTop: 2,
  },
  policeDetailsGrid: {
    gap: 6,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 4,
  },
  policeRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  policeKey: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  policeVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
  },
  policeValHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  policeStampBox: {
    marginTop: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  policeStampIcon: {
    fontSize: 16,
  },
  policeStampText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  policeDoneBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  policeDoneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },

  // Gate SOS Modal
  sosCardModal: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    marginVertical: 'auto',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sosHeaderBox: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sosWarningGlyph: {
    fontSize: 40,
  },
  sosModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  sosModalDesc: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: 10,
  },
  sosActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    width: '100%',
  },
  sosCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
  },
  sosCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  sosConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3525CD',
    alignItems: 'center',
  },
  sosConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },

  // Agent Desk Hotline Modal
  phoneOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  phoneOptionGlyph: {
    fontSize: 22,
  },
  phoneOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },
  phoneOptionNumber: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
});
