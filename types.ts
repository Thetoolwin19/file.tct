export enum CrawlStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  depth: number;
  ignoreImages: boolean;
}

export interface CrawledPage {
  url: string;
  title: string;
  content: string; // Text content
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
  linksFound: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface SummaryResult {
  url: string;
  summary: string;
}