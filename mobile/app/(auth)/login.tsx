import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useColors } from '../../constants/colors';

export default function LoginScreen() {
  const Colors = useColors();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login failed', err.message ?? 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / header */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <Text style={{ fontSize: 40, fontWeight: '700', color: Colors.primary }}>Sage</Text>
            <Text style={{ fontSize: 15, color: Colors.mutedForeground, marginTop: 6 }}>
              Your T1D companion
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={Colors.mutedForeground}
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: Colors.foreground,
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor={Colors.mutedForeground}
                onSubmitEditing={handleLogin}
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: Colors.foreground,
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading || !email || !password}
              style={{
                backgroundColor:
                  loading || !email || !password ? Colors.muted : Colors.primary,
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Sign in</Text>
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 4 }}>
              <Text style={{ color: Colors.mutedForeground, fontSize: 14 }}>
                Don't have an account?
              </Text>
              <Link href="/(auth)/signup">
                <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '600' }}>
                  Sign up
                </Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
