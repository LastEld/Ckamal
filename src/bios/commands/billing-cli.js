/**
 * Billing Commands
 * View billing summary, costs, budgets, and alerts
 */

import * as f from './utils/formatters.js';

/**
 * Get billing summary
 */
export async function getBillingSummary(options = {}) {
  const spinner = f.createSpinner('Fetching billing summary');
  spinner.start();

  await delay(400);

  const summary = {
    currentMonth: {
      total: 2847.50,
      currency: 'USD',
      usage: 2847.50,
      credits: 0,
      projected: 3250.00
    },
    previousMonth: {
      total: 2650.00,
      change: '+7.5%'
    },
    billingCycle: {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
      daysRemaining: 15
    },
    paymentStatus: 'current',
    nextInvoiceDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0]
  };

  spinner.succeed('Billing summary retrieved');

  let output = '\n';
  output += f.header('BILLING SUMMARY', 'box');
  output += '\n\n';

  output += f.keyValue({
    'Current Month': formatCurrency(summary.currentMonth.total),
    'Projected': formatCurrency(summary.currentMonth.projected),
    'vs Last Month': summary.previousMonth.change,
    'Billing Period': `${summary.billingCycle.start} to ${summary.billingCycle.end}`,
    'Days Remaining': `${summary.billingCycle.daysRemaining} days`,
    'Payment Status': formatPaymentStatus(summary.paymentStatus),
    'Next Invoice': summary.nextInvoiceDate
  }, { indent: 2 });

  output += '\n\n';
  output += f.colorize('Spending Trend:', 'bright') + '\n';
  output += '  ' + f.progressBar(summary.currentMonth.total, summary.currentMonth.projected, {
    width: 40,
    showPercent: true,
    showCount: false
  });

  return { success: true, output, data: summary };
}

/**
 * Get cost breakdown
 */
export async function getCosts(options = {}) {
  const days = parseInt(options.days) || 30;

  const spinner = f.createSpinner(`Fetching costs for last ${days} days`);
  spinner.start();

  await delay(300);

  // Sample cost breakdown by service
  const costsByService = [
    { service: 'AI Model API', category: 'Compute', cost: 1245.50, percentage: 43.7 },
    { service: 'Data Storage', category: 'Storage', cost: 420.00, percentage: 14.7 },
    { service: 'Compute Instances', category: 'Compute', cost: 680.25, percentage: 23.9 },
    { service: 'Bandwidth', category: 'Network', cost: 180.75, percentage: 6.3 },
    { service: 'Monitoring', category: 'Operations', cost: 95.00, percentage: 3.3 },
    { service: 'Support Plan', category: 'Support', cost: 226.00, percentage: 7.9 },
    { service: 'Miscellaneous', category: 'Other', cost: 5.00, percentage: 0.2 }
  ];

  const totalCost = costsByService.reduce((sum, item) => sum + item.cost, 0);

  // Daily costs for trend
  const dailyCosts = generateDailyCosts(days, totalCost);

  spinner.succeed(`Costs retrieved for last ${days} days`);

  let output = '\n';
  output += f.header(`COSTS - LAST ${days} DAYS`, 'line');
  output += '\n\n';

  output += f.colorize('Total:', 'bright') + ' ' + formatCurrency(totalCost) + '\n\n';

  // Service breakdown
  const serviceData = costsByService.map(item => ({
    Service: item.service.length > 22 ? item.service.substring(0, 19) + '...' : item.service,
    Category: item.category,
    Cost: formatCurrency(item.cost),
    '%': `${item.percentage.toFixed(1)}%`
  }));

  output += f.colorize('By Service:', 'bright') + '\n';
  output += f.table(serviceData, {
    columns: ['Service', 'Category', 'Cost', '%']
  });

  // Daily trend (if 7 days or less)
  if (days <= 7) {
    output += '\n\n';
    output += f.colorize('Daily Trend:', 'bright') + '\n';

    const maxCost = Math.max(...dailyCosts.map(d => d.cost));
    dailyCosts.forEach(day => {
      const barWidth = Math.round((day.cost / maxCost) * 30);
      const bar = '█'.repeat(barWidth);
      output += `  ${day.date} ${f.colorize(bar, 'cyan')} ${formatCurrency(day.cost)}\n`;
    });
  }

  return { success: true, output, data: { total: totalCost, byService: costsByService, daily: dailyCosts } };
}

/**
 * Get budgets
 */
export async function getBudgets(_options = {}) {
  const spinner = f.createSpinner('Fetching budgets');
  spinner.start();

  await delay(250);

  const budgets = [
    {
      id: 'BUD-001',
      name: 'Monthly AI Spending',
      amount: 1500.00,
      spent: 1245.50,
      alertAt: 80,
      period: 'monthly',
      status: 'active'
    },
    {
      id: 'BUD-002',
      name: 'Storage Costs',
      amount: 500.00,
      spent: 420.00,
      alertAt: 75,
      period: 'monthly',
      status: 'active'
    },
    {
      id: 'BUD-003',
      name: 'Compute Budget',
      amount: 1000.00,
      spent: 680.25,
      alertAt: 90,
      period: 'monthly',
      status: 'active'
    },
    {
      id: 'BUD-004',
      name: 'Q1 Total Spending',
      amount: 8000.00,
      spent: 7650.00,
      alertAt: 85,
      period: 'quarterly',
      status: 'warning'
    }
  ];

  spinner.succeed(`Found ${budgets.length} budgets`);

  let output = '\n';
  output += f.header('BUDGETS', 'line');
  output += '\n\n';

  budgets.forEach(budget => {
    const percentage = (budget.spent / budget.amount) * 100;
    const isAlert = percentage >= budget.alertAt;
    const isOver = percentage >= 100;

    output += f.box(
      f.keyValue({
        'Name': budget.name,
        'Period': budget.period,
        'Budget': formatCurrency(budget.amount),
        'Spent': formatCurrency(budget.spent),
        'Remaining': formatCurrency(budget.amount - budget.spent),
        'Alert At': `${budget.alertAt}%`
      }) + '\n\n' + f.progressBar(budget.spent, budget.amount, { width: 40, showPercent: true }),
      { title: `${budget.id} ${isOver ? f.colorize('[OVER]', 'red') : isAlert ? f.colorize('[WARNING]', 'yellow') : ''}`, width: 60 }
    );
    output += '\n';
  });

  // Summary
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);

  output += f.colorize('Overall:', 'bright') + '\n';
  output += `  Total Budget: ${formatCurrency(totalBudget)}\n`;
  output += `  Total Spent: ${formatCurrency(totalSpent)}\n`;
  output += `  Remaining: ${formatCurrency(totalBudget - totalSpent)}\n`;

  return { success: true, output, data: budgets };
}

/**
 * Get billing alerts
 */
export async function getAlerts(_options = {}) {
  const spinner = f.createSpinner('Fetching billing alerts');
  spinner.start();

  await delay(200);

  const alerts = [
    {
      id: 'ALERT-001',
      type: 'budget_warning',
      severity: 'warning',
      message: 'Q1 Total Spending budget is at 95.6%',
      triggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      acknowledged: false
    },
    {
      id: 'ALERT-002',
      type: 'spike_detected',
      severity: 'info',
      message: 'AI Model API costs increased 25% vs last week',
      triggeredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      acknowledged: false
    },
    {
      id: 'ALERT-003',
      type: 'anomaly',
      severity: 'warning',
      message: 'Unusual data transfer detected in us-east-1 region',
      triggeredAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      acknowledged: true
    }
  ];

  spinner.succeed(`Found ${alerts.length} alerts`);

  let output = '\n';
  output += f.header('BILLING ALERTS', 'line');
  output += '\n\n';

  // Unacknowledged alerts first
  const unacknowledged = alerts.filter(a => !a.acknowledged);
  const acknowledged = alerts.filter(a => a.acknowledged);

  if (unacknowledged.length > 0) {
    output += f.colorize(`Active Alerts (${unacknowledged.length}):`, 'bright') + '\n\n';

    unacknowledged.forEach(alert => {
      output += f.box(
        f.keyValue({
          'Type': formatAlertType(alert.type),
          'Severity': formatSeverity(alert.severity),
          'Message': alert.message,
          'Triggered': formatTimeAgo(alert.triggeredAt)
        }),
        { title: alert.id, width: 60 }
      );
      output += '\n';
    });
  }

  if (acknowledged.length > 0) {
    output += f.colorize(`Acknowledged (${acknowledged.length}):`, 'dim') + '\n\n';

    acknowledged.forEach(alert => {
      output += `  ${f.colorize('✓', 'dim')} ${f.colorize(alert.message, 'dim')} - ${formatTimeAgo(alert.triggeredAt)}\n`;
    });
  }

  if (alerts.length === 0) {
    output += f.success('No billing alerts at this time');
  }

  return { success: true, output, data: alerts };
}

// Helper functions
function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function formatPaymentStatus(status) {
  const colors = {
    current: f.colorize('current', 'green'),
    overdue: f.colorize('overdue', 'red'),
    pending: f.colorize('pending', 'yellow')
  };
  return colors[status] || status;
}

function formatAlertType(type) {
  const labels = {
    budget_warning: 'Budget Warning',
    budget_exceeded: 'Budget Exceeded',
    spike_detected: 'Spike Detected',
    anomaly: 'Anomaly Detected',
    forecast: 'Forecast Alert'
  };
  return labels[type] || type;
}

function formatSeverity(severity) {
  const colors = {
    info: f.colorize('info', 'blue'),
    warning: f.colorize('warning', 'yellow'),
    critical: f.colorize('critical', 'red')
  };
  return colors[severity] || severity;
}

function formatTimeAgo(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function generateDailyCosts(days, total) {
  const daily = [];
  const avgDaily = total / days;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    // Add some variance to daily costs
    const variance = (Math.random() - 0.5) * 0.4;
    const cost = avgDaily * (1 + variance);

    daily.push({
      date: date.toISOString().split('T')[0],
      cost: Math.max(0, cost)
    });
  }

  return daily;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  summary: getBillingSummary,
  costs: getCosts,
  budgets: getBudgets,
  alerts: getAlerts
};
