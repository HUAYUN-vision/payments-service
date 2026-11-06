import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { YookassaWebhookPayload } from './types/yookassa.types';
import { YookassaService } from './yookassa.service';

/** URL для настроек магазина YooKassa: https://<host>/api/v1/yookassa/webhook */
@ApiExcludeController()
@Controller('yookassa')
export class YookassaWebhookController {
  constructor(private readonly yookassaService: YookassaService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: YookassaWebhookPayload): Promise<void> {
    await this.yookassaService.handleWebhook(body);
  }
}
