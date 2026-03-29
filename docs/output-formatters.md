# Ckamal CLI Output Formatters

Comprehensive output formatting system for the Ckamal CLI with support for multiple formats, color themes, and terminal capabilities.

## Table of Contents

- [Quick Start](#quick-start)
- [Global Format Options](#global-format-options)
- [Available Formats](#available-formats)
- [Format Examples](#format-examples)
- [Terminal Capabilities](#terminal-capabilities)
- [API Reference](#api-reference)

## Quick Start

```bash
# Use JSON output
cognimesh agents list --json

# Use CSV for data export
cognimesh issues list --csv > issues.csv

# Use YAML for configuration
cognimesh billing summary --yaml

# Disable colors
cognimesh status --no-color
```

## Global Format Options

The following options are available for all commands:

| Option | Short | Description |
|--------|-------|-------------|
| `--format <type>` | | Set output format (table, json, yaml, csv, tree, plain) |
| `--json` | | Shortcut for `--format json` |
| `--yaml` | | Shortcut for `--format yaml` |
| `--csv` | | Shortcut for `--format csv` |
| `--no-color` | | Disable colored output |
| `--no-pager` | | Disable pager for long output |
| `--quiet, -q` | | Suppress non-error output |
| `--verbose` | | Enable verbose output |
| `--stream` | | Enable streaming output mode |

## Available Formats

### Table Format (Default)

Best for interactive terminal viewing. Supports Unicode, ASCII, and compact styles.

```bash
cognimesh agents list
```

Features:
- Auto-sized columns
- Unicode box drawing characters
- Color-coded headers
- Truncation for long content
- Configurable alignment

### JSON Format

Machine-readable output with optional syntax highlighting.

```bash
cognimesh agents list --json
cognimesh agents list --json | jq '.agents[0].name'
```

Features:
- Pretty-printed with indentation
- Syntax highlighting (in TTY)
- Sort keys option
- Compact mode for pipes

### YAML Format

Human-readable structured data format.

```bash
cognimesh agents list --yaml
cognimesh config show --yaml
```

Features:
- Block scalars for multiline text
- Clean indentation
- Compatible with Kubernetes/YAML tools

### CSV Format

Spreadsheet-compatible output.

```bash
cognimesh issues list --csv > issues.csv
cognimesh tasks list --csv | xsv table
```

Features:
- RFC 4180 compliant
- Automatic field escaping
- Header row included
- Custom delimiter support

### Tree Format

Hierarchical data visualization.

```bash
cognimesh agents inspect sa-00 --format tree
cognimesh config show --format tree
```

Features:
- Branch drawing characters
- Nested object support
- Collapsible sections
- Color-coded keys

### Plain Format

Unformatted text output.

```bash
cognimesh status --format plain
```

## Format Examples

### Agents

```bash
# List all agents as table (default)
cognimesh agents list

# Export agents to JSON
cognimesh agents list --json > agents.json

# Export agents to CSV
cognimesh agents list --csv > agents.csv

# Get agent details as YAML
cognimesh agents inspect sa-00 --yaml

# Tree view of agent
cognimesh agents inspect sa-00 --format tree
```

### Tasks

```bash
# List tasks
cognimesh tasks list

# Export to CSV
cognimesh tasks list --csv > tasks.csv

# JSON with all details
cognimesh tasks get TASK-0001 --json
```

### Issues

```bash
# List issues
cognimesh issues list

# Export for analysis
cognimesh issues list --json | jq '.[] | select(.state == "open")'

# CSV for spreadsheet
cognimesh issues list --csv > issues.csv
```

### Billing/Cost

```bash
# Cost summary with visual bars (default)
cognimesh billing summary

# YAML for configuration export
cognimesh billing summary --yaml

# JSON for API integration
cognimesh billing summary --json
```

## Terminal Capabilities

The CLI automatically detects terminal capabilities:

### Auto-Detection

- **TTY Detection**: Determines if output is interactive or piped
- **Color Support**: Checks for color terminal support
- **Unicode Support**: Detects Unicode character support
- **Terminal Size**: Reads terminal width and height
- **Pager Availability**: Detects available pager (less, more)

### Environment Variables

Override auto-detection with environment variables:

```bash
# Force color output
export FORCE_COLOR=1

# Disable color
export NO_COLOR=1
export FORCE_COLOR=0

# Set default format
export CKAMAL_FORMAT=json

# Set preferred pager
export PAGER=less
```

### Pager Support

Long output is automatically paged:

```bash
# Use default pager
cognimesh agents list

# Disable pager
cognimesh agents list --no-pager
```

## API Reference

### Enhanced Formatters

Located in `src/bios/commands/utils/enhanced-formatters.js`:

```javascript
import * as ef from './utils/enhanced-formatters.js';

// Format data
ef.table(data, options);
ef.json(data, options);
ef.yaml(data, options);
ef.csv(data, options);
ef.tree(data, options);

// Progress and status
ef.progressBar(current, total, options);
ef.createSpinner(text, options);
ef.status(state, text);

// Utilities
ef.formatDuration(ms);
ef.formatBytes(bytes);
ef.formatNumber(num);
ef.formatDate(date, format);

// Layout
ef.header(text, style);
ef.box(content, options);
ef.keyValue(pairs, options);
ef.list(items, options);
```

### Output Manager

Located in `src/bios/commands/utils/output-manager.js`:

```javascript
import { OutputManager, formatAgentList } from './utils/output-manager.js';

// Create manager
const manager = new OutputManager({
  format: 'json',
  color: true,
  pager: true
});

// Render output
manager.render(data, 'json');

// Domain formatters
formatAgentList(agents, { format: 'table' });
formatAgentStatus(agent, { detailed: true });
formatIssueList(issues, { format: 'csv' });
formatCostSummary(summary, { format: 'table' });
formatApprovalList(approvals, { format: 'table' });
formatTaskOutput(tasks, { list: true });
```

### Color Themes

```javascript
import * as ef from './utils/enhanced-formatters.js';

// Set theme
ef.setTheme('default');   // Full colors
ef.setTheme('minimal');   // Reduced colors
ef.setTheme('nocolor');   // No colors

// Force color on/off
ef.setForceColor(true);
ef.setForceColor(false);
```

## Integration Guide

### Adding Format Support to Commands

```javascript
// In your command file
import { formatAgentList } from './utils/output-manager.js';

export async function listAgents(options = {}) {
  const agents = await fetchAgents();
  
  // Return structured data
  return {
    success: true,
    data: agents,
    // Domain formatter handles format selection
    output: formatAgentList(agents, { format: options.format })
  };
}
```

### CLI Integration

```javascript
// In cli.js
.command('agents list')
.action(async (options) => {
  this.initOutputManager();
  const result = await commands.agents.list(options);
  
  // Use output manager for consistent formatting
  if (result.data) {
    this.outputManager.render(result.data, this.program.opts().format);
  }
});
```

## Best Practices

1. **Use structured formats for scripts**: Use `--json` or `--csv` when piping to other tools
2. **Default to table for interactive use**: Table format is most readable in terminals
3. **Respect `--no-color`**: Always respect user's color preference
4. **Handle large outputs**: Use pager for potentially long output
5. **Export data in CSV**: Use CSV for data that might be imported to spreadsheets
6. **Use YAML for configs**: YAML is most readable for configuration data

## Troubleshooting

### No colors in output

```bash
# Check if TTY
echo $TERM

# Force color
cognimesh status --format table --no-color=false
export FORCE_COLOR=1
```

### Garbled characters

```bash
# Use ASCII style
cognimesh agents list --format table --style ascii

# Or disable Unicode
export TERM=dumb
```

### Pager not working

```bash
# Set pager explicitly
export PAGER=less

# Or disable pager
cognimesh agents list --no-pager
```
