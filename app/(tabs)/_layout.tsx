import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.outline,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'home-variant' : 'home-variant-outline'}
              size={size + 2}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'compass' : 'compass-outline'}
              size={size + 2}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'piggy-bank' : 'piggy-bank-outline'}
              size={size + 2}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-box' : 'chart-box-outline'}
              size={size + 2}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="investments"
        options={{
          title: 'Invest',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-line-variant' : 'chart-line-variant'}
              size={size + 2}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
