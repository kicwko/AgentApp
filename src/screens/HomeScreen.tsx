import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, ToastAndroid, View } from 'react-native';
import { AppFooter, type TabName } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import type { User } from '../services/firebaseAuth';
import { orderPollingService } from '../services/orderPollingService';
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
    const cleanPhone = (user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
    const userId = dbUser?._id || dbUser?.agentId || user?.uid;

    if (isOnDuty) {
      orderPollingService
        .start({
          phone: cleanPhone,
          userId: userId || cleanPhone,
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

      {/* Main Tab Content */}
      <View style={styles.body}>
        {activeTab === 'dashboard' && <DashboardScreen user={user} />}
        {activeTab === 'orders' && <OrdersScreen user={user} />}
        {activeTab === 'settings' && (
          <SettingsScreen
            user={user}
            isOnDuty={isOnDuty}
            onToggleDuty={handleToggleDuty}
            onSignOut={onSignOut}
          />
        )}
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
  },
});
