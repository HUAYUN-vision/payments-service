import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { WechatModule } from '../wechat/wechat.module';
import { YookassaModule } from '../yookassa/yookassa.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity]), YookassaModule, WechatModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
