import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QuickActionButton } from './QuickActionButton';
import { apiService } from '@/services/api';
import type { QuickAction } from '@/types/quickActions';

interface QuickActionsBarProps {
  onLogSuccess?: () => void;
}

export function QuickActionsBar({ onLogSuccess }: QuickActionsBarProps) {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadQuickActions();
  }, []);

  const loadQuickActions = async () => {
    try {
      const suggestions = await apiService.getQuickActions();
      setActions(suggestions);
    } catch (error) {
      console.error('Failed to load quick actions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLog = async (action: QuickAction) => {
    try {
      await apiService.quickLog({
        type: action.type,
        data: action.metadata,
      });

      // Refresh quick actions and notify parent
      loadQuickActions();
      onLogSuccess?.();
    } catch (error: any) {
      alert(error.message || 'Failed to log event');
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 px-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 w-32 bg-muted animate-pulse rounded-md flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2 overflow-x-auto pb-2 px-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
    >
      {actions.map((action) => (
        <QuickActionButton
          key={action.id}
          action={action}
          onClick={handleQuickLog}
        />
      ))}
    </motion.div>
  );
}
