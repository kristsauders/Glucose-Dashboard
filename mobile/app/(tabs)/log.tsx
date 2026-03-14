import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MealForm } from '../../components/logging/MealForm';
import { InsulinForm } from '../../components/logging/InsulinForm';
import { ExerciseForm } from '../../components/logging/ExerciseForm';
import { useColors } from '../../constants/colors';
import { quickLog } from '../../services/api';
import { useHealthKit } from '../../hooks/useHealthKit';

type LogType = 'meal' | 'insulin' | 'exercise';

const TABS: { key: LogType; label: string; emoji: string }[] = [
  { key: 'meal', label: 'Meal', emoji: '🍽️' },
  { key: 'insulin', label: 'Insulin', emoji: '💉' },
  { key: 'exercise', label: 'Exercise', emoji: '🏃' },
];

export default function LogScreen() {
  const Colors = useColors();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [activeTab, setActiveTab] = useState<LogType>(() => {
    if (type === 'insulin' || type === 'exercise') return type;
    return 'meal';
  });
  const queryClient = useQueryClient();
  const healthKit = useHealthKit();

  // Re-select tab when the screen is re-opened via a deep link (widget tap)
  useEffect(() => {
    if (type === 'insulin' || type === 'meal' || type === 'exercise') {
      setActiveTab(type);
    }
  }, [type]);

  const handleMealSubmit = async (data: { carbs: number; description: string; timestamp: string }) => {
    const { timestamp, ...rest } = data;
    await quickLog('meal', rest, timestamp);
    healthKit.writeMeal(data.carbs, data.timestamp).catch(console.warn);
    queryClient.invalidateQueries({ queryKey: ['logs'] });
    Alert.alert('Logged!', `Meal logged: ${data.carbs}g carbs`);
  };

  const handleInsulinSubmit = async (data: { units: number; type: string; timestamp: string }) => {
    const { timestamp, type, ...rest } = data;
    await quickLog('insulin', { ...rest, type }, timestamp);
    healthKit.writeInsulin(data.units, data.type as any, data.timestamp).catch(console.warn);
    queryClient.invalidateQueries({ queryKey: ['logs'] });
    Alert.alert('Logged!', `${data.units}u ${data.type} insulin logged`);
  };

  const handleExerciseSubmit = async (data: {
    activity: string;
    duration: number;
    intensity: string;
    timestamp: string;
  }) => {
    const { timestamp, ...rest } = data;
    await quickLog('exercise', rest, timestamp);
    healthKit.writeExercise(data.activity, data.duration, data.intensity as any, data.timestamp).catch(console.warn);
    queryClient.invalidateQueries({ queryKey: ['logs'] });
    Alert.alert('Logged!', `${data.duration} min ${data.activity} logged`);
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
    </SafeAreaView>
  );
}
