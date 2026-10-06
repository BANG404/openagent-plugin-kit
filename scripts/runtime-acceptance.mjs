#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runtimeAcceptance } from '../lib/runtime-acceptance.mjs';

// Explicit operator fixture configuration; the installed development tool
// obtains its profile only from the authenticated parent Runtime.
const [configuration] = process.argv.slice(2);
if (!configuration) throw new Error('Usage: node scripts/runtime-acceptance.mjs <fixture.json>');
const report = await runtimeAcceptance(JSON.parse(await readFile(configuration, 'utf8')));
console.log(JSON.stringify({ passed: report.passed, error: report.error, report_path: report.report_path }));
if (!report.passed) process.exitCode = 1;
