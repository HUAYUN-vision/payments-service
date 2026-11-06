import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';

export enum InvoiceProvider {
  YOOKASSA = 'yookassa',
  WECHAT = 'wechat',
}

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELED = 'canceled',
}

export enum CallbackStatus {
  /** событие ещё не наступило */
  NONE = 'none',
  /** ждёт отправки / повторной попытки */
  PENDING = 'pending',
  DELIVERED = 'delivered',
  /** исчерпаны попытки */
  FAILED = 'failed',
}

export type InvoiceMetadata = Record<string, string | number | boolean | null>;

/** numeric -> number (pg отдаёт numeric строкой) */
const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

@Entity({ name: 'invoices' })
@Index(['project', 'createdAt'])
@Index(['project', 'orderId'], { unique: true, where: '"order_id" IS NOT NULL' })
@Index(['provider', 'externalId'], { unique: true, where: '"external_id" IS NOT NULL' })
@Index(['nextCallbackAt'], { where: `"callback_status" = 'pending'` })
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Проект-клиент (ключ из API_KEYS) */
  @Column({ type: 'varchar', length: 64 })
  project: string;

  /** ID заказа на стороне проекта — ключ идемпотентности (уникален в рамках проекта) */
  @Column({ name: 'order_id', type: 'varchar', length: 128, nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 16 })
  provider: InvoiceProvider;

  @Column({ type: 'varchar', length: 16, default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  description: string | null;

  /** ID платежа у провайдера (YooKassa payment.id / WeChat out_trade_no) */
  @Column({ name: 'external_id', type: 'varchar', length: 64, nullable: true })
  externalId: string | null;

  /** YooKassa: confirmation_url; WeChat: code_url (weixin://...) для QR */
  @Column({ name: 'payment_url', type: 'text', nullable: true })
  paymentUrl: string | null;

  @Column({ name: 'callback_url', type: 'text' })
  callbackUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: InvoiceMetadata | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'callback_status', type: 'varchar', length: 16, default: CallbackStatus.NONE })
  callbackStatus: CallbackStatus;

  @Column({ name: 'callback_attempts', type: 'int', default: 0 })
  callbackAttempts: number;

  @Column({ name: 'next_callback_at', type: 'timestamptz', nullable: true })
  nextCallbackAt: Date | null;

  @Column({ name: 'callback_delivered_at', type: 'timestamptz', nullable: true })
  callbackDeliveredAt: Date | null;

  @Column({ name: 'callback_last_error', type: 'text', nullable: true })
  callbackLastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
