/**
 * GitHub CLI Commands
 * Interact with GitHub repositories, issues, and pull requests
 * 
 * Commands:
 * - cognimesh github repos [list]          List repositories
 * - cognimesh github repos search <query>  Search repositories
 * - cognimesh github repo <owner>/<repo>   Show repository details
 * - cognimesh github issues <repo>         List issues
 * - cognimesh github issues sync <repo>    Sync issues bidirectionally
 * - cognimesh github prs <repo>            List pull requests
 * - cognimesh github pr <repo> <number>    Show PR details
 * - cognimesh github releases <repo>       List releases
 */

import * as f from './utils/formatters.js';

// In-memory storage for demo/development
const syncStore = new Map();

// Helper to parse repo string
function parseRepo(repoString) {
  if (!repoString || !repoString.includes('/')) {
    throw new Error(`Invalid repository format. Expected 'owner/repo', got: ${repoString}`);
  }
  const [owner, repo] = repoString.split('/');
  return { owner, repo };
}

// Simulate API delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// REPOSITORY COMMANDS
// ============================================================================

/**
 * List repositories for the authenticated user
 */
export async function listRepos(options = {}) {
  const spinner = f.createSpinner('Fetching repositories');
  spinner.start();

  await delay(500);

  // Sample repositories for demo
  const repos = [
    {
      id: 1,
      name: 'cognimesh',
      fullName: 'acme-corp/cognimesh',
      description: 'Multi-agent orchestration platform',
      private: true,
      stars: 42,
      forks: 8,
      openIssues: 12,
      language: 'JavaScript',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 2,
      name: 'dashboard',
      fullName: 'acme-corp/dashboard',
      description: 'Analytics dashboard with real-time updates',
      private: true,
      stars: 15,
      forks: 3,
      openIssues: 5,
      language: 'TypeScript',
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 3,
      name: 'api-gateway',
      fullName: 'acme-corp/api-gateway',
      description: 'API gateway service',
      private: false,
      stars: 128,
      forks: 24,
      openIssues: 23,
      language: 'Go',
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 4,
      name: 'mobile-app',
      fullName: 'acme-corp/mobile-app',
      description: 'React Native mobile application',
      private: true,
      stars: 8,
      forks: 2,
      openIssues: 18,
      language: 'TypeScript',
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // Apply filters
  let filtered = repos;
  if (options.type === 'public') {
    filtered = repos.filter(r => !r.private);
  } else if (options.type === 'private') {
    filtered = repos.filter(r => r.private);
  }

  spinner.succeed(`Found ${filtered.length} repositories`);

  let output = '\n';
  output += f.header('GITHUB REPOSITORIES', 'line');
  output += '\n\n';

  const repoData = filtered.map(repo => ({
    Name: f.colorize(repo.name, 'cyan'),
    Visibility: repo.private ? f.colorize('● private', 'yellow') : f.colorize('○ public', 'green'),
    Stars: `⭐ ${repo.stars}`,
    Issues: repo.openIssues > 0 ? f.colorize(repo.openIssues.toString(), 'red') : '0',
    Language: repo.language || '-',
    Updated: formatTimeAgo(repo.updatedAt)
  }));

  output += f.table(repoData, {
    columns: ['Name', 'Visibility', 'Stars', 'Issues', 'Language', 'Updated']
  });

  // Summary
  const totalStars = filtered.reduce((sum, r) => sum + r.stars, 0);
  const totalIssues = filtered.reduce((sum, r) => sum + r.openIssues, 0);

  output += '\n\n';
  output += f.colorize('Summary:', 'bright') + ' ';
  output += `${filtered.length} repos | ${totalStars} ⭐ | ${totalIssues} open issues`;

  return { success: true, output, data: filtered };
}

/**
 * Search repositories on GitHub
 */
export async function searchRepos(query, _options = {}) {
  if (!query) {
    return {
      success: false,
      error: 'Search query is required',
      output: f.error('Search query is required. Usage: cognimesh github repos search <query>')
    };
  }

  const spinner = f.createSpinner(`Searching for "${query}"`);
  spinner.start();

  await delay(800);

  // Sample search results
  const results = [
    {
      fullName: 'facebook/react',
      description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
      stars: 228000,
      language: 'JavaScript',
      updatedAt: '2024-01-15T10:30:00Z'
    },
    {
      fullName: 'vuejs/vue',
      description: 'This is the repo for Vue 2. For Vue 3, go to https://github.com/vuejs/core',
      stars: 206000,
      language: 'JavaScript',
      updatedAt: '2024-01-10T08:15:00Z'
    },
    {
      fullName: 'angular/angular',
      description: 'The modern web developer\'s platform',
      stars: 95000,
      language: 'TypeScript',
      updatedAt: '2024-01-14T16:45:00Z'
    }
  ];

  spinner.succeed(`Found ${results.length} results`);

  let output = '\n';
  output += f.header(`SEARCH: "${query}"`, 'line');
  output += '\n\n';

  results.forEach((repo, i) => {
    output += `${f.colorize(`${i + 1}.`, 'dim')} ${f.colorize(repo.fullName, 'cyan')} ${f.colorize('⭐ ' + formatNumber(repo.stars), 'yellow')}\n`;
    output += `   ${repo.description}\n`;
    output += `   ${f.colorize(repo.language, 'magenta')} • Updated ${formatTimeAgo(repo.updatedAt)}\n`;
    if (i < results.length - 1) output += '\n';
  });

  return { success: true, output, data: results };
}

/**
 * Show repository details
 */
export async function showRepo(repoString, _options = {}) {
  try {
    const { owner, repo } = parseRepo(repoString);

    const spinner = f.createSpinner('Fetching repository details');
    spinner.start();

    await delay(600);

    // Sample repo details
    const details = {
      name: repo,
      fullName: `${owner}/${repo}`,
      description: 'Multi-agent orchestration platform with dashboard',
      private: false,
      fork: false,
      createdAt: '2023-06-15T08:30:00Z',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      pushedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      stars: 128,
      forks: 24,
      openIssues: 23,
      watchers: 45,
      defaultBranch: 'main',
      language: 'JavaScript',
      languages: {
        JavaScript: 65.4,
        TypeScript: 22.1,
        CSS: 8.5,
        HTML: 4.0
      },
      topics: ['ai', 'multi-agent', 'orchestration', 'dashboard'],
      license: 'MIT',
      size: 24580 // KB
    };

    spinner.succeed('Repository details loaded');

    let output = '\n';
    output += f.header(details.fullName, 'box');
    output += '\n\n';

    output += f.keyValue({
      'Description': details.description,
      'Visibility': details.private ? f.colorize('● Private', 'yellow') : f.colorize('○ Public', 'green'),
      'Default Branch': f.colorize(details.defaultBranch, 'cyan'),
      'License': details.license,
      'Size': formatBytes(details.size * 1024)
    }, { indent: 2 });

    output += '\n\n';
    output += f.colorize('Statistics:', 'bright') + '\n';
    output += f.keyValue({
      '⭐ Stars': formatNumber(details.stars),
      '🍴 Forks': formatNumber(details.forks),
      '⚠️  Open Issues': details.openIssues,
      '👁  Watchers': formatNumber(details.watchers)
    }, { indent: 4 });

    output += '\n\n';
    output += f.colorize('Languages:', 'bright') + '\n';
    Object.entries(details.languages).forEach(([lang, pct]) => {
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      output += `  ${f.colorize(bar, getLanguageColor(lang))} ${lang} ${pct}%\n`;
    });

    if (details.topics.length > 0) {
      output += '\n';
      output += f.colorize('Topics:', 'bright') + '\n  ';
      output += details.topics.map(t => f.colorize(t, 'blue')).join(' ');
    }

    output += '\n\n';
    output += f.colorize('Timeline:', 'bright') + '\n';
    output += f.keyValue({
      'Created': new Date(details.createdAt).toLocaleDateString(),
      'Last Updated': formatTimeAgo(details.updatedAt),
      'Last Push': formatTimeAgo(details.pushedAt)
    }, { indent: 2 });

    return { success: true, output, data: details };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

// ============================================================================
// ISSUE COMMANDS
// ============================================================================

/**
 * List issues in a repository
 */
export async function listIssues(repoString, options = {}) {
  try {
    const { owner, repo } = parseRepo(repoString);

    const spinner = f.createSpinner(`Fetching issues from ${owner}/${repo}`);
    spinner.start();

    await delay(600);

    // Sample issues
    const issues = [
      {
        number: 42,
        title: 'API timeout on large dataset queries',
        state: 'open',
        author: 'johndoe',
        labels: [{ name: 'bug', color: 'd73a4a' }, { name: 'priority:high', color: 'ffa500' }],
        comments: 5,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        number: 41,
        title: 'Add dark mode support to dashboard',
        state: 'open',
        author: 'janesmith',
        labels: [{ name: 'feature', color: 'a2eeef' }, { name: 'status:in-progress', color: '8b5cf6' }],
        comments: 12,
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        number: 38,
        title: 'Update documentation for v2 API',
        state: 'open',
        author: 'bobwilson',
        labels: [{ name: 'documentation', color: '0075ca' }],
        comments: 0,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        number: 35,
        title: 'Memory leak in WebSocket connections',
        state: 'closed',
        author: 'alicebrown',
        labels: [{ name: 'bug', color: 'd73a4a' }, { name: 'priority:critical', color: 'dc2626' }],
        comments: 8,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Apply filters
    let filtered = issues;
    if (options.state) {
      filtered = issues.filter(i => i.state === options.state);
    }
    if (options.label) {
      filtered = issues.filter(i => 
        i.labels.some(l => l.name === options.label)
      );
    }

    spinner.succeed(`Found ${filtered.length} issues`);

    let output = '\n';
    output += f.header(`ISSUES: ${owner}/${repo}`, 'line');
    output += '\n\n';

    filtered.forEach(issue => {
      const stateIcon = issue.state === 'open' 
        ? f.colorize('●', 'green') 
        : f.colorize('●', 'red');
      
      const labels = issue.labels.map(l => 
        f.colorize(l.name, 'white', `#${l.color}`)
      ).join(' ');

      output += `${stateIcon} ${f.colorize(`#${issue.number}`, 'cyan')} ${issue.title}\n`;
      output += `   ${f.colorize(issue.author, 'yellow')} • ${formatTimeAgo(issue.updatedAt)}`;
      if (issue.comments > 0) {
        output += ` • 💬 ${issue.comments}`;
      }
      output += '\n';
      if (labels) {
        output += `   ${labels}\n`;
      }
      output += '\n';
    });

    // Summary
    const open = filtered.filter(i => i.state === 'open').length;
    const closed = filtered.filter(i => i.state === 'closed').length;

    output += f.colorize('Summary:', 'bright') + ' ';
    output += `${f.colorize(`${open} open`, 'green')} | ${f.colorize(`${closed} closed`, 'red')}`;

    return { success: true, output, data: filtered };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

/**
 * Sync issues between Ckamal and GitHub
 */
export async function syncIssues(repoString, options = {}) {
  try {
    const { owner, repo } = parseRepo(repoString);

    const spinner = f.createSpinner(`Syncing issues for ${owner}/${repo}`);
    spinner.start();

    await delay(1500);

    // Simulate sync results
    const results = {
      direction: options.direction || 'bidirectional',
      toGitHub: {
        created: 3,
        updated: 5,
        failed: 0
      },
      fromGitHub: {
        created: 2,
        updated: 1,
        skipped: 4,
        failed: 0
      },
      commentsSynced: 12
    };

    // Store sync record
    const syncId = `sync_${Date.now()}`;
    syncStore.set(syncId, {
      id: syncId,
      owner,
      repo,
      ...results,
      timestamp: new Date().toISOString()
    });

    spinner.succeed('Issue sync completed');

    let output = '\n';
    output += f.header(`SYNC COMPLETE: ${owner}/${repo}`, 'line');
    output += '\n\n';

    output += f.box(
      f.keyValue({
        'Direction': results.direction,
        'Sync ID': syncId,
        'Timestamp': new Date().toLocaleString()
      }), { title: 'Sync Details', width: 60 }
    );

    output += '\n\n';
    output += f.colorize('Ckamal → GitHub:', 'bright') + '\n';
    output += `  ${f.colorize(results.toGitHub.created.toString(), 'green')} created\n`;
    output += `  ${f.colorize(results.toGitHub.updated.toString(), 'cyan')} updated\n`;
    if (results.toGitHub.failed > 0) {
      output += `  ${f.colorize(results.toGitHub.failed.toString(), 'red')} failed\n`;
    }

    output += '\n';
    output += f.colorize('GitHub → Ckamal:', 'bright') + '\n';
    output += `  ${f.colorize(results.fromGitHub.created.toString(), 'green')} created\n`;
    output += `  ${f.colorize(results.fromGitHub.updated.toString(), 'cyan')} updated\n`;
    output += `  ${f.colorize(results.fromGitHub.skipped.toString(), 'dim')} skipped (up to date)\n`;
    if (results.fromGitHub.failed > 0) {
      output += `  ${f.colorize(results.fromGitHub.failed.toString(), 'red')} failed\n`;
    }

    output += '\n';
    output += f.colorize('Comments:', 'bright') + ` ${results.commentsSynced} synced`;

    return { success: true, output, data: results };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

/**
 * Show issue details
 */
export async function showIssue(repoString, issueNumber, _options = {}) {
  try {
    parseRepo(repoString);
    const num = parseInt(issueNumber);

    if (isNaN(num)) {
      throw new Error(`Invalid issue number: ${issueNumber}`);
    }

    const spinner = f.createSpinner('Fetching issue details');
    spinner.start();

    await delay(500);

    // Sample issue
    const issue = {
      number: num,
      title: 'API timeout on large dataset queries',
      body: `When querying datasets over 100k records, the API times out after 30s.

## Steps to Reproduce
1. Create a dataset with >100k records
2. Query with GET /api/v1/data?limit=100000
3. Observe timeout after 30s

## Expected Behavior
Query should complete or paginate appropriately.

## Environment
- Node.js 18
- PostgreSQL 15`,
      state: 'open',
      author: 'johndoe',
      assignees: ['janesmith'],
      labels: [
        { name: 'bug', color: 'd73a4a' },
        { name: 'priority:high', color: 'ffa500' }
      ],
      milestone: 'v2.1',
      comments: [
        {
          author: 'janesmith',
          body: 'Looking into this. I think we need to increase the connection pool size.',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          author: 'bobwilson',
          body: 'I can reproduce this on staging. The issue seems to be in the query builder.',
          createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    };

    spinner.succeed('Issue loaded');

    let output = '\n';
    output += f.header(`#${issue.number}: ${issue.title.substring(0, 40)}${issue.title.length > 40 ? '...' : ''}`, 'box');
    output += '\n\n';

    output += f.keyValue({
      'State': issue.state === 'open' 
        ? f.colorize('● Open', 'green') 
        : f.colorize('● Closed', 'red'),
      'Author': f.colorize(`@${issue.author}`, 'yellow'),
      'Assignees': issue.assignees.map(a => f.colorize(`@${a}`, 'cyan')).join(', '),
      'Milestone': issue.milestone,
      'Created': new Date(issue.createdAt).toLocaleDateString(),
      'Updated': formatTimeAgo(issue.updatedAt)
    }, { indent: 2 });

    output += '\n\n';
    output += f.colorize('Labels:', 'bright') + ' ';
    output += issue.labels.map(l => 
      f.colorize(l.name, 'white', `#${l.color}`)
    ).join(' ');

    output += '\n\n';
    output += f.colorize('Description:', 'bright') + '\n';
    output += f.box(issue.body, { width: 80 });

    if (issue.comments.length > 0) {
      output += '\n\n';
      output += f.colorize(`Comments (${issue.comments.length}):`, 'bright') + '\n';
      
      issue.comments.forEach(comment => {
        output += '\n';
        output += f.colorize(`@${comment.author}`, 'yellow') + ' ';
        output += f.colorize(formatTimeAgo(comment.createdAt), 'dim') + '\n';
        output += comment.body + '\n';
      });
    }

    return { success: true, output, data: issue };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

// ============================================================================
// PULL REQUEST COMMANDS
// ============================================================================

/**
 * List pull requests
 */
export async function listPRs(repoString, _options = {}) {
  try {
    const { owner, repo } = parseRepo(repoString);

    const spinner = f.createSpinner(`Fetching PRs from ${owner}/${repo}`);
    spinner.start();

    await delay(600);

    // Sample PRs
    const prs = [
      {
        number: 156,
        title: 'Add GitHub integration for issue sync',
        state: 'open',
        author: 'developer1',
        head: 'feature/github-sync',
        base: 'main',
        draft: false,
        labels: [{ name: 'enhancement', color: 'a2eeef' }],
        checks: { status: 'passing', count: 12 },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      },
      {
        number: 155,
        title: 'Fix memory leak in WebSocket handler',
        state: 'open',
        author: 'developer2',
        head: 'fix/websocket-leak',
        base: 'main',
        draft: false,
        labels: [{ name: 'bug', color: 'd73a4a' }],
        checks: { status: 'pending', count: 8 },
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        number: 152,
        title: 'WIP: Dashboard v2 redesign',
        state: 'open',
        author: 'designer1',
        head: 'feat/dashboard-v2',
        base: 'main',
        draft: true,
        labels: [{ name: 'feature', color: 'a2eeef' }],
        checks: { status: 'none', count: 0 },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    spinner.succeed(`Found ${prs.length} pull requests`);

    let output = '\n';
    output += f.header(`PULL REQUESTS: ${owner}/${repo}`, 'line');
    output += '\n\n';

    prs.forEach(pr => {
      const stateIcon = pr.draft 
        ? f.colorize('◐', 'dim') 
        : f.colorize('◉', 'green');
      
      const checkIcon = pr.checks.status === 'passing' 
        ? f.colorize('✓', 'green')
        : pr.checks.status === 'pending'
        ? f.colorize('○', 'yellow')
        : f.colorize('✗', 'red');

      output += `${stateIcon} ${checkIcon} ${f.colorize(`#${pr.number}`, 'cyan')} ${pr.title}\n`;
      output += `   ${f.colorize(pr.head, 'magenta')} → ${f.colorize(pr.base, 'cyan')} • ${f.colorize(`@${pr.author}`, 'yellow')}\n`;
      output += `   ${formatTimeAgo(pr.updatedAt)}`;
      if (pr.checks.count > 0) {
        output += ` • ${pr.checks.count} checks`;
      }
      output += '\n\n';
    });

    return { success: true, output, data: prs };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

/**
 * Show pull request details
 */
export async function showPR(repoString, prNumber, _options = {}) {
  try {
    parseRepo(repoString);
    const num = parseInt(prNumber);

    if (isNaN(num)) {
      throw new Error(`Invalid PR number: ${prNumber}`);
    }

    const spinner = f.createSpinner('Fetching PR details');
    spinner.start();

    await delay(600);

    // Sample PR
    const pr = {
      number: num,
      title: 'Add GitHub integration for issue sync',
      body: `This PR adds comprehensive GitHub integration including:

- Two-way issue synchronization
- Pull request tracking
- Webhook support
- Label mapping

## Changes
- New GitHubService class
- REST API endpoints
- CLI commands

## Testing
- [x] Unit tests
- [x] Integration tests
- [ ] Manual testing`,
      state: 'open',
      draft: false,
      author: 'developer1',
      head: { ref: 'feature/github-sync', sha: 'abc1234' },
      base: { ref: 'main', sha: 'def5678' },
      labels: [{ name: 'enhancement', color: 'a2eeef' }],
      assignees: ['maintainer1'],
      reviewers: ['maintainer2', 'maintainer3'],
      additions: 1250,
      deletions: 180,
      changedFiles: 8,
      mergeable: true,
      mergeableState: 'clean',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    };

    spinner.succeed('PR loaded');

    let output = '\n';
    output += f.header(`PR #${pr.number}: ${pr.title.substring(0, 35)}${pr.title.length > 35 ? '...' : ''}`, 'box');
    output += '\n\n';

    output += f.keyValue({
      'State': pr.draft 
        ? f.colorize('◐ Draft', 'dim') 
        : f.colorize('◉ Open', 'green'),
      'Author': f.colorize(`@${pr.author}`, 'yellow'),
      'Branch': `${f.colorize(pr.head.ref, 'magenta')} → ${f.colorize(pr.base.ref, 'cyan')}`,
      'Mergeable': pr.mergeable 
        ? f.colorize('✓ Yes', 'green') 
        : f.colorize('✗ No', 'red'),
      'Created': new Date(pr.createdAt).toLocaleDateString(),
      'Updated': formatTimeAgo(pr.updatedAt)
    }, { indent: 2 });

    output += '\n\n';
    output += f.colorize('Changes:', 'bright') + '\n';
    output += `  ${f.colorize(`+${pr.additions}`, 'green')} / ${f.colorize(`-${pr.deletions}`, 'red')} in ${pr.changedFiles} files`;

    if (pr.assignees.length > 0) {
      output += '\n\n';
      output += f.colorize('Assignees:', 'bright') + ' ';
      output += pr.assignees.map(a => f.colorize(`@${a}`, 'cyan')).join(', ');
    }

    if (pr.reviewers.length > 0) {
      output += '\n';
      output += f.colorize('Reviewers:', 'bright') + ' ';
      output += pr.reviewers.map(r => f.colorize(`@${r}`, 'cyan')).join(', ');
    }

    output += '\n\n';
    output += f.colorize('Description:', 'bright') + '\n';
    output += f.box(pr.body, { width: 80 });

    return { success: true, output, data: pr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

// ============================================================================
// RELEASE COMMANDS
// ============================================================================

/**
 * List releases
 */
export async function listReleases(repoString, _options = {}) {
  try {
    const { owner, repo } = parseRepo(repoString);

    const spinner = f.createSpinner(`Fetching releases from ${owner}/${repo}`);
    spinner.start();

    await delay(500);

    // Sample releases
    const releases = [
      {
        id: 1,
        tagName: 'v2.1.0',
        name: 'Version 2.1.0',
        body: '## Features\n- Added GitHub integration\n- New dashboard widgets\n\n## Bug Fixes\n- Fixed memory leak\n- Improved error handling',
        draft: false,
        prerelease: false,
        author: 'maintainer1',
        assets: [
          { name: 'cognimesh-2.1.0.tar.gz', size: 2458000 },
          { name: 'cognimesh-2.1.0.zip', size: 3120000 }
        ],
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        tagName: 'v2.0.1',
        name: 'Version 2.0.1 - Hotfix',
        body: '## Bug Fixes\n- Fixed critical authentication bug',
        draft: false,
        prerelease: false,
        author: 'maintainer1',
        assets: [],
        createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
        publishedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 3,
        tagName: 'v2.1.0-beta',
        name: 'Version 2.1.0 Beta',
        body: 'Beta release for testing',
        draft: true,
        prerelease: true,
        author: 'developer1',
        assets: [],
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        publishedAt: null
      }
    ];

    spinner.succeed(`Found ${releases.length} releases`);

    let output = '\n';
    output += f.header(`RELEASES: ${owner}/${repo}`, 'line');
    output += '\n\n';

    releases.forEach(release => {
      const status = release.draft 
        ? f.colorize('[DRAFT]', 'yellow')
        : release.prerelease
        ? f.colorize('[PRE]', 'magenta')
        : f.colorize('[RELEASE]', 'green');

      output += `${status} ${f.colorize(release.tagName, 'cyan')} ${release.name}\n`;
      output += `   By ${f.colorize(`@${release.author}`, 'yellow')} • ${formatTimeAgo(release.publishedAt || release.createdAt)}\n`;
      
      if (release.assets.length > 0) {
        output += `   ${release.assets.length} assets (${formatBytes(release.assets.reduce((a, b) => a + b.size, 0))})\n`;
      }
      output += '\n';
    });

    return { success: true, output, data: releases };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: f.error(error.message)
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getLanguageColor(lang) {
  const colors = {
    JavaScript: 'yellow',
    TypeScript: 'blue',
    Python: 'green',
    Go: 'cyan',
    Rust: 'red',
    Java: 'magenta',
    CSS: 'blue',
    HTML: 'red'
  };
  return colors[lang] || 'white';
}

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

export const commands = {
  repos: {
    default: listRepos,
    list: listRepos,
    search: searchRepos
  },
  repo: showRepo,
  issues: {
    default: listIssues,
    list: listIssues,
    sync: syncIssues,
    show: showIssue
  },
  prs: listPRs,
  pr: showPR,
  releases: listReleases
};

export default {
  listRepos,
  searchRepos,
  showRepo,
  listIssues,
  syncIssues,
  showIssue,
  listPRs,
  showPR,
  listReleases,
  commands
};
