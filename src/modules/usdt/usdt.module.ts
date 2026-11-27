import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../database/entities/invoice.entity';
import { UsdtService } from './usdt.service';
import { UsdtWalletService } from './usdt-wallet.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity])],
  providers: [UsdtWalletService, UsdtService],
  exports: [UsdtWalletService, UsdtService],
})
export class UsdtModule {}
