/**
 * Doctor Checks Index
 * Exports all diagnostic check modules
 */

export { checkNodeVersion } from './node-version.js';
export { checkDatabase, repairDatabase } from './database.js';
export { checkEnvironment } from './environment.js';
export { checkPermissions, repairPermissions } from './permissions.js';
export { checkMigrations, repairMigrations } from './migrations.js';
export { checkAIClients } from './ai-clients.js';
export { checkPorts } from './ports.js';
export { checkDiskSpace } from './disk-space.js';
export { checkMemory } from './memory.js';
export { checkConfig } from './config.js';
export { checkGitHub } from './github.js';

// Default export with all checks in order
export default {
  nodeVersion: () => import('./node-version.js').then(m => m.checkNodeVersion()),
  environment: () => import('./environment.js').then(m => m.checkEnvironment()),
  repairEnvironment: () => import('./environment.js').then(m => m.repairEnvironment()),
  config: () => import('./config.js').then(m => m.checkConfig()),
  permissions: () => import('./permissions.js').then(m => m.checkPermissions()),
  database: () => import('./database.js').then(m => m.checkDatabase()),
  migrations: () => import('./migrations.js').then(m => m.checkMigrations()),
  aiClients: () => import('./ai-clients.js').then(m => m.checkAIClients()),
  ports: () => import('./ports.js').then(m => m.checkPorts()),
  diskSpace: () => import('./disk-space.js').then(m => m.checkDiskSpace()),
  memory: () => import('./memory.js').then(m => m.checkMemory()),
  github: () => import('./github.js').then(m => m.checkGitHub())
};
