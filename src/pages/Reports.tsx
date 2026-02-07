import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Download, Trash2, FileText, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GenerateReportModal } from '@/components/GenerateReportModal';
import { useAuth } from '@/hooks/useAuth';

interface Report {
  id: string;
  title: string;
  report_type: 'general' | 'comparison' | 'decision-support';
  date_range_start: string;
  date_range_end: string;
  status: 'generating' | 'ready' | 'error';
  generated_at?: string;
  created_at: string;
}

export function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const { getAuthHeaders } = useAuth();

  const fetchReports = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('http://localhost:3002/api/reports', {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }

      const data = await response.json();
      setReports(data.reports);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDownload = async (reportId: string, title: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`http://localhost:3002/api/reports/${reportId}/download`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download report:', error);
      alert('Failed to download report');
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`http://localhost:3002/api/reports/${reportId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      // Refresh reports list
      fetchReports();
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert('Failed to delete report');
    }
  };

  const getStatusBadge = (status: Report['status']) => {
    switch (status) {
      case 'generating':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating
          </Badge>
        );
      case 'ready':
        return <Badge className="bg-green-600">Ready</Badge>;
      case 'error':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Error
          </Badge>
        );
    }
  };

  const getReportTypeLabel = (type: Report['report_type']) => {
    switch (type) {
      case 'general':
        return 'General Overview';
      case 'comparison':
        return 'Period Comparison';
      case 'decision-support':
        return 'Decision Support';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Medical Reports</h1>
            <p className="text-muted-foreground mt-2">
              Generate comprehensive reports to share with your healthcare provider
            </p>
          </div>
          <Button onClick={() => setShowGenerateModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Generate Report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first report to share with your healthcare provider
              </p>
              <Button onClick={() => setShowGenerateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-xl">{report.title}</CardTitle>
                      {getStatusBadge(report.status)}
                    </div>
                    <CardDescription className="flex items-center gap-4 text-sm">
                      <span>{getReportTypeLabel(report.report_type)}</span>
                      <span>•</span>
                      <span>
                        {formatDate(report.date_range_start)} - {formatDate(report.date_range_end)}
                      </span>
                      <span>•</span>
                      <span>Created {formatDate(report.created_at)}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {report.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(report.id, report.title)}
                        className="flex items-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(report.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <GenerateReportModal
        open={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onReportGenerated={() => {
          setShowGenerateModal(false);
          fetchReports();
        }}
      />
    </div>
  );
}
