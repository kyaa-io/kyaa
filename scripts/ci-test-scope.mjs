import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// SQL suites consume supabase/, scripts/ and worker output; unknown inputs run all suites.
export function databaseRequired(paths) {
  return paths.length === 0 || paths.some(path => !(
    /^apps\/web\/(app|components|features|server|hooks|lib|public|types|e2e)\/.+\.(ts|tsx|js|jsx|mjs|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(path)
    || /^docs\/.+\.md$/.test(path)
    || /^release-notes\/.+\.(json|md|png)$/.test(path)
  ));
}

export function selectDatabase(eventName, event, cwd = process.cwd()) {
  try {
    if (!['push', 'pull_request'].includes(eventName)) return true;
    let base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
    const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
    const sha = /^(?!0+$)[a-f0-9]{40}$/i;
    if (!sha.test(base ?? '') || !sha.test(head ?? '')) return true;
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
    if (eventName === 'pull_request') base = git('merge-base', base, head);
    else git('merge-base', '--is-ancestor', base, head);
    return databaseRequired(git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean));
  } catch {
    return true;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let database = true;
  try {
    database = selectDatabase(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  } catch { /* Missing event data must keep all checks. */ }
  console.log(`Database migration suites: ${database ? 'run' : 'unchanged inputs; skip'}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `database=${database}\n`);
}
