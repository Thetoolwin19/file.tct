import React, { useState, useCallback, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Download, 
  Settings, 
  Globe, 
  Cpu, 
  RefreshCcw,
  FileText,
  ListOrdered,
  Network,
  File,
  X,
  Eye,
  Wand2
} from 'lucide-react';
import LogViewer from './components/LogViewer';
import StatsPanel from './components/StatsPanel';
import { CrawlConfig, CrawlStatus, CrawledPage, LogEntry } from './types';
import { fetchUrlContent, parseHtml, downloadAsTextFile, generatePaginatedUrls } from './services/crawlerService';
import { summarizeContent } from './services/geminiService';

const App: React.FC = () => {
  // Configuration State
  const [urlInput, setUrlInput] = useState<string>('https://www.moi.gov.mm/news/78764');
  const [maxPages, setMaxPages] = useState<number>(5);
  const [isGeminiEnabled, setIsGeminiEnabled] = useState<boolean>(false);
  
  // Pagination / Mode State
  const [crawlMode, setCrawlMode] = useState<'single' | 'pagination' | 'link-follow'>('single');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(3);

  // Execution State
  const [status, setStatus] = useState<CrawlStatus>(CrawlStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  
  // Preview Modal
  const [selectedPage, setSelectedPage] = useState<CrawledPage | null>(null);
  
  // Refs for loop control
  const statusRef = useRef<CrawlStatus>(CrawlStatus.IDLE);
  const queueRef = useRef<string[]>([]);
  const visitedRef = useRef<Set<string>>(new Set());
  const pagesRef = useRef<CrawledPage[]>([]);

  // Helpers
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      message,
      type
    }]);
  };

  const handleCrawlStart = async () => {
    if (!urlInput) {
      addLog("Please enter a valid URL", 'error');
      return;
    }
    
    // Reset State
    setLogs([]);
    setPages([]);
    setVisited(new Set());
    setStatus(CrawlStatus.RUNNING);
    
    // Reset Refs
    statusRef.current = CrawlStatus.RUNNING;
    visitedRef.current = new Set();
    pagesRef.current = [];
    
    let initialQueue: string[] = [];

    if (crawlMode === 'pagination') {
        addLog(`Generating URLs from ID ${startPage} to ${endPage}...`, 'info');
        initialQueue = generatePaginatedUrls(urlInput, startPage, endPage);
        if (initialQueue.length === 0) {
            addLog("Could not generate URLs. Check format.", 'error');
            setStatus(CrawlStatus.ERROR);
            return;
        }
        addLog(`Generated ${initialQueue.length} target URLs.`, 'info');
        addLog(`First URL: ${initialQueue[0]}`, 'info');
    } else if (crawlMode === 'single') {
        initialQueue = [urlInput];
        addLog(`Preparing to crawl single page: ${urlInput}`, 'info');
    } else {
        // Link Follow Mode
        initialQueue = [urlInput];
        addLog(`Starting Link Discovery from: ${urlInput}`, 'info');
    }

    setQueue(initialQueue);
    queueRef.current = initialQueue;

    processQueue();
  };

  const processQueue = async () => {
    if (statusRef.current !== CrawlStatus.RUNNING) return;
    
    // Stop conditions
    if (queueRef.current.length === 0) {
        finishCrawl("Queue is empty.");
        return;
    }
    
    if (crawlMode === 'link-follow' && pagesRef.current.length >= maxPages) {
        finishCrawl(`Reached limit of ${maxPages} pages.`);
        return;
    }

    const currentUrl = queueRef.current.shift();
    if (!currentUrl) return;

    if (visitedRef.current.has(currentUrl)) {
        processQueue(); // Skip and continue
        return;
    }

    visitedRef.current.add(currentUrl);
    setVisited(new Set(visitedRef.current));

    addLog(`Crawling: ${currentUrl}`, 'info');

    try {
        const { html, status } = await fetchUrlContent(currentUrl);
        
        if (status === 200) {
            addLog(`Fetched ${html.length} bytes. Parsing...`, 'success');
            const { text, title, links } = parseHtml(html, currentUrl);
            
            let finalContent = text;
            
            // Check for soft 404s
            if (title.toLowerCase().includes('page not found') || title.toLowerCase().includes('404')) {
                 addLog(`Warning: Page appears to be empty or 404.`, 'warning');
                 finalContent = `[WARNING: PAGE NOT FOUND OR EMPTY]\n\n${text}`;
            }

            if (isGeminiEnabled) {
               addLog(`Summarizing: ${title.substring(0, 30)}...`, 'info');
               try {
                 const summary = await summarizeContent(text);
                 finalContent = `[AI SUMMARY]: ${summary}\n\n================================\n[FULL CONTENT]:\n${text}`;
               } catch (e) {
                 addLog(`AI Summary skipped.`, 'warning');
               }
            }

            const newPage: CrawledPage = {
                url: currentUrl,
                title,
                content: finalContent,
                status: 'success',
                timestamp: Date.now(),
                linksFound: links.length
            };

            pagesRef.current.push(newPage);
            setPages([...pagesRef.current]);

            // If in Link Follow mode, find new links and add to queue
            if (crawlMode === 'link-follow') {
                const newLinks = links.filter(l => !visitedRef.current.has(l));
                // Add unique new links to queue
                queueRef.current = [...queueRef.current, ...newLinks];
                addLog(`Found ${links.length} new links.`, 'info');
            }
        } else {
            addLog(`Failed to fetch. Status: ${status}`, 'error');
        }
    } catch (error: any) {
        addLog(`Error: ${error.message}`, 'error');
    }

    // Delay to prevent rate limiting (1 second)
    setTimeout(() => {
        processQueue();
    }, 1000);
  };

  const finishCrawl = (reason: string) => {
      setStatus(CrawlStatus.COMPLETED);
      statusRef.current = CrawlStatus.COMPLETED;
      addLog(`Crawl Finished: ${reason}`, 'success');
  };

  const handleStop = () => {
    setStatus(CrawlStatus.PAUSED);
    statusRef.current = CrawlStatus.PAUSED;
    addLog("Process paused by user.", 'warning');
  };

  const handleDownload = () => {
    if (pages.length === 0) {
        addLog("No data to download.", 'warning');
        return;
    }
    downloadAsTextFile(pages);
    addLog("File download initiated.", 'success');
  };

  const handleAutoFormat = () => {
      // Regex to find the last segment of digits
      const regex = /(\d+)(\/?)$/;
      if (regex.test(urlInput)) {
          const newUrl = urlInput.replace(regex, '{{page}}$2');
          setUrlInput(newUrl);
          addLog("URL format updated automatically for ID range.", 'success');
      } else {
          addLog("No numeric ID found at the end of URL to replace.", 'warning');
      }
  };

  const getPreviewUrl = () => {
      if (crawlMode === 'pagination') {
           if (urlInput.includes('{{page}}')) {
               return urlInput.replace('{{page}}', startPage.toString());
           }
           // Fallback to appending if no placeholder
           const base = urlInput.endsWith('/') ? urlInput : `${urlInput}/`;
           return `${base}${startPage}`;
      }
      return urlInput;
  };

  const totalSize = pages.reduce((acc, page) => acc + page.content.length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
            <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <Cpu className="text-crawler-accent w-8 h-8" />
                    AutoCrawler AI
                </h1>
                <p className="text-slate-500 mt-1">Advanced Text Extractor</p>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-700 text-xs">
                 <span className={`w-2 h-2 rounded-full ${process.env.API_KEY ? 'bg-green-500' : 'bg-red-500'}`}></span>
                 {process.env.API_KEY ? 'Gemini API Connected' : 'Gemini API Missing'}
               </div>
            </div>
        </header>

        {/* Configuration Panel */}
        <div className="bg-crawler-panel p-6 rounded-lg border border-slate-700 shadow-xl space-y-6">
            
            {/* Mode Selection Tabs */}
            <div className="flex flex-wrap gap-1 bg-slate-900/50 p-1 rounded-lg w-fit">
                <button 
                    onClick={() => setCrawlMode('single')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${crawlMode === 'single' ? 'bg-crawler-accent text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                    <File className="w-4 h-4" />
                    Single Page (တစ်ခုတည်း)
                </button>
                <button 
                    onClick={() => setCrawlMode('pagination')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${crawlMode === 'pagination' ? 'bg-crawler-accent text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                    <ListOrdered className="w-4 h-4" />
                    ID Range / Pagination
                </button>
                <button 
                    onClick={() => setCrawlMode('link-follow')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${crawlMode === 'link-follow' ? 'bg-crawler-accent text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                    <Network className="w-4 h-4" />
                    Follow Links (လင့်ခ်ဆက်ရာ)
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* URL Input */}
                <div className="md:col-span-6 space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-mono text-slate-400 font-bold uppercase ml-1">Target URL</label>
                        {crawlMode === 'pagination' && (
                             <span className="text-[10px] text-crawler-accent bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-900/50">
                                 Preview: {getPreviewUrl().substring(0, 40)}...
                             </span>
                        )}
                    </div>
                    <div className="relative flex gap-2">
                        <div className="relative flex-1">
                            <Globe className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                            <input 
                                type="text" 
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder={crawlMode === 'pagination' ? "https://site.com/news/{{page}}" : "https://site.com/article"}
                                disabled={status === CrawlStatus.RUNNING}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-crawler-accent focus:border-transparent outline-none font-mono text-sm"
                            />
                        </div>
                        {crawlMode === 'pagination' && (
                            <button 
                                onClick={handleAutoFormat}
                                title="Auto-format URL: Replace last number with {{page}}"
                                className="bg-slate-800 hover:bg-slate-700 text-crawler-accent border border-slate-600 px-3 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                            >
                                <Wand2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    {crawlMode === 'pagination' && (
                        <p className="text-[10px] text-slate-500 ml-1">
                            Click the <Wand2 className="w-3 h-3 inline mx-1" /> button to auto-replace the ID (e.g., 78764) with <span className="text-crawler-accent">{'{{page}}'}</span>.
                        </p>
                    )}
                </div>

                {/* Controls based on Mode */}
                {crawlMode === 'single' && (
                     <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-mono text-slate-400 font-bold uppercase ml-1">Limit</label>
                        <input 
                            type="text" 
                            value="1 Page"
                            disabled
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-slate-400 font-mono cursor-not-allowed"
                        />
                    </div>
                )}
                {crawlMode === 'pagination' && (
                    <div className="md:col-span-3 flex gap-4">
                        <div className="space-y-2 w-1/2">
                            <label className="text-xs font-mono text-slate-400 font-bold uppercase">Start ID</label>
                            <input 
                                type="number" 
                                value={startPage}
                                onChange={(e) => setStartPage(parseInt(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 px-3 text-white focus:ring-2 focus:ring-crawler-accent outline-none font-mono text-center"
                            />
                        </div>
                        <div className="space-y-2 w-1/2">
                            <label className="text-xs font-mono text-slate-400 font-bold uppercase">End ID</label>
                            <input 
                                type="number" 
                                value={endPage}
                                onChange={(e) => setEndPage(parseInt(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 px-3 text-white focus:ring-2 focus:ring-crawler-accent outline-none font-mono text-center"
                            />
                        </div>
                    </div>
                )}
                 {crawlMode === 'link-follow' && (
                    <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-mono text-slate-400 font-bold uppercase ml-1">Limit Pages</label>
                        <input 
                            type="number" 
                            value={maxPages}
                            onChange={(e) => setMaxPages(parseInt(e.target.value))}
                            min={1}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-crawler-accent outline-none font-mono"
                        />
                    </div>
                )}

                {/* Buttons */}
                <div className={`flex gap-3 ${crawlMode === 'pagination' ? 'md:col-span-3' : 'md:col-span-4'}`}>
                     {status === CrawlStatus.RUNNING ? (
                        <button 
                            onClick={handleStop}
                            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 py-3 rounded-lg font-bold flex justify-center items-center gap-2 h-[50px] mt-6"
                        >
                            <Pause className="w-4 h-4" /> Stop
                        </button>
                    ) : (
                        <button 
                            onClick={handleCrawlStart}
                            className="flex-1 bg-crawler-accent hover:bg-emerald-400 text-slate-900 py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] h-[50px] mt-6"
                        >
                            <Play className="w-4 h-4" /> Crawl
                        </button>
                    )}
                     <button 
                        onClick={handleDownload}
                        disabled={pages.length === 0}
                        className={`px-4 rounded-lg font-bold flex justify-center items-center border transition-all h-[50px] mt-6
                            ${pages.length > 0 
                                ? 'bg-slate-800 border-slate-600 text-white hover:bg-slate-700' 
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>
            
            {/* Advanced Settings */}
            <div className="flex gap-6 border-t border-slate-700 pt-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isGeminiEnabled ? 'bg-crawler-accent' : 'bg-slate-700'}`} onClick={() => setIsGeminiEnabled(!isGeminiEnabled)}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isGeminiEnabled ? 'translate-x-4' : ''}`}></div>
                    </div>
                    <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Enable Gemini AI Summarization</span>
                </label>
            </div>
        </div>

        {/* Stats */}
        <StatsPanel 
            totalPages={pages.length}
            totalLinks={pages.reduce((acc, p) => acc + p.linksFound, 0)}
            totalSize={totalSize}
            status={status}
        />

        {/* Logs & Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <LogViewer logs={logs} />
            </div>

            <div className="lg:col-span-1 bg-crawler-panel rounded-lg border border-slate-700 h-96 flex flex-col overflow-hidden">
                 <div className="bg-slate-900 px-4 py-2 border-b border-slate-700 flex items-center gap-2">
                    <RefreshCcw className={`w-4 h-4 text-crawler-accent ${status === CrawlStatus.RUNNING ? 'animate-spin' : ''}`} />
                    <span className="text-sm font-mono text-slate-300 font-bold">PROCESSED FILES</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {pages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600">
                            <FileText className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-xs">No files crawled yet</p>
                        </div>
                    )}
                    {pages.map((page, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setSelectedPage(page)}
                            className="bg-slate-900/50 p-3 rounded border border-slate-800 hover:border-crawler-accent transition-colors cursor-pointer group relative"
                        >
                             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="w-4 h-4 text-crawler-accent" />
                            </div>
                            <div className="flex justify-between items-start mb-1 pr-6">
                                <span className="text-xs font-mono text-crawler-accent font-bold">FILE_{idx + 1}.txt</span>
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{Math.round(page.content.length / 1024)}KB</span>
                            </div>
                            <div className="text-xs text-slate-300 truncate font-semibold mb-1" title={page.title}>{page.title || 'No Title'}</div>
                            <div className="text-[10px] text-slate-500 truncate font-mono">{page.url}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
      
      {/* Content Preview Modal */}
      {selectedPage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 w-full max-w-4xl max-h-[80vh] rounded-xl border border-slate-700 shadow-2xl flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-slate-800">
                    <div>
                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                             <FileText className="w-5 h-5 text-crawler-accent" />
                             File Preview
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 font-mono">{selectedPage.url}</p>
                    </div>
                    <button 
                        onClick={() => setSelectedPage(null)}
                        className="p-2 hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400 hover:text-white" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-slate-950/50">
                    <pre className="text-slate-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                        {selectedPage.content}
                    </pre>
                </div>
                <div className="p-4 border-t border-slate-800 flex justify-end">
                    <button 
                        onClick={() => setSelectedPage(null)}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;