import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import {
  getSettings,
  updateSettings,
  connectLibreView,
  disconnectLibreView,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  getModelConfig,
  updateModelConfig,
} from '../../services/api';
import { registerForPushNotifications } from '../../services/notifications';
import { useColors } from '../../constants/colors';

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  const Colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
    >
      <Text style={{ fontSize: 15, color: Colors.foreground, flex: 1 }}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const Colors = useColors();
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: '600',
        color: Colors.mutedForeground,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginTop: 24,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
  );
}

export default function SettingsScreen() {
  const Colors = useColors();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  // LibreView connection form
  const [lvEmail, setLvEmail] = useState('');
  const [lvPassword, setLvPassword] = useState('');
  const [lvLoading, setLvLoading] = useState(false);

  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const notifPrefs = useQuery({ queryKey: ['notif-prefs'], queryFn: getNotificationPreferences });
  const modelConfig = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig });

  const updateNotifMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notif-prefs'] }),
  });

  const handleLibreConnect = async () => {
    if (!lvEmail || !lvPassword) return;
    setLvLoading(true);
    try {
      await connectLibreView(lvEmail, lvPassword);
      Alert.alert('Connected', 'LibreView connected successfully.');
      setLvEmail('');
      setLvPassword('');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Check your LibreView credentials.');
    } finally {
      setLvLoading(false);
    }
  };

  const handleLibreDisconnect = () => {
    Alert.alert('Disconnect LibreView', 'This will stop glucose syncing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await disconnectLibreView();
            queryClient.invalidateQueries({ queryKey: ['settings'] });
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleTestNotification = async () => {
    try {
      await registerForPushNotifications();
      await sendTestNotification();
      Alert.alert('Sent', 'Test notification sent.');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not send test notification.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const settingsData = (settings.data as any)?.settings ?? {};
  const notifData = (notifPrefs.data as any) ?? {};
  const isLibreConnected = !!settingsData?.libreview_email;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: Colors.foreground, marginBottom: 4 }}>
          Settings
        </Text>
        {user?.email ? (
          <Text style={{ fontSize: 14, color: Colors.mutedForeground }}>{user.email}</Text>
        ) : null}

        {/* ── LibreView ───────────────────────────────────────────────── */}
        <SectionHeader title="Glucose Source" />
        <View
          style={{
            backgroundColor: Colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            padding: 16,
            gap: 12,
          }}
        >
          {isLibreConnected ? (
            <>
              <Text style={{ fontSize: 15, color: Colors.foreground }}>
                Connected as{' '}
                <Text style={{ fontWeight: '600' }}>{settingsData.libreview_email}</Text>
              </Text>
              <TouchableOpacity
                onPress={handleLibreDisconnect}
                style={{
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: Colors.destructive,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Disconnect LibreView</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground }}>
                Connect LibreView
              </Text>
              <TextInput
                value={lvEmail}
                onChangeText={setLvEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="LibreView email"
                placeholderTextColor={Colors.mutedForeground}
                style={{
                  backgroundColor: Colors.muted,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.foreground,
                }}
              />
              <TextInput
                value={lvPassword}
                onChangeText={setLvPassword}
                secureTextEntry
                placeholder="LibreView password"
                placeholderTextColor={Colors.mutedForeground}
                style={{
                  backgroundColor: Colors.muted,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.foreground,
                }}
              />
              <TouchableOpacity
                onPress={handleLibreConnect}
                disabled={lvLoading || !lvEmail || !lvPassword}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: lvLoading || !lvEmail || !lvPassword ? Colors.muted : Colors.primary,
                  alignItems: 'center',
                }}
              >
                {lvLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Connect</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Notifications ───────────────────────────────────────────── */}
        <SectionHeader title="Notifications" />
        <View
          style={{
            backgroundColor: Colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            paddingHorizontal: 16,
          }}
        >
          <SettingRow label="Proactive insights">
            <Switch
              value={notifData?.proactive_enabled ?? true}
              onValueChange={val => updateNotifMutation.mutate({ proactive_enabled: val })}
              trackColor={{ true: Colors.primary }}
            />
          </SettingRow>
          <SettingRow label="Low glucose alerts">
            <Switch
              value={notifData?.low_glucose_enabled ?? true}
              onValueChange={val => updateNotifMutation.mutate({ low_glucose_enabled: val })}
              trackColor={{ true: Colors.primary }}
            />
          </SettingRow>
          <SettingRow label="High glucose alerts">
            <Switch
              value={notifData?.high_glucose_enabled ?? true}
              onValueChange={val => updateNotifMutation.mutate({ high_glucose_enabled: val })}
              trackColor={{ true: Colors.primary }}
            />
          </SettingRow>
          <View style={{ paddingVertical: 14 }}>
            <TouchableOpacity
              onPress={handleTestNotification}
              style={{
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: Colors.muted,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: Colors.primary, fontWeight: '600' }}>
                Send test notification
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <View
          style={{
            backgroundColor: Colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            paddingHorizontal: 16,
          }}
        >
          <SettingRow label="Email">
            <Text style={{ color: Colors.mutedForeground, fontSize: 14 }}>{user?.email}</Text>
          </SettingRow>
          {user?.diagnosisType ? (
            <SettingRow label="Diagnosis">
              <Text style={{ color: Colors.mutedForeground, fontSize: 14 }}>
                {user.diagnosisType}
              </Text>
            </SettingRow>
          ) : null}
          <View style={{ paddingVertical: 14 }}>
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: Colors.destructive,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
