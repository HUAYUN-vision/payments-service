import { Module } from '@nestjs/common';
import { CallbacksModule } from '../callbacks/callbacks.module';
import { YookassaWebhookController } from './yookassa-webhook.controller';
import { YookassaService } from './yookassa.service';

@Module({
  imports: [CallbacksModule],
  controllers: [YookassaWebhookController],
  providers: [YookassaService],
  exports: [YookassaService],
})
export class YookassaModule {}
