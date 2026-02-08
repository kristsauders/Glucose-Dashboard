import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiService } from '@/services/api';

interface GenerateReportModalProps {
  open: boolean;
  onClose: () => void;
  onReportGenerated: () => void;
}

export function GenerateReportModal({ open, onClose, onReportGenerated }: GenerateReportModalProps) {
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<'general' | 'comparison' | 'decision-support'>('general');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [comparisonRangeStart, setComparisonRangeStart] = useState('');
  const [comparisonRangeEnd, setComparisonRangeEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !reportType || !dateRangeStart || !dateRangeEnd) {
      alert('Please fill in all required fields');
      return;
    }

    if (reportType === 'comparison' && (!comparisonRangeStart || !comparisonRangeEnd)) {
      alert('Please provide comparison date range');
      return;
    }

    setGenerating(true);

    try {
      await apiService.generateReport({
        title,
        reportType,
        dateRangeStart,
        dateRangeEnd,
        comparisonRangeStart: reportType === 'comparison' ? comparisonRangeStart : undefined,
        comparisonRangeEnd: reportType === 'comparison' ? comparisonRangeEnd : undefined,
        notes,
      });

      // Reset form
      setTitle('');
      setReportType('general');
      setDateRangeStart('');
      setDateRangeEnd('');
      setComparisonRangeStart('');
      setComparisonRangeEnd('');
      setNotes('');

      onReportGenerated();
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  // Set default date range (last 14 days)
  const setDefaultDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);

    setDateRangeStart(start.toISOString().split('T')[0]);
    setDateRangeEnd(end.toISOString().split('T')[0]);
  };

  // Set default comparison range (14 days before primary range)
  const setDefaultComparisonRange = () => {
    if (!dateRangeStart) return;

    const primaryStart = new Date(dateRangeStart);
    const compEnd = new Date(primaryStart);
    compEnd.setDate(compEnd.getDate() - 1);

    const compStart = new Date(compEnd);
    compStart.setDate(compStart.getDate() - 14);

    setComparisonRangeStart(compStart.toISOString().split('T')[0]);
    setComparisonRangeEnd(compEnd.toISOString().split('T')[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Medical Report</DialogTitle>
          <DialogDescription>
            Create a comprehensive report to share with your healthcare provider
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Report Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekly Review - December 2024"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reportType">Report Type *</Label>
            <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
              <SelectTrigger id="reportType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Overview</SelectItem>
                <SelectItem value="comparison">Period Comparison</SelectItem>
                <SelectItem value="decision-support">Decision Support</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {reportType === 'general' && 'Comprehensive overview of glucose management'}
              {reportType === 'comparison' && 'Compare two time periods side-by-side'}
              {reportType === 'decision-support' && 'Focused analysis for specific decisions'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Primary Date Range *</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={setDefaultDateRange}
                className="h-auto p-0 text-xs"
              >
                Last 14 days
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateRangeStart">Start Date</Label>
                <Input
                  id="dateRangeStart"
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateRangeEnd">End Date</Label>
                <Input
                  id="dateRangeEnd"
                  type="date"
                  value={dateRangeEnd}
                  onChange={(e) => setDateRangeEnd(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {reportType === 'comparison' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Comparison Date Range *</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={setDefaultComparisonRange}
                  className="h-auto p-0 text-xs"
                >
                  Previous 14 days
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="comparisonRangeStart">Start Date</Label>
                  <Input
                    id="comparisonRangeStart"
                    type="date"
                    value={comparisonRangeStart}
                    onChange={(e) => setComparisonRangeStart(e.target.value)}
                    required={reportType === 'comparison'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comparisonRangeEnd">End Date</Label>
                  <Input
                    id="comparisonRangeEnd"
                    type="date"
                    value={comparisonRangeEnd}
                    onChange={(e) => setComparisonRangeEnd(e.target.value)}
                    required={reportType === 'comparison'}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any specific questions or areas of concern for your provider..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button type="submit" disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Report'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
