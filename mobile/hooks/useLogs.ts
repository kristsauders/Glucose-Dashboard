import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { subDays, formatISO } from 'date-fns';

function rangeParams(days = 7) {
  const end = new Date();
  const start = subDays(end, days);
  return { start: formatISO(start), end: formatISO(end) };
}

export function useMealLogs(days = 7) {
  const { start, end } = rangeParams(days);
  return useQuery({
    queryKey: ['logs', 'meals', days],
    queryFn: () => api.getMealLogs(start, end),
    staleTime: 60_000,
  });
}

export function useInsulinLogs(days = 7) {
  const { start, end } = rangeParams(days);
  return useQuery({
    queryKey: ['logs', 'insulin', days],
    queryFn: () => api.getInsulinLogs(start, end),
    staleTime: 60_000,
  });
}

export function useExerciseLogs(days = 7) {
  const { start, end } = rangeParams(days);
  return useQuery({
    queryKey: ['logs', 'exercise', days],
    queryFn: () => api.getExerciseLogs(start, end),
    staleTime: 60_000,
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id }: { type: 'meal' | 'insulin' | 'exercise'; id: string }) => {
      if (type === 'meal') return api.deleteMeal(id);
      if (type === 'insulin') return api.deleteInsulin(id);
      return api.deleteExercise(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}

export function useQuickLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, data }: { type: 'meal' | 'insulin' | 'exercise'; data: Record<string, any> }) =>
      api.quickLog(type, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}
