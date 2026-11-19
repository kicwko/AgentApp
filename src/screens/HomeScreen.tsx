import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppFooter, type TabName } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import type { User } from '../services/firebaseAuth';
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

  return (
    <View style={styles.container}>
      {/* Common App Header */}
      <AppHeader
        isOnDuty={isOnDuty}
        onToggleDuty={() => setIsOnDuty(prev => !prev)}
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
            onToggleDuty={() => setIsOnDuty(prev => !prev)}
            onSignOut={onSignOut}
          />
        )}
      </View>

      {/* Common App Footer / Bottom Navigation */}
      <AppFooter
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        ordersBadgeCount={3}
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
