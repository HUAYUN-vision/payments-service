import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AppConfigService } from '../../config/app-config.service';
import { type InvoiceEntity, UsdtNetwork } from '../database/entities/invoice.entity';
import { UsdtService } from './usdt.service';
import type { UsdtWalletService } from './usdt-wallet.service';

const INVOICE_ID = '6f1c8c2a-3b4d-4e5f-8a6b-7c8d9e0f1a2b';

describe('UsdtService.createPayment', () => {
  const env: Record<string, unknown> = {
    USDT_INVOICE_TTL_SEC: 86_400,
    USDT_TON_API_URL: 'https://tonapi.test',
    USDT_TON_API_KEY: 'ton-key',
    USDT_ETH_RPC_URL: 'https://eth.test',
    USDT_TRON_API_URL: undefined,
    USDT_TRON_API_KEY: undefined,
  };
  const config = { get: (key: string) => env[key] } as unknown as AppConfigService;
  const addresses = { ton: 'UQ_ton', ethereum: '0xEth', tron: 'Ttron' };
  const wallet = {
    isConfigured: () => true,
    addresses,
  } as UsdtWalletService;

  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const query = jest.fn();
  type Tx = {
    update: jest.Mock;
    query: jest.Mock;
    transaction: (fn: (tx: Tx) => Promise<unknown>) => Promise<unknown>;
  };
  const manager: Tx = {
    update,
    query,
    transaction: async (fn) => fn(manager),
  };
  const invoices = { manager } as unknown as Repository<InvoiceEntity>;
  const service = new UsdtService(config, wallet, invoices);

  beforeEach(() => {
    update.mockClear();
    query.mockReset();
    query.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      return [];
    });
  });

  it('requires a configured network', async () => {
    await expect(
      service.createPayment({
        invoiceId: INVOICE_ID,
        amount: 10.5,
        description: null,
        network: UsdtNetwork.TRON,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('puts the invoice id into the TON comment and keeps the order amount', async () => {
    const before = Date.now();
    const payment = await service.createPayment({
      invoiceId: INVOICE_ID,
      amount: 10.5,
      description: null,
      network: UsdtNetwork.TON,
    });

    expect(payment.externalId).toBe(INVOICE_ID);
    expect(payment.payAddress).toBe('UQ_ton');
    expect(payment.payAmount).toBe(10.5);
    expect(payment.memo).toBe(INVOICE_ID);
    expect(payment.paymentUrl).toBe(
      `ton://transfer/UQ_ton?jetton=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs&amount=10500000&text=${INVOICE_ID}`,
    );
    expect(payment.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(query).not.toHaveBeenCalled();
  });

  it('gives the next Ethereum invoice another pay amount', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      return [{ pay_amount: '10.500000' }];
    });

    const payment = await service.createPayment({
      invoiceId: INVOICE_ID,
      amount: 10.5,
      description: null,
      network: UsdtNetwork.ETHEREUM,
    });

    expect(payment.payAmount).toBe(10.500001);
    expect(payment.memo).toBeNull();
    expect(payment.paymentUrl).toBe(
      'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7@1/transfer?address=0xEth&uint256=10500001',
    );
    expect(query).toHaveBeenCalledWith(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      'usdt-pay:ethereum',
    ]);
  });

  it('answers 409 when no Ethereum tail is free', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      const rows = [];
      for (let tail = 0; tail < 10_000; tail++) {
        const micro = 10_500_000 + tail;
        const frac = String(micro % 1_000_000).padStart(6, '0');
        rows.push({ pay_amount: `${Math.floor(micro / 1_000_000)}.${frac}` });
      }
      return rows;
    });

    await expect(
      service.createPayment({
        invoiceId: INVOICE_ID,
        amount: 10.5,
        description: null,
        network: UsdtNetwork.ETHEREUM,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
