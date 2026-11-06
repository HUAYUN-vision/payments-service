import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { CallbacksService } from './callbacks.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity])],
  providers: [CallbacksService],
  exports: [CallbacksService],
})
export class CallbacksModule {}
