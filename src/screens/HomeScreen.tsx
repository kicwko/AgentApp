import React, { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, ToastAndroid, View } from 'react-native';
import { AppFooter, type TabName } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import type { User } from '../services/firebaseAuth';
import { orderPollingService } from '../services/orderPollingService';
import apiClient from '../services/apiClient';
import { API_CONFIG } from '../config/api';
import { userService, type BackendUser } from '../services/userService';
import { colors } from '../theme/colors';
import { DashboardScreen } from './DashboardScreen';
import { OrdersScreen } from './OrdersScreen';
import { SettingsScreen } from './SettingsScreen';

type Props = {
  user: User;
  onSignOut?: () => void;
};

/**
 * Main application shell for authenticated agents.
 * Integrates reusable AppHeader, Tab Navigation, and AppFooter.
 */
export function HomeScreen({ user, onSignOut }: Props) {
  const [activeTab, setActiveTab] = useState<TabName>('dashboard');
  const [isOnDuty, setIsOnDuty] = useState(true);
  const [updatingDuty, setUpdatingDuty] = useState(false);
  const [dbUser, setDbUser] = useState<BackendUser | null>(null);

  // Fetch initial duty status from database on mount
  useEffect(() => {
    const cleanPhone = (user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
    userService
      .fetchPartnerProfile({
        phone: cleanPhone,
        email: user?.email,
        uid: user?.uid,
      })
      .then(res => {
        if (res && res.data) {
          setDbUser(res.data);
          if (res.data.availability !== undefined && res.data.availability !== null) {
            setIsOnDuty(Boolean(res.data.availability));
          } else if (res.data.availabilty !== undefined && res.data.availabilty !== null) {
            setIsOnDuty(Boolean(res.data.availabilty));
          } else if ((res.data.preferences as any)?.isOnDuty !== undefined) {
            setIsOnDuty(Boolean((res.data.preferences as any).isOnDuty));
          }
        }
      })
      .catch(() => {});
  }, [user]);

  // Keep background polling service active while On Duty
  useEffect(() => {
    const rawPhone =
      user?.phoneNumber ||
      dbUser?.phone ||
      (dbUser as any)?.mobile ||
      apiClient.getUserPhone() ||
      '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const userId = dbUser?._id || dbUser?.agentId || user?.uid || cleanPhone;

    orderPollingService.setOnDuty(isOnDuty);

    if (isOnDuty && (cleanPhone || userId)) {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS' as any)
          .then(granted => {
            if (!granted) {
              PermissionsAndroid.request(
                'android.permission.POST_NOTIFICATIONS' as any,
                {
                  title: 'Kweecko Dispatch Alerts',
                  message:
                    'Allow notifications so you are instantly alerted when orders are assigned in the background.',
                  buttonPositive: 'Allow',
                }
              ).catch(() => {});
            }
          })
          .catch(() => {});
      }

      orderPollingService
        .start({
          phone: cleanPhone,
          userId: userId,
          token: apiClient.getAuthToken() || `mock-jwt-${cleanPhone}`,
          baseUrl: API_CONFIG.baseUrl,
        })
        .then(() => {
          orderPollingService.requestBatteryOptimizationExemption().catch(() => {});
        })
        .catch(err => {
          console.log('[HomeScreen] Notice starting polling service:', err);
        });
    } else {
      orderPollingService.stop().catch(() => {});
    }
  }, [isOnDuty, user, dbUser]);

  // Toggle duty status and update database in real-time
  const handleToggleDuty = async () => {
    if (updatingDuty) return;
    const newStatus = !isOnDuty;
    setIsOnDuty(newStatus); // Optimistic UI update
    setUpdatingDuty(true);

    const cleanPhone = (user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
    const userId = dbUser?._id || dbUser?.agentId || user?.uid;
    const fullName = dbUser?.fullName || user?.displayName || 'Partner';

    try {
      const res = await userService.updateDutyStatus({
        phone: cleanPhone,
        userId: userId || undefined,
        email: user?.email || undefined,
        fullName: fullName || undefined,
        isOnDuty: newStatus,
      });

      if (res && res.data) {
        setDbUser(res.data);
      }

      if (Platform.OS === 'android') {
        ToastAndroid.show(
          newStatus ? 'Duty ON • Receiving Dispatches' : 'Duty OFF • Standby',
          ToastAndroid.SHORT
        );
      }
    } catch (err: any) {
      console.warn('[HomeScreen] Could not update duty status in database:', err);
      // Revert optimistic update if API failed
      setIsOnDuty(!newStatus);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Failed to update duty status in database', ToastAndroid.SHORT);
      }
    } finally {
      setUpdatingDuty(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Common App Header */}
      <AppHeader
        isOnDuty={isOnDuty}
        onToggleDuty={handleToggleDuty}
        onPressProfile={() => setActiveTab('settings')}
        onSignOut={onSignOut}
      />

      {/* Main Tab Content - Kept mounted so page DOM and scroll are never removed on tab switch */}
      <View style={styles.body}>
        <View
          style={[
            styles.tabContainer,
            activeTab === 'dashboard' ? styles.tabVisible : styles.tabHidden,
          ]}
          pointerEvents={activeTab === 'dashboard' ? 'auto' : 'none'}>
          <DashboardScreen
            user={user}
            isActive={activeTab === 'dashboard'}
            isOnDuty={isOnDuty}
            onSwitchToDashboard={() => setActiveTab('dashboard')}
          />
        </View>
        <View
          style={[
            styles.tabContainer,
            activeTab === 'orders' ? styles.tabVisible : styles.tabHidden,
          ]}
          pointerEvents={activeTab === 'orders' ? 'auto' : 'none'}>
          <OrdersScreen user={user} isActive={activeTab === 'orders'} />
        </View>
        <View
          style={[
            styles.tabContainer,
            activeTab === 'settings' ? styles.tabVisible : styles.tabHidden,
          ]}
          pointerEvents={activeTab === 'settings' ? 'auto' : 'none'}>
          <SettingsScreen
            user={user}
            isOnDuty={isOnDuty}
            onToggleDuty={handleToggleDuty}
            onSignOut={onSignOut}
            isActive={activeTab === 'settings'}
          />
        </View>
      </View>

      {/* Common App Footer / Bottom Navigation */}
      <AppFooter
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    position: 'relative',
  },
  tabContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabVisible: {
    display: 'flex',
    zIndex: 1,
    opacity: 1,
  },
  tabHidden: {
    opacity: 0,
    zIndex: 0,
    top: -99999,
  },
});
