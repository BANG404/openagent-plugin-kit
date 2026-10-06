import { rename, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Windows readers/virus scanners can briefly deny replacement of an open file.
// Preserve the old complete value until a bounded atomic replacement succeeds.
export async function writeAtomic(file, content) {
  const temporary = file + '.' + randomUUID();
  await writeFile(temporary, content);
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); return; }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 100) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } finally { await rm(temporary, { force: true }); }
}
