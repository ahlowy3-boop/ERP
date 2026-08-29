import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  Query,
} from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import {
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateRfqDto, RfqVendorDto } from './dto/create-rfq.dto';
import { AddQuotationDto } from './dto/add-quotation.dto';

@Controller('procurement/rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Post()
  async create(@Body() createRfqDto: CreateRfqDto) {
    return this.rfqsService.createRfq(createRfqDto);
  }

  @Post(':id/quotations')
  async addQuotation(
    @Param('id') rfqId: string,
    @Body() quotationDto: AddQuotationDto,
  ) {
    return this.rfqsService.addQuotation(rfqId, quotationDto);
  }

  @Post(':id/award')
  async award(
    @Param('id') rfqId: string,
    @Body('vendorId') vendorId: string,
    @Body('quotationId') quotationId: string,
  ) {
    return this.rfqsService.awardQuotation(rfqId, quotationId, vendorId);
  }

  @Post(':id/quotations/:qId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadQuotationAttachment(
    @Param('id') rfqId: string,
    @Param('qId') quotationId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(pdf|doc|docx|jpg|png|xls|xlsx)$/ })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    // 💡 يفترض إضافة هذه الدالة في RfqsService لاستخدام FileUploadService
    return this.rfqsService.uploadQuotationAttachment(rfqId, quotationId, file);
  }

  @Post(':id/invite-vendors')
  async inviteVendors(
    @Param('id') id: string,
    @Body('vendors') vendors: RfqVendorDto[],
  ) {
    return this.rfqsService.inviteVendors(id, vendors);
  }

  // Alias POST :id/send for frontend compatibility
  @Post(':id/send')
  async sendRfq(@Param('id') id: string) {
    return { success: true, message: 'RFQ sent successfully to vendors', rfqId: id };
  }

  @Patch(':id/quotations/:qId/status')
  async updateQuotationStatus(
    @Param('id') rfqId: string,
    @Param('qId') quotationId: string,
    @Body('status') status: string,
  ) {
    return this.rfqsService.updateQuotationStatus(rfqId, quotationId, status);
  }

  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.rfqsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rfqsService.findOne(id);
  }
}
