import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { WechatPayRequest, type WechatHttpsRequest } from './wechat-pay-request';

function fakeRequest(
  onEnd: (req: ClientRequest, callback: (res: IncomingMessage) => void, body?: string) => void,
): WechatHttpsRequest {
  return (options, callback) => {
    void options;
    const req = new EventEmitter() as ClientRequest;
    req.end = ((body?: string) => {
      onEnd(req, callback, body);
      return req;
    }) as ClientRequest['end'];
    req.setTimeout = () => req;
    req.destroy = () => req;
    return req;
  };
}

describe('WechatPayRequest', () => {
  it('calls WeChat over IPv4 and parses code_url', async () => {
    let seen: RequestOptions | undefined;
    let sent: string | undefined;
    const request: WechatHttpsRequest = (options, callback) => {
      seen = options;
      return fakeRequest((_req, cb, body) => {
        sent = body;
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 200;
        process.nextTick(() => {
          cb(res);
          res.emit('data', Buffer.from('{"code_url":"weixin://ok"}'));
          res.emit('end');
        });
      })(options, callback);
    };

    const result = await new WechatPayRequest(request).post(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/native',
      { out_trade_no: 'abc' },
      { Authorization: 'WECHATPAY2-SHA256-RSA2048 x', 'Accept-Encoding': 'gzip' },
    );

    expect(result).toEqual({ status: 200, data: { code_url: 'weixin://ok' } });
    expect(seen?.family).toBe(4);
    expect(seen?.headers).not.toHaveProperty('Accept-Encoding');
    expect(sent).toBe('{"out_trade_no":"abc"}');
  });

  it('maps a connect timeout to status 0', async () => {
    const request = fakeRequest((req) => {
      process.nextTick(() =>
        req.emit('error', Object.assign(new Error('connect'), { code: 'ETIMEDOUT' })),
      );
    });

    const result = await new WechatPayRequest(request).post(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/native',
      {},
      {},
    );

    expect(result.status).toBe(0);
    expect(result.errRaw?.code).toBe('ETIMEDOUT');
  });
});
