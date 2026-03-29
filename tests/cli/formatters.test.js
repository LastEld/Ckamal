/**
 * @fileoverview Tests for CLI Formatters (table, JSON, progress bar, spinner)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/bios/commands/utils/formatters.js';

describe('CLI Formatters', () => {
  describe('colorize', () => {
    it('should colorize text with valid color', () => {
      const result = f.colorize('test', 'red');
      assert.ok(result.includes('test'));
    });

    it('should return plain text when color is not supported', () => {
      const originalForceColor = process.env.FORCE_COLOR;
      process.env.FORCE_COLOR = '0';
      
      const result = f.colorize('test', 'red');
      assert.strictEqual(result, 'test');
      
      process.env.FORCE_COLOR = originalForceColor;
    });

    it('should handle all color names', () => {
      const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'bright', 'dim'];
      colors.forEach(color => {
        const result = f.colorize('test', color);
        assert.ok(result.includes('test'));
      });
    });
  });

  describe('header', () => {
    it('should create box style header', () => {
      const result = f.header('Test Header', 'box');
      assert.ok(result.includes('Test Header'));
      assert.ok(result.includes('═'));
    });

    it('should create line style header', () => {
      const result = f.header('Test Header', 'line');
      assert.ok(result.includes('Test Header'));
      assert.ok(result.includes('─'));
    });

    it('should create double style header', () => {
      const result = f.header('Test Header', 'double');
      assert.ok(result.includes('Test Header'));
      assert.ok(result.includes('═'));
    });

    it('should create default style header', () => {
      const result = f.header('Test Header', 'default');
      assert.ok(result.includes('Test Header'));
    });
  });

  describe('table', () => {
    it('should create table from array data', () => {
      const data = [
        { Name: 'Alice', Age: '30' },
        { Name: 'Bob', Age: '25' }
      ];
      const result = f.table(data);
      
      assert.ok(result.includes('Alice'));
      assert.ok(result.includes('Bob'));
      assert.ok(result.includes('│'));
    });

    it('should handle empty data', () => {
      const result = f.table([]);
      assert.ok(result.includes('No data'));
    });

    it('should handle custom columns', () => {
      const data = [
        { Name: 'Alice', Age: '30', Hidden: 'value' }
      ];
      const result = f.table(data, { columns: ['Name', 'Age'] });
      
      assert.ok(result.includes('Alice'));
      assert.ok(result.includes('Age'));
    });
  });

  describe('list', () => {
    it('should create bulleted list', () => {
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const result = f.list(items);
      
      assert.ok(result.includes('Item 1'));
      assert.ok(result.includes('Item 2'));
      assert.ok(result.includes('•'));
    });

    it('should create numbered list', () => {
      const items = ['First', 'Second'];
      const result = f.list(items, { numbered: true });
      
      assert.ok(result.includes('1.'));
      assert.ok(result.includes('2.'));
    });

    it('should handle indentation', () => {
      const items = ['Item'];
      const result = f.list(items, { indent: 4 });
      
      assert.ok(result.includes('    '));
    });

    it('should handle custom bullet', () => {
      const items = ['Item'];
      const result = f.list(items, { bullet: '>' });
      
      assert.ok(result.includes('>'));
    });
  });

  describe('progressBar', () => {
    it('should create progress bar', () => {
      const result = f.progressBar(50, 100);
      
      assert.ok(result.includes('['));
      assert.ok(result.includes(']'));
      assert.ok(result.includes('50%'));
    });

    it('should show percentage', () => {
      const result = f.progressBar(75, 100, { showPercent: true });
      assert.ok(result.includes('75%'));
    });

    it('should show count', () => {
      const result = f.progressBar(5, 10, { showCount: true });
      assert.ok(result.includes('(5/10)'));
    });

    it('should handle 0%', () => {
      const result = f.progressBar(0, 100);
      assert.ok(result.includes('0%'));
    });

    it('should handle 100%', () => {
      const result = f.progressBar(100, 100);
      assert.ok(result.includes('100%'));
    });

    it('should cap at 100%', () => {
      const result = f.progressBar(150, 100);
      assert.ok(result.includes('100%'));
    });
  });

  describe('status indicators', () => {
    it('should create success status', () => {
      const result = f.status('success', 'Operation completed');
      assert.ok(result.includes('Operation completed'));
    });

    it('should create error status', () => {
      const result = f.status('error', 'Operation failed');
      assert.ok(result.includes('Operation failed'));
    });

    it('should create warning status', () => {
      const result = f.status('warning', 'Warning message');
      assert.ok(result.includes('Warning message'));
    });

    it('should create info status', () => {
      const result = f.status('info', 'Info message');
      assert.ok(result.includes('Info message'));
    });

    it('should create pending status', () => {
      const result = f.status('pending', 'Pending...');
      assert.ok(result.includes('Pending'));
    });

    it('should create running status', () => {
      const result = f.status('running', 'Running...');
      assert.ok(result.includes('Running'));
    });
  });

  describe('createSpinner', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = () => {};
    });

    afterEach(() => {
      consoleSpy = null;
    });

    it('should create spinner object', () => {
      const spinner = f.createSpinner('Loading');
      
      assert.ok(spinner);
      assert.strictEqual(typeof spinner.start, 'function');
      assert.strictEqual(typeof spinner.stop, 'function');
      assert.strictEqual(typeof spinner.succeed, 'function');
      assert.strictEqual(typeof spinner.fail, 'function');
    });

    it('should start spinner', () => {
      const spinner = f.createSpinner('Loading');
      const result = spinner.start();
      
      assert.strictEqual(result, spinner);
    });

    it('should stop spinner with success', () => {
      const spinner = f.createSpinner('Loading');
      spinner.start();
      const result = spinner.succeed('Done');
      
      assert.strictEqual(result, spinner);
    });

    it('should stop spinner with failure', () => {
      const spinner = f.createSpinner('Loading');
      spinner.start();
      const result = spinner.fail('Failed');
      
      assert.strictEqual(result, spinner);
    });

    it('should stop spinner with warning', () => {
      const spinner = f.createSpinner('Loading');
      spinner.start();
      const result = spinner.warn('Warning');
      
      assert.strictEqual(result, spinner);
    });
  });

  describe('tree', () => {
    it('should create tree view', () => {
      const items = [
        'Root',
        { label: 'Branch', children: ['Leaf 1', 'Leaf 2'] }
      ];
      const result = f.tree(items);
      
      assert.ok(result.includes('Root'));
      assert.ok(result.includes('Branch'));
      assert.ok(result.includes('├──'));
    });

    it('should handle nested items', () => {
      const items = [
        { label: 'Level 1', children: [
          { label: 'Level 2', children: ['Level 3'] }
        ]}
      ];
      const result = f.tree(items);
      
      assert.ok(result.includes('Level 1'));
      assert.ok(result.includes('Level 2'));
      assert.ok(result.includes('Level 3'));
    });
  });

  describe('divider', () => {
    it('should create divider with default width', () => {
      const result = f.divider();
      assert.ok(result.length > 0);
    });

    it('should create divider with custom char', () => {
      const result = f.divider('=');
      assert.ok(result.includes('='));
    });

    it('should create divider with custom width', () => {
      const result = f.divider('-', 20);
      assert.strictEqual(result.length, 20);
    });
  });

  describe('json', () => {
    it('should format JSON with indentation', () => {
      const data = { name: 'test', value: 123 };
      const result = f.json(data);
      
      assert.ok(result.includes('name'));
      assert.ok(result.includes('test'));
      assert.ok(result.includes('  '));
    });

    it('should format JSON without indentation', () => {
      const data = { name: 'test' };
      const result = f.json(data, false);
      assert.ok(!result.includes('\n  '));
    });
  });

  describe('keyValue', () => {
    it('should format key-value pairs', () => {
      const pairs = { Name: 'Alice', Age: '30' };
      const result = f.keyValue(pairs);
      
      assert.ok(result.includes('Name'));
      assert.ok(result.includes('Alice'));
      assert.ok(result.includes(':'))
    });

    it('should handle indentation', () => {
      const pairs = { Key: 'Value' };
      const result = f.keyValue(pairs, { indent: 4 });
      assert.ok(result.includes('    '));
    });

    it('should align keys', () => {
      const pairs = { Short: '1', LongerKey: '2' };
      const result = f.keyValue(pairs, { align: true });
      
      assert.ok(result.includes('Short'));
      assert.ok(result.includes('LongerKey'));
    });
  });

  describe('box', () => {
    it('should create box around content', () => {
      const result = f.box('Content');
      
      assert.ok(result.includes('Content'));
      assert.ok(result.includes('┌'));
      assert.ok(result.includes('┐'));
      assert.ok(result.includes('└'));
      assert.ok(result.includes('┘'));
    });

    it('should create box with title', () => {
      const result = f.box('Content', { title: 'Box Title' });
      
      assert.ok(result.includes('Content'));
      assert.ok(result.includes('Box Title'));
    });

    it('should handle multi-line content', () => {
      const result = f.box('Line 1\nLine 2\nLine 3');
      
      assert.ok(result.includes('Line 1'));
      assert.ok(result.includes('Line 2'));
      assert.ok(result.includes('Line 3'));
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      assert.strictEqual(f.formatDuration(500), '500ms');
    });

    it('should format seconds', () => {
      const result = f.formatDuration(5000);
      assert.ok(result.includes('s'));
    });

    it('should format minutes', () => {
      const result = f.formatDuration(120000);
      assert.ok(result.includes('m'));
    });

    it('should format hours', () => {
      const result = f.formatDuration(7200000);
      assert.ok(result.includes('h'));
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      assert.strictEqual(f.formatBytes(0), '0 B');
    });

    it('should format kilobytes', () => {
      const result = f.formatBytes(1024);
      assert.ok(result.includes('KB'));
    });

    it('should format megabytes', () => {
      const result = f.formatBytes(1024 * 1024);
      assert.ok(result.includes('MB'));
    });

    it('should format gigabytes', () => {
      const result = f.formatBytes(1024 * 1024 * 1024);
      assert.ok(result.includes('GB'));
    });
  });

  describe('convenience functions', () => {
    it('should create success message', () => {
      const result = f.success('Success!');
      assert.ok(result.includes('Success!'));
    });

    it('should create error message', () => {
      const result = f.error('Error!');
      assert.ok(result.includes('Error!'));
    });

    it('should create warning message', () => {
      const result = f.warning('Warning!');
      assert.ok(result.includes('Warning!'));
    });

    it('should create info message', () => {
      const result = f.info('Info');
      assert.ok(result.includes('Info'));
    });
  });
});
