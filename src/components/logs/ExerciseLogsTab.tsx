import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import { ExerciseLogCard } from './ExerciseLogCard';
import { EmptyState } from './EmptyState';
import type { ExerciseLog } from '@/types/logs';

interface ExerciseLogsTabProps {
  logs: ExerciseLog[];
  loading: boolean;
  onDelete?: (id: string) => void;
}

export function ExerciseLogsTab({ logs, loading, onDelete }: ExerciseLogsTabProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No exercise logged"
        description="Import CSV data or use AI chat to log exercise activities"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {logs.map((log, index) => (
        <ExerciseLogCard key={log.id} log={log} index={index} onDelete={onDelete} />
      ))}
    </div>
  );
}
