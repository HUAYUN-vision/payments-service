import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard, CurrentProject } from '../../common/guards/api-key.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceView, toInvoiceView } from './invoice-view';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * Создать инвойс и получить ссылку на оплату.
   * 201 — создан новый; 200 — инвойс с таким orderId уже есть, возвращён он;
   * 409 — orderId занят инвойсом с другими provider/amount.
   */
  @Post()
  async create(
    @CurrentProject() project: string,
    @Body() dto: CreateInvoiceDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InvoiceView> {
    const { invoice, created } = await this.invoicesService.create(project, dto);
    if (!created) res.status(HttpStatus.OK);
    return toInvoiceView(invoice);
  }

  /** Получить инвойс и его статус */
  @Get(':id')
  async findOne(
    @CurrentProject() project: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<InvoiceView> {
    return toInvoiceView(await this.invoicesService.findOne(project, id));
  }
}
