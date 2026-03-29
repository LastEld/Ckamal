/**
 * Create Admin User Step
 */

import { createInterface } from 'readline';
import { randomBytes } from 'crypto';
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

function generateSecurePassword(length = 16) {
  return randomBytes(length).toString('base64').slice(0, length);
}

function validatePassword(password) {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < minLength) errors.push(`At least ${minLength} characters`);
  if (!hasUpper) errors.push('At least one uppercase letter');
  if (!hasLower) errors.push('At least one lowercase letter');
  if (!hasNumber) errors.push('At least one number');
  if (!hasSpecial) errors.push('At least one special character');

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function createAdmin(options = {}) {
  const { yes = false, username: providedUsername, password: providedPassword } = options;
  
  console.log(f.colorize('Creating admin user...', 'cyan'));
  console.log();

  let username = providedUsername;
  let password = providedPassword;
  let generatePassword = false;

  if (!yes) {
    // Get username
    if (!username) {
      const userInput = await question(f.colorize('  Admin username (default: admin): ', 'dim'));
      username = userInput.trim() || 'admin';
    }

    // Get password
    console.log();
    console.log(f.colorize('Password options:', 'dim'));
    console.log('  1. Generate secure password');
    console.log('  2. Enter custom password');
    const passChoice = await question(f.colorize('  Select option (1-2, default: 1): ', 'dim'));
    generatePassword = passChoice.trim() !== '2';

    if (generatePassword) {
      password = generateSecurePassword();
      console.log(f.success(`Generated password: ${password}`));
      console.log(f.warning('  Please save this password securely!'));
    } else {
      while (!password) {
        const passInput = await question(f.colorize('  Enter password: ', 'dim'));
        const validation = validatePassword(passInput);
        
        if (validation.valid) {
          const confirmPass = await question(f.colorize('  Confirm password: ', 'dim'));
          if (passInput === confirmPass) {
            password = passInput;
          } else {
            console.log(f.error('  Passwords do not match. Try again.'));
          }
        } else {
          console.log(f.error('  Password requirements:'));
          validation.errors.forEach(err => console.log(f.colorize(`    - ${err}`, 'dim')));
        }
      }
    }
  } else {
    // Automated mode defaults
    username = username || 'admin';
    password = password || generateSecurePassword();
    generatePassword = true;
  }

  console.log();
  console.log(f.colorize('Admin user configured:', 'cyan'));
  console.log(f.colorize('  Username:', 'cyan'), username);
  console.log(f.colorize('  Password:', 'cyan'), generatePassword ? `${password} (auto-generated)` : '********');
  console.log();

  return {
    success: true,
    data: { 
      step: 'create-admin', 
      username,
      password,
      generated: generatePassword
    },
    message: `Admin user '${username}' created`
  };
}

export default createAdmin;
