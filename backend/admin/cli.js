#!/usr/bin/env node
const readline = require('node:readline');
const { createInterface } = require('node:readline/promises');

// Raw terminal input: no echo, no password arguments, no environment password.
function hiddenQuestion(prompt, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('INTERACTIVE_TERMINAL_REQUIRED'));
  }
  return new Promise((resolve, reject) => {
    const wasRaw = !!input.isRaw;
    let characters = [];
    const cleanup = () => {
      input.removeListener('keypress', onKey);
      process.removeListener('SIGTERM', onTerminate);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
    };
    const onTerminate = () => { cleanup(); characters = []; reject(new Error('CANCELLED')); };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') return onTerminate();
      if (key.name === 'return' || key.name === 'enter') {
        const value = characters.join('');
        cleanup(); characters = []; resolve(value); return;
      }
      if (key.name === 'backspace') { characters.pop(); return; }
      if (key.ctrl || key.meta || !text || /[\u0000-\u001f\u007f]/.test(text)) return;
      if (characters.length < 73) characters.push(...Array.from(text).slice(0, 73 - characters.length));
    };
    output.write(prompt);
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.on('keypress', onKey);
    process.once('SIGTERM', onTerminate);
    input.resume();
  });
}

async function main() {
  const [command, username, value, ...extra] = process.argv.slice(2);
  if (command === '--help' || !command) {
    console.log('Usage: node admin/cli.js create | set-active <username> enabled|disabled | set-access <username> granted|revoked | grant-organization-permissions');
    return;
  }
  if (!['create', 'set-active', 'set-access', 'grant-organization-permissions'].includes(command) || extra.length
    || (['create', 'grant-organization-permissions'].includes(command) && (username || value))
    || (command === 'set-active' && !['enabled', 'disabled'].includes(value))
    || (command === 'set-access' && !['granted', 'revoked'].includes(value))) throw new Error('INVALID_COMMAND');
  if (command !== 'grant-organization-permissions' && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  require('dotenv').config({ quiet: true });
  let pool;
  try {
    pool = require('../db');
    const repository = require('./repositories/auth')(pool);
    await repository.ready();
    const provisioning = require('./services/provisioning')(repository);
    if (command === 'grant-organization-permissions') {
      await require('./services/organization-policy')(repository)();
      console.log('Organization read/select permissions granted to the platform administrator role and audited.');
    } else if (command === 'create') {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      let loginName, displayName;
      try {
        loginName = await terminal.question('Administrator username: ');
        displayName = await terminal.question('Display name: ');
      } finally { terminal.close(); }
      let password = await hiddenQuestion('Password (12+ characters, at most 72 UTF-8 bytes): ');
      let confirmation = await hiddenQuestion('Confirm password: ');
      try {
        if (password !== confirmation) throw new Error('PASSWORD_MISMATCH');
        await provisioning.create({ username: loginName, displayName, password });
      } finally { password = undefined; confirmation = undefined; }
      console.log('Administrator provisioned. No credentials are displayed.');
    } else {
      await provisioning.change(username, command === 'set-active' ? 'active' : 'access', ['enabled', 'granted'].includes(value));
      console.log('Access updated and audited. Existing sessions must sign in again.');
    }
  } finally { if (pool) await pool.end(); }
}

if (require.main === module) main().catch(error => {
  const safeMessages = {
    INTERACTIVE_TERMINAL_REQUIRED: 'Use an interactive terminal. Piped credentials are not accepted.',
    INVALID_COMMAND: 'Invalid command. Use --help. Password arguments are never accepted.',
    PASSWORD_MISMATCH: 'Passwords did not match. Nothing was provisioned.',
    CANCELLED: 'Cancelled.',
    INITIAL_POLICY_UNAVAILABLE: 'The initial administrator role is unavailable. Check its access policy.',
    ACCOUNT_NOT_FOUND: 'No matching platform account was found.',
  };
  console.error(safeMessages[error.message] || 'Operation failed. Check the migration, database connection, unique username, and input policy.');
  process.exitCode = 1;
});
module.exports = { hiddenQuestion };
