import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { UsdtModule } from '../usdt/usdt.module';
import { WechatModule } from '../wechat/wechat.module';
import { YookassaModule } from '../yookassa/yookassa.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity]), YookassaModule, WechatModule, UsdtModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
