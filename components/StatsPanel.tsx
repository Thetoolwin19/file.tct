import React from 'react';
import { FileText, Link as LinkIcon, Clock, Database } from 'lucide-react';

interface StatsPanelProps {
  totalPages: number;
  totalLinks: number;
  totalSize: number;
  status: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ totalPages, totalLinks, totalSize, status }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-crawler-panel border border-slate-700 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          <FileText className="w-4 h-4" />
          <span className="text-xs uppercase font-bold">Pages Crawled</span>
        </div>
        <div className="text-2xl font-mono text-white">{totalPages}</div>
      </div>
      
      <div className="bg-crawler-panel border border-slate-700 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          <LinkIcon className="w-4 h-4" />
          <span className="text-xs uppercase font-bold">Links Found</span>
        </div>
        <div className="text-2xl font-mono text-white">{totalLinks}</div>
      </div>

      <div className="bg-crawler-panel border border-slate-700 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          <Database className="w-4 h-4" />
          <span className="text-xs uppercase font-bold">Data Size</span>
        </div>
        <div className="text-2xl font-mono text-crawler-accent">{formatBytes(totalSize)}</div>
      </div>

      <div className="bg-crawler-panel border border-slate-700 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          <Clock className="w-4 h-4" />
          <span className="text-xs uppercase font-bold">Status</span>
        </div>
        <div className="text-2xl font-mono text-white">
            <span className={status === 'RUNNING' ? 'text-green-400 animate-pulse' : 'text-slate-200'}>
                {status}
            </span>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;