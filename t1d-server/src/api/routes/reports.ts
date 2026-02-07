import { Router, Request, Response } from 'express';
import { ReportGenerator, ReportConfig } from '../../services/report-generator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../../types/index.js';
import * as fs from 'fs/promises';

const router = Router();
const reportGenerator = new ReportGenerator();

/**
 * Create a new report
 * POST /api/reports
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const {
      title,
      reportType,
      dateRangeStart,
      dateRangeEnd,
      comparisonRangeStart,
      comparisonRangeEnd,
      sections,
      focusAreas,
      notes,
    } = req.body;

    // Validate required fields
    if (!title || !reportType || !dateRangeStart || !dateRangeEnd) {
      return res.status(400).json({
        error: 'Missing required fields: title, reportType, dateRangeStart, dateRangeEnd',
      });
    }

    // Validate report type
    if (!['general', 'comparison', 'decision-support'].includes(reportType)) {
      return res.status(400).json({
        error: 'Invalid report type. Must be: general, comparison, or decision-support',
      });
    }

    // Validate comparison dates if comparison report
    if (reportType === 'comparison' && (!comparisonRangeStart || !comparisonRangeEnd)) {
      return res.status(400).json({
        error: 'Comparison report requires comparisonRangeStart and comparisonRangeEnd',
      });
    }

    const config: ReportConfig = {
      userId,
      title,
      reportType,
      dateRangeStart: new Date(dateRangeStart),
      dateRangeEnd: new Date(dateRangeEnd),
      comparisonRangeStart: comparisonRangeStart ? new Date(comparisonRangeStart) : undefined,
      comparisonRangeEnd: comparisonRangeEnd ? new Date(comparisonRangeEnd) : undefined,
      sections,
      focusAreas,
      notes,
    };

    // Generate report asynchronously (in background)
    const reportId = await reportGenerator.generateReport(config);

    res.json({
      success: true,
      reportId,
      message: 'Report generation started',
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate report',
    });
  }
});

/**
 * Get all reports for the authenticated user
 * GET /api/reports
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const reports = await reportGenerator.getUserReports(userId);

    res.json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch reports',
    });
  }
});

/**
 * Get report metadata
 * GET /api/reports/:id
 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const reportId = req.params.id;

    const report = await reportGenerator.getReport(reportId, userId);

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Get report error:', error);
    const statusCode = error instanceof Error && error.message === 'Report not found' ? 404 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to fetch report',
    });
  }
});

/**
 * Download report PDF
 * GET /api/reports/:id/download
 */
router.get('/:id/download', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const reportId = req.params.id;

    const report = await reportGenerator.getReport(reportId, userId);

    if (report.status !== 'ready') {
      return res.status(400).json({
        error: `Report is not ready yet. Status: ${report.status}`,
      });
    }

    const filePath = await reportGenerator.getReportFilePath(reportId, userId);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'Report file not found',
      });
    }

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
    );

    // Stream the file
    const fileStream = await fs.readFile(filePath);
    res.send(fileStream);
  } catch (error) {
    console.error('Download report error:', error);
    const statusCode = error instanceof Error && error.message === 'Report not found' ? 404 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to download report',
    });
  }
});

/**
 * Delete a report
 * DELETE /api/reports/:id
 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const reportId = req.params.id;

    await reportGenerator.deleteReport(reportId, userId);

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    console.error('Delete report error:', error);
    const statusCode = error instanceof Error && error.message === 'Report not found' ? 404 : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to delete report',
    });
  }
});

export default router;
