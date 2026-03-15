import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { MealForm } from '../../components/logging/MealForm';
import { InsulinForm } from '../../components/logging/InsulinForm';
import { ExerciseForm } from '../../components/logging/ExerciseForm';
import { useColors } from '../../constants/colors';
import { quickLog } from '../../services/api';
import { useHealthKit } from '../../hooks/useHealthKit';

type LogType = 'meal' | 'insulin' | 'exercise';

const TABS: { key: LogType; label: string; emoji: string }[] = [
  { key: 'insulin', label: 'Insulin', emoji: '💉' },
  { key: 'meal', label: 'Meal', emoji: '🍽️' },
  { key: 'exercise', label: 'Exercise', emoji: '🏃' },
];

export default function LogScreen() {
  const Colors = useColors();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [activeTab, setActiveTab] = useState<LogType>(() => {
    if (type === 'meal' || type === 'exercise') return type;
    return 'insulin';
  });
  const queryClient = useQueryClient();
  const healthKit = useHealthKit();

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');
  const navTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (navTimeout.current) clearTimeout(navTimeout.current); };
  }, []);

  // Re-select tab when the screen is re-opened via a deep link (widget tap)
  useEffect(() => {
    if (type === 'insulin' || type === 'meal' || type === 'exercise') {
      setActiveTab(type);
    }
  }, [type]);

  const showToastAndNavigate = (msg: string) => {
    setToastMsg(msg);
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    navTimeout.current = setTimeout(() => router.navigate('/(tabs)/'), 1000);
  };

  const handleMealSubmit = async (data: { carbs: number; description: string; timestamp: string }) => {
    try {
      const { timestamp, ...rest } = data;
      await quickLog('meal', rest, timestamp);
      healthKit.writeMeal(data.carbs, data.timestamp).catch(console.warn);
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      showToastAndNavigate(`${data.carbs}g carbs logged`);
    } catch (err) {
      console.error('Failed to log meal:', err);
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    }
  };

  const handleInsulinSubmit = async (data: { units: number; type: string; timestamp: string }) => {
    try {
      const { timestamp, type, ...rest } = data;

      // Pre-meal bolus should precede the meal. If there's a meal logged within ±10 min
      // of the insulin timestamp, place the insulin 2 min before that meal instead.
      const cachedMeals = (queryClient.getQueryData(['logs', 'meals', 1]) as any)?.meals as any[] ?? [];
      const insulinMs = new Date(timestamp).getTime();
      const nearbyMeal = cachedMeals.find(
        (m: any) => Math.abs(new Date(m.timestamp).getTime() - insulinMs) < 10 * 60_000
      );
      const adjustedTimestamp = nearbyMeal
        ? new Date(new Date(nearbyMeal.timestamp).getTime() - 15 * 60_000).toISOString()
        : timestamp;

      await quickLog('insulin', { ...rest, type }, adjustedTimestamp);
      healthKit.writeInsulin(data.units, data.type as any, adjustedTimestamp).catch(console.warn);
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      showToastAndNavigate(`${data.units}u ${data.type} insulin logged`);
    } catch (err) {
      console.error('Failed to log insulin:', err);
      Alert.alert('Error', 'Failed to log insulin. Please try again.');
    }
  };

  const handleExerciseSubmit = async (data: {
    activity: string;
    duration: number;
    intensity: string;
    timestamp: string;
  }) => {
    try {
      const { timestamp, ...rest } = data;
      await quickLog('exercise', rest, timestamp);
      healthKit.writeExercise(data.activity, data.duration, data.intensity as any, data.timestamp).catch(console.warn);
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      showToastAndNavigate(`${data.duration} min ${data.activity} logged`);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      Alert.alert('Error', 'Failed to log exercise. Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      {/* Header: title + tabs on one line */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
        gap: 12,
      }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: Colors.foreground }}>
          Log
        </Text>
        <View style={{
          flex: 1,
          flexDirection: 'row',
          backgroundColor: Colors.muted,
          borderRadius: 12,
          padding: 4,
        }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: activeTab === tab.key ? Colors.card : 'transparent',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 5,
                shadowColor: activeTab === tab.key ? '#000' : 'transparent',
                shadowOpacity: 0.06,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Text style={{ fontSize: 15 }}>{tab.emoji}</Text>
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: activeTab === tab.key ? Colors.foreground : Colors.mutedForeground,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Form — keyboard-aware so the Log button stays visible */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'meal' && <MealForm onSubmit={handleMealSubmit} />}
          {activeTab === 'insulin' && <InsulinForm onSubmit={handleInsulinSubmit} />}
          {activeTab === 'exercise' && <ExerciseForm onSubmit={handleExerciseSubmit} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success toast — fades in, then screen navigates away */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 36,
          left: 16,
          right: 16,
          backgroundColor: Colors.success,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 20,
          alignItems: 'center',
          opacity: toastOpacity,
          zIndex: 100,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{toastMsg}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}
