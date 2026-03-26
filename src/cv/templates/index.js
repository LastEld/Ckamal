/**
 * CV Templates Index
 * Exports all built-in CV templates
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const architect = require('./architect.json');
const developer = require('./developer.json');
const analyst = require('./analyst.json');
const tester = require('./tester.json');
const devops = require('./devops.json');
const gpt54Specialist = require('./gpt54-specialist.json');

export const templates = {
  architect,
  developer,
  analyst,
  tester,
  devops,
  gpt54Specialist
};

export {
  architect,
  developer,
  analyst,
  tester,
  devops,
  gpt54Specialist
};

export default templates;
