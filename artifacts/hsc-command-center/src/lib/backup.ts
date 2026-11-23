import { z } from 'zod';
import { validateStudyData, type StudyData } from './model';

const BACKUP_FORMAT = 'hsc-2027-command-center';
const BACKUP_VERSION = 2;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.union([z.literal(1), z.literal(BACKUP_VERSION)]),
  exportedAt: z.string().datetime(),
  data: z.unknown(),
});

export function createBackupJson(data: StudyData): string {
  const timer = data.activeTimer;
  const elapsedSeconds = timer && !timer.isPaused && timer.resumedAt
    ? timer.elapsedSeconds + Math.max(0, Math.floor((Date.now() - Date.parse(timer.resumedAt)) / 1000))
    : timer?.elapsedSeconds;
  const validated = validateStudyData({
    ...data,
    activeTimer: timer && !timer.isPaused
      ? { ...timer, elapsedSeconds, resumedAt: null, isPaused: true }
      : timer,
  });
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: validated,
    },
    null,
    2,
  );
}

export function parseBackupJson(text: string): StudyData {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('This backup is larger than the 5 MB limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  const backup = BackupSchema.safeParse(parsed);
  if (!backup.success) {
    throw new Error(
      'This backup is invalid or uses a version this app cannot restore.',
    );
  }
  return validateStudyData(backup.data.data);
}

export function downloadBackup(data: StudyData): void {
  const blob = new Blob([createBackupJson(data)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hsc-command-center-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
