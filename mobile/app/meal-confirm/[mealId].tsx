import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getMeal, confirmMeal, dismissMeal, logInsulinForMeal, getRecentInsulinDoses } from '../../services/api';
import { useColors } from '../../constants/colors';

export default function MealConfirmScreen() {
  const { mealId } = useLocalSearchParams<{ mealId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const Colors = useColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Meal fields
  const [carbs, setCarbs] = useState('');
  const [description, setDescription] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [rise, setRise] = useState(0);

  // Insulin fields
  const [insulinUnits, setInsulinUnits] = useState('');
  const [recentDoses, setRecentDoses] = useState<number[]>([]);

  useEffect(() => {
    if (!mealId) return;
    Promise.all([
      getMeal(mealId),
      getRecentInsulinDoses(),
    ]).then(([{ meal }, { doses }]) => {
      setCarbs(String(meal.carbs ?? ''));
      setDescription(meal.description ?? '');
      setTimestamp(meal.timestamp);
      setRise(meal.rise ?? 0);
      setRecentDoses(doses);
    }).catch(() => {
      Alert.alert('Error', 'Could not load meal details.');
      router.back();
    }).finally(() => setLoading(false));
  }, [mealId]);

  async function handleConfirm() {
    if (!mealId) return;
    setSaving(true);
    try {
      await confirmMeal(mealId, {
        carbs: carbs ? Number(carbs) : undefined,
        description: description || undefined,
        timestamp,
      });

      const units = parseFloat(insulinUnits);
      if (!isNaN(units) && units > 0) {
        await logInsulinForMeal(mealId, units);
      }

      queryClient.invalidateQueries({ queryKey: ['logs'] });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDismiss() {
    if (!mealId) return;
    Alert.alert('Not a meal?', 'Remove this auto-detected entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await dismissMeal(mealId).catch(console.warn);
          queryClient.invalidateQueries({ queryKey: ['logs'] });
          router.back();
        },
      },
    ]);
  }

  const mealTimeLabel = timestamp
    ? format(new Date(timestamp), 'h:mm a')
    : '';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ fontSize: 16, color: Colors.primary }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: Colors.foreground }}>
            Meal at {mealTimeLabel}
          </Text>
        </View>

        {/* Detection summary */}
        {rise > 0 && (
          <View style={{
            backgroundColor: Colors.warning + '18',
            borderRadius: 10,
            padding: 12,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: Colors.warning + '44',
          }}>
            <Text style={{ color: Colors.warning, fontSize: 13, fontWeight: '600' }}>
              SAGE DETECTED · +{Math.round(rise)} mg/dL rise
            </Text>
          </View>
        )}

        {/* Carbs */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.mutedForeground, marginBottom: 6 }}>
          CARBS (g)
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 }}>
          <TouchableOpacity
            onPress={() => setCarbs(String(Math.max(0, (parseInt(carbs) || 0) - 5)))}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: Colors.muted, justifyContent: 'center', alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: Colors.foreground }}>−</Text>
          </TouchableOpacity>
          <TextInput
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="numeric"
            style={{
              flex: 1, textAlign: 'center', fontSize: 28, fontWeight: '700',
              color: Colors.foreground, backgroundColor: Colors.card,
              borderRadius: 12, paddingVertical: 12,
              borderWidth: 1, borderColor: Colors.cardBorder,
            }}
          />
          <TouchableOpacity
            onPress={() => setCarbs(String((parseInt(carbs) || 0) + 5))}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: Colors.muted, justifyContent: 'center', alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: Colors.foreground }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.mutedForeground, marginBottom: 6 }}>
          DESCRIPTION (optional)
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What did you eat?"
          placeholderTextColor={Colors.mutedForeground}
          style={{
            backgroundColor: Colors.card, borderRadius: 12, padding: 14,
            fontSize: 16, color: Colors.foreground,
            borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 24,
          }}
        />

        {/* Insulin */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.mutedForeground, marginBottom: 6 }}>
          INSULIN FOR THIS MEAL (optional)
        </Text>

        {/* Quick-pick buttons from recent doses */}
        {recentDoses.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {recentDoses.map(dose => (
              <TouchableOpacity
                key={dose}
                onPress={() => setInsulinUnits(insulinUnits === String(dose) ? '' : String(dose))}
                style={{
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                  backgroundColor: insulinUnits === String(dose) ? Colors.primary : Colors.muted,
                  borderWidth: 1,
                  borderColor: insulinUnits === String(dose) ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{
                  fontSize: 15, fontWeight: '600',
                  color: insulinUnits === String(dose) ? Colors.primaryForeground : Colors.foreground,
                }}>
                  {dose}u
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setInsulinUnits('')}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                backgroundColor: insulinUnits === '' ? Colors.primary : Colors.muted,
                borderWidth: 1,
                borderColor: insulinUnits === '' ? Colors.primary : Colors.border,
              }}
            >
              <Text style={{
                fontSize: 15, fontWeight: '600',
                color: insulinUnits === '' ? Colors.primaryForeground : Colors.mutedForeground,
              }}>
                None
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          value={insulinUnits}
          onChangeText={setInsulinUnits}
          keyboardType="decimal-pad"
          placeholder="Custom units (e.g. 4.5)"
          placeholderTextColor={Colors.mutedForeground}
          style={{
            backgroundColor: Colors.card, borderRadius: 12, padding: 14,
            fontSize: 16, color: Colors.foreground,
            borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 32,
          }}
        />

        {/* Confirm button */}
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={saving}
          style={{
            backgroundColor: Colors.primary, borderRadius: 14,
            paddingVertical: 16, alignItems: 'center', marginBottom: 12,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving
            ? <ActivityIndicator color={Colors.primaryForeground} />
            : <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.primaryForeground }}>
                Confirm{insulinUnits && parseFloat(insulinUnits) > 0 ? ` + Log ${insulinUnits}u insulin` : ''}
              </Text>
          }
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity onPress={handleDismiss} style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 15, color: Colors.destructive }}>Not a meal — remove</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
