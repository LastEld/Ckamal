/**
 * @fileoverview Report Generation System for CogniMesh v5.0
 * Generates usage, cost, performance, and audit reports in multiple formats.
 * @module analytics/reports
 */

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

/**
 * Report types
 * @typedef {'usage' | 'costs' | 'performance' | 'audit'} ReportType
 */

/**
 * Report formats
 * @typedef {'json' | 'csv' | 'html' | 'pdf'} ReportFormat
 */

/**
 * Date range for reports
 * @typedef {Object} DateRange
 * @property {Date} start - Start date
 * @property {Date} end - End date
 */

/**
 * Report configuration
 * @typedef {Object} ReportConfig
 * @property {ReportType} type - Report type
 * @property {ReportFormat} format - Output format
 * @property {DateRange} dateRange - Date range
 * @property {string[]} [providers] - Filter by providers
 * @property {string[]} [models] - Filter by models
 * @property {string} [outputPath] - Custom output path
 */

/**
 * Generated report result
 * @typedef {Object} ReportResult
 * @property {string} id - Report ID
 * @property {ReportType} type - Report type
 * @property {ReportFormat} format - Report format
 * @property {string} content - Report content or file path
 * @property {Date} generatedAt - Generation timestamp
 * @property {DateRange} dateRange - Report date range
 * @property {Object} metadata - Additional metadata
 */

/**
 * Report data structure
 * @typedef {Object} ReportData
 * @property {string} title - Report title
 * @property {DateRange} period - Report period
 * @property {Object} summary - Summary statistics
 * @property {Array} details - Detailed data
 */

/**
 * Generates analytics reports in multiple formats
 */
export class ReportGenerator {
  /**
   * Supported report types
   * @readonly
   * @enum {string}
   */
  static REPORT_TYPES = {
    USAGE: 'usage',
    COSTS: 'costs',
    PERFORMANCE: 'performance',
    AUDIT: 'audit'
  };

  /**
   * Supported output formats
   * @readonly
   * @enum {string}
   */
  static FORMATS = {
    JSON: 'json',
    CSV: 'csv',
    HTML: 'html',
    PDF: 'pdf'
  };

  /**
   * Creates a new ReportGenerator instance
   * @param {Object} options - Configuration options
   * @param {string} [options.dataDir='./data'] - Directory for data and reports
   * @param {string} [options.reportsDir='./reports'] - Directory for generated reports
   * @param {CostTracker} [options.costTracker] - CostTracker instance
   * @param {BudgetManager} [options.budgetManager] - BudgetManager instance
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || './data';
    this.reportsDir = options.reportsDir || './reports';
    this.costTracker = options.costTracker || null;
    this.budgetManager = options.budgetManager || null;
    this.db = null;
  }

  /**
   * Initializes the report generator
   * @returns {Promise<void>}
   */
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.reportsDir, { recursive: true });
    
    this.db = await open({
      filename: join(this.dataDir, 'reports.db'),
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS generated_reports (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        format TEXT NOT NULL,
        file_path TEXT,
        content TEXT,
        generated_at INTEGER NOT NULL,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reports_type ON generated_reports(type);
      CREATE INDEX IF NOT EXISTS idx_reports_date ON generated_reports(generated_at);
    `);
  }

  /**
   * Closes the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  /**
   * Generates a unique ID
   * @private
   * @returns {string}
   */
  _generateId() {
    return `report-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Formats date for display
   * @private
   * @param {Date} date - Date to format
   * @returns {string} Formatted date
   */
  _formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generates a report
   * @param {ReportType} type - Report type
   * @param {ReportFormat} format - Output format
   * @param {DateRange} dateRange - Date range
   * @param {Object} [options={}] - Additional options
   * @param {string[]} [options.providers] - Filter by providers
   * @param {string[]} [options.models] - Filter by models
   * @param {string} [options.outputPath] - Custom output path
   * @returns {Promise<ReportResult>} Generated report
   */
  async generate(type, format, dateRange, options = {}) {
    if (!this.db) {
      throw new Error('ReportGenerator not initialized. Call init() first.');
    }

    if (!Object.values(ReportGenerator.REPORT_TYPES).includes(type)) {
      throw new Error(`Unsupported report type: ${type}`);
    }

    if (!Object.values(ReportGenerator.FORMATS).includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    const data = await this._collectData(type, dateRange, options);
    const content = await this._formatOutput(data, format, type);

    const reportId = this._generateId();
    const timestamp = Date.now();
    const fileName = `${type}-report-${this._formatDate(dateRange.start)}-to-${this._formatDate(dateRange.end)}.${format}`;
    const filePath = options.outputPath || join(this.reportsDir, fileName);

    // Save to file for non-JSON formats or if requested
    if (format !== 'json' || options.outputPath) {
      await writeFile(filePath, content, 'utf8');
    }

    const metadata = {
      providers: options.providers,
      models: options.models,
      recordCount: data.details?.length || 0
    };

    await this.db.run(
      `INSERT INTO generated_reports (id, type, format, file_path, content, generated_at, start_date, end_date, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportId, type, format, filePath, format === 'json' ? content : null, timestamp,
       dateRange.start.getTime(), dateRange.end.getTime(), JSON.stringify(metadata)]
    );

    return {
      id: reportId,
      type,
      format,
      content: format === 'json' ? content : filePath,
      generatedAt: new Date(timestamp),
      dateRange,
      metadata
    };
  }

  /**
   * Collects data for the specified report type
   * @private
   * @param {ReportType} type - Report type
   * @param {DateRange} dateRange - Date range
   * @param {Object} options - Filter options
   * @returns {Promise<ReportData>} Report data
   */
  async _collectData(type, dateRange, options) {
    switch (type) {
      case ReportGenerator.REPORT_TYPES.USAGE:
        return this._collectUsageData(dateRange, options);
      case ReportGenerator.REPORT_TYPES.COSTS:
        return this._collectCostData(dateRange, options);
      case ReportGenerator.REPORT_TYPES.PERFORMANCE:
        return this._collectPerformanceData(dateRange, options);
      case ReportGenerator.REPORT_TYPES.AUDIT:
        return this._collectAuditData(dateRange, options);
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  /**
   * Collects usage report data
   * @private
   */
  async _collectUsageData(dateRange, options) {
    if (!this.costTracker) {
      throw new Error('CostTracker required for usage reports');
    }

    const filters = {
      startDate: dateRange.start,
      endDate: dateRange.end,
      ...options
    };

    const stats = await this.costTracker.getStats(filters);
    const costs = await this.costTracker.getCosts(filters);

    // Aggregate by day
    const dailyUsage = {};
    for (const cost of costs) {
      const date = new Date(cost.timestamp).toISOString().split('T')[0];
      if (!dailyUsage[date]) {
        dailyUsage[date] = { date, requests: 0, tokens: 0, cost: 0 };
      }
      dailyUsage[date].requests++;
      dailyUsage[date].tokens += cost.tokens;
      dailyUsage[date].cost += cost.cost;
    }

    return {
      title: 'API Usage Report',
      period: dateRange,
      summary: {
        totalRequests: stats.requestCount,
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
        averageCostPerRequest: stats.requestCount > 0 ? stats.totalCost / stats.requestCount : 0
      },
      details: Object.values(dailyUsage).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * Collects cost report data
   * @private
   */
  async _collectCostData(dateRange, options) {
    if (!this.costTracker) {
      throw new Error('CostTracker required for cost reports');
    }

    const filters = {
      startDate: dateRange.start,
      endDate: dateRange.end,
      ...options
    };

    const stats = await this.costTracker.getStats(filters);
    const costs = await this.costTracker.getCosts(filters);

    return {
      title: 'Cost Analysis Report',
      period: dateRange,
      summary: {
        totalCost: stats.totalCost,
        costByProvider: stats.costByProvider,
        costByModel: stats.costByModel
      },
      details: costs.map(c => ({
        date: new Date(c.timestamp).toISOString(),
        provider: c.provider,
        model: c.model,
        tokens: c.tokens,
        cost: c.cost,
        operation: c.operation
      }))
    };
  }

  /**
   * Collects performance report data
   * @private
   */
  async _collectPerformanceData(dateRange, options) {
    if (!this.costTracker) {
      throw new Error('CostTracker required for performance reports');
    }

    const filters = {
      startDate: dateRange.start,
      endDate: dateRange.end,
      ...options
    };

    const costs = await this.costTracker.getCosts(filters);
    
    // Calculate performance metrics by provider/model
    const metrics = {};
    for (const cost of costs) {
      const key = `${cost.provider}/${cost.model}`;
      if (!metrics[key]) {
        metrics[key] = {
          provider: cost.provider,
          model: cost.model,
          requests: 0,
          totalTokens: 0,
          totalCost: 0,
          avgCostPerToken: 0
        };
      }
      metrics[key].requests++;
      metrics[key].totalTokens += cost.tokens;
      metrics[key].totalCost += cost.cost;
    }

    for (const key in metrics) {
      const m = metrics[key];
      m.avgCostPerToken = m.totalTokens > 0 ? m.totalCost / m.totalTokens : 0;
    }

    return {
      title: 'Performance Report',
      period: dateRange,
      summary: {
        totalRequests: costs.length,
        uniqueModels: Object.keys(metrics).length
      },
      details: Object.values(metrics)
    };
  }

  /**
   * Collects audit report data
   * @private
   */
  async _collectAuditData(dateRange, options) {
    if (!this.budgetManager) {
      throw new Error('BudgetManager required for audit reports');
    }

    const budgets = await this.budgetManager.getAllBudgets();
    const alerts = await this.budgetManager.getAlerts({ limit: 100 });
    const status = await this.budgetManager.getBudgetStatus();

    return {
      title: 'Budget Audit Report',
      period: dateRange,
      summary: {
        totalBudgets: budgets.length,
        totalAlerts: alerts.length,
        exceededBudgets: status.filter(s => s.status === 'exceeded').length
      },
      details: {
        budgets: status.map(s => ({
          id: s.id,
          limit: s.limit,
          spent: s.spent,
          remaining: s.remaining,
          percentage: s.percentage,
          status: s.status
        })),
        alerts: alerts.map(a => ({
          id: a.id,
          budgetId: a.budget_id,
          level: a.level,
          message: a.message,
          timestamp: new Date(a.timestamp).toISOString(),
          acknowledged: a.acknowledged === 1
        }))
      }
    };
  }

  /**
   * Formats report data for output
   * @private
   * @param {ReportData} data - Report data
   * @param {ReportFormat} format - Output format
   * @param {ReportType} type - Report type
   * @returns {Promise<string>} Formatted content
   */
  async _formatOutput(data, format, type) {
    switch (format) {
      case ReportGenerator.FORMATS.JSON:
        return JSON.stringify(data, null, 2);
      case ReportGenerator.FORMATS.CSV:
        return this._formatCsv(data);
      case ReportGenerator.FORMATS.HTML:
        return this._formatHtml(data, type);
      case ReportGenerator.FORMATS.PDF:
        // PDF would require additional library like puppeteer
        // For now, return HTML that can be converted
        return this._formatHtml(data, type);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Formats data as CSV
   * @private
   */
  _formatCsv(data) {
    const details = Array.isArray(data.details) ? data.details : [];
    if (details.length === 0) {
      return 'No data available\n';
    }

    const headers = Object.keys(details[0]);
    const rows = details.map(row => 
      headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Formats data as HTML
   * @private
   */
  _formatHtml(data, type) {
    const periodStr = `${this._formatDate(data.period.start)} to ${this._formatDate(data.period.end)}`;
    
    let detailsHtml = '';
    if (Array.isArray(data.details)) {
      if (data.details.length > 0) {
        const headers = Object.keys(data.details[0]);
        detailsHtml = `
          <table class="data-table">
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${data.details.map(row => 
                `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        `;
      }
    } else if (typeof data.details === 'object') {
      // Handle nested details (e.g., audit report)
      for (const [section, items] of Object.entries(data.details)) {
        if (Array.isArray(items) && items.length > 0) {
          const headers = Object.keys(items[0]);
          detailsHtml += `
            <h3>${section}</h3>
            <table class="data-table">
              <thead>
                <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${items.map(row => 
                  `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`
                ).join('')}
              </tbody>
            </table>
          `;
        }
      }
    }

    const summaryHtml = Object.entries(data.summary)
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return `<div class="summary-item"><strong>${key}:</strong><ul>${Object.entries(value).map(([k, v]) => `<li>${k}: ${v}</li>`).join('')}</ul></div>`;
        }
        return `<div class="summary-item"><strong>${key}:</strong> ${value}</div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${data.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .period { color: #666; font-style: italic; margin-bottom: 20px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .summary-item { margin: 10px 0; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .data-table th, .data-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .data-table th { background: #0066cc; color: white; }
    .data-table tr:hover { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${data.title}</h1>
  <div class="period">Period: ${periodStr}</div>
  <div class="summary">
    <h2>Summary</h2>
    ${summaryHtml}
  </div>
  <h2>Details</h2>
  ${detailsHtml}
</body>
</html>`;
  }

  /**
   * Lists previously generated reports
   * @param {Object} [options={}] - Query options
   * @param {ReportType} [options.type] - Filter by type
   * @param {number} [options.limit=50] - Maximum results
   * @returns {Promise<Array>} Report records
   */
  async listReports(options = {}) {
    if (!this.db) {
      throw new Error('ReportGenerator not initialized. Call init() first.');
    }

    let query = 'SELECT * FROM generated_reports';
    const params = [];

    if (options.type) {
      query += ' WHERE type = ?';
      params.push(options.type);
    }

    query += ' ORDER BY generated_at DESC LIMIT ?';
    params.push(options.limit || 50);

    const rows = await this.db.all(query, params);
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      format: row.format,
      filePath: row.file_path,
      generatedAt: new Date(row.generated_at),
      dateRange: {
        start: new Date(row.start_date),
        end: new Date(row.end_date)
      },
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  /**
   * Gets a previously generated report
   * @param {string} reportId - Report ID
   * @returns {Promise<ReportResult|null>} Report data
   */
  async getReport(reportId) {
    if (!this.db) {
      throw new Error('ReportGenerator not initialized. Call init() first.');
    }

    const row = await this.db.get('SELECT * FROM generated_reports WHERE id = ?', [reportId]);
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      format: row.format,
      content: row.content || row.file_path,
      generatedAt: new Date(row.generated_at),
      dateRange: {
        start: new Date(row.start_date),
        end: new Date(row.end_date)
      },
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  /**
   * Deletes a report
   * @param {string} reportId - Report ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteReport(reportId) {
    if (!this.db) {
      throw new Error('ReportGenerator not initialized. Call init() first.');
    }

    const result = await this.db.run('DELETE FROM generated_reports WHERE id = ?', [reportId]);
    return result.changes > 0;
  }
}

export default ReportGenerator;
