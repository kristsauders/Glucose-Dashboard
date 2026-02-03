import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Utensils, Activity, Syringe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MealLogsTab } from './MealLogsTab';
import { ExerciseLogsTab } from './ExerciseLogsTab';
import { InsulinLogsTab } from './InsulinLogsTab';
import { apiService } from '@/services/api';
import type { MealLog, ExerciseLog, InsulinLog } from '@/types/logs';

interface LogsModalProps {
  onClose: () => void;
  dateRange: string;
  startDate: Date;
  endDate: Date;
}

export function LogsModal({ onClose, dateRange, startDate, endDate }: LogsModalProps) {
  const [activeTab, setActiveTab] = useState<'meals' | 'exercise' | 'insulin'>('meals');
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [insulinLogs, setInsulinLogs] = useState<InsulinLog[]>([]);
  const [loading, setLoading] = useState({ meals: true, exercise: true, insulin: true });

  // Fetch data on mount and when date range changes
  useEffect(() => {
    fetchAllLogs();
  }, [startDate, endDate]);

  const fetchAllLogs = async () => {
    setLoading({ meals: true, exercise: true, insulin: true });

    try {
      // Fetch all three log types in parallel
      const [meals, exercises, insulin] = await Promise.all([
        apiService.getMealLogs(startDate, endDate, 200),
        apiService.getExerciseLogs(startDate, endDate, 200),
        apiService.getInsulinLogs(startDate, endDate, 200),
      ]);

      setMealLogs(meals);
      setExerciseLogs(exercises);
      setInsulinLogs(insulin);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading({ meals: false, exercise: false, insulin: false });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-6xl max-h-[90vh] bg-card rounded-lg shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b bg-card/95 backdrop-blur-sm sticky top-0 z-10">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold">Activity Logs</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Viewing data for {dateRange}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="border-b px-4 md:px-6">
              <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
                <TabsTrigger value="meals" className="gap-2">
                  <Utensils className="h-4 w-4" />
                  <span>Meals</span>
                  {!loading.meals && mealLogs.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({mealLogs.length})
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="exercise" className="gap-2">
                  <Activity className="h-4 w-4" />
                  <span>Exercise</span>
                  {!loading.exercise && exerciseLogs.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({exerciseLogs.length})
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="insulin" className="gap-2">
                  <Syringe className="h-4 w-4" />
                  <span>Insulin</span>
                  {!loading.insulin && insulinLogs.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({insulinLogs.length})
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <TabsContent value="meals" className="mt-0">
                <MealLogsTab logs={mealLogs} loading={loading.meals} />
              </TabsContent>

              <TabsContent value="exercise" className="mt-0">
                <ExerciseLogsTab logs={exerciseLogs} loading={loading.exercise} />
              </TabsContent>

              <TabsContent value="insulin" className="mt-0">
                <InsulinLogsTab logs={insulinLogs} loading={loading.insulin} />
              </TabsContent>
            </div>
          </Tabs>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
