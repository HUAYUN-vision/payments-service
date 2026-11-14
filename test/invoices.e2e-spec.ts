import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  SIGNATURE_HEADER,
  signCallback,
  TIMESTAMP_HEADER,
} from '../src/modules/callbacks/callbacks.service';
import { setupApp } from '../src/setup-app';

const KEY_A = 'test-key-project-a-0001';
const KEY_B = 'test-key-project-b-0002';

type Received = { headers: IncomingHttpHeaders; body: string };

describe('Invoices (e2e)', () => {
  let app: INestApplication<App>;
  let callbackServer: Server;
  let callbackUrl: string;
  const returnUrl = 'https://example.com/thanks';
  const received: Received[] = [];
  const yookassaPayments = new Map<string, { status: string }>();
  const realFetch = global.fetch;

  beforeAll(async () => {
    // мок API YooKassa, остальные запросы (callback) идут по-настоящему
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith('https://api.yookassa.ru/')) return realFetch(input, init);

      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { metadata: { invoiceId: string } };
        const id = `yk-${body.metadata.invoiceId}`;
        yookassaPayments.set(id, { status: 'pending' });
        return Response.json({
          id,
          status: 'pending',
          confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.ru/pay/${id}` },
        });
      }
      const id = decodeURIComponent(url.split('/').pop()!);
      const payment = yookassaPayments.get(id);
      return payment ? Response.json({ id, ...payment }) : new Response('{}', { status: 404 });
    });

    callbackServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((r) => callbackServer.listen(0, '127.0.0.1', r));
    callbackUrl = `http://127.0.0.1:${(callbackServer.address() as AddressInfo).port}/cb`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    await app.get(DataSource).query('TRUNCATE invoices');
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    await new Promise((r) => callbackServer.close(r));
  });

  const api = () => request(app.getHttpServer());

  it('rejects requests without a valid api key', async () => {
    await api().post('/api/v1/invoices').send({}).expect(401);
    await api().post('/api/v1/invoices').set('x-api-key', 'wrong').send({}).expect(401);
  });

  it('validates the body', async () => {
    const res = await api()
      .post('/api/v1/invoices')
      .set('x-api-key', KEY_A)
      .send({ provider: 'paypal', amount: 1.234, callbackUrl: 'nope' })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/provider|amount|callbackUrl/);
  });

  it('requires returnUrl for yookassa', async () => {
    const res = await api()
      .post('/api/v1/invoices')
      .set('x-api-key', KEY_A)
      .send({ provider: 'yookassa', amount: 10, callbackUrl })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/returnUrl/);
  });

  it('rejects unconfigured provider', async () => {
    await api()
      .post('/api/v1/invoices')
      .set('x-api-key', KEY_A)
      .send({ provider: 'wechat', amount: 10, callbackUrl })
      .expect(400);
  });

  describe('idempotency by orderId', () => {
    const body = (patch: Record<string, unknown> = {}) => ({
      provider: 'yookassa',
      amount: 50,
      callbackUrl,
      returnUrl,
      orderId: 'order-1',
      ...patch,
    });
    const countPayments = () => yookassaPayments.size;

    it('returns the same invoice on repeat (200) without a second payment', async () => {
      const before = countPayments();
      const first = await api()
        .post('/api/v1/invoices')
        .set('x-api-key', KEY_A)
        .send(body())
        .expect(201);
      expect(first.body.orderId).toBe('order-1');

      const second = await api()
        .post('/api/v1/invoices')
        .set('x-api-key', KEY_A)
        .send(body())
        .expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.paymentUrl).toBe(first.body.paymentUrl);
      expect(countPayments()).toBe(before + 1);
    });

    it('rejects the same orderId with different amount (409)', async () => {
      await api()
        .post('/api/v1/invoices')
        .set('x-api-key', KEY_A)
        .send(body({ amount: 51 }))
        .expect(409);
    });

    it('scopes orderId per project', async () => {
      const res = await api()
        .post('/api/v1/invoices')
        .set('x-api-key', KEY_B)
        .send(body())
        .expect(201);
      expect(res.body.orderId).toBe('order-1');
    });

    it('creates exactly one invoice under concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          api()
            .post('/api/v1/invoices')
            .set('x-api-key', KEY_A)
            .send(body({ orderId: 'order-concurrent' })),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.every((s) => [200, 201, 409].includes(s))).toBe(true);
      const ids = new Set(results.filter((r) => r.status < 300).map((r) => r.body.id as string));
      expect(ids.size).toBe(1);
    });
  });

  it('creates yookassa invoice, handles webhook and delivers signed callback', async () => {
    const created = await api()
      .post('/api/v1/invoices')
      .set('x-api-key', KEY_A)
      .send({
        provider: 'yookassa',
        amount: 199.9,
        description: 'Test order',
        callbackUrl,
        returnUrl,
        metadata: { orderId: '42' },
      })
      .expect(201);

    const invoice = created.body as { id: string; paymentUrl: string };
    expect(created.body).toMatchObject({
      provider: 'yookassa',
      status: 'pending',
      amount: 199.9,
      currency: 'RUB',
      metadata: { orderId: '42' },
    });
    expect(invoice.paymentUrl).toContain('https://yoomoney.ru/pay/');

    // чужой проект инвойс не видит
    await api().get(`/api/v1/invoices/${invoice.id}`).set('x-api-key', KEY_B).expect(404);

    // поддельный вебхук (у YooKassa платёж ещё pending) ничего не меняет
    const paymentId = `yk-${invoice.id}`;
    await api()
      .post('/api/v1/yookassa/webhook')
      .send({ event: 'payment.succeeded', object: { id: paymentId, status: 'succeeded' } })
      .expect(200);
    let got = await api().get(`/api/v1/invoices/${invoice.id}`).set('x-api-key', KEY_A);
    expect(got.body.status).toBe('pending');

    // настоящая оплата
    yookassaPayments.set(paymentId, { status: 'succeeded' });
    await api()
      .post('/api/v1/yookassa/webhook')
      .send({ event: 'payment.succeeded', object: { id: paymentId, status: 'succeeded' } })
      .expect(200);
    // повтор вебхука — идемпотентно
    await api()
      .post('/api/v1/yookassa/webhook')
      .send({ event: 'payment.succeeded', object: { id: paymentId, status: 'succeeded' } })
      .expect(200);

    await waitFor(() => received.length > 0);
    expect(received).toHaveLength(1);
    const cb = received[0];
    const ts = cb.headers[TIMESTAMP_HEADER] as string;
    expect(cb.headers[SIGNATURE_HEADER]).toBe(signCallback(KEY_A, ts, cb.body));
    expect(JSON.parse(cb.body)).toMatchObject({
      event: 'invoice.paid',
      invoice: { id: invoice.id, status: 'paid', metadata: { orderId: '42' } },
    });

    got = await api().get(`/api/v1/invoices/${invoice.id}`).set('x-api-key', KEY_A).expect(200);
    expect(got.body.status).toBe('paid');
    expect(got.body.paidAt).toBeTruthy();
  });
});

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}
