/**
 * CogniMesh Welcome Screen
 * Renders a live status banner when the server starts
 */

/**
 * Render the welcome banner with live provider status
 * @param {Object} options - Server startup info
 * @param {number} options.initTime - Initialization time in ms
 * @param {string} options.httpPort - HTTP port
 * @param {string} options.dashboardPort - Dashboard port
 * @param {string} options.wsPath - WebSocket path
 * @param {number} options.toolCount - Number of registered tools
 * @param {Object} options.providers - Provider status { claude, codex, kimi }
 * @param {string} options.biosState - BIOS state
 */
export function renderWelcome(options = {}) {
  const {
    initTime = 0,
    httpPort = 3000,
    dashboardPort = 3001,
    wsPath = '/ws',
    toolCount = 0,
    providers = {},
    biosState = 'OPERATIONAL'
  } = options;

  const version = '5.0.0';

  const check = (ok) => ok ? '\x1b[32m\u2713\x1b[0m' : '\x1b[90m\u25CB\x1b[0m';
  const dim = (s) => `\x1b[90m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;

  const w = 52;
  const hr = '\u2550'.repeat(w);
  const line = '\u2500'.repeat(w);

  const pad = (text, width = w) => {
    // Strip ANSI codes for length calculation
    // eslint-disable-next-line no-control-regex
    const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - clean.length);
    return text + ' '.repeat(padding);
  };

  const claudeOk = providers.claude !== false;
  const codexOk = providers.codex !== false;
  const kimiOk = providers.kimi !== false;
  const providerCount = [claudeOk, codexOk, kimiOk].filter(Boolean).length;

  const lines = [
    `\u2554${hr}\u2557`,
    `\u2551  ${bold(`CogniMesh v${version}`)}${' '.repeat(w - 18)}\u2551`,
    `\u2551  ${dim('Multi-model AI orchestration')}${' '.repeat(w - 30)}\u2551`,
    `\u2560${line}\u2563`,
    `\u2551  ${bold('Providers:')}${' '.repeat(w - 12)}\u2551`,
    `\u2551    ${check(claudeOk)} Claude  ${dim('(Opus 4.6 / Sonnet 4.6)')}${' '.repeat(w - 38)}\u2551`,
    `\u2551    ${check(codexOk)} Codex   ${dim('(GPT-5.4 / GPT-5.3)')}${' '.repeat(w - 34)}\u2551`,
    `\u2551    ${check(kimiOk)} Kimi    ${dim('(K2.5)')}${' '.repeat(w - 21)}\u2551`,
    `\u2560${line}\u2563`,
    `\u2551  ${bold('Surfaces:')}${' '.repeat(w - 11)}\u2551`,
    `\u2551    ${check(true)} CLI        ${dim('\u2192 cognimesh ask "..."')}${' '.repeat(w - 36)}\u2551`,
    `\u2551    ${check(true)} Dashboard  ${dim(`\u2192 http://localhost:${dashboardPort}`)}${' '.repeat(w - 39 - String(dashboardPort).length)}\u2551`,
    `\u2551    ${check(true)} MCP        ${dim('\u2192 Claude Desktop ready')}${' '.repeat(w - 36)}\u2551`,
    `\u2551    ${check(true)} WebSocket  ${dim(`\u2192 ws://localhost:${httpPort}${wsPath}`)}${' '.repeat(w - 36 - String(httpPort).length - wsPath.length)}\u2551`,
    `\u2560${line}\u2563`,
    `\u2551  Router: ${green('READY')}  ${dim('\u2502')}  BIOS: ${green(biosState)}  ${dim('\u2502')}  Tools: ${cyan(String(toolCount))}${' '.repeat(Math.max(0, w - 40 - biosState.length - String(toolCount).length))}\u2551`,
    `\u2551  Boot: ${cyan(`${initTime}ms`)}  ${dim('\u2502')}  Providers: ${cyan(`${providerCount}/3`)}  ${dim('\u2502')}  PID: ${dim(String(process.pid))}${' '.repeat(Math.max(0, w - 40 - String(initTime).length - String(process.pid).length))}\u2551`,
    `\u255A${hr}\u255D`,
  ];

  console.log();
  lines.forEach(l => console.log(l));
  console.log();
}
