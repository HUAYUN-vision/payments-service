import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InvoiceProvider, type InvoiceMetadata } from '../../database/entities/invoice.entity';

const urlOptions = { require_tld: false, protocols: ['http', 'https'], require_protocol: true };

export class CreateInvoiceDto {
  /**
   * ID заказа в вашем проекте — ключ идемпотентности.
   * Повторный запрос с тем же orderId вернёт уже созданный инвойс (200) вместо нового.
   * @example "order-42"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  orderId?: string;

  /** Платёжная система */
  @IsEnum(InvoiceProvider)
  provider: InvoiceProvider;

  /**
   * Сумма в основных единицах валюты, до 2 знаков после запятой.
   * Валюта определяется провайдером: yookassa — RUB, wechat — CNY.
   * @example 199.9
   */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(999_999_999)
  amount: number;

  /**
   * Назначение платежа (видит плательщик)
   * @example "Подписка на месяц"
   */
  @IsOptional()
  @IsString()
  @MaxLength(127)
  description?: string;

  /**
   * Куда отправить POST-уведомление при оплате / отмене
   * @example "https://my-shop.example.com/payments/callback"
   */
  @IsUrl(urlOptions)
  @MaxLength(2048)
  callbackUrl: string;

  /**
   * Только для yookassa: куда вернуть пользователя после оплаты.
   * Если не задан — используется YOOKASSA_RETURN_URL.
   */
  @IsOptional()
  @IsUrl({ ...urlOptions, protocols: ['http', 'https', 'tg'] })
  @MaxLength(2048)
  returnUrl?: string;

  /**
   * Произвольные данные клиента — возвращаются в GET и в уведомлении.
   * @example { "orderId": "42", "userId": "u_1" }
   */
  @IsOptional()
  @IsObject()
  metadata?: InvoiceMetadata;
}
