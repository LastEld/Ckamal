/**
 * GitHub Connectivity Check
 * Validates GitHub API access
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars

/**
 * Check GitHub connectivity
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkGitHub(_options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return {
      name: 'GitHub API',
      status: 'fail',
      message: 'GITHUB_TOKEN not configured',
      canRepair: false,
      repairHint: 'Set GITHUB_TOKEN environment variable with a valid GitHub Personal Access Token',
      details: { configured: false }
    };
  }

  // Basic token format validation
  if (token.length < 10) {
    return {
      name: 'GitHub API',
      status: 'fail',
      message: 'GITHUB_TOKEN appears invalid (too short)',
      canRepair: false,
      repairHint: 'Generate a new token at https://github.com/settings/tokens',
      details: { configured: true, valid: false }
    };
  }

  // Check token format (ghp_ for classic PATs, github_pat_ for fine-grained)
  const validPrefixes = ['ghp_', 'github_pat_'];
  const hasValidPrefix = validPrefixes.some(prefix => token.startsWith(prefix));

  if (!hasValidPrefix) {
    return {
      name: 'GitHub API',
      status: 'warn',
      message: 'GITHUB_TOKEN has unusual format (may be invalid)',
      canRepair: false,
      repairHint: 'Token should start with "ghp_" or "github_pat_". Verify token is valid.',
      details: {
        configured: true,
        format: 'unusual',
        expectedPrefixes: validPrefixes
      }
    };
  }

  // Try to make a test API call (optional, may fail in offline mode)
  let apiStatus = 'unknown';
  try {
    const { Octokit } = await import('octokit');
    const octokit = new Octokit({ auth: token });

    // Quick API test with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await octokit.rest.users.getAuthenticated({
      request: { signal: controller.signal }
    });

    clearTimeout(timeout);

    apiStatus = 'connected';
    const user = response.data.login;

    return {
      name: 'GitHub API',
      status: 'pass',
      message: `Connected as ${user}`,
      details: {
        configured: true,
        valid: true,
        user,
        apiStatus
      }
    };

  } catch (err) {
    // API call failed but token format is valid
    if (err.name === 'AbortError') {
      return {
        name: 'GitHub API',
        status: 'warn',
        message: 'API request timed out (offline?)',
        canRepair: false,
        repairHint: 'Check internet connection. Token appears valid but API is unreachable.',
        details: {
          configured: true,
          valid: true,
          apiStatus: 'timeout'
        }
      };
    }

    if (err.status === 401) {
      return {
        name: 'GitHub API',
        status: 'fail',
        message: 'Invalid credentials (401)',
        canRepair: false,
        repairHint: 'Token is invalid or expired. Generate a new token at https://github.com/settings/tokens',
        details: {
          configured: true,
          valid: false,
          error: err.message
        }
      };
    }

    // Other errors (rate limit, network, etc)
    return {
      name: 'GitHub API',
      status: 'warn',
      message: `Token valid, API check failed: ${err.message}`,
      canRepair: false,
      repairHint: 'Token format is valid. API may be temporarily unavailable.',
      details: {
        configured: true,
        valid: true,
        apiStatus: 'error',
        error: err.message
      }
    };
  }
}

export default checkGitHub;
