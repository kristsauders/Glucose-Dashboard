import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Syringe, Clock, Trash2 } from 'lucide-react';
import type { InsulinLog } from '@/types/logs';
import { format, isToday, isYesterday } from 'date-fns';
import { useState } from 'react';

interface InsulinLogCardProps {
  log: InsulinLog;
  index: number;
  onDelete?: (id: string) => void;
}

export function InsulinLogCard({ log, index, onDelete }: InsulinLogCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = () => {
    if (confirm('Delete this insulin log? This cannot be undone.')) {
      setIsDeleting(true);
      onDelete?.(log.id);
    }
  };
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

  // Get insulin type badge color
  const getInsulinTypeColor = (type: string) => {
    const lowerType = type?.toLowerCase() || '';

    if (lowerType.includes('rapid') || lowerType.includes('fast')) {
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    } else if (lowerType.includes('long') || lowerType.includes('ultra') || lowerType.includes('basal')) {
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    } else if (lowerType.includes('mixed') || lowerType.includes('premix')) {
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    } else {
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    }
  };

  // Get purpose badge color
  const getPurposeColor = (purpose: string) => {
    switch (purpose?.toLowerCase()) {
      case 'meal':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'correction':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'basal':
        return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
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
            <div className="flex items-center gap-2">
              {getSourceBadge(log.source)}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Units (prominent) */}
          <div className="flex items-center gap-3">
            <Syringe className="h-5 w-5 text-primary" />
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{log.units}</span>
              <span className="text-lg text-muted-foreground">units</span>
            </div>
          </div>

          {/* Type & Purpose */}
          <div className="flex flex-wrap gap-2">
            <Badge className={getInsulinTypeColor(log.insulin_type)}>
              {log.insulin_type}
            </Badge>
            <Badge className={getPurposeColor(log.purpose)}>
              {log.purpose}
            </Badge>
          </div>

          {/* Brand Name */}
          {log.brand_name && log.brand_name !== log.insulin_type && (
            <div className="text-sm text-muted-foreground">
              Brand: <span className="font-medium">{log.brand_name}</span>
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
