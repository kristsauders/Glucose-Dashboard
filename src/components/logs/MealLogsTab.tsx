import { Skeleton } from '@/components/ui/skeleton';
import { Utensils } from 'lucide-react';
import { MealLogCard } from './MealLogCard';
import { EmptyState } from './EmptyState';
import type { MealLog } from '@/types/logs';

interface MealLogsTabProps {
  logs: MealLog[];
  loading: boolean;
  onDelete?: (id: string) => void;
}

export function MealLogsTab({ logs, loading, onDelete }: MealLogsTabProps) {
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
        icon={Utensils}
        title="No meals logged"
        description="Import CSV data or use AI chat to log meals"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {logs.map((log, index) => (
        <MealLogCard key={log.id} log={log} index={index} onDelete={onDelete} />
      ))}
    </div>
  );
}
