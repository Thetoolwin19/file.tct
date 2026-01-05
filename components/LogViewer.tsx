import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface LogViewerProps {
  logs: LogEntry[];
}

const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-blue-400';
    }
  };

  return (
    <div className="bg-crawler-panel rounded-lg border border-slate-700 h-96 flex flex-col overflow-hidden shadow-xl">
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-crawler-accent" />
        <span className="text-sm font-mono text-slate-300 font-bold">LIVE EXECUTION LOGS</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2">
        {logs.length === 0 && (
          <div className="text-slate-500 italic">Waiting for crawling process to start...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 items-start animate-fade-in">
            <span className="text-slate-500 min-w-[80px]">
              {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="mt-0.5">{getIcon(log.type)}</span>
            <span className={`${getColor(log.type)} break-all`}>{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default LogViewer;