import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ApprovePoStepDto } from './dto/approve-po.dto';
import {
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Get(':id')
  async getPo(@Param('id') poId: string) {
    return this.poService.getPoDetails(poId);
  }

  @Post(':id/approve')
  async approvePoStep(
    @Param('id') poId: string,
    @Body() approveDto: ApprovePoStepDto,
  ) {
    return this.poService.approveStep(
      poId,
      approveDto.role,
      approveDto.approverName,
      approveDto.comments,
    );
  }

  // Alias PATCH :id/approve for frontend compatibility
  @Patch(':id/approve')
  async approvePoPatch(
    @Param('id') poId: string,
    @Body() approveDto: any,
  ) {
    return this.poService.approveStep(
      poId,
      approveDto.role || approveDto.action,
      approveDto.approverName,
      approveDto.comments,
    );
  }
  @Patch(':id/contract')
  @UseInterceptors(FileInterceptor('contractFile'))
  async uploadContract(
    @Param('id') poId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(pdf|jpg|jpeg|png)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5 ميجا للعقود
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
    @Body('contractNumber') contractNumber?: string,
    @Body('contractTitle') contractTitle?: string,
  ) {
    // 💡 يفترض إضافة هذه الدالة في PurchaseOrdersService
    return this.poService.uploadContract(
      poId,
      file,
      contractNumber,
      contractTitle,
    );
  }

  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.poService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post()
  async createManual(@Body() data: any) {
    return this.poService.createManual(data);
  }

  @Get(':id/download')
  async downloadContract(@Param('id') poId: string, @Res() res: Response) {
    const poResult = await this.poService.getPoDetails(poId);

    if (!poResult.data.contractFileUrl) {
      throw new NotFoundException('No contract file uploaded for this PO');
    }

    // بما أن الملفات مرفوعة على Cloudinary، نقوم بعمل Redirect للرابط المباشر للملف
    return res.redirect(poResult.data.contractFileUrl);
  }
}
