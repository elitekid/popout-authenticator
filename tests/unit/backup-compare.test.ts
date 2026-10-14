import { describe, expect, it } from 'vitest';
import { compareBackupAccounts, parseComparisonBackup } from '../../src/core/backup-compare';
import { decodeBase32 } from '../../src/core/base32';
import { buildEncryptedBackup, buildPlainBackup } from '../../src/core/export/own';
import { NeedsPasswordError } from '../../src/core/import';
import type { Account } from '../../src/core/types';

const FAKE = decodeBase32('JBSWY3DPEHPK3PXP');
const RFC = new TextEncoder().encode('12345678901234567890');
function account(id: string, extra: Partial<Account> = {}): Account {
  return {
    id, issuer: 'Example', label: `${id}@example.test`, secret: FAKE.slice(),
    type: 'totp', algorithm: 'SHA-1', digits: 6, period: 30,
    note: '', pinned: false, matchHosts: [], createdAt: 1, updatedAt: 1, ...extra,
  };
}

describe('backup comparison', () => {
  it('uses own IDs before names and keys, detecting authentication changes only', () => {
    const current = [account('a'), account('b', { secret: RFC })];
    const saved = [account('b', { label: 'renamed', secret: FAKE }), account('a', { note: 'old', pinned: true })];
    const out = compareBackupAccounts(current, saved, { ownIds: true });
    expect(out.rows.map(({ status, fields }) => ({ status, fields }))).toEqual([
      { status: 'same', fields: [] }, { status: 'changed', fields: ['secret'] },
    ]);
    expect(out.backupOnly).toEqual([]);
  });

  it('does not pick one entry from duplicate own IDs', () => {
    const out = compareBackupAccounts([account('a')], [account('a'), account('a', { secret: RFC })], { ownIds: true });
    expect(out.rows[0]).toMatchObject({ status: 'uncertain', reason: 'ambiguous' });
    expect(out.backupOnly).toEqual([]);
  });

  it('recognizes a unique key despite a renamed account and detects algorithm, digits, period differences', () => {
    const out = compareBackupAccounts([account('a')], [account('foreign', { algorithm: 'SHA-256', digits: 8, period: 60 })]);
    expect(out.rows[0]).toMatchObject({ status: 'changed', fields: ['algorithm', 'digits', 'period'] });
  });

  it('compares the HOTP counter, not its unused period', () => {
    const out = compareBackupAccounts([account('a', { type: 'hotp', counter: 5 })], [account('a', { type: 'hotp', counter: 4, period: 60 })]);
    expect(out.rows[0]).toMatchObject({ status: 'changed', fields: ['counter'] });
  });

  it('marks identical-name, changed-key imports as candidates rather than confirmed changes', () => {
    const out = compareBackupAccounts([account('a')], [account('a', { secret: RFC })]);
    expect(out.rows[0]).toMatchObject({ status: 'uncertain', reason: 'nameCandidate', fields: ['secret'] });
    expect(out.backupOnly).toEqual([]);
  });

  it('does not arbitrarily pair duplicated foreign secrets or competing name/key candidates', () => {
    const duplicates = compareBackupAccounts([account('a'), account('b')], [account('a')]);
    expect(duplicates.counts.uncertain).toBe(2);
    const conflict = compareBackupAccounts([account('a'), account('b', { secret: RFC })], [account('b')]);
    expect(conflict.counts.uncertain).toBe(2);
    expect(conflict.backupOnly).toEqual([]);
  });

  it('does not match blank names and omits trash from missing/backup-only counts', () => {
    const out = compareBackupAccounts(
      [account('a', { issuer: '', label: '' }), account('trash', { deletedAt: 2 })],
      [account('b', { issuer: '', label: '', secret: RFC }), account('old-trash', { deletedAt: 2 })],
    );
    expect(out.counts.missing).toBe(1);
    expect(out.rows).toHaveLength(1);
    expect(out.backupOnly).toEqual([{ issuer: '', label: '' }]);
  });

  it('keeps unmatched backup entries and excludes raw keys, links, and parse failures from results', async () => {
    const text = 'otpauth://totp/Example:other?secret=JBSWY3DPEHPK3PXP&issuer=Example\notpauth://totp/Broken?secret=NOT-BASE32';
    const parsed = await parseComparisonBackup(text);
    expect(parsed.failedCount).toBe(1);
    const out = compareBackupAccounts([account('a', { secret: RFC })], parsed.accounts, parsed);
    expect(out.counts.missing).toBe(1);
    expect(out.backupOnly).toEqual([{ issuer: 'Example', label: 'other' }]);
    const json = JSON.stringify(out);
    for (const secret of ['JBSWY3DPEHPK3PXP', 'NOT-BASE32', 'otpauth:', '48656c6c6f21deadbeef']) expect(json).not.toContain(secret);
  });

  it('preserves own IDs from plain and encrypted backups and requests the password', async () => {
    const input = [account('stable-id')];
    expect(await parseComparisonBackup(buildPlainBackup(input))).toMatchObject({ ownIds: true, accounts: [{ id: 'stable-id' }] });
    const encrypted = await buildEncryptedBackup(input, 'fake-password', { iterations: 1, memoryKiB: 64, parallelism: 1 });
    await expect(parseComparisonBackup(encrypted)).rejects.toBeInstanceOf(NeedsPasswordError);
    expect(await parseComparisonBackup(encrypted, 'fake-password')).toMatchObject({ ownIds: true, accounts: [{ id: 'stable-id' }] });
  });

  it('processes thousands of repeated-key candidates without pairwise scans', () => {
    const current = Array.from({ length: 6000 }, (_, i) => account(String(i)));
    const saved = current.map((a) => ({ ...a, id: `foreign-${a.id}` }));
    const started = performance.now();
    const out = compareBackupAccounts(current, saved);
    const elapsed = performance.now() - started;
    console.info(`backup comparison: 6000 current + 6000 backup, ${elapsed.toFixed(1)} ms`);
    expect(out.counts.uncertain).toBe(6000);
    expect(out.backupOnly).toEqual([]);
  });
});
