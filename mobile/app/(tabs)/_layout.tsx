import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useColors } from '../../constants/colors';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  const Colors = useColors();
  return (
    <Text style={{ fontSize: 22, color: focused ? Colors.tabActive : Colors.tabInactive }}>
      {symbol}
    </Text>
  );
}

export default function TabsLayout() {
  const Colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon symbol="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: Colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 24, lineHeight: 28 }}>+</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused }) => <TabIcon symbol="⏱" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon symbol="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
