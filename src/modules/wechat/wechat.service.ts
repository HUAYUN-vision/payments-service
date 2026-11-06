import * as fs from 'node:fs';
import path from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import WxPay from 'wechatpay-node-v3';
import { AppConfigService } from '../../config/app-config.service';
import { CallbacksService } from '../callbacks/callbacks.service';
import { InvoiceProvider } from '../database/entities/invoice.entity';
import type {
  CreatedPayment,
  CreatePaymentParams,
  PaymentProvider,
} from '../invoices/payment-provider';
import type { WechatCallbackPayload, WechatTransaction } from './types/wechat.types';

/** out_trade_no: 6-32 символа [A-Za-z0-9_-*] — uuid без дефисов ровно 32 */
export const toOutTradeNo = (invoiceId: string) => invoiceId.replace(/-/g, '');

@Injectable()
export class WechatService implements PaymentProvider, OnModuleInit {
  readonly currency = 'CNY';
  private readonly logger = new Logger(WechatService.name);
  private wxPay?: WxPay;

  constructor(
    private readonly config: AppConfigService,
    private readonly callbacks: CallbacksService,
  ) {}

  onModuleInit(): void {
    this.initWxPay();
  }

  isConfigured(): boolean {
    return !!this.wxPay && !!this.config.get('WECHAT_NOTIFY_URL');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const notifyUrl = this.config.get('WECHAT_NOTIFY_URL');
    if (!this.wxPay || !notifyUrl) throw new BadRequestException('wechat is not configured');

    const outTradeNo = toOutTradeNo(params.invoiceId);
    const result = await this.wxPay.transactions_native({
      description: params.description ?? `Invoice ${outTradeNo}`,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      attach: params.invoiceId,
      amount: { total: Math.round(params.amount * 100), currency: this.currency },
    });

    const codeUrl = (result.data as { code_url?: string } | undefined)?.code_url;
    if (result.status !== 200 || !codeUrl) {
      this.logger.error(
        `WeChat native order failed: ${result.status} ${JSON.stringify(result.error)}`,
      );
      throw new BadGatewayException(`wechat error: HTTP ${result.status}`);
    }
    return { externalId: outTradeNo, paymentUrl: codeUrl };
  }

  /**
   * Ресурс зашифрован AES-256-GCM ключом APIv3 — успешная расшифровка
   * подтверждает, что уведомление пришло от WeChat.
   */
  async handleCallback(data: WechatCallbackPayload): Promise<void> {
    if (!this.wxPay) throw new BadRequestException('wechat is not configured');
    if (!data?.resource) throw new BadRequestException('resource is missing');

    const { ciphertext, associated_data, nonce } = data.resource;
    let trx: WechatTransaction;
    try {
      trx = this.wxPay.decipher_gcm<WechatTransaction>(ciphertext, associated_data, nonce);
    } catch (e) {
      this.logger.warn(`WeChat callback decrypt failed: ${String(e)}`);
      throw new BadRequestException('cannot decrypt resource');
    }

    if (trx.trade_state === 'SUCCESS') {
      await this.callbacks.markPaid(InvoiceProvider.WECHAT, trx.out_trade_no);
    }
  }

  private initWxPay(): void {
    const appid = this.config.get('WECHAT_APPID');
    const mchid = this.config.get('WECHAT_MCHID');
    const key = this.config.get('WECHAT_API_V3_KEY');
    if (!appid || !mchid || !key) {
      this.logger.log(
        'WeChat Pay is disabled: WECHAT_APPID / WECHAT_MCHID / WECHAT_API_V3_KEY not set',
      );
      return;
    }

    const certsDir = path.resolve(process.cwd(), this.config.get('WECHAT_CERTS_DIR'));
    try {
      this.wxPay = new WxPay({
        appid,
        mchid,
        key,
        publicKey: fs.readFileSync(path.join(certsDir, 'apiclient_cert.pem')),
        privateKey: fs.readFileSync(path.join(certsDir, 'apiclient_key.pem')),
      });
    } catch (e) {
      this.logger.error(`WeChat Pay init failed (certs dir: ${certsDir})`, e);
    }
  }
}
