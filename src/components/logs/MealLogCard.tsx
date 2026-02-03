import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Utensils, Clock } from 'lucide-react';
import type { MealLog } from '@/types/logs';
import { format, isToday, isYesterday } from 'date-fns';

interface MealLogCardProps {
  log: MealLog;
  index: number;
}

export function MealLogCard({ log, index }: MealLogCardProps) {
  // Format timestamp
  const formatTime = (date: Date) => {
    if (isToday(date)) {
      return `Today ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, 'h:mm a')}`;
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  // Get carb badge color based on carbs amount
  const getCarbColor = (carbs: number) => {
    if (carbs < 30) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (carbs <= 60) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
  };

  // Get meal type badge color
  const getMealTypeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'breakfast':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'lunch':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'dinner':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'snack':
        return 'bg-pink-500/10 text-pink-600 border-pink-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  // Get source badge
  const getSourceBadge = (source: string) => {
    if (source === 'csv') {
      return <Badge variant="secondary" className="text-xs">CSV</Badge>;
    } else if (source === 'agent') {
      return <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">✨ Agent</Badge>;
    } else {
      return <Badge className="text-xs">Manual</Badge>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatTime(log.timestamp)}</span>
            </div>
            {getSourceBadge(log.source)}
          </div>

          {/* Description */}
          <div className="flex items-start gap-3">
            <Utensils className="h-5 w-5 text-primary mt-0.5" />
            <p className="font-medium text-base flex-1">{log.description}</p>
          </div>

          {/* Carbs & Meal Type */}
          <div className="flex flex-wrap gap-2">
            <Badge className={getCarbColor(log.carbs)}>
              {log.carbs}g carbs
            </Badge>
            {log.meal_type && (
              <Badge className={getMealTypeColor(log.meal_type)}>
                {log.meal_type}
              </Badge>
            )}
          </div>

          {/* Tags */}
          {log.tags && log.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {log.tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {log.notes && (
            <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
              {log.notes}
            </p>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
