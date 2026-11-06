import { Module } from '@nestjs/common';
import { CallbacksModule } from '../callbacks/callbacks.module';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [CallbacksModule],
  controllers: [WechatController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
