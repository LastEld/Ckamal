/**
 * Context/Profile Commands
 * Manage CLI profiles and contexts
 * 
 * Commands:
 *   cognimesh context list        - List all profiles
 *   cognimesh context create      - Create new profile
 *   cognimesh context switch      - Switch active profile
 *   cognimesh context delete      - Delete profile
 *   cognimesh context show        - Show profile details
 *   cognimesh context export      - Export profile to JSON
 *   cognimesh context import      - Import profile from JSON
 */

import * as f from './utils/formatters.js';
import {
  loadAllProfiles,
  loadProfile,
  saveProfile,
  deleteProfile as deleteProfileFn,
  getCurrentProfile,
  getCurrentProfileName,
  setCurrentProfileName,
  getCurrentContext,
  validateProfile,
  exportProfile,
  importProfile,
  profileExists
} from '../context-manager.js';

import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

/**
 * List all profiles
 */
export async function listProfiles(_options = {}) {
  const spinner = f.createSpinner('Loading profiles');
  spinner.start();
  
  const profiles = loadAllProfiles();
  const current = getCurrentProfileName();
  
  spinner.succeed('Profiles loaded');
  
  let output = '\n';
  output += f.header('PROFILES', 'box');
  output += '\n\n';
  
  if (profiles.length === 0) {
    output += f.warning('No profiles found');
    output += '\n' + f.colorize('Run: cognimesh context create <name>', 'cyan');
    return { success: true, output, data: [] };
  }
  
  const profileData = profiles.map(p => ({
    Name: p.name === current ? f.colorize(`${p.name} *`, 'green') : p.name,
    'API URL': p.apiUrl ? truncate(p.apiUrl, 30) : f.colorize('(not set)', 'dim'),
    'Company ID': p.companyId ? truncate(p.companyId, 20) : f.colorize('(not set)', 'dim'),
    Auth: p.authToken ? f.colorize('✓', 'green') : f.colorize('✗', 'red'),
    Updated: formatDate(p.updatedAt)
  }));
  
  output += f.table(profileData, {
    columns: ['Name', 'API URL', 'Company ID', 'Auth', 'Updated']
  });
  
  output += '\n\n';
  output += f.info(`${profiles.length} profile(s) total, "${current}" is active`);
  output += '\n' + f.colorize('* = active profile', 'dim');
  
  return { success: true, output, data: profiles };
}

/**
 * Create a new profile
 */
export async function createProfile(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Profile name is required',
      output: f.error('Usage: cognimesh context create <name>')
    };
  }
  
  // Check if profile already exists
  if (profileExists(name)) {
    return {
      success: false,
      error: `Profile "${name}" already exists`,
      output: f.error(`Profile "${name}" already exists. Use "cognimesh context switch ${name}" to activate it.`)
    };
  }
  
  const spinner = f.createSpinner(`Creating profile "${name}"`);
  spinner.start();
  
  try {
    const profileData = {
      apiUrl: options.apiUrl || process.env.COGNIMESH_API_URL || '',
      companyId: options.companyId || process.env.COGNIMESH_COMPANY_ID || '',
      authToken: options.authToken || process.env.COGNIMESH_AUTH_TOKEN || '',
      preferences: {
        defaultModel: options.defaultModel || 'auto',
        theme: options.theme || 'system'
      }
    };
    
    const profile = saveProfile(name, profileData);
    
    // Switch to the new profile if requested
    if (options.switch || options.activate) {
      setCurrentProfileName(name);
      spinner.succeed(`Profile "${name}" created and activated`);
    } else {
      spinner.succeed(`Profile "${name}" created`);
    }
    
    let output = '\n';
    output += f.success(`Profile "${name}" created successfully`);
    output += '\n\n';
    output += f.keyValue({
      'Profile': profile.name,
      'API URL': profile.apiUrl || f.colorize('(not set)', 'dim'),
      'Company ID': profile.companyId || f.colorize('(not set)', 'dim'),
      'Auth Token': profile.authToken ? maskToken(profile.authToken) : f.colorize('(not set)', 'dim'),
      'Default Model': profile.preferences.defaultModel,
      'Theme': profile.preferences.theme
    }, { indent: 2 });
    
    if (!options.switch && !options.activate) {
      output += '\n\n';
      output += f.colorize(`Run "cognimesh context switch ${name}" to activate this profile`, 'cyan');
    }
    
    return { success: true, output, data: profile };
  } catch (err) {
    spinner.fail(`Failed to create profile: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Switch to a different profile
 */
export async function switchProfile(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Profile name is required',
      output: f.error('Usage: cognimesh context switch <name>')
    };
  }
  
  // Check if profile exists
  if (!profileExists(name)) {
    const allProfiles = loadAllProfiles();
    let output = f.error(`Profile "${name}" does not exist`);
    
    if (allProfiles.length > 0) {
      output += '\n\n';
      output += f.colorize('Available profiles:', 'bright');
      allProfiles.forEach(p => {
        const marker = p.name === getCurrentProfileName() ? ' *' : '';
        output += `\n  ${f.colorize('•', 'cyan')} ${p.name}${marker}`;
      });
    }
    
    output += '\n\n';
    output += f.colorize(`Run "cognimesh context create ${name}" to create it`, 'cyan');
    
    return { success: false, error: `Profile "${name}" does not exist`, output };
  }
  
  const spinner = f.createSpinner(`Switching to profile "${name}"`);
  spinner.start();
  
  try {
    const previous = getCurrentProfileName();
    setCurrentProfileName(name);
    
    spinner.succeed(`Switched to profile "${name}"`);
    
    const profile = getCurrentProfile();
    
    let output = '\n';
    output += f.success(`Active profile: ${f.colorize(name, 'green')}`);
    
    if (previous !== name) {
      output += '\n' + f.colorize(`(was: ${previous})`, 'dim');
    }
    
    output += '\n\n';
    output += f.keyValue({
      'API URL': profile.apiUrl || f.colorize('(not set)', 'dim'),
      'Company ID': profile.companyId || f.colorize('(not set)', 'dim'),
      'Auth': profile.authToken ? f.colorize('configured', 'green') : f.colorize('not configured', 'yellow')
    }, { indent: 2 });
    
    return { success: true, output, data: profile };
  } catch (err) {
    spinner.fail(`Failed to switch profile: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a profile
 */
export async function deleteProfile(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Profile name is required',
      output: f.error('Usage: cognimesh context delete <name>')
    };
  }
  
  if (name === 'default' && !options.force) {
    return {
      success: false,
      error: 'Cannot delete the default profile',
      output: f.error('Cannot delete the default profile. Use --force to override.')
    };
  }
  
  if (!profileExists(name)) {
    return {
      success: false,
      error: `Profile "${name}" does not exist`,
      output: f.error(`Profile "${name}" does not exist`)
    };
  }
  
  const current = getCurrentProfileName();
  const isCurrent = current === name;
  
  let output = '\n';
  output += f.header('DELETE PROFILE', 'box');
  output += '\n\n';
  output += f.warning(`You are about to delete profile: ${f.colorize(name, 'bright')}`);
  
  if (isCurrent) {
    output += '\n' + f.warning('This is your currently active profile');
    output += '\n' + f.colorize('You will be switched to the default profile after deletion.', 'dim');
  }
  
  output += '\n\n';
  
  if (!options.force) {
    output += f.info('Use --force to skip confirmation');
    return { 
      success: false, 
      error: 'Confirmation required (use --force)',
      output 
    };
  }
  
  const spinner = f.createSpinner(`Deleting profile "${name}"`);
  spinner.start();
  
  try {
    deleteProfileFn(name);
    spinner.succeed(`Profile "${name}" deleted`);
    
    output += f.success(`Profile "${name}" has been deleted`);
    
    if (isCurrent) {
      output += '\n' + f.info(`Switched to default profile`);
    }
    
    return { success: true, output };
  } catch (err) {
    spinner.fail(`Failed to delete profile: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Show profile details
 */
export async function showProfile(name, options = {}) {
  const targetName = name || getCurrentProfileName();
  
  const spinner = f.createSpinner('Loading profile');
  spinner.start();
  
  const profile = loadProfile(targetName);
  
  if (!profile) {
    spinner.fail(`Profile "${targetName}" not found`);
    return {
      success: false,
      error: `Profile "${targetName}" does not exist`,
      output: f.error(`Profile "${targetName}" does not exist`)
    };
  }
  
  const current = getCurrentProfileName();
  const isActive = targetName === current;
  
  spinner.succeed('Profile loaded');
  
  let output = '\n';
  output += f.header(`PROFILE: ${targetName}${isActive ? ' (ACTIVE)' : ''}`, 'box');
  output += '\n\n';
  
  // Basic info
  output += f.colorize('Configuration:', 'bright');
  output += '\n';
  output += f.keyValue({
    'Name': profile.name,
    'API URL': profile.apiUrl || f.colorize('(not set)', 'dim'),
    'Company ID': profile.companyId || f.colorize('(not set)', 'dim'),
    'Auth Token': profile.authToken ? maskToken(profile.authToken) : f.colorize('(not set)', 'dim')
  }, { indent: 2 });
  
  output += '\n\n';
  output += f.colorize('Preferences:', 'bright');
  output += '\n';
  output += f.keyValue({
    'Default Model': profile.preferences.defaultModel,
    'Theme': profile.preferences.theme,
    'Auto Save': profile.preferences.autoSave ? 'enabled' : 'disabled'
  }, { indent: 2 });
  
  output += '\n\n';
  output += f.colorize('Metadata:', 'bright');
  output += '\n';
  output += f.keyValue({
    'Created': formatDateTime(profile.createdAt),
    'Updated': formatDateTime(profile.updatedAt),
    'Status': isActive ? f.colorize('active', 'green') : f.colorize('inactive', 'dim')
  }, { indent: 2 });
  
  // Validation
  const validation = validateProfile(profile);
  if (!validation.valid) {
    output += '\n\n';
    output += f.colorize('Validation Issues:', 'red');
    validation.errors.forEach(err => {
      output += `\n  ${f.colorize('•', 'yellow')} ${err}`;
    });
  }
  
  // Show resolved context if this is the current profile
  if (isActive && options.resolved) {
    output += '\n\n';
    output += f.colorize('Resolved Context (with environment overrides):', 'bright');
    const context = getCurrentContext();
    output += '\n';
    output += f.keyValue({
      'API URL': `${context.apiUrl} ${sourceTag(context.sources.apiUrl)}`,
      'Company ID': `${context.companyId || '(not set)'} ${sourceTag(context.sources.companyId)}`,
      'Auth Token': `${context.authToken ? maskToken(context.authToken) : '(not set)'} ${sourceTag(context.sources.authToken)}`
    }, { indent: 2 });
  }
  
  return { success: true, output, data: profile };
}

/**
 * Export a profile to JSON
 */
export async function exportProfileCmd(name, options = {}) {
  if (!name) {
    return {
      success: false,
      error: 'Profile name is required',
      output: f.error('Usage: cognimesh context export <name>')
    };
  }
  
  const spinner = f.createSpinner(`Exporting profile "${name}"`);
  spinner.start();
  
  const json = exportProfile(name);
  
  if (!json) {
    spinner.fail(`Profile "${name}" not found`);
    return {
      success: false,
      error: `Profile "${name}" does not exist`,
      output: f.error(`Profile "${name}" does not exist`)
    };
  }
  
  spinner.succeed('Profile exported');
  
  let output = '\n';
  output += f.header('EXPORTED PROFILE', 'box');
  output += '\n\n';
  output += f.json(JSON.parse(json));
  
  if (!options.file) {
    output += '\n\n';
    output += f.info('To save to a file, use: --file <path>');
  }
  
  return { 
    success: true, 
    output,
    data: { json, profile: JSON.parse(json) }
  };
}

/**
 * Import a profile from JSON file
 */
export async function importProfileCmd(filePath, options = {}) {
  if (!filePath) {
    return {
      success: false,
      error: 'File path is required',
      output: f.error('Usage: cognimesh context import <file>')
    };
  }
  
  // Resolve file path
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  
  if (!existsSync(resolvedPath)) {
    return {
      success: false,
      error: `File not found: ${filePath}`,
      output: f.error(`File not found: ${filePath}`)
    };
  }
  
  const spinner = f.createSpinner('Importing profile');
  spinner.start();
  
  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Use provided name or from file
    const targetName = options.name || data.name;
    
    if (!targetName) {
      spinner.fail('Profile name not found in import file');
      return {
        success: false,
        error: 'Profile name not found',
        output: f.error('Profile name not found in import file. Use --name to specify.')
      };
    }
    
    // Check if profile exists
    const exists = profileExists(targetName);
    if (exists && !options.force) {
      spinner.fail('Profile already exists');
      return {
        success: false,
        error: 'Profile already exists',
        output: f.error(`Profile "${targetName}" already exists. Use --force to overwrite.`)
      };
    }
    
    const profile = importProfile(data, targetName);
    
    spinner.succeed(`Profile "${targetName}" ${exists ? 'updated' : 'imported'}`);
    
    let output = '\n';
    output += f.success(`Profile "${targetName}" ${exists ? 'updated' : 'imported'} successfully`);
    output += '\n\n';
    output += f.keyValue({
      'Name': profile.name,
      'API URL': profile.apiUrl || f.colorize('(not set)', 'dim'),
      'Company ID': profile.companyId || f.colorize('(not set)', 'dim')
    }, { indent: 2 });
    
    if (options.switch) {
      setCurrentProfileName(targetName);
      output += '\n';
      output += f.info(`Switched to profile "${targetName}"`);
    } else {
      output += '\n';
      output += f.colorize(`Run "cognimesh context switch ${targetName}" to activate`, 'cyan');
    }
    
    return { success: true, output, data: profile };
  } catch (err) {
    spinner.fail(`Import failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      output: f.error(`Import failed: ${err.message}`)
    };
  }
}

// Helper functions
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString();
  } catch {
    return isoString;
  }
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function sourceTag(source) {
  if (source === 'env') {
    return f.colorize('[env]', 'cyan');
  }
  return f.colorize('[profile]', 'dim');
}

// Default export
export default {
  list: listProfiles,
  create: createProfile,
  switch: switchProfile,
  delete: deleteProfile,
  show: showProfile,
  export: exportProfileCmd,
  import: importProfileCmd
};
