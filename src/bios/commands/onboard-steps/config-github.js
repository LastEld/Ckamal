/**
 * GitHub Configuration Step
 */

import { createInterface } from 'readline';
import * as f from '../utils/formatters.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function validateGitHubToken(token) {
  if (!token) return { valid: false, error: 'Token is empty' };
  
  // Basic format validation
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    return { valid: false, error: 'Invalid token format. Should start with ghp_ or github_pat_' };
  }

  // Try to validate with GitHub API
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.status === 200) {
      const user = await response.json();
      return { valid: true, user: user.login };
    } else if (response.status === 401) {
      return { valid: false, error: 'Token is invalid or expired' };
    } else {
      return { valid: false, error: `GitHub API error: ${response.status}` };
    }
  } catch (err) {
    return { valid: false, error: `Network error: ${err.message}`, offline: true };
  }
}

export async function configureGitHub(options = {}) {
  const { yes = false, token: providedToken } = options;
  
  console.log(f.colorize('Configuring GitHub integration...', 'cyan'));
  console.log();
  console.log(f.colorize('GitHub integration enables:', 'dim'));
  console.log(f.list([
    'Repository access and management',
    'Issue and PR tracking',
    'Automated workflows',
    'GitHub Actions integration'
  ], { indent: 2 }));
  console.log();

  if (!yes) {
    console.log(f.colorize('Create a token at:', 'dim'), 'https://github.com/settings/tokens');
    console.log(f.colorize('Required scopes:', 'dim'), 'repo, workflow, read:org');
    console.log();
  }

  let token = providedToken;
  let validationResult = null;

  if (!yes) {
    const input = await question(f.colorize('  GitHub token (or press Enter to skip): ', 'dim'));
    token = input.trim() || null;
  }

  if (token) {
    const spinner = f.createSpinner('Validating GitHub token...');
    spinner.start();
    
    validationResult = await validateGitHubToken(token);
    
    if (validationResult.valid) {
      spinner.succeed(`GitHub token valid (${validationResult.user})`);
    } else if (validationResult.offline) {
      spinner.warn(`Could not validate token (offline) - will save anyway`);
    } else {
      spinner.fail(`Invalid token: ${validationResult.error}`);
      
      if (!yes) {
        const retry = await question(f.colorize('  Continue with invalid token? [y/N]: ', 'dim'));
        if (retry.toLowerCase() !== 'y') {
          return {
            success: false,
            data: { step: 'config-github' },
            message: 'GitHub configuration cancelled'
          };
        }
      }
    }
  } else {
    console.log(f.warning('No GitHub token provided. You can add it later in .env'));
  }

  console.log();

  return {
    success: true,
    data: { 
      step: 'config-github', 
      token: token ? `${token.substring(0, 8)}...` : null,
      validated: validationResult?.valid || false,
      user: validationResult?.user || null
    },
    message: token ? 'GitHub token configured' : 'GitHub configuration skipped'
  };
}

export default configureGitHub;
