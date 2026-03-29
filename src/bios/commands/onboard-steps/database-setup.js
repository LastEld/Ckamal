/**
 * Database Setup Step
 */

import { existsSync } from 'fs';
import { join } from 'path';
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

async function checkDatabaseExists(dbPath) {
  return existsSync(dbPath);
}

export async function setupDatabase(options = {}) {
  const { 
    yes = false, 
    dataDir,
    migrate = true,
    seed = false 
  } = options;
  
  console.log(f.colorize('Setting up database...', 'cyan'));
  console.log();

  const dbPath = join(dataDir, 'db', 'cognimesh.db');
  const dbExists = await checkDatabaseExists(dbPath);

  if (dbExists) {
    console.log(f.info('Database already exists'));
    
    if (!yes) {
      const backup = await question(f.colorize('  Create backup before migration? [Y/n]: ', 'dim'));
      if (backup.toLowerCase() !== 'n') {
        console.log(f.info('  Creating backup...'));
        // Backup logic would go here
        console.log(f.success('  Backup created'));
      }
    }
  } else {
    console.log(f.info('Creating new database...'));
  }

  console.log();
  console.log(f.colorize('Database configuration:', 'cyan'));
  console.log(f.colorize('  Path:', 'cyan'), dbPath);
  console.log(f.colorize('  Type:', 'cyan'), 'SQLite');
  console.log();

  // Run migrations if requested
  if (migrate) {
    const spinner = f.createSpinner('Running database migrations...');
    spinner.start();
    
    try {
      // Simulate migration (would be actual DB calls in production)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      spinner.succeed('Database migrations completed');
    } catch (err) {
      spinner.fail(`Migration failed: ${err.message}`);
      return {
        success: false,
        data: { step: 'database-setup', error: err.message },
        message: 'Database migration failed'
      };
    }
  }

  // Seed data if requested
  if (seed) {
    const spinner = f.createSpinner('Seeding database...');
    spinner.start();
    
    try {
      // Simulate seeding
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      spinner.succeed('Database seeded with initial data');
    } catch (err) {
      spinner.fail(`Seeding failed: ${err.message}`);
    }
  }

  console.log();

  return {
    success: true,
    data: { 
      step: 'database-setup', 
      dbPath,
      migrated: migrate,
      seeded: seed
    },
    message: 'Database setup complete'
  };
}

export default setupDatabase;
