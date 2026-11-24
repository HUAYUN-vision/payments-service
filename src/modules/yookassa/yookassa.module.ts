import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallbacksModule } from '../callbacks/callbacks.module';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { YookassaWebhookController } from './yookassa-webhook.controller';
import { YookassaService } from './yookassa.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity]), CallbacksModule],
  controllers: [YookassaWebhookController],
  providers: [YookassaService],
  exports: [YookassaService],
})
export class YookassaModule {}
