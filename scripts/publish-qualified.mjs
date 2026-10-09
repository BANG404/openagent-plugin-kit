#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { packageDigest } from '../lib/development-state.mjs';

// This explicit host CLI uses the operator's GitHub login. It is never run by
// the development stop hook or relayed through a plugin Host Bridge.
const [evidenceFile, owner, artifactRoot, authorization] = process.argv.slice(2);
if (!/^[A-Za-z0-9-]+$/.test(owner ?? '') || !artifactRoot || authorization !== '--publish-public')
  throw new Error('Usage: bun scripts/publish-qualified.mjs <candidates.json> <owner> <artifacts> --publish-public. Obtain explicit repository naming/publication authorization first.');
const evidence = JSON.parse(await readFile(evidenceFile, 'utf8'));
await mkdir(artifactRoot, { recursive: true });
const publication = [];
function command(executable, args, cwd) {
  return execFileSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim();
}
for (const candidate of evidence.candidates) {
  const state = candidate.state;
  const root = state.package;
  const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
  const repo = `${owner}/openagent-${manifest.name}`;
  if (state.status !== 'accepted' || manifest.repository !== 'https://github.com/' + repo)
    throw new Error('Accepted state and authorized repository must agree: ' + repo);
  const digest = await packageDigest(root);
  for (const gate of ['validation', 'tests', 'runtime'])
    if (!state.evidence[gate]?.passed || state.evidence[gate].digest !== digest) throw new Error('Missing or stale gate: ' + repo + '/' + gate);
  const runtimeReport = JSON.parse(await readFile(state.evidence.runtime.report_path, 'utf8'));
  if (!runtimeReport.passed || runtimeReport.digest !== digest) throw new Error('Invalid Runtime report');
  if (manifest.name === 'fakechat') {
    const channel = JSON.parse(await readFile(state.evidence.channel?.report_path ?? '', 'utf8'));
    if (!channel.passed || channel.digest !== digest || !channel.checks.some(check => check.kind === 'inbound_host_agent_reply' && check.passed)) throw new Error('Fakechat publication requires current-byte receive/Agent/reply qualification');
  }
  let initialized = false;
  try { initialized = command('git', ['rev-parse', '--show-toplevel'], root).replaceAll('\\', '/').toLowerCase() === root.replaceAll('\\', '/').toLowerCase(); } catch {}
  if (!initialized) {
    command('git', ['init', '--initial-branch=main'], root);
    command('git', ['config', 'core.autocrlf', 'false'], root);
    command('git', ['add', '.'], root);
    command('git', ['commit', '-m', 'feat: adapt upstream integration for OpenAgent'], root);
  }
  if (command('git', ['status', '--porcelain'], root)) throw new Error('Publication requires clean package source');
  const commit = command('git', ['rev-parse', 'HEAD'], root);
  let exists = false;
  try { const current = JSON.parse(command('gh', ['repo', 'view', repo, '--json', 'visibility,url'], root)); if (current.visibility !== 'PUBLIC') throw new Error('Existing repository is not public'); exists = true; }
  catch (error) { if (!/Could not resolve to a Repository/.test(String(error.stderr))) throw error; }
  if (!exists) command('gh', ['repo', 'create', repo, '--public', '--source', root, '--remote', 'origin'], root);
  if (command('git', ['remote', 'get-url', 'origin'], root) !== `https://github.com/${repo}.git`) throw new Error('Unexpected origin');
  command('git', ['push', '-u', 'origin', 'main'], root);
  const tag = 'v' + manifest.version;
  const asset = `${manifest.name}-${manifest.version}.zip`;
  const archive = path.resolve(artifactRoot, asset);
  command('git', ['archive', '--format=zip', '-o', archive, commit], root);
  const bytes = await readFile(archive);
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Release exceeds download limit');
  const sha256 = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const extracted = await mkdtemp(path.join(path.resolve(artifactRoot), 'check-'));
  try {
    command(process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/tar.exe') : 'tar', ['-xf', archive, '-C', extracted], root);
    if (await packageDigest(extracted) !== digest) throw new Error('Archived bytes differ from accepted candidate');
  } finally { await rm(extracted, { recursive: true, force: true, maxRetries: 3 }); }
  const notes = path.resolve(artifactRoot, manifest.name + '-release.md');
  await writeFile(notes, `Independent OpenAgent adaptation of ${evidence.revision}.\n\nQualified source: ${commit}\nPackage digest: ${digest}\nRuntime binary SHA-256: ${runtimeReport.binary_sha256}\n\nPackage tests, production Runtime installation, commands and integration status passed. See README for authentication and platform prerequisites; external authenticated operations are not implied by setup qualification.\n`);
  let release;
  try { release = JSON.parse(command('gh', ['api', `repos/${repo}/releases/tags/${tag}`], root)); }
  catch (error) {
    if (!/404/.test(String(error.stderr))) throw error;
    command('gh', ['release', 'create', tag, archive, '--repo', repo, '--target', commit, '--title', tag, '--notes-file', notes], root);
    release = JSON.parse(command('gh', ['api', `repos/${repo}/releases/tags/${tag}`], root));
  }
  const published = release.assets.find(item => item.name === asset);
  if (release.draft || release.prerelease || published?.digest !== sha256) throw new Error('Published release digest or stable channel mismatch');
  const download = await mkdtemp(path.join(path.resolve(artifactRoot), 'download-'));
  try {
    command('gh', ['release', 'download', tag, '--repo', repo, '--pattern', asset, '--dir', download], root);
    if (createHash('sha256').update(await readFile(path.join(download, asset))).digest('hex') !== sha256.slice(7)) throw new Error('Release download digest mismatch');
  } finally { await rm(download, { recursive: true, force: true, maxRetries: 3 }); }
  publication.push({ id: manifest.name, repository: manifest.repository, commit, tag, release_url: release.html_url, source_url: published.browser_download_url, sha256, package_digest: digest });
  await writeFile(path.join(artifactRoot, 'publication.json'), JSON.stringify({ revision: evidence.revision, publication }, null, 2) + '\n');
  console.log(JSON.stringify(publication.at(-1)));
}
