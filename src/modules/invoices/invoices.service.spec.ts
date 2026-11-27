import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { InvoiceEntity, InvoiceProvider, UsdtNetwork } from '../database/entities/invoice.entity';
import type { UsdtService } from '../usdt/usdt.service';
import type { WechatService } from '../wechat/wechat.service';
import type { YookassaService } from '../yookassa/yookassa.service';
import { InvoicesService } from './invoices.service';

const callbackUrl = 'https://shop.example/cb';

describe('InvoicesService USDT', () => {
  const findOneBy = jest.fn();
  const save = jest.fn();
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const invoices = {
    findOneBy,
    save,
    update,
    delete: jest.fn(),
    create: (row: InvoiceEntity) => row,
  } as unknown as Repository<InvoiceEntity>;

  const yookassaPayment = jest.fn();
  const usdtPayment = jest.fn();
  let usdtOn = false;
  const yookassa = {
    currency: 'RUB',
    isConfigured: () => true,
    createPayment: yookassaPayment,
  } as unknown as YookassaService;
  const wechat = {
    currency: 'CNY',
    isConfigured: () => false,
    createPayment: jest.fn(),
  } as unknown as WechatService;
  const usdt = {
    currency: 'USDT',
    isConfigured: () => usdtOn,
    createPayment: usdtPayment,
  } as unknown as UsdtService;

  const service = new InvoicesService(invoices, yookassa, wechat, usdt);

  beforeEach(() => {
    usdtOn = false;
    findOneBy.mockReset();
    save.mockReset();
    yookassaPayment.mockReset();
    usdtPayment.mockReset();
  });

  it('rejects usdt when the wallet is off and still creates a yookassa invoice', async () => {
    await expect(
      service.create('shop', {
        provider: InvoiceProvider.USDT,
        network: UsdtNetwork.TON,
        amount: 10,
        callbackUrl,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();

    save.mockImplementation((row: InvoiceEntity) => Promise.resolve(row));
    yookassaPayment.mockResolvedValue({ externalId: 'yk-1', paymentUrl: 'https://pay' });
    const created = await service.create('shop', {
      provider: InvoiceProvider.YOOKASSA,
      amount: 10,
      callbackUrl,
      returnUrl: 'https://shop.example/back',
    });
    expect(created.created).toBe(true);
    expect(yookassaPayment).toHaveBeenCalled();
    expect(usdtPayment).not.toHaveBeenCalled();
  });

  it('rejects the same orderId on another USDT network', async () => {
    usdtOn = true;
    findOneBy.mockResolvedValue({
      id: 'existing',
      provider: InvoiceProvider.USDT,
      amount: 10.5,
      network: UsdtNetwork.TON,
      paymentUrl: 'ton://transfer/UQ',
    });

    await expect(
      service.create('shop', {
        orderId: 'order-1',
        provider: InvoiceProvider.USDT,
        network: UsdtNetwork.ETHEREUM,
        amount: 10.5,
        callbackUrl,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usdtPayment).not.toHaveBeenCalled();
  });
});
