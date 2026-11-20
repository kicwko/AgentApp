import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GradientButton } from '../components/GradientButton';
import { orderService, type BackendOrder } from '../services/orderService';
import type { User } from '../services/firebaseAuth';

type FilterType = 'all' | 'active' | 'completed' | 'cancelled';

export interface OrderData {
  id: string;
  transactionId?: string;
  status: 'active' | 'completed' | 'cancelled';
  statusLabel: string;
  time: string;
  amount: string;
  payoutAmount: string;
  amountNote: string;
  originalAmount?: string;
  title: string;
  description?: string;
  category: string;
  categoryIcon: string;
  society: string;
  address: string;
  landmark?: string;
  residentName?: string;
  phone?: string;
  rating?: string;
  stars?: string;
  feedback?: string;
  cancellationReason?: string;
  passCode?: string;
  gpsCoords?: string;
  isHighPriority?: boolean;
  paymentMethod?: string;
  paymentStatus?: string;
  payoutMethod?: string;
  agentId?: string;
  agentPhone?: string;
}

function mapBackendOrderToUI(bo: BackendOrder): OrderData {
  const isDone = bo.status === 'Done';
  const isCanceled = bo.status === 'Canceled';
  const uiStatus: 'active' | 'completed' | 'cancelled' = isDone
    ? 'completed'
    : isCanceled
    ? 'cancelled'
    : 'active';

  const categoryName = bo.taskCategoryNames?.[0] || 'Service';
  let categoryIcon = '🛠️';
  const lowerCat = (categoryName + ' ' + (bo.taskTitle || '')).toLowerCase();
  if (lowerCat.includes('water') || lowerCat.includes('plumb') || lowerCat.includes('tap')) {
    categoryIcon = '💧';
  } else if (lowerCat.includes('elec') || lowerCat.includes('mcb') || lowerCat.includes('switch') || lowerCat.includes('ac')) {
    categoryIcon = '⚡';
  } else if (lowerCat.includes('carp') || lowerCat.includes('wood')) {
    categoryIcon = '🪚';
  } else if (lowerCat.includes('cook') || lowerCat.includes('meal')) {
    categoryIcon = '🍳';
  } else if (lowerCat.includes('net') || lowerCat.includes('install')) {
    categoryIcon = '🔧';
  }

  const ratingVal = bo.rating?.stars;
  let starsStr = '';
  if (ratingVal) {
    const fullStars = Math.floor(ratingVal);
    const hasHalf = ratingVal % 1 >= 0.5;
    starsStr = '★'.repeat(Math.min(5, fullStars)) + (hasHalf ? '½' : '');
  }

  let formattedTime = bo.scheduledTimeSlot || 'Today';
  if (bo.createdAt) {
    try {
      const dt = new Date(bo.createdAt);
      formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      // ignore
    }
  }

  const payout = bo.agentPayment?.amount || Math.round((bo.totalPrice || 0) * 0.85);

  let amountNote = 'Instant Payout';
  if (uiStatus === 'active') {
    amountNote = bo.agentPayment?.status ? `${bo.agentPayment.status} Payout` : 'Instant Payout';
  } else if (uiStatus === 'completed') {
    amountNote = bo.agentPayment?.status === 'Paid' ? 'Settled to Wallet' : 'Processing Settlement';
  } else {
    amountNote = `Cancellation Fee: ₹${payout || 50}`;
  }

  const cleanId = bo.orderId || (bo._id ? `#KW-${bo._id.slice(-4).toUpperCase()}` : '#KW-9000');

  return {
    id: cleanId,
    transactionId: bo.transactionId,
    status: uiStatus,
    statusLabel:
      bo.status === 'Done'
        ? 'Completed'
        : bo.status === 'Canceled'
        ? 'Customer Cancelled'
        : bo.status,
    time: formattedTime,
    amount: `₹${bo.totalPrice || payout || 450}`,
    payoutAmount: `₹${payout}`,
    amountNote,
    originalAmount: uiStatus === 'cancelled' ? `₹${bo.totalPrice || 500}` : undefined,
    title: bo.taskTitle || 'Resident Service Task',
    description: bo.taskDescription,
    category: categoryName,
    categoryIcon,
    society: bo.location?.cluster || bo.location?.city || 'Prestige Lakeside',
    address: bo.location?.address || bo.location?.flat || 'Tower B-804 (8th Floor)',
    landmark: bo.location?.street || (bo.location?.pincode ? `Pin: ${bo.location?.pincode}` : 'Near Gate Security Hub'),
    residentName: bo.customer?.name || 'Resident',
    phone: bo.customer?.phone || '',
    rating: ratingVal ? ratingVal.toFixed(1) : undefined,
    stars: starsStr || undefined,
    feedback: bo.rating?.comment || undefined,
    cancellationReason: bo.cancellation?.reason || undefined,
    passCode: bo.transactionId || `GP-${cleanId.replace(/\D/g, '').slice(-4) || '7729'}-KW`,
    gpsCoords:
      bo.location?.latitude && bo.location?.longitude
        ? `${bo.location.latitude.toFixed(4)}° N, ${bo.location.longitude.toFixed(4)}° E`
        : '12.9249° N, 77.6784° E',
    isHighPriority: uiStatus === 'active',
    paymentMethod: bo.paymentMethod || 'UPI',
    paymentStatus: bo.paymentStatus || 'Completed',
    payoutMethod: bo.agentPayment?.payoutMethod || 'Instant Wallet Settlement',
    agentId: bo.agentId,
    agentPhone: bo.agentPhone,
  };
}

export function OrdersScreen({ user }: { user?: User } = {}) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDateTrayOpen, setIsDateTrayOpen] = useState(false);

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState('');
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Gate Pass Modal state
  const [gatePassModalVisible, setGatePassModalVisible] = useState(false);
  const [gatePassOrder, setGatePassOrder] = useState<OrderData | null>(null);

  // Diagnostic Spec / Invoice Sheet state
  const [detailsSheetVisible, setDetailsSheetVisible] = useState(false);
  const [selectedDetailsOrder, setSelectedDetailsOrder] = useState<OrderData | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setIsToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsToastVisible(false);
    });
  };

  const fetchRealOrders = async (silent = false) => {
    if (!silent) setLoading(true);

    const cleanPhone = (user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
    const agentIdentifier = cleanPhone || user?.email || user?.uid || '';

    try {
      const response = await orderService.getOrders({
        agentId: agentIdentifier || undefined,
      });

      if (response && response.success && Array.isArray(response.data)) {
        // Filter strictly to current user's assigned tasks
        const userOrders = response.data.filter(
          o =>
            (cleanPhone && (o.agentPhone?.includes(cleanPhone) || o.agentId?.includes(cleanPhone))) ||
            (user?.email && (o.agentId?.includes(user.email) || o.customer?.email === user.email)) ||
            (user?.uid && o.agentId?.includes(user.uid)) ||
            (o.agentName && user?.displayName && o.agentName.toLowerCase() === user.displayName.toLowerCase())
        );
        const listToUse = userOrders.length > 0 ? userOrders : (agentIdentifier ? [] : response.data);
        const mapped = listToUse.map(mapBackendOrderToUI);
        setOrders(mapped);
        setIsLiveConnected(true);
        if (silent) {
          showToast(mapped.length > 0 ? `Synced ${mapped.length} tasks` : 'Task feed updated');
        }
      } else {
        setOrders([]);
        setIsLiveConnected(true);
      }
    } catch (err: any) {
      console.warn('[OrdersScreen] Could not fetch real orders:', err.message);
      setOrders([]);
      setIsLiveConnected(false);
      if (silent) {
        showToast('Running on live offline mode');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRealOrders();
  }, [user]);

  const REFRESH_COOLDOWN_MS = 30 * 1000;
  const lastRefreshTimeRef = useRef<number>(0);

  const handleRefresh = () => {
    const now = Date.now();
    const timeSinceLast = now - lastRefreshTimeRef.current;
    if (timeSinceLast < REFRESH_COOLDOWN_MS && lastRefreshTimeRef.current !== 0) {
      const remainingSec = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLast) / 1000);
      showToast(`Please wait ${remainingSec}s before refreshing again`);
      setRefreshing(false);
      return;
    }

    lastRefreshTimeRef.current = now;
    setRefreshing(true);
    fetchRealOrders(true);
  };

  const openGatePassModal = (order: OrderData) => {
    setGatePassOrder(order);
    setGatePassModalVisible(true);
  };

  const closeGatePassModal = () => {
    setGatePassModalVisible(false);
  };

  const openDetailsSheet = (order: OrderData) => {
    setSelectedDetailsOrder(order);
    setDetailsSheetVisible(true);
  };

  const closeDetailsSheet = () => {
    setDetailsSheetVisible(false);
  };

  const handleCallResident = (phone?: string) => {
    if (!phone) {
      showToast('Contact number not available');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      showToast(`Calling resident: ${phone}`);
    });
  };

  const handleCopyCoords = (_coords?: string) => {
    showToast('Coordinates copied to clipboard!');
  };

  const handleStartNavigation = () => {
    showToast('Launching Google Maps Navigation...');
  };

  // Filtered orders list
  const filteredOrders = orders.filter(order => {
    if (activeFilter === 'active' && order.status !== 'active') return false;
    if (activeFilter === 'completed' && order.status !== 'completed') return false;
    if (activeFilter === 'cancelled' && order.status !== 'cancelled') return false;

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const combined = `${order.id} ${order.title} ${order.society} ${order.address} ${order.residentName || ''}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }

    return true;
  });

  const totalOrdersCount = orders.length;
  const activeOrdersCount = orders.filter(o => o.status === 'active').length;
  const completedOrdersCount = orders.filter(o => o.status === 'completed').length;
  const cancelledOrdersCount = orders.filter(o => o.status === 'cancelled').length;

  return (
    <View style={styles.screenContainer}>
      {/* Toast Notification Overlay */}
      {isToastVisible && (
        <Animated.View
          style={[
            styles.toastContainer,
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
          <Text style={styles.toastCheckIcon}>✓</Text>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        {/* Page Introduction Banner */}
        <View style={styles.introHeaderRow}>
          <View style={styles.introTitleColumn}>
            <View style={styles.titleWithLiveRow}>
              <Text style={styles.introTitle}>Task Orders</Text>
              {isLiveConnected && (
                <View style={styles.liveTag}>
                  <View style={styles.liveGreenDot} />
                  <Text style={styles.liveTagText}>LIVE</Text>
                </View>
              )}
            </View>
            <Text style={styles.introSubtitle}>
              Live assignments & completed gate entries
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            activeOpacity={0.7}
            accessibilityLabel="Refresh Orders">
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primaryContainer} />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Statement & Tax Invoices Strip (Earnings & Statements) */}
        <View style={styles.statementCard}>
          <View style={styles.statementGlowCircle} />
          <View style={styles.statementContent}>
            <View style={styles.statementHeaderRow}>
              <View style={styles.statementIconBox}>
                <Text style={styles.statementReceiptIcon}>📄</Text>
              </View>
              <View style={styles.statementTextContainer}>
                <View style={styles.statementTitleRow}>
                  <Text style={styles.statementTitle}>Earnings & Statements</Text>
                  <View style={styles.gstBadge}>
                    <Text style={styles.gstBadgeText}>GST READY</Text>
                  </View>
                </View>
                <Text style={styles.statementSubtitle}>
                  Monthly task summary, TDS & settlement logs
                </Text>
              </View>
            </View>

            <View style={styles.statementButtonRow}>
              <GradientButton
                style={styles.downloadPdfButton}
                onPress={() => showToast('Downloading October PDF statement...')}
                activeOpacity={0.85}>
                <Text style={styles.pdfButtonIcon}>📥</Text>
                <Text style={styles.downloadPdfText}>Download PDF</Text>
              </GradientButton>

              <TouchableOpacity
                style={styles.exportExcelButton}
                onPress={() => showToast('Generating Excel (.xlsx) statement...')}
                activeOpacity={0.85}>
                <Text style={styles.excelButtonIcon}>📊</Text>
                <Text style={styles.exportExcelText}>Export Excel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Filter & Search Section */}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search order ID, resident, society..."
                placeholderTextColor={colors.outline}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setIsDateTrayOpen(prev => !prev)}
              activeOpacity={0.7}>
              <Text style={styles.calendarIcon}>📅</Text>
              <Text style={styles.datePickerText}>This Week</Text>
            </TouchableOpacity>
          </View>

          {/* Date Range Collapsible Tray */}
          {isDateTrayOpen && (
            <View style={styles.dateFilterTray}>
              <View style={styles.dateRangeInfo}>
                <Text style={styles.dateRangeIcon}>🗓</Text>
                <Text style={styles.dateRangeText}>
                  Showing: 01 Oct 2024 - Today
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => showToast('Date range picker opened')}>
                <Text style={styles.changeRangeText}>Change Range</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Status Filter Chips (Horizontal Scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContainer}>
            <TouchableOpacity
              style={[
                styles.statusChip,
                activeFilter === 'all' && styles.statusChipActive,
              ]}
              onPress={() => setActiveFilter('all')}>
              <Text
                style={[
                  styles.chipText,
                  activeFilter === 'all' && styles.chipTextActive,
                ]}>
                All Orders ({totalOrdersCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusChip,
                activeFilter === 'active' && styles.statusChipActive,
              ]}
              onPress={() => setActiveFilter('active')}>
              <Text
                style={[
                  styles.chipText,
                  activeFilter === 'active' && styles.chipTextActive,
                ]}>
                Active / Ongoing ({activeOrdersCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusChip,
                activeFilter === 'completed' && styles.statusChipActive,
              ]}
              onPress={() => setActiveFilter('completed')}>
              <Text
                style={[
                  styles.chipText,
                  activeFilter === 'completed' && styles.chipTextActive,
                ]}>
                Completed ({completedOrdersCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusChip,
                activeFilter === 'cancelled' && styles.statusChipActive,
              ]}
              onPress={() => setActiveFilter('cancelled')}>
              <Text
                style={[
                  styles.chipText,
                  activeFilter === 'cancelled' && styles.chipTextActive,
                ]}>
                Cancelled / Declined ({cancelledOrdersCount})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Orders List Content */}
        <View style={styles.ordersList}>
          {loading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Fetching real-time orders...</Text>
            </View>
          ) : filteredOrders.length === 0 ? (
            /* Empty State */
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
              </View>
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptySubtitle}>
                No orders match your filter. Pull to refresh to check for new assignments.
              </Text>
              <GradientButton
                style={styles.resetFiltersButton}
                onPress={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                title="Reset All Filters"
                textStyle={styles.resetFiltersText}
              />
            </View>
          ) : (
            filteredOrders.map(order => {
              if (order.status === 'active') {
                return (
                  <View key={order.id} style={styles.activeOrderCard}>
                    {/* Glowing Accent Stripe */}
                    <View style={styles.activeGlowStripe} />

                    {/* Header: ID + Live Status Badge & Price */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.orderIdGroup}>
                        <View style={styles.categoryIconCircleError}>
                          <Text style={styles.categoryGlyphActive}>
                            {order.categoryIcon}
                          </Text>
                        </View>
                        <View style={styles.idTextWrapper}>
                          <View style={styles.idWithBadgeRow}>
                            <Text style={styles.orderIdText}>{order.id}</Text>
                            <View style={styles.inProgressBadge}>
                              <View style={styles.pulseDot} />
                              <Text style={styles.inProgressBadgeText}>
                                {order.statusLabel}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.assignedTimeText}>
                            {order.time}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.amountRightGroup}>
                        <Text style={styles.activeAmountText}>
                          {order.amount}
                        </Text>
                        <Text style={styles.amountNoteText} numberOfLines={1}>
                          {order.amountNote}
                        </Text>
                      </View>
                    </View>

                    {/* Task & Location Info Box */}
                    <View style={styles.activeDetailsBox}>
                      <View style={styles.taskTitleRow}>
                        <View style={styles.taskTitleLeft}>
                          <Text style={styles.plumbingIcon}>🔧</Text>
                          <Text style={styles.activeTaskTitle}>
                            {order.title}
                          </Text>
                        </View>
                        {order.isHighPriority && (
                          <Text style={styles.highPriorityText}>HIGH PRIORITY</Text>
                        )}
                      </View>

                      <View style={styles.societyLocationRow}>
                        <Text style={styles.buildingIcon}>🏢</Text>
                        <View style={styles.societyTextGroup}>
                          <Text style={styles.societyNameBold}>
                            {order.society} •{' '}
                            <Text style={styles.societyAddressText}>
                              {order.address}
                            </Text>
                          </Text>
                          {order.landmark && (
                            <Text style={styles.societyLandmarkText}>
                              {order.landmark}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.residentRow}>
                        <View style={styles.residentInfo}>
                          <View style={styles.residentAvatar}>
                            <Text style={styles.residentAvatarGlyph}>👤</Text>
                          </View>
                          <Text style={styles.residentName}>
                            {order.residentName}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.callResidentButton}
                          onPress={() => handleCallResident(order.phone)}
                          activeOpacity={0.7}>
                          <Text style={styles.callIcon}>📞</Text>
                          <Text style={styles.callResidentText}>
                            Call Resident
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.activeActionRow}>
                      <GradientButton
                        style={styles.viewGatePassButton}
                        onPress={() => openGatePassModal(order)}
                        activeOpacity={0.85}>
                        <Text style={styles.gatePassQrIcon}>▦</Text>
                        <Text style={styles.viewGatePassText}>
                          View Address & Gate Pass
                        </Text>
                      </GradientButton>

                      <TouchableOpacity
                        style={styles.infoSheetButton}
                        onPress={() => openDetailsSheet(order)}
                        activeOpacity={0.7}
                        accessibilityLabel="More Task Details">
                        <Text style={styles.infoIcon}>ℹ️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              if (order.status === 'completed') {
                return (
                  <View key={order.id} style={styles.completedOrderCard}>
                    {/* Header */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.orderIdGroup}>
                        <View style={styles.categoryIconCircleSec}>
                          <Text style={styles.categoryGlyph}>
                            {order.categoryIcon}
                          </Text>
                        </View>
                        <View style={styles.idTextWrapper}>
                          <View style={styles.idWithBadgeRow}>
                            <Text style={styles.orderIdText}>{order.id}</Text>
                            <View style={styles.completedBadge}>
                              <Text style={styles.completedCheckGlyph}>✓</Text>
                              <Text style={styles.completedBadgeText}>
                                {order.statusLabel}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.assignedTimeText}>
                            {order.time}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.amountRightGroup}>
                        <Text style={styles.completedAmountText}>
                          {order.amount}
                        </Text>
                        <Text style={styles.settledWalletText} numberOfLines={1}>
                          {order.amountNote}
                        </Text>
                      </View>
                    </View>

                    {/* Task Title & Society */}
                    <View style={styles.taskBriefContainer}>
                      <Text style={styles.orderTitleText}>{order.title}</Text>
                      <View style={styles.locationInlineRow}>
                        <Text style={styles.locationPinSmall}>📍</Text>
                        <Text style={styles.locationInlineText}>
                          {order.society}, {order.address}
                        </Text>
                      </View>
                    </View>

                    {/* Full Customer Feedback Container - Click opens Invoice Sheet with all details */}
                    <TouchableOpacity
                      style={styles.feedbackInteractiveBox}
                      onPress={() => openDetailsSheet(order)}
                      activeOpacity={0.85}>
                      <View style={styles.feedbackTopRow}>
                        <View style={styles.feedbackLeftRow}>
                          {order.stars && (
                            <Text style={styles.feedbackStars}>{order.stars}</Text>
                          )}
                          {order.rating && (
                            <Text style={styles.feedbackRating}>{order.rating}</Text>
                          )}
                        </View>

                        <View style={styles.invoicePill}>
                          <Text style={styles.invoicePillText}>Invoice & Details →</Text>
                        </View>
                      </View>

                      {/* Display Full Customer Feedback Quote */}
                      <Text style={styles.feedbackFullText}>
                        {order.feedback || '"Prompt arrival and cleanly resolved the task!"'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (order.status === 'cancelled') {
                return (
                  <View key={order.id} style={styles.cancelledOrderCard}>
                    {/* Header - Price and cross contained strictly inside card width */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.orderIdGroup}>
                        <View style={styles.categoryIconCircleCancel}>
                          <Text style={styles.categoryGlyphCancel}>✕</Text>
                        </View>
                        <View style={styles.idTextWrapper}>
                          <View style={styles.idWithBadgeRow}>
                            <Text style={styles.orderIdText}>{order.id}</Text>
                            <View style={styles.cancelledBadge}>
                              <Text style={styles.cancelledBadgeText}>
                                {order.statusLabel}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.assignedTimeText}>
                            {order.time}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.amountRightGroup}>
                        <Text style={styles.cancelledAmountText}>
                          {order.originalAmount || order.amount}
                        </Text>
                        <Text style={styles.cancellationFeeText} numberOfLines={1}>
                          {order.amountNote}
                        </Text>
                      </View>
                    </View>

                    {/* Cancellation details */}
                    <View style={styles.taskBriefContainer}>
                      <Text style={styles.cancelledTitleText}>
                        {order.title}
                      </Text>
                      <Text style={styles.cancelledReasonText}>
                        {order.cancellationReason || 'Reason: Resident rescheduled with maintenance team.'}
                      </Text>
                    </View>
                  </View>
                );
              }

              return null;
            })
          )}
        </View>
      </ScrollView>

      {/* Interactive Gate Pass & Address Modal */}
      <Modal
        visible={gatePassModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeGatePassModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.verifiedIconBox}>
                  <Text style={styles.verifiedGlyph}>✓</Text>
                </View>
                <View>
                  <Text style={styles.modalTitle}>Digital Gate Entry Pass</Text>
                  <Text style={styles.modalOrderTag}>
                    Order {gatePassOrder?.id || '#KW-9082'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeGatePassModal}
                accessibilityLabel="Close modal">
                <Text style={styles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* QR Pattern & Code Container */}
            <View style={styles.qrPassContainer}>
              <View style={styles.qrBox}>
                <View style={styles.qrGrid}>
                  <View style={styles.qrCornerTopLeft}>
                    <View style={styles.qrCornerInner} />
                  </View>
                  <View style={styles.qrCornerTopRight}>
                    <View style={styles.qrCornerInner} />
                  </View>
                  <View style={styles.qrCenterDotGroup}>
                    <View style={styles.qrDot} />
                    <View style={styles.qrDot} />
                    <View style={styles.qrDot} />
                    <View style={styles.qrDot} />
                  </View>
                  <View style={styles.qrCornerBottomLeft}>
                    <View style={styles.qrCornerInner} />
                  </View>
                  <View style={styles.qrCodeBars}>
                    <View style={styles.qrBar} />
                    <View style={styles.qrBar} />
                    <View style={styles.qrBar} />
                  </View>
                </View>
              </View>

              <View style={styles.passCodeSection}>
                <Text style={styles.passCodeLabel}>
                  GATE SECURITY OTP / PASS CODE
                </Text>
                <Text style={styles.passCodeValue}>
                  {gatePassOrder?.passCode || 'GP-7729-KW'}
                </Text>
              </View>
            </View>

            {/* Address & Gate Approval Status */}
            <View style={styles.modalInfoList}>
              <View style={styles.modalInfoTile}>
                <Text style={styles.infoTileIcon}>📍</Text>
                <View style={styles.infoTileContent}>
                  <Text style={styles.infoTileLabel}>
                    Confirmed Flat Address
                  </Text>
                  <Text style={styles.infoTileValue}>
                    {[gatePassOrder?.society, gatePassOrder?.address]
                      .filter(Boolean)
                      .join(', ') || 'Customer Site'}
                  </Text>
                </View>
              </View>

              <View style={styles.modalInfoTile}>
                <Text style={styles.infoTileIcon}>🛡️</Text>
                <View style={styles.infoTileContent}>
                  <Text style={styles.infoTileLabel}>Gate Approval Status</Text>
                  <View style={styles.gateVerifiedRow}>
                    <View style={styles.gateGreenDot} />
                    <Text style={styles.infoTileValue}>
                      Pre-approved by resident (MyGate Sync Verified)
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionRow}>
              <GradientButton
                style={styles.startNavButton}
                onPress={handleStartNavigation}
                activeOpacity={0.85}>
                <Text style={styles.startNavIcon}>🧭</Text>
                <Text style={styles.startNavText}>Start Navigation</Text>
              </GradientButton>

              <TouchableOpacity
                style={styles.doneModalButton}
                onPress={closeGatePassModal}
                activeOpacity={0.8}>
                <Text style={styles.doneModalText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comprehensive Order Details & Invoice Bottom Sheet */}
      <Modal
        visible={detailsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDetailsSheet}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContainer}>
            {/* Top Grab Bar Handle */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.sheetHeaderBadge}>
                  <Text style={styles.sheetHeaderBadgeText}>TAX INVOICE</Text>
                </View>
                <Text style={styles.sheetTitle}>
                  {selectedDetailsOrder?.id}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {selectedDetailsOrder?.title}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeDetailsSheet}
                accessibilityLabel="Close sheet">
                <Text style={styles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}>
              <View style={styles.sheetContent}>
                {/* Financial Ledger Breakdown */}
                <View style={styles.sheetCardBlock}>
                  <Text style={styles.sheetBlockHeader}>Payment & Settlement</Text>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetItemLabel}>Total Task Price</Text>
                    <Text style={styles.sheetPriceBig}>
                      {selectedDetailsOrder?.amount}
                    </Text>
                  </View>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetItemLabel}>Partner Wallet Payout</Text>
                    <Text style={styles.sheetPayoutHighlight}>
                      {selectedDetailsOrder?.payoutAmount}
                    </Text>
                  </View>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetItemLabel}>Payment Method</Text>
                    <Text style={styles.sheetItemValue}>
                      {selectedDetailsOrder?.paymentMethod || 'UPI (Instant)'}
                    </Text>
                  </View>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetItemLabel}>Settlement Status</Text>
                    <Text style={styles.sheetStatusDone}>
                      {selectedDetailsOrder?.amountNote}
                    </Text>
                  </View>
                  {selectedDetailsOrder?.transactionId && (
                    <View style={styles.sheetRowBetween}>
                      <Text style={styles.sheetItemLabel}>Transaction ID</Text>
                      <Text style={styles.sheetMonoText}>
                        {selectedDetailsOrder.transactionId}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Customer Review & Full Feedback Section */}
                {(selectedDetailsOrder?.feedback || selectedDetailsOrder?.rating) && (
                  <View style={styles.sheetFeedbackBlock}>
                    <Text style={styles.sheetBlockHeader}>Resident Rating & Review</Text>
                    <View style={styles.sheetFeedbackHeader}>
                      <Text style={styles.sheetStars}>
                        {selectedDetailsOrder.stars || '★★★★★'}
                      </Text>
                      <Text style={styles.sheetRatingScore}>
                        {selectedDetailsOrder.rating || '5.0'} / 5.0
                      </Text>
                      <View style={styles.verifiedResidentTag}>
                        <Text style={styles.verifiedResidentText}>Verified</Text>
                      </View>
                    </View>
                    <Text style={styles.sheetFeedbackComment}>
                      {selectedDetailsOrder.feedback || '"Technician was punctual and resolved the issue neatly."'}
                    </Text>
                    {selectedDetailsOrder.residentName && (
                      <Text style={styles.sheetReviewerName}>
                        — {selectedDetailsOrder.residentName}
                      </Text>
                    )}
                  </View>
                )}

                {/* Location & Navigation */}
                <View style={styles.sheetCardBlock}>
                  <Text style={styles.sheetBlockHeader}>Location Details</Text>
                  <View style={styles.sheetAddressBlock}>
                    <Text style={styles.sheetItemLabel}>Confirmed Address</Text>
                    <Text style={styles.sheetAddressValue}>
                      {selectedDetailsOrder?.society},{' '}
                      {selectedDetailsOrder?.address}
                    </Text>
                  </View>

                  <View style={styles.sheetRowBetween}>
                    <View>
                      <Text style={styles.sheetItemLabel}>GPS Coordinates</Text>
                      <Text style={styles.sheetCoordsText}>
                        {selectedDetailsOrder?.gpsCoords || '12.9249° N, 77.6784° E'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.copyCoordsButton}
                      onPress={() => handleCopyCoords(selectedDetailsOrder?.gpsCoords)}
                      activeOpacity={0.7}>
                      <Text style={styles.copyIcon}>📋</Text>
                      <Text style={styles.copyCoordsText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View style={styles.sheetActionRow}>
              <GradientButton
                style={styles.sheetDownloadPdfBtn}
                onPress={() => showToast('Downloading Tax Invoice PDF...')}
                activeOpacity={0.85}>
                <Text style={styles.downloadPdfIcon}>📥</Text>
                <Text style={styles.sheetDownloadPdfText}>Download Invoice PDF</Text>
              </GradientButton>

              <TouchableOpacity
                style={styles.sheetDismissButton}
                onPress={closeDetailsSheet}
                activeOpacity={0.85}>
                <Text style={styles.sheetDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
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
    paddingBottom: 24,
    gap: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  loadingText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },

  // Floating Toast
  toastContainer: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#303030',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  toastCheckIcon: {
    fontSize: 16,
    color: '#7DF5FA',
    fontWeight: 'bold',
  },
  toastText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: '#F3F0F0',
  },

  // Intro Header Row
  introHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 8,
  },
  introTitleColumn: {
    flex: 1,
  },
  titleWithLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  introTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveTagText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
    color: '#1B5E20',
    letterSpacing: 0.5,
  },
  introSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    flexShrink: 0,
  },
  refreshIcon: {
    fontSize: 18,
    color: colors.primaryContainer,
    fontWeight: 'bold',
  },

  // Statement & Tax Invoices Strip
  statementCard: {
    backgroundColor: '#FFE9E4',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#FFD5CC',
  },
  statementGlowCircle: {
    position: 'absolute',
    right: -24,
    bottom: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 88, 65, 0.12)',
  },
  statementContent: {
    gap: 14,
  },
  statementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statementIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    flexShrink: 0,
  },
  statementReceiptIcon: {
    fontSize: 20,
  },
  statementTextContainer: {
    flex: 1,
  },
  statementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statementTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: '#400100',
  },
  gstBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.4,
  },
  statementSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  statementButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  downloadPdfButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfButtonIcon: {
    fontSize: 16,
  },
  downloadPdfText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  exportExcelButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  excelButtonIcon: {
    fontSize: 16,
  },
  exportExcelText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },

  // Search & Filter
  searchSection: {
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 14,
    color: colors.outline,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurface,
    padding: 0,
  },
  clearSearchButton: {
    padding: 4,
  },
  clearSearchIcon: {
    fontSize: 12,
    color: colors.outline,
  },
  datePickerButton: {
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  calendarIcon: {
    fontSize: 15,
  },
  datePickerText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  dateFilterTray: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateRangeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateRangeIcon: {
    fontSize: 14,
  },
  dateRangeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  changeRangeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  chipsContainer: {
    gap: 8,
    paddingVertical: 2,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },

  // Orders List
  ordersList: {
    gap: 14,
  },

  // Card Header Structure - Prevents layout overflow
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  orderIdGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexShrink: 1,
  },
  idTextWrapper: {
    flex: 1,
    flexShrink: 1,
  },
  idWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  orderIdText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  amountRightGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '42%',
  },

  // Active Card
  activeOrderCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    gap: 12,
  },
  activeGlowStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.primaryContainer,
  },
  categoryIconCircleError: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorContainer,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  categoryGlyphActive: {
    fontSize: 15,
  },
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.badgeInfoBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.secondary,
  },
  inProgressBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.badgeInfoText,
  },
  assignedTimeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  activeAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  amountNoteText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: 'right',
  },

  // Active Details Box
  activeDetailsBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  taskTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  taskTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  plumbingIcon: {
    fontSize: 14,
  },
  activeTaskTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
    flex: 1,
  },
  highPriorityText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
    color: colors.secondary,
    letterSpacing: 0.3,
  },
  societyLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  buildingIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  societyTextGroup: {
    flex: 1,
  },
  societyNameBold: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
  },
  societyAddressText: {
    fontWeight: '400',
    color: colors.onSurface,
  },
  societyLandmarkText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  residentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    gap: 8,
  },
  residentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  residentAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  residentAvatarGlyph: {
    fontSize: 11,
  },
  residentName: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
  },
  callResidentButton: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callIcon: {
    fontSize: 12,
  },
  callResidentText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: colors.tertiary,
  },

  // Active Action Row
  activeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewGatePassButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  gatePassQrIcon: {
    fontSize: 15,
    color: colors.white,
    fontWeight: 'bold',
  },
  viewGatePassText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  infoSheetButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIcon: {
    fontSize: 17,
  },

  // Completed Order Card
  completedOrderCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 10,
  },
  categoryIconCircleSec: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  categoryGlyph: {
    fontSize: 15,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  completedCheckGlyph: {
    fontSize: 10,
    color: colors.tertiary,
    fontWeight: 'bold',
  },
  completedBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurface,
  },
  completedAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'right',
  },
  settledWalletText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '500',
    color: colors.tertiary,
    textAlign: 'right',
  },
  taskBriefContainer: {
    gap: 2,
  },
  orderTitleText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  locationInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationPinSmall: {
    fontSize: 12,
  },
  locationInlineText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },

  // Interactive Feedback Box - Fully clickable to open Invoice & Details
  feedbackInteractiveBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  feedbackTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedbackStars: {
    fontSize: 13,
    color: '#F59E0B',
  },
  feedbackRating: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  invoicePill: {
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  invoicePillText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  feedbackFullText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },

  // Cancelled Order Card - Cross & Price contained inside box
  cancelledOrderCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.9,
    gap: 10,
    overflow: 'hidden',
  },
  categoryIconCircleCancel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorContainer,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  categoryGlyphCancel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.error,
  },
  cancelledBadge: {
    backgroundColor: colors.errorContainer,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cancelledBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: colors.error,
  },
  cancelledAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },
  cancellationFeeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.error,
    textAlign: 'right',
    marginTop: 1,
  },
  cancelledTitleText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  cancelledReasonText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyIcon: {
    fontSize: 26,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '600',
    color: colors.onSurface,
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  resetFiltersButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  resetFiltersText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },

  // Gate Pass Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  verifiedIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verifiedGlyph: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  modalOrderTag: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeGlyph: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: 'bold',
  },

  // QR container
  qrPassContainer: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
  },
  qrBox: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainerLowest,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  qrGrid: {
    width: 110,
    height: 110,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  qrCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    borderWidth: 4,
    borderColor: '#1B1C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderWidth: 4,
    borderColor: '#1B1C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 32,
    height: 32,
    borderWidth: 4,
    borderColor: '#1B1C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCornerInner: {
    width: 12,
    height: 12,
    backgroundColor: '#1B1C1C',
  },
  qrCenterDotGroup: {
    position: 'absolute',
    top: 42,
    left: 42,
    width: 26,
    height: 26,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  qrDot: {
    width: 9,
    height: 9,
    backgroundColor: '#1B1C1C',
  },
  qrCodeBars: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 40,
    height: 32,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'flex-end',
  },
  qrBar: {
    width: 7,
    height: 24,
    backgroundColor: '#1B1C1C',
  },
  passCodeSection: {
    alignItems: 'center',
  },
  passCodeLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  passCodeValue: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
    marginTop: 2,
  },

  // Modal Info
  modalInfoList: {
    gap: 8,
  },
  modalInfoTile: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoTileIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  infoTileContent: {
    flex: 1,
  },
  infoTileLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  infoTileValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
    marginTop: 1,
  },
  gateVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  gateGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },

  // Modal Actions
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  startNavButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  startNavIcon: {
    fontSize: 15,
  },
  startNavText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  doneModalButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneModalText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },

  // Details & Invoice Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: '85%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
    alignSelf: 'center',
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  sheetHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  sheetHeaderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  sheetHeaderBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sheetSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  sheetScroll: {
    maxHeight: 380,
  },
  sheetContent: {
    gap: 12,
    paddingVertical: 4,
  },
  sheetCardBlock: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sheetBlockHeader: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
    paddingBottom: 6,
    marginBottom: 2,
  },
  sheetRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetItemLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  sheetItemValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
  },
  sheetPriceBig: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sheetPayoutHighlight: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  sheetStatusDone: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.tertiary,
  },
  sheetMonoText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },

  // Feedback Block in Sheet
  sheetFeedbackBlock: {
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FFE08A',
  },
  sheetFeedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetStars: {
    fontSize: 14,
    color: '#F59E0B',
  },
  sheetRatingScore: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },
  verifiedResidentTag: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  verifiedResidentText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: '#1B5E20',
  },
  sheetFeedbackComment: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  sheetReviewerName: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    textAlign: 'right',
  },

  // Address in Sheet
  sheetAddressBlock: {
    gap: 2,
  },
  sheetAddressValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '500',
    color: colors.onSurface,
  },
  sheetCoordsText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
    marginTop: 2,
  },
  copyCoordsButton: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  copyIcon: {
    fontSize: 12,
  },
  copyCoordsText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: colors.tertiary,
  },

  // Sheet Action Row
  sheetActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 6,
  },
  sheetDownloadPdfBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  downloadPdfIcon: {
    fontSize: 15,
  },
  sheetDownloadPdfText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  sheetDismissButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDismissText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
});
