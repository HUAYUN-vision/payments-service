import type { Repository } from 'typeorm';
import type { AppConfigService } from '../../config/app-config.service';
import {
  CallbackStatus,
  type InvoiceEntity,
  InvoiceProvider,
  InvoiceStatus,
} from '../database/entities/invoice.entity';
import { CallbacksService, signCallback } from './callbacks.service';

describe('CallbacksService.deliver', () => {
  const update = jest.fn();
  const repo = { update } as unknown as Repository<InvoiceEntity>;
  const env: Record<string, unknown> = {
    API_KEYS: new Map([['shop', 'shop-secret-key-0001']]),
    CALLBACK_TIMEOUT_MS: 1000,
    CALLBACK_MAX_ATTEMPTS: 3,
  };
  const config = { get: (k: string) => env[k] } as unknown as AppConfigService;
  const service = new CallbacksService(repo, config);
  const fetchMock = jest.spyOn(global, 'fetch');

  const invoice = (patch: Partial<InvoiceEntity> = {}) =>
    ({
      id: '11111111-1111-1111-1111-111111111111',
      project: 'shop',
      provider: InvoiceProvider.YOOKASSA,
      status: InvoiceStatus.PAID,
      amount: 10,
      currency: 'RUB',
      callbackUrl: 'https://shop.example/cb',
      callbackAttempts: 0,
      ...patch,
    }) as InvoiceEntity;

  beforeEach(() => {
    update.mockReset();
    fetchMock.mockReset();
  });
  afterAll(() => fetchMock.mockRestore());

  it('marks delivered on 2xx and signs the body', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    await expect(service.deliver(invoice())).resolves.toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init!.headers as Record<string, string>;
    const body = init!.body as string;
    expect(headers['x-payments-signature']).toBe(
      signCallback('shop-secret-key-0001', headers['x-payments-timestamp'], body),
    );
    expect(JSON.parse(body)).toMatchObject({ event: 'invoice.paid' });
    expect(update).toHaveBeenCalledWith(
      invoice().id,
      expect.objectContaining({ callbackStatus: CallbackStatus.DELIVERED, callbackAttempts: 1 }),
    );
  });

  it('schedules a retry on failure', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(service.deliver(invoice())).resolves.toBe(false);

    const patch = update.mock.calls[0][1] as Partial<InvoiceEntity>;
    expect(patch.callbackStatus).toBe(CallbackStatus.PENDING);
    expect(patch.callbackAttempts).toBe(1);
    expect(patch.nextCallbackAt!.getTime()).toBeGreaterThan(Date.now());
    expect(patch.callbackLastError).toContain('HTTP 500');
  });

  it('gives up after max attempts', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await service.deliver(invoice({ callbackAttempts: 2 }));

    expect(update.mock.calls[0][1]).toMatchObject({
      callbackStatus: CallbackStatus.FAILED,
      callbackAttempts: 3,
      nextCallbackAt: null,
    });
  });

  it('sends invoice.canceled for canceled invoices', async () => {
    fetchMock.mockResolvedValue(new Response('ok'));
    await service.deliver(invoice({ status: InvoiceStatus.CANCELED }));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      event: 'invoice.canceled',
    });
  });
});
