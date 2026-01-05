import { CrawledPage, LogEntry } from '../types';

// Enhanced list of CORS proxies
const PROXIES = [
  {
    // High success rate for text content
    name: 'AllOrigins',
    getUrl: (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    extract: async (res: Response) => {
      const data = await res.json();
      return data.contents; 
    }
  },
  {
    // Very robust, often works when others fail
    name: 'CodeTabs',
    getUrl: (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    extract: async (res: Response) => res.text()
  },
  {
    // Standard CORS proxy
    name: 'CorsProxy',
    getUrl: (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    extract: async (res: Response) => res.text()
  },
  {
    // Backup 1
    name: 'ThingProxy',
    getUrl: (target: string) => `https://thingproxy.freeboard.io/fetch/${target}`,
    extract: async (res: Response) => res.text()
  },
  {
    // Backup 2
    name: 'HacApp',
    getUrl: (target: string) => `https://api.hac.app/proxy?url=${encodeURIComponent(target)}`,
    extract: async (res: Response) => res.text()
  }
];

export const fetchUrlContent = async (url: string): Promise<{ html: string; status: number }> => {
  let lastError;

  // Try each proxy until one works
  for (const proxy of PROXIES) {
    try {
      // Add a random parameter to prevent caching
      const targetUrlWithCacheBust = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      const proxyUrl = proxy.getUrl(targetUrlWithCacheBust);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30s for slow sites

      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        continue; 
      }

      const html = await proxy.extract(response);
      
      // Basic validation
      if (!html || html.length < 50) {
          throw new Error("Empty or invalid response from proxy");
      }

      return { html, status: 200 };
    } catch (error: any) {
      console.warn(`Proxy ${proxy.name} failed for ${url}:`, error.message);
      lastError = error;
    }
  }

  throw new Error(`Unable to crawl URL. The site might be blocking access or is unreachable.`);
};

export const parseHtml = (html: string, url: string): { text: string; title: string; links: string[] } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Remove Junk (Conservative removal to avoid losing content)
  const trashSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 
    'header', 'aside', '.ad', '.ads', '.advertisement', 
    '.menu', '.navigation', '.sidebar', '.widget',
    '.cookie-consent', '#cookie-banner',
    '.social-share', '.share-buttons',
    '.related-posts', '.comments', '#comments',
    'form', 'button', 'input', '.hidden', '[hidden]',
    '[aria-hidden="true"]'
  ];
  trashSelectors.forEach(sel => {
     doc.querySelectorAll(sel).forEach(el => el.remove());
  });

  // 2. Extract Title
  let title = doc.querySelector('title')?.innerText || '';
  if (!title) {
      const h1 = doc.querySelector('h1');
      if (h1) title = h1.innerText;
  }
  title = title.replace(/\s+/g, ' ').trim();

  // 3. Extract Text (Robust Method)
  // Attempt to find the main content container
  let mainContainer = doc.querySelector('article') || 
                      doc.querySelector('[role="main"]') || 
                      doc.querySelector('#content') || 
                      doc.querySelector('.content') || 
                      doc.querySelector('.post-content') ||
                      doc.querySelector('.entry-content') ||
                      doc.querySelector('.main') ||
                      doc.body;

  const textLines: string[] = [];
  
  const isBlock = (tagName: string) => {
      return ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'tr'].includes(tagName);
  };

  const walker = doc.createTreeWalker(mainContainer, NodeFilter.SHOW_TEXT, null);
  let currentNode;
  
  while (currentNode = walker.nextNode()) {
      const text = currentNode.textContent?.trim();
      // Relaxed length check to capture short Burmese phrases
      if (text && text.length > 0) {
          const parent = currentNode.parentElement;
          if (!parent) continue;
          
          const tagName = parent.tagName.toLowerCase();
          
          if (['h1', 'h2', 'h3'].includes(tagName)) {
              textLines.push(`\n\n### ${text}\n`);
          } else if (tagName === 'li') {
              textLines.push(`\n- ${text}`);
          } else if (tagName === 'td' || tagName === 'th') {
               textLines.push(` ${text} |`);
          } else {
              if (isBlock(tagName)) {
                  textLines.push(`\n${text}\n`);
              } else {
                  textLines.push(` ${text} `);
              }
          }
      }
  }

  let contentText = textLines.join('')
      .replace(/[ ]+/g, ' ') 
      .replace(/\n\s+/g, '\n')
      .replace(/\n+/g, '\n\n') 
      .trim();

  // Fallback: if TreeWalker failed to get meaningful text, use innerText
  // This is often better for simple sites
  if (contentText.length < 100) {
      // Clone body to avoid mutating original doc further if we needed it (we don't here)
      // We already removed junk, so innerText should be relatively clean
      const bodyText = doc.body.innerText || "";
      const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      contentText = lines.join('\n\n');
  }

  // 4. Extract Links
  const linkElements = doc.querySelectorAll('a[href]');
  const links: string[] = [];
  try {
      const baseUrlObj = new URL(url);
      linkElements.forEach((element) => {
        const href = element.getAttribute('href');
        if (href) {
            try {
                const absoluteUrl = new URL(href, baseUrlObj.origin).href;
                if (absoluteUrl.startsWith('http')) {
                    links.push(absoluteUrl);
                }
            } catch (e) { /* ignore */ }
        }
      });
  } catch (e) {
      // invalid url
  }

  return { text: contentText, title, links };
};

export const generatePaginatedUrls = (baseUrl: string, start: number, end: number): string[] => {
  const urls: string[] = [];
  const hasPlaceholder = baseUrl.includes('{{page}}');
  
  for (let i = start; i <= end; i++) {
    if (hasPlaceholder) {
      urls.push(baseUrl.replace('{{page}}', i.toString()));
    } else {
      if (baseUrl.endsWith('=') || baseUrl.endsWith('/')) {
        urls.push(`${baseUrl}${i}`);
      } else {
        urls.push(`${baseUrl}/${i}`);
      }
    }
  }
  return urls;
};

export const downloadAsTextFile = (data: CrawledPage[], filename: string = 'crawl_data.txt') => {
  // Add Byte Order Mark (BOM) for UTF-8 to ensure Windows Notepad opens it correctly with Burmese fonts
  const BOM = '\uFEFF'; 
  
  let content = `CRAWL REPORT - ${new Date().toLocaleString()}\n`;
  content += `Total Pages: ${data.length}\n`;
  content += `=================================================\n\n`;

  data.forEach((page, index) => {
    content += `FILE #${index + 1}: ${page.url}\n`;
    content += `TITLE: ${page.title}\n`;
    content += `STATUS: ${page.status}\n`;
    content += `-------------------------------------------------\n`;
    content += `${page.content}\n`;
    content += `\n=================================================\n\n`;
  });

  const blob = new Blob([BOM + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};