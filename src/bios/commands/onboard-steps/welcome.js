/**
 * Welcome Step - Display welcome banner and intro
 */

import * as f from '../utils/formatters.js';

export async function showWelcome() {
  console.log(f.header('COGNIMESH ONBOARDING WIZARD', 'box'));
  console.log();
  console.log(f.colorize('Welcome to CogniMesh v5.0! 🧠', 'bright'));
  console.log();
  console.log('This wizard will guide you through setting up your multi-agent');
  console.log('orchestration platform in just a few minutes.');
  console.log();
  console.log(f.colorize('What we\'ll configure:', 'cyan'));
  console.log(f.list([
    'Prerequisites (Node.js, Git)',
    'Data directory and storage',
    'GitHub integration',
    'AI client connections (Claude, Codex, Kimi)',
    'Deployment mode',
    'Admin user',
    'Database setup',
    'Service startup'
  ], { indent: 2 }));
  console.log();
  
  return { success: true, data: { step: 'welcome' } };
}

export default showWelcome;
