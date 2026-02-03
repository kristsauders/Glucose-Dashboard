import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, Timer } from 'lucide-react';
import type { ExerciseLog } from '@/types/logs';
import { format, isToday, isYesterday } from 'date-fns';

interface ExerciseLogCardProps {
  log: ExerciseLog;
  index: number;
}

export function ExerciseLogCard({ log, index }: ExerciseLogCardProps) {
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

  // Get activity type badge color
  const getActivityColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'cardio':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'strength':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'flexibility':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'sports':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  // Get intensity color and width
  const getIntensityDisplay = (intensity: string) => {
    const lowerIntensity = intensity?.toLowerCase() || '';

    let color = '';
    let width = '';

    switch (lowerIntensity) {
      case 'low':
        color = 'bg-green-500';
        width = 'w-1/4';
        break;
      case 'moderate':
        color = 'bg-yellow-500';
        width = 'w-2/4';
        break;
      case 'high':
        color = 'bg-orange-500';
        width = 'w-3/4';
        break;
      case 'intense':
        color = 'bg-red-500';
        width = 'w-full';
        break;
      default:
        color = 'bg-gray-500';
        width = 'w-1/4';
    }

    return { color, width, label: intensity };
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

  const intensityDisplay = getIntensityDisplay(log.intensity);

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
            <Activity className="h-5 w-5 text-primary mt-0.5" />
            <p className="font-medium text-base flex-1">
              {log.description || log.activity_type}
            </p>
          </div>

          {/* Activity Type & Duration */}
          <div className="flex flex-wrap gap-2">
            <Badge className={getActivityColor(log.activity_type)}>
              {log.activity_type}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Timer className="h-3 w-3" />
              {log.duration_minutes} min
            </Badge>
          </div>

          {/* Intensity Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Intensity</span>
              <span className="font-medium">{intensityDisplay.label}</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${intensityDisplay.color} ${intensityDisplay.width} transition-all rounded-full`}
              />
            </div>
          </div>

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
