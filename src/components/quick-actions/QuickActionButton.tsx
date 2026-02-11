import { motion } from 'framer-motion';
import { Syringe, Utensils, Activity, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { QuickAction } from '@/types/quickActions';

interface QuickActionButtonProps {
  action: QuickAction;
  onClick: (action: QuickAction) => void;
  disabled?: boolean;
}

const iconMap = {
  syringe: Syringe,
  utensils: Utensils,
  activity: Activity,
};

export function QuickActionButton({ action, onClick, disabled }: QuickActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const Icon = iconMap[action.icon as keyof typeof iconMap] || Activity;

  const handleClick = async () => {
    if (disabled || isLoading) return;

    setIsLoading(true);
    try {
      await onClick(action);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
    } catch (error) {
      console.error('Error quick logging:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      className="flex-shrink-0"
    >
      <Button
        onClick={handleClick}
        disabled={disabled || isLoading}
        variant="outline"
        size="default"
        className={`flex items-center gap-2 h-auto py-3 px-4 min-w-[120px] ${
          isSuccess ? 'bg-green-50 border-green-500' : ''
        }`}
      >
        {isSuccess ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        <span className="text-sm font-medium whitespace-nowrap">
          {isLoading ? 'Logging...' : action.label}
        </span>
      </Button>
    </motion.div>
  );
}
