import type { ClientRequest, IncomingMessage } from 'node:http';
import * as https from 'node:https';

export type WechatHttpsRequest = (
  options: https.RequestOptions,
  callback: (res: IncomingMessage) => void,
) => ClientRequest;

/** Как у YooKassa: не держим вызов инвойса до системного TCP-таймаута. */
const TIMEOUT_MS = 15_000;

export interface WechatPayResponse {
  status: number;
  error?: string;
  errRaw?: { code?: string; message?: string };
  data?: unknown;
}

/**
 * HTTP-клиент для wechatpay-node-v3.
 * Node 24 по умолчанию включает Happy Eyeballs и рвёт попытку через 250 мс.
 * До api.mch.weixin.qq.com этого не хватает: `https.request` получает ETIMEDOUT
 * примерно за 800 мс, а wget по IPv4 доходит. `family: 4` выключает перебор адресов.
 */
export class WechatPayRequest {
  constructor(
    private readonly request: WechatHttpsRequest = (options, callback) =>
      https.request(options, callback),
  ) {}

  post(
    url: string,
    params: Record<string, unknown>,
    headers: Record<string, unknown>,
  ): Promise<WechatPayResponse> {
    // Тело должно совпасть с JSON.stringify в подписи запроса.
    return this.call('POST', url, headers, JSON.stringify(params ?? {}));
  }

  get(url: string, headers: Record<string, unknown>): Promise<WechatPayResponse> {
    return this.call('GET', url, headers);
  }

  upload(): Promise<WechatPayResponse> {
    return Promise.resolve({
      status: 0,
      errRaw: { code: 'UNSUPPORTED', message: 'wechat upload is not supported' },
    });
  }

  private call(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, unknown>,
    body?: string,
  ): Promise<WechatPayResponse> {
    const target = new URL(url);
    const reqHeaders = toHeaders(headers);
    if (body !== undefined) reqHeaders['Content-Length'] = String(Buffer.byteLength(body));

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: WechatPayResponse) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const req = this.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port ? Number(target.port) : 443,
          path: `${target.pathname}${target.search}`,
          method,
          headers: reqHeaders,
          family: 4,
          timeout: TIMEOUT_MS,
        },
        (res) => collect(res, finish),
      );

      req.on('timeout', () => {
        req.destroy(Object.assign(new Error('WeChat request timeout'), { code: 'ETIMEDOUT' }));
      });
      req.on('error', (err: NodeJS.ErrnoException) => {
        finish({
          status: 0,
          errRaw: { code: err.code ?? 'NETWORK', message: err.message },
        });
      });
      req.end(body);
    });
  }
}

function toHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      continue;
    }
    // Не просим gzip: ответ нужен обычным JSON, без распаковки.
    if (key.toLowerCase() === 'accept-encoding') continue;
    out[key] = String(value);
  }
  return out;
}

function collect(res: IncomingMessage, finish: (result: WechatPayResponse) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('error', (err: NodeJS.ErrnoException) => {
    finish({
      status: res.statusCode ?? 0,
      errRaw: { code: err.code ?? 'NETWORK', message: err.message },
    });
  });
  res.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    const status = res.statusCode ?? 0;
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    finish(status >= 200 && status < 300 ? { status, data } : { status, error: text, data });
  });
}
