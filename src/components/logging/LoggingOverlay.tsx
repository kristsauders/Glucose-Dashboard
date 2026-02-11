import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InsulinLoggingPanel } from './InsulinLoggingPanel';
import { MealLoggingPanel } from './MealLoggingPanel';
import { ExerciseLoggingPanel } from './ExerciseLoggingPanel';

type LogCategory = 'insulin' | 'meal' | 'exercise';

interface LoggingOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onLogSuccess?: () => void;
  initialCategory?: LogCategory;
}

export function LoggingOverlay({
  isOpen,
  onClose,
  onLogSuccess,
  initialCategory = 'insulin',
}: LoggingOverlayProps) {
  const [activeCategory, setActiveCategory] = useState<LogCategory>(initialCategory);

  const handleSuccess = () => {
    onLogSuccess?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center md:p-4"
          onClick={onClose}
        >
          {/* Overlay Panel */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-background border-0 md:border md:rounded-lg shadow-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-semibold">Log Event</h2>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Category Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setActiveCategory('insulin')}
                className={`flex-1 py-3 px-4 font-medium transition-colors ${
                  activeCategory === 'insulin'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Insulin
              </button>
              <button
                onClick={() => setActiveCategory('meal')}
                className={`flex-1 py-3 px-4 font-medium transition-colors ${
                  activeCategory === 'meal'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Food
              </button>
              <button
                onClick={() => setActiveCategory('exercise')}
                className={`flex-1 py-3 px-4 font-medium transition-colors ${
                  activeCategory === 'exercise'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Exercise
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeCategory === 'insulin' && (
                <InsulinLoggingPanel onSuccess={handleSuccess} />
              )}
              {activeCategory === 'meal' && (
                <MealLoggingPanel onSuccess={handleSuccess} />
              )}
              {activeCategory === 'exercise' && (
                <ExerciseLoggingPanel onSuccess={handleSuccess} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
