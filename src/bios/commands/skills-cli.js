/**
 * Skills CLI Commands
 * Manage and sync skills across AI clients
 * 
 * Commands:
 *   cognimesh skills list              - List all skills
 *   cognimesh skills create <name>     - Create a new skill
 *   cognimesh skills show <name>       - Show skill details
 *   cognimesh skills update <name>     - Update a skill
 *   cognimesh skills delete <name>     - Delete a skill
 *   cognimesh skills sync [--client <name>]  - Sync skills to clients
 *   cognimesh skills scan [--project <path>] - Scan project for skills
 */

import * as f from './utils/formatters.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { SkillService } from '../../domains/skills/skill-service.js';
import { SkillSync } from '../../domains/skills/skill-sync.js';

// Initialize services (singleton pattern)
let skillService = null;
let skillSync = null;

function getSkillService() {
  if (!skillService) {
    skillService = new SkillService();
  }
  return skillService;
}

function getSkillSync() {
  if (!skillSync) {
    skillSync = new SkillSync({ skillService: getSkillService() });
  }
  return skillSync;
}

// ==================== List Skills ====================

export async function listSkills(options = {}) {
  const service = getSkillService();
  
  const filters = {};
  if (options.status) filters.status = options.status;
  if (options.category) filters.category = options.category;
  if (options.tag) filters.tag = options.tag;

  const skills = service.listSkills(filters);

  let output = '';
  output += f.header('SKILLS', 'line');
  output += '\n\n';
  output += f.keyValue({
    Total: String(skills.length),
    Filter: options.status || options.category || options.tag || 'none'
  }, { indent: 2 });
  output += '\n\n';

  if (skills.length === 0) {
    output += f.info('No skills found. Use "cognimesh skills create <name>" to create one.');
    return { success: true, output, data: { skills: [] } };
  }

  const rows = skills.map(skill => ({
    Name: skill.name,
    Version: skill.version,
    Status: formatStatus(skill.status),
    Description: truncate(skill.description, 40),
    Updated: formatDate(skill.updatedAt)
  }));

  output += f.table(rows, {
    columns: ['Name', 'Version', 'Status', 'Description', 'Updated']
  });

  return {
    success: true,
    output,
    data: { skills, count: skills.length }
  };
}

// ==================== Create Skill ====================

export async function createSkill(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Skill name is required',
      output: f.error('Usage: cognimesh skills create <name>')
    };
  }

  if (!SkillService.isValidName(name)) {
    return {
      success: false,
      error: `Invalid skill name: ${name}`,
      output: f.error(`Invalid skill name "${name}". Must be lowercase kebab-case starting with a letter.`)
    };
  }

  const service = getSkillService();

  // Check if skill already exists
  const existing = service.getSkillByName(name, options.company);
  if (existing) {
    return {
      success: false,
      error: `Skill "${name}" already exists`,
      output: f.error(`Skill "${name}" already exists. Use "cognimesh skills update ${name}" to modify it.`)
    };
  }

  // Generate skill content from template
  const content = generateSkillTemplate(name, options);

  // Create skill
  try {
    const skill = service.createSkill({
      name,
      content,
      companyId: options.company,
      createdBy: options.createdBy
    });

    // Save to file if requested
    if (options.file) {
      const filePath = resolve(options.file);
      writeFileSync(filePath, content, 'utf-8');
    }

    let output = '';
    output += f.header('SKILL CREATED', 'line');
    output += '\n\n';
    output += f.keyValue({
      Name: skill.name,
      Version: skill.version,
      Status: skill.status,
      ID: skill.id
    }, { indent: 2 });
    output += '\n\n';
    output += f.success(`Skill "${skill.name}" created successfully.`);
    
    if (options.file) {
      output += '\n' + f.info(`Saved to: ${options.file}`);
    }

    return {
      success: true,
      output,
      data: { skill }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      output: f.error(`Failed to create skill: ${err.message}`)
    };
  }
}

// ==================== Show Skill ====================

export async function showSkill(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Skill name is required',
      output: f.error('Usage: cognimesh skills show <name>')
    };
  }

  const service = getSkillService();
  const skill = service.getSkill(name) || service.getSkillByName(name, options.company);

  if (!skill) {
    return {
      success: false,
      error: `Skill not found: ${name}`,
      output: f.error(`Skill "${name}" not found.`)
    };
  }

  // Get sync status
  const sync = getSkillSync();
  const syncStatus = sync.getSyncStatus(skill.id);

  // Get assignments
  const assignments = service.getSkillAssignments(skill.id);

  let output = '';
  output += f.header(skill.displayName.toUpperCase(), 'box');
  output += '\n\n';
  
  output += f.keyValue({
    ID: skill.id,
    Name: skill.name,
    'Display Name': skill.displayName,
    Version: skill.version,
    Status: formatStatus(skill.status),
    Description: skill.description,
    Created: formatDate(skill.createdAt),
    Updated: formatDate(skill.updatedAt)
  }, { indent: 2 });

  if (skill.tags?.length > 0) {
    output += '\n\n';
    output += f.colorize('Tags:', 'bright') + '\n';
    output += f.list(skill.tags, { indent: 2 });
  }

  if (skill.categories?.length > 0) {
    output += '\n';
    output += f.colorize('Categories:', 'bright') + '\n';
    output += f.list(skill.categories, { indent: 2 });
  }

  // Sync Status
  output += '\n\n';
  output += f.colorize('Sync Status:', 'bright') + '\n\n';
  
  const syncRows = Object.entries(syncStatus).map(([client, status]) => ({
    Client: client,
    Available: status.available ? f.colorize('yes', 'green') : f.colorize('no', 'red'),
    Synced: status.synced ? f.colorize('yes', 'green') : f.colorize('no', 'dim'),
    'Up to Date': status.upToDate ? f.colorize('yes', 'green') : (status.synced ? f.colorize('no', 'yellow') : '-')
  }));

  output += f.table(syncRows, {
    columns: ['Client', 'Available', 'Synced', 'Up to Date']
  });

  // Assignments
  if (assignments.length > 0) {
    output += '\n\n';
    output += f.colorize(`Assigned to (${assignments.length}):`, 'bright') + '\n';
    
    const assignRows = assignments.map(a => ({
      Type: a.assigneeType,
      ID: truncate(a.assigneeId, 20),
      Scope: a.scope,
      Assigned: formatDate(a.assignedAt)
    }));

    output += f.table(assignRows, {
      columns: ['Type', 'ID', 'Scope', 'Assigned']
    });
  }

  // Content preview
  if (!options.noContent) {
    output += '\n\n';
    output += f.colorize('Content Preview:', 'bright') + '\n';
    output += f.divider() + '\n';
    output += truncate(skill.content, 500) + '\n';
    output += f.divider();
  }

  return {
    success: true,
    output,
    data: { skill, syncStatus, assignments }
  };
}

// ==================== Update Skill ====================

export async function updateSkill(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Skill name is required',
      output: f.error('Usage: cognimesh skills update <name>')
    };
  }

  const service = getSkillService();
  const skill = service.getSkill(name) || service.getSkillByName(name, options.company);

  if (!skill) {
    return {
      success: false,
      error: `Skill not found: ${name}`,
      output: f.error(`Skill "${name}" not found.`)
    };
  }

  // Load new content from file if provided
  let content = options.content;
  if (options.file) {
    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
        output: f.error(`File not found: ${filePath}`)
      };
    }
    content = readFileSync(filePath, 'utf-8');
  }

  // Prepare updates
  const updates = {};
  if (content) updates.content = content;
  if (options.displayName) updates.displayName = options.displayName;
  if (options.status) updates.status = options.status;
  if (options.tags) updates.tags = options.tags.split(',').map(t => t.trim());
  if (options.categories) updates.categories = options.categories.split(',').map(c => c.trim());
  updates.changeNotes = options.changeNotes || 'Updated via CLI';
  updates.updatedBy = options.updatedBy;

  try {
    const updated = service.updateSkill(skill.id, updates, !options.noVersion);

    let output = '';
    output += f.header('SKILL UPDATED', 'line');
    output += '\n\n';
    output += f.keyValue({
      Name: updated.name,
      'Old Version': skill.version,
      'New Version': updated.version,
      Status: updated.status
    }, { indent: 2 });
    output += '\n\n';
    output += f.success(`Skill "${updated.name}" updated successfully.`);

    return {
      success: true,
      output,
      data: { skill: updated, previousVersion: skill.version }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      output: f.error(`Failed to update skill: ${err.message}`)
    };
  }
}

// ==================== Delete Skill ====================

export async function deleteSkill(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Skill name is required',
      output: f.error('Usage: cognimesh skills delete <name>')
    };
  }

  const service = getSkillService();
  const skill = service.getSkill(name) || service.getSkillByName(name, options.company);

  if (!skill) {
    return {
      success: false,
      error: `Skill not found: ${name}`,
      output: f.error(`Skill "${name}" not found.`)
    };
  }

  // Confirm deletion unless --force
  if (!options.force) {
    return {
      success: false,
      needsConfirmation: true,
      output: f.warning(`Are you sure you want to delete "${skill.name}"? Use --force to confirm.`)
    };
  }

  // Remove from clients first if --clean
  if (options.clean) {
    const sync = getSkillSync();
    await sync.removeSkill(skill.id);
  }

  // Delete skill
  const deleted = service.deleteSkill(skill.id);

  if (deleted) {
    return {
      success: true,
      output: f.success(`Skill "${skill.name}" has been archived.`),
      data: { name: skill.name, id: skill.id }
    };
  } else {
    return {
      success: false,
      error: 'Delete failed',
      output: f.error('Failed to delete skill.')
    };
  }
}

// ==================== Sync Skills ====================

export async function syncSkills(options = {}) {
  const sync = getSkillSync();

  // Check client availability
  const client = options.client || 'all';
  
  if (client !== 'all') {
    const detection = sync.detectClient(client);
    if (!detection.writable) {
      return {
        success: false,
        error: `Client "${client}" not available`,
        output: f.error(`Client "${client}" is not installed or not writable.`)
      };
    }
  }

  const spinner = f.createSpinner(`Syncing skills to ${client}`);
  
  if (!options.dryRun) {
    spinner.start();
  }

  try {
    const result = await sync.sync(client, {
      skillIds: options.skills?.split(',').map(s => s.trim()),
      mode: options.mode,
      dryRun: options.dryRun,
      cleanOrphaned: options.clean,
      force: options.force
    });

    if (!options.dryRun) {
      spinner.succeed(`Skills synced to ${client}`);
    }

    let output = '';
    output += f.header(options.dryRun ? 'SYNC PREVIEW' : 'SKILLS SYNCED', 'line');
    output += '\n\n';
    output += f.keyValue({
      Operation: result.operation,
      Client: result.client,
      'Total Skills': String(result.totalSkills),
      Synced: f.colorize(String(result.synced), 'green'),
      Failed: result.failed > 0 ? f.colorize(String(result.failed), 'red') : '0',
      Removed: result.removed > 0 ? f.colorize(String(result.removed), 'yellow') : '0',
      Duration: `${result.durationMs}ms`
    }, { indent: 2 });

    if (result.details.length > 0 && options.verbose) {
      output += '\n\n';
      output += f.colorize('Details:', 'bright') + '\n';
      
      const detailRows = result.details.slice(0, 20).map(d => ({
        Skill: d.skillId || d.skillName || '-',
        Client: d.client || '-',
        Status: formatSyncStatus(d.status),
        Info: d.error || d.reason || d.action || '-'
      }));

      output += f.table(detailRows, {
        columns: ['Skill', 'Client', 'Status', 'Info']
      });

      if (result.details.length > 20) {
        output += `\n... and ${result.details.length - 20} more`;
      }
    }

    return {
      success: result.failed === 0 || options.dryRun,
      output,
      data: result
    };
  } catch (err) {
    if (!options.dryRun) {
      spinner.fail(`Sync failed: ${err.message}`);
    }
    
    return {
      success: false,
      error: err.message,
      output: f.error(`Sync failed: ${err.message}`)
    };
  }
}

// ==================== Scan Skills ====================

export async function scanSkills(options = {}) {
  const projectPath = options.project ? resolve(options.project) : process.cwd();
  const service = getSkillService();

  if (!existsSync(projectPath)) {
    return {
      success: false,
      error: `Path not found: ${projectPath}`,
      output: f.error(`Path not found: ${projectPath}`)
    };
  }

  const spinner = f.createSpinner('Scanning for skills');
  spinner.start();

  // Scan .agents/skills/ directory
  const skillsDir = join(projectPath, '.agents', 'skills');
  let imported = [];

  if (existsSync(skillsDir)) {
    try {
      imported = service.scanDirectory(skillsDir, {
        companyId: options.company,
        createdBy: options.createdBy
      });
    } catch (err) {
      spinner.fail(`Scan failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
        output: f.error(`Scan failed: ${err.message}`)
      };
    }
  }

  // Also look for SKILL.md files in subdirectories
  const rootSkillFile = join(projectPath, 'SKILL.md');
  if (existsSync(rootSkillFile)) {
    try {
      const skill = service.importFromFile(rootSkillFile, {
        companyId: options.company,
        createdBy: options.createdBy
      });
      imported.push(skill);
    } catch {
      // Skip invalid root skill
    }
  }

  spinner.succeed(`Scan complete: ${imported.length} skills found`);

  let output = '';
  output += f.header('SKILL SCAN RESULTS', 'line');
  output += '\n\n';
  output += f.keyValue({
    'Scanned Path': projectPath,
    'Skills Found': String(imported.length)
  }, { indent: 2 });

  if (imported.length > 0) {
    output += '\n\n';
    const rows = imported.map(s => ({
      Name: s.name,
      Version: s.version,
      Status: formatStatus(s.status)
    }));

    output += f.table(rows, {
      columns: ['Name', 'Version', 'Status']
    });
  }

  return {
    success: true,
    output,
    data: { 
      scannedPath: projectPath, 
      skillsFound: imported.length,
      skills: imported 
    }
  };
}

// ==================== Helper Functions ====================

function formatStatus(status) {
  const colors = {
    active: 'green',
    deprecated: 'yellow',
    draft: 'cyan',
    archived: 'dim'
  };
  return f.colorize(status, colors[status] || 'white');
}

function formatSyncStatus(status) {
  const colors = {
    synced: 'green',
    removed: 'yellow',
    failed: 'red',
    skipped: 'dim',
    preview: 'cyan'
  };
  return f.colorize(status, colors[status] || 'white');
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function formatDate(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  return date.toLocaleDateString();
}

function generateSkillTemplate(name, options = {}) {
  const displayName = options.displayName || name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const description = options.description || `Description for ${displayName}`;
  
  return `---
name: ${name}
description: ${description}
tags: [${options.tags ? options.tags.split(',').map(t => `'${t.trim()}'`).join(', ') : ''}]
categories: [${options.categories ? options.categories.split(',').map(c => `'${c.trim()}'`).join(', ') : ''}]
---

# ${displayName}

## Overview

${description}

## When to Use

- Use this skill when...
- Apply this skill for...

## Instructions

### Step 1: Setup

Describe the initial setup steps here.

### Step 2: Execution

Describe the execution steps here.

### Step 3: Validation

Describe how to validate the results.

## Best Practices

1. Follow these guidelines
2. Consider these edge cases
3. Validate your work

## Examples

### Example 1: Basic Usage

\`\`\`
Show a simple example here
\`\`\`

### Example 2: Advanced Usage

\`\`\`
Show an advanced example here
\`\`\`

## References

- Related skills: 
- External docs:
`;
}

// ==================== Default Export ====================

export default {
  list: listSkills,
  create: createSkill,
  show: showSkill,
  update: updateSkill,
  delete: deleteSkill,
  sync: syncSkills,
  scan: scanSkills
};
