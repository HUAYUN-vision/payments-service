import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { AppConfigService } from '../../config/app-config.service';
import {
  InvoiceEntity,
  InvoiceProvider,
  InvoiceStatus,
  UsdtNetwork,
} from '../database/entities/invoice.entity';
import type {
  CreatedPayment,
  CreatePaymentParams,
  PaymentProvider,
} from '../invoices/payment-provider';
import { allocatePayAmount, decimalToMicro, fromMicroUsdt, toMicroUsdt } from './amount';
import { ethereumPaymentUrl } from './ethereum';
import { tonPaymentUrl } from './ton';
import { tronPaymentUrl } from './tron';
import { UsdtWalletService } from './usdt-wallet.service';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsdtService implements PaymentProvider {
  readonly currency = 'USDT';

  constructor(
    private readonly config: AppConfigService,
    private readonly wallet: UsdtWalletService,
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
  ) {}

  isConfigured(): boolean {
    return this.wallet.isConfigured();
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const network = params.network;
    if (!network) throw new BadRequestException('network is required for usdt');
    this.assertNetworkConfigured(network);

    const addresses = this.wallet.addresses;
    if (!addresses) throw new BadRequestException('provider "usdt" is not configured');

    const expiresAt = new Date(Date.now() + this.config.get('USDT_INVOICE_TTL_SEC') * 1000);

    if (network === UsdtNetwork.TON) {
      const micro = toMicroUsdt(params.amount);
      const payment: CreatedPayment = {
        externalId: params.invoiceId,
        paymentUrl: tonPaymentUrl(addresses.ton, micro, params.invoiceId),
        network,
        payAmount: fromMicroUsdt(micro),
        payAddress: addresses.ton,
        memo: params.invoiceId,
        expiresAt,
      };
      await this.persist(this.invoices.manager, params.invoiceId, payment);
      return payment;
    }

    const payAddress = network === UsdtNetwork.ETHEREUM ? addresses.ethereum : addresses.tron;
    return this.invoices.manager.transaction(async (manager) => {
      // Держим блокировку, пока payAmount не записан: иначе два запроса возьмут один хвост.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`usdt-pay:${network}`]);
      const micro = allocatePayAmount(params.amount, await this.usedPayAmounts(manager, network));
      if (micro == null) {
        throw new ConflictException('no free USDT pay amount for this network');
      }
      const payment: CreatedPayment = {
        externalId: params.invoiceId,
        paymentUrl:
          network === UsdtNetwork.ETHEREUM
            ? ethereumPaymentUrl(payAddress, micro)
            : tronPaymentUrl(payAddress),
        network,
        payAmount: fromMicroUsdt(micro),
        payAddress,
        memo: null,
        expiresAt,
      };
      await this.persist(manager, params.invoiceId, payment);
      return payment;
    });
  }

  private assertNetworkConfigured(network: UsdtNetwork): void {
    if (network === UsdtNetwork.TON) {
      if (this.config.get('USDT_TON_API_URL') && this.config.get('USDT_TON_API_KEY')) return;
    } else if (network === UsdtNetwork.ETHEREUM) {
      if (this.config.get('USDT_ETH_RPC_URL')) return;
    } else if (this.config.get('USDT_TRON_API_URL') && this.config.get('USDT_TRON_API_KEY')) {
      return;
    }
    throw new BadRequestException(`usdt network "${network}" is not configured`);
  }

  private async usedPayAmounts(manager: EntityManager, network: UsdtNetwork): Promise<Set<bigint>> {
    const rows: unknown = await manager.query(
      `SELECT pay_amount::text AS pay_amount
         FROM invoices
        WHERE provider = $1 AND network = $2 AND status = $3 AND pay_amount IS NOT NULL`,
      [InvoiceProvider.USDT, network, InvoiceStatus.PENDING],
    );
    const used = new Set<bigint>();
    if (!Array.isArray(rows)) return used;
    for (const row of rows) {
      const value = payAmountText(row);
      if (value) used.add(decimalToMicro(value));
    }
    return used;
  }

  /** Пишет поля оплаты в той же транзакции, что и выбор хвоста. */
  private async persist(
    manager: EntityManager,
    invoiceId: string,
    payment: CreatedPayment,
  ): Promise<void> {
    try {
      const result = await manager.update(InvoiceEntity, invoiceId, {
        externalId: payment.externalId,
        paymentUrl: payment.paymentUrl,
        network: payment.network ?? null,
        payAmount: payment.payAmount ?? null,
        payAddress: payment.payAddress ?? null,
        memo: payment.memo ?? null,
        expiresAt: payment.expiresAt ?? null,
      });
      if (result.affected === 0) {
        throw new Error(`USDT invoice ${invoiceId} disappeared before the payment was saved`);
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('no free USDT pay amount for this network');
      }
      throw error;
    }
  }
}

function payAmountText(row: unknown): string | undefined {
  if (typeof row !== 'object' || row === null || !('pay_amount' in row)) return undefined;
  const value = row.pay_amount;
  return typeof value === 'string' ? value : undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}
