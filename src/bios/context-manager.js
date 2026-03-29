/**
 * Context Manager
 * Manages CLI profiles stored in ~/.cognimesh/profiles/
 * Handles loading, saving, validation, and merging with environment variables
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, basename, extname } from 'path';
import { homedir } from 'os';

// Constants
const COGNIMESH_DIR = join(homedir(), '.cognimesh');
const PROFILES_DIR = join(COGNIMESH_DIR, 'profiles');
const CURRENT_PROFILE_FILE = join(COGNIMESH_DIR, 'current-profile');
const DEFAULT_PROFILE_NAME = 'default';

/**
 * Profile Schema
 * @typedef {Object} Profile
 * @property {string} name - Profile name
 * @property {string} [apiUrl] - API base URL
 * @property {string} [companyId] - Company/organization ID
 * @property {string} [authToken] - Authentication token
 * @property {Object} [preferences] - User preferences
 * @property {string} preferences.defaultModel - Default AI model
 * @property {string} preferences.theme - UI theme preference
 * @property {boolean} preferences.autoSave - Auto-save preference
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} updatedAt - ISO timestamp of last update
 */

/**
 * Ensure profiles directory exists
 */
function ensureProfilesDir() {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get profile file path
 * @param {string} name - Profile name
 * @returns {string} Profile file path
 */
function getProfilePath(name) {
  // Sanitize profile name to prevent directory traversal
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(PROFILES_DIR, `${sanitized}.json`);
}

/**
 * Validate profile name
 * @param {string} name - Profile name to validate
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
function validateProfileName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Profile name is required' };
  }
  
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Profile name cannot be empty' };
  }
  
  if (trimmed.length > 50) {
    return { valid: false, error: 'Profile name cannot exceed 50 characters' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Profile name can only contain letters, numbers, hyphens, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Create a default profile structure
 * @param {string} name - Profile name
 * @returns {Profile} Default profile object
 */
function createDefaultProfile(name) {
  const now = new Date().toISOString();
  return {
    name,
    apiUrl: process.env.COGNIMESH_API_URL || 'http://localhost:3000',
    companyId: process.env.COGNIMESH_COMPANY_ID || '',
    authToken: process.env.COGNIMESH_AUTH_TOKEN || '',
    preferences: {
      defaultModel: 'auto',
      theme: 'system',
      autoSave: true
    },
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Normalize profile data
 * @param {Object} data - Raw profile data
 * @param {string} name - Profile name
 * @returns {Profile} Normalized profile
 */
function normalizeProfile(data, name) {
  const now = new Date().toISOString();
  return {
    name: name || data.name || DEFAULT_PROFILE_NAME,
    apiUrl: data.apiUrl || '',
    companyId: data.companyId || '',
    authToken: data.authToken || '',
    preferences: {
      defaultModel: data.preferences?.defaultModel || 'auto',
      theme: data.preferences?.theme || 'system',
      autoSave: data.preferences?.autoSave !== false
    },
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

/**
 * Load all available profiles
 * @returns {Profile[]} Array of profiles
 */
export function loadAllProfiles() {
  ensureProfilesDir();
  
  if (!existsSync(PROFILES_DIR)) {
    return [];
  }
  
  const files = readdirSync(PROFILES_DIR)
    .filter(f => extname(f) === '.json')
    .map(f => basename(f, '.json'));
  
  return files.map(name => loadProfile(name)).filter(Boolean);
}

/**
 * Load a specific profile
 * @param {string} name - Profile name
 * @returns {Profile|null} Profile object or null if not found
 */
export function loadProfile(name) {
  ensureProfilesDir();
  
  const profilePath = getProfilePath(name);
  
  if (!existsSync(profilePath)) {
    return null;
  }
  
  try {
    const data = JSON.parse(readFileSync(profilePath, 'utf-8'));
    return normalizeProfile(data, name);
  } catch (err) {
    console.error(`Failed to load profile "${name}": ${err.message}`);
    return null;
  }
}

/**
 * Save a profile
 * @param {string} name - Profile name
 * @param {Object} data - Profile data
 * @returns {Profile} Saved profile
 */
export function saveProfile(name, data) {
  ensureProfilesDir();
  
  const validation = validateProfileName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const profilePath = getProfilePath(name);
  const existing = loadProfile(name);
  
  const profile = normalizeProfile({
    ...(existing || {}),
    ...data,
    name
  }, name);
  
  profile.updatedAt = new Date().toISOString();
  
  // Write with restricted permissions (user read/write only)
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), { mode: 0o600 });
  
  return profile;
}

/**
 * Delete a profile
 * @param {string} name - Profile name to delete
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteProfile(name) {
  if (name === DEFAULT_PROFILE_NAME) {
    throw new Error('Cannot delete the default profile');
  }
  
  const profilePath = getProfilePath(name);
  
  if (!existsSync(profilePath)) {
    return false;
  }
  
  // Check if this is the current profile
  const current = getCurrentProfileName();
  if (current === name) {
    // Switch to default before deleting
    setCurrentProfileName(DEFAULT_PROFILE_NAME);
  }
  
  unlinkSync(profilePath);
  return true;
}

/**
 * Get the name of the current active profile
 * @returns {string} Current profile name
 */
export function getCurrentProfileName() {
  if (existsSync(CURRENT_PROFILE_FILE)) {
    try {
      const name = readFileSync(CURRENT_PROFILE_FILE, 'utf-8').trim();
      if (name && validateProfileName(name).valid) {
        return name;
      }
    } catch (err) {
      // Fall through to default
    }
  }
  return DEFAULT_PROFILE_NAME;
}

/**
 * Set the current active profile
 * @param {string} name - Profile name to set as current
 * @returns {boolean} True if set successfully
 */
export function setCurrentProfileName(name) {
  ensureProfilesDir();
  
  // Ensure profile exists (create if default)
  if (name === DEFAULT_PROFILE_NAME) {
    if (!loadProfile(name)) {
      saveProfile(name, createDefaultProfile(name));
    }
  } else if (!loadProfile(name)) {
    throw new Error(`Profile "${name}" does not exist`);
  }
  
  writeFileSync(CURRENT_PROFILE_FILE, name, { mode: 0o600 });
  return true;
}

/**
 * Get the current active profile with resolved values
 * @returns {Profile} Current profile
 */
export function getCurrentProfile() {
  const name = getCurrentProfileName();
  let profile = loadProfile(name);
  
  // Create default profile if none exists
  if (!profile) {
    profile = createDefaultProfile(name);
    saveProfile(name, profile);
  }
  
  return profile;
}

/**
 * Get current context with environment variable overrides
 * @returns {Object} Resolved context
 */
export function getCurrentContext() {
  const profile = getCurrentProfile();
  const profileName = getCurrentProfileName();
  
  // Environment variables take precedence
  return {
    profile: profileName,
    apiUrl: process.env.COGNIMESH_API_URL || profile.apiUrl,
    companyId: process.env.COGNIMESH_COMPANY_ID || profile.companyId,
    authToken: process.env.COGNIMESH_AUTH_TOKEN || profile.authToken,
    preferences: {
      ...profile.preferences,
      ...(process.env.COGNIMESH_DEFAULT_MODEL && { defaultModel: process.env.COGNIMESH_DEFAULT_MODEL }),
      ...(process.env.COGNIMESH_THEME && { theme: process.env.COGNIMESH_THEME })
    },
    sources: {
      apiUrl: process.env.COGNIMESH_API_URL ? 'env' : 'profile',
      companyId: process.env.COGNIMESH_COMPANY_ID ? 'env' : 'profile',
      authToken: process.env.COGNIMESH_AUTH_TOKEN ? 'env' : 'profile'
    }
  };
}

/**
 * Validate a profile configuration
 * @param {Object} profile - Profile to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateProfile(profile) {
  const errors = [];
  
  if (!profile) {
    return { valid: false, errors: ['Profile is required'] };
  }
  
  // Validate API URL if provided
  if (profile.apiUrl) {
    try {
      const url = new URL(profile.apiUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('API URL must use http or https protocol');
      }
    } catch {
      errors.push('API URL is not a valid URL');
    }
  }
  
  // Validate company ID if provided
  if (profile.companyId && typeof profile.companyId !== 'string') {
    errors.push('Company ID must be a string');
  }
  
  // Validate auth token if provided
  if (profile.authToken && profile.authToken.length < 10) {
    errors.push('Auth token seems too short (minimum 10 characters)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Export a profile to a JSON string
 * @param {string} name - Profile name to export
 * @returns {string|null} JSON string or null if profile not found
 */
export function exportProfile(name) {
  const profile = loadProfile(name);
  if (!profile) {
    return null;
  }
  
  return JSON.stringify(profile, null, 2);
}

/**
 * Import a profile from JSON data
 * @param {Object} data - Profile data to import
 * @param {string} [targetName] - Optional target name (uses data.name if not provided)
 * @returns {Profile} Imported profile
 */
export function importProfile(data, targetName) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid profile data: must be an object');
  }
  
  const name = targetName || data.name;
  if (!name) {
    throw new Error('Profile name is required (either in data or as targetName)');
  }
  
  const validation = validateProfileName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Remove internal fields that will be regenerated
  const cleanData = {
    apiUrl: data.apiUrl,
    companyId: data.companyId,
    authToken: data.authToken,
    preferences: data.preferences
  };
  
  const profile = saveProfile(name, cleanData);
  return profile;
}

/**
 * Check if a profile exists
 * @param {string} name - Profile name
 * @returns {boolean} True if profile exists
 */
export function profileExists(name) {
  return existsSync(getProfilePath(name));
}

/**
 * Initialize the context system
 * Creates default profile if none exists
 */
export function initializeContext() {
  ensureProfilesDir();
  
  // Create default profile if it doesn't exist
  if (!profileExists(DEFAULT_PROFILE_NAME)) {
    const defaultProfile = createDefaultProfile(DEFAULT_PROFILE_NAME);
    saveProfile(DEFAULT_PROFILE_NAME, defaultProfile);
  }
  
  // Set default as current if no current profile is set
  const current = getCurrentProfileName();
  if (!current || !profileExists(current)) {
    setCurrentProfileName(DEFAULT_PROFILE_NAME);
  }
}

// Default export for convenience
export default {
  loadProfile,
  loadAllProfiles,
  saveProfile,
  deleteProfile,
  getCurrentProfile,
  getCurrentProfileName,
  setCurrentProfileName,
  getCurrentContext,
  validateProfile,
  exportProfile,
  importProfile,
  profileExists,
  initializeContext
};
