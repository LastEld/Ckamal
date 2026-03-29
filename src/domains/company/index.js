/**
 * @fileoverview Company Domain - Multi-tenant organization management
 * @module domains/company
 * 
 * Entry point for the company domain, exporting company management functionality
 * including multi-tenant support, role-based permissions, and member management.
 * 
 * @example
 * ```javascript
 * import { CompanyDomain } from './domains/company/index.js';
 * 
 * const companyDomain = new CompanyDomain();
 * const company = companyDomain.createCompany({ name: 'Acme Inc' }, 'creator-123');
 * ```
 */

export { CompanyDomain } from './company-domain.js';
export { CompanyRepository, CompanyMembershipRepository } from './company-repository.js';
