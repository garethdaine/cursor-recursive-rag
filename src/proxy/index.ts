import type { RAGConfig } from '../types/index.js';

export interface ProxyConfig {
  enabled: boolean;
  driver: 'packetstream' | 'decodo' | 'smartproxy' | 'none'; // 'smartproxy' is legacy alias for 'decodo'
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface ProxyResult {
  proxyUrl: string | null;
  headers: Record<string, string>;
  userAgent: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class ProxyManager {
  private config: ProxyConfig;

  constructor(ragConfig: RAGConfig) {
    this.config = ragConfig.proxy || {
      enabled: false,
      driver: 'none'
    };
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.driver !== 'none';
  }

  getProxyConfig(country?: string, sessionId?: string): ProxyResult {
    const userAgent = getRandomUserAgent();

    if (!this.isEnabled()) {
      return {
        proxyUrl: null,
        headers: {
          'User-Agent': userAgent,
        },
        userAgent,
      };
    }

    const proxyUrl = this.buildProxyUrl(country, sessionId);

    return {
      proxyUrl,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      userAgent,
    };
  }

  private buildProxyUrl(country?: string, sessionId?: string): string {
    const { driver, host, port, username, password } = this.config;

    if (!username || !password) {
      throw new Error('Proxy username and password are required');
    }

    let finalUsername = username;

    // PacketStream-specific formatting
    if (driver === 'packetstream') {
      // Country suffix: username_country-US
      if (country) {
        finalUsername += `_country-${country}`;
      }
      // Session ID for sticky sessions: username_session-abc123
      if (sessionId) {
        finalUsername += `_session-${sessionId}`;
      }
    }

    // Decodo (formerly SmartProxy) formatting
    if (driver === 'decodo' || driver === 'smartproxy') {
      // Decodo uses format: user-country-us:password
      // See: https://help.decodo.com/reference/public-api-key-authentication
      if (country) {
        finalUsername = `${username}-country-${country.toLowerCase()}`;
      }
      if (sessionId) {
        finalUsername += `-session-${sessionId}`;
      }
    }

    const proxyHost = host || this.getDefaultHost();
    const proxyPort = port || this.getDefaultPort();

    return `http://${finalUsername}:${password}@${proxyHost}:${proxyPort}`;
  }

  private getDefaultHost(): string {
    switch (this.config.driver) {
      case 'packetstream':
        return 'proxy.packetstream.io';
      case 'decodo':
      case 'smartproxy': // legacy alias
        return 'gate.decodo.com';
      default:
        return 'localhost';
    }
  }

  private getDefaultPort(): number {
    switch (this.config.driver) {
      case 'packetstream':
        return 31112;
      case 'decodo':
      case 'smartproxy': // legacy alias
        return 7000;
      default:
        return 8080;
    }
  }

  /**
   * Create a fetch function that uses the proxy
   */
  async fetchWithProxy(url: string, options: RequestInit = {}): Promise<Response> {
    const proxyConfig = this.getProxyConfig();

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        ...proxyConfig.headers,
        ...options.headers,
      },
    };

    // Note: Node.js fetch doesn't natively support proxies
    // For proxy support, we'd need to use a library like node-fetch-native with proxy-agent
    // or undici with ProxyAgent. For now, we'll set headers and let users
    // configure system-level proxy if needed.

    if (proxyConfig.proxyUrl) {
      // In a full implementation, use undici ProxyAgent or similar
      console.warn('Proxy URL configured but Node.js fetch requires additional setup. Using direct connection with proxy headers.');
    }

    return fetch(url, fetchOptions);
  }
}

export function createProxyManager(config: RAGConfig): ProxyManager {
  return new ProxyManager(config);
}
