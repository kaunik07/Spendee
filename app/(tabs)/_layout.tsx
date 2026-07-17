import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

// Material-3 style icon: the active tab's icon sits inside a soft mint pill
function PillIcon({
  focused, color, size, active, inactive,
}: {
  focused: boolean;
  color: string;
  size: number;
  active: string;
  inactive: string;
}) {
  return (
    <View
      style={{
        width: 60,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? Colors.primaryMuted : 'transparent',
      }}>
      <MaterialCommunityIcons name={(focused ? active : inactive) as any} size={size + 2} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.outline,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: (props) => (
            <PillIcon {...props} active="home-variant" inactive="home-variant-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expense',
          tabBarIcon: (props) => (
            <PillIcon {...props} active="receipt-text" inactive="receipt-text-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: (props) => (
            <PillIcon {...props} active="target" inactive="target" />
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: (props) => (
            <PillIcon {...props} active="piggy-bank" inactive="piggy-bank-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: (props) => (
            <PillIcon {...props} active="chart-box" inactive="chart-box-outline" />
          ),
        }}
      />
    </Tabs>
  );
}
