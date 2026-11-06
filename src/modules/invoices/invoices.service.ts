import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { InvoiceEntity, InvoiceProvider, InvoiceStatus } from '../database/entities/invoice.entity';
import { WechatService } from '../wechat/wechat.service';
import { YookassaService } from '../yookassa/yookassa.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { PaymentProvider } from './payment-provider';

const METADATA_MAX_BYTES = 4096;
const PG_UNIQUE_VIOLATION = '23505';

export type CreateInvoiceResult = {
  invoice: InvoiceEntity;
  /** false — вернули ранее созданный инвойс с тем же orderId */
  created: boolean;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly providers: Record<InvoiceProvider, PaymentProvider>;

  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    yookassaService: YookassaService,
    wechatService: WechatService,
  ) {
    this.providers = {
      [InvoiceProvider.YOOKASSA]: yookassaService,
      [InvoiceProvider.WECHAT]: wechatService,
    };
  }

  async create(project: string, dto: CreateInvoiceDto): Promise<CreateInvoiceResult> {
    if (dto.orderId) {
      const existing = await this.invoices.findOneBy({ project, orderId: dto.orderId });
      if (existing) return { invoice: this.ensureSameOrder(existing, dto), created: false };
    }

    const provider = this.providers[dto.provider];
    if (!provider.isConfigured()) {
      throw new BadRequestException(`provider "${dto.provider}" is not configured`);
    }
    if (dto.metadata && Buffer.byteLength(JSON.stringify(dto.metadata)) > METADATA_MAX_BYTES) {
      throw new BadRequestException(`metadata must be <= ${METADATA_MAX_BYTES} bytes`);
    }

    // Сначала сохраняем инвойс, чтобы вебхук провайдера всегда находил запись.
    // Уникальный индекс (project, order_id) защищает от параллельных дублей.
    let invoice: InvoiceEntity;
    try {
      invoice = await this.invoices.save(
        this.invoices.create({
          id: randomUUID(),
          project,
          orderId: dto.orderId ?? null,
          provider: dto.provider,
          status: InvoiceStatus.PENDING,
          amount: dto.amount,
          currency: provider.currency,
          description: dto.description ?? null,
          callbackUrl: dto.callbackUrl,
          metadata: dto.metadata ?? null,
        }),
      );
    } catch (error) {
      if (dto.orderId && isUniqueViolation(error)) {
        const existing = await this.invoices.findOneBy({ project, orderId: dto.orderId });
        if (existing) return { invoice: this.ensureSameOrder(existing, dto), created: false };
      }
      throw error;
    }

    try {
      const payment = await provider.createPayment({
        invoiceId: invoice.id,
        amount: invoice.amount,
        description: invoice.description,
        returnUrl: dto.returnUrl,
      });
      invoice.externalId = payment.externalId;
      invoice.paymentUrl = payment.paymentUrl;
      await this.invoices.update(invoice.id, {
        externalId: payment.externalId,
        paymentUrl: payment.paymentUrl,
      });
    } catch (error) {
      // освобождаем orderId, чтобы клиент мог повторить запрос
      await this.invoices.delete(invoice.id).catch((e: unknown) => this.logger.error(e));
      throw error;
    }

    this.logger.log(`Invoice ${invoice.id} created: ${project} ${dto.provider} ${dto.amount}`);
    return { invoice, created: true };
  }

  async findOne(project: string, id: string): Promise<InvoiceEntity> {
    const invoice = await this.invoices.findOneBy({ id, project });
    if (!invoice) throw new NotFoundException('invoice not found');
    return invoice;
  }

  /** Повтор с тем же orderId допустим, только если это тот же заказ. */
  private ensureSameOrder(existing: InvoiceEntity, dto: CreateInvoiceDto): InvoiceEntity {
    if (existing.provider !== dto.provider || existing.amount !== dto.amount) {
      throw new ConflictException(
        `orderId "${dto.orderId}" is already used by invoice ${existing.id} ` +
          `with different provider/amount`,
      );
    }
    if (!existing.paymentUrl) {
      // параллельный запрос ещё создаёт платёж у провайдера
      throw new ConflictException(`invoice for orderId "${dto.orderId}" is being created, retry`);
    }
    return existing;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}
