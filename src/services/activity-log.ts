import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface ActivityEntry {
  timestamp: string;
  type: 'ingest' | 'search' | 'crawl' | 'error' | 'query';
  message: string;
  details?: Record<string, any>;
}

const ACTIVITY_LOG_DIR = join(homedir(), '.cursor-rag');
const ACTIVITY_LOG_FILE = join(ACTIVITY_LOG_DIR, 'activity.json');
const MAX_ENTRIES = 100;

function ensureLogDir(): void {
  if (!existsSync(ACTIVITY_LOG_DIR)) {
    mkdirSync(ACTIVITY_LOG_DIR, { recursive: true });
  }
}

export function logActivity(
  type: ActivityEntry['type'],
  message: string,
  details?: Record<string, any>
): void {
  try {
    ensureLogDir();
    
    const entries = getActivityLog();
    
    entries.unshift({
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    });
    
    // Keep only the most recent entries
    const trimmed = entries.slice(0, MAX_ENTRIES);
    
    writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (error) {
    // Silently fail - activity logging shouldn't break the main flow
    console.error('Failed to log activity:', error);
  }
}

export function getActivityLog(): ActivityEntry[] {
  try {
    ensureLogDir();
    
    if (!existsSync(ACTIVITY_LOG_FILE)) {
      return [];
    }
    
    const content = readFileSync(ACTIVITY_LOG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

export function clearActivityLog(): void {
  try {
    ensureLogDir();
    writeFileSync(ACTIVITY_LOG_FILE, '[]', 'utf-8');
  } catch (error) {
    console.error('Failed to clear activity log:', error);
  }
}
