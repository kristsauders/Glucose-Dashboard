import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { parseLibreCSV, saveGlucoseData } from '@/lib/csvParser';
import type { GlucoseReading } from '@/types/glucose';

interface CSVUploadProps {
  onDataLoaded: (readings: GlucoseReading[]) => void;
}

export function CSVUpload({ onDataLoaded }: CSVUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const text = await file.text();
      const readings = parseLibreCSV(text);

      if (readings.length === 0) {
        setError('No glucose readings found in the CSV file. Please check the file format.');
        setIsProcessing(false);
        return;
      }

      saveGlucoseData(readings);
      onDataLoaded(readings);
    } catch (err) {
      console.error('Error processing file:', err);
      setError('Error processing file. Please ensure it\'s a valid Libre CSV export.');
    } finally {
      setIsProcessing(false);
    }
  }, [onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(f => f.name.endsWith('.csv'));

    if (csvFile) {
      processFile(csvFile);
    } else {
      setError('Please upload a CSV file.');
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Upload Your Glucose Data</CardTitle>
          <CardDescription>
            Upload your Libre CGM CSV export to start analyzing your glucose patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-all
              ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border'}
              ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
            `}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
              disabled={isProcessing}
            />

            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
              {isProcessing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <FileText className="w-16 h-16 text-primary" />
                  </motion.div>
                  <p className="text-lg font-medium">Processing your data...</p>
                </>
              ) : (
                <>
                  <Upload className="w-16 h-16 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium mb-2">
                      {isDragging ? 'Drop your CSV file here' : 'Drag and drop your CSV file'}
                    </p>
                    <p className="text-sm text-muted-foreground">or</p>
                  </div>
                  <Button type="button" variant="outline">
                    Browse Files
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Accepts Libre CGM CSV exports
                  </p>
                </>
              )}
            </label>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
