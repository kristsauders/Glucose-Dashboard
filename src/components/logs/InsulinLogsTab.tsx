import { Skeleton } from '@/components/ui/skeleton';
import { Syringe } from 'lucide-react';
import { InsulinLogCard } from './InsulinLogCard';
import { EmptyState } from './EmptyState';
import type { InsulinLog } from '@/types/logs';

interface InsulinLogsTabProps {
  logs: InsulinLog[];
  loading: boolean;
  onDelete?: (id: string) => void;
}

export function InsulinLogsTab({ logs, loading, onDelete }: InsulinLogsTabProps) {
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
        icon={Syringe}
        title="No insulin doses logged"
        description="Import CSV data or use AI chat to log insulin doses"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {logs.map((log, index) => (
        <InsulinLogCard key={log.id} log={log} index={index} onDelete={onDelete} />
      ))}
    </div>
  );
}
