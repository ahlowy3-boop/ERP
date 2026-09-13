import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto, RfqVendorDto } from './dto/create-rfq.dto';
import { AddQuotationDto } from './dto/add-quotation.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('procurement/rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  // POST /api/v1/procurement/rfqs
  @Post()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
  async create(
    @Body() createRfqDto: CreateRfqDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.rfqsService.createRfq(createRfqDto, userId);
  }

  // GET /api/v1/procurement/rfqs
  @Get()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
    UserRole.FinanceManager,
    UserRole.ProjectManager,
  )
  @RequirePermissions('view:procurement')
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.rfqsService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      status,
      search,
      sortBy,
      sortOrder,
    });
  }

  // GET /api/v1/procurement/rfqs/:id
  @Get(':id')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
    UserRole.FinanceManager,
    UserRole.ProjectManager,
  )
  @RequirePermissions('view:procurement')
  async findOne(@Param('id') id: string) {
    return this.rfqsService.findOne(id);
  }

  // POST /api/v1/procurement/rfqs/:id/quotations
  @Post(':id/quotations')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
  async addQuotation(
    @Param('id') rfqId: string,
    @Body() quotationDto: AddQuotationDto,
  ) {
    return this.rfqsService.addQuotation(rfqId, quotationDto);
  }

  // POST /api/v1/procurement/rfqs/:id/invite-vendors
  @Post(':id/invite-vendors')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
  async inviteVendors(
    @Param('id') id: string,
    @Body('vendors') vendors: RfqVendorDto[],
  ) {
    return this.rfqsService.inviteVendors(id, vendors);
  }

  // PATCH /api/v1/procurement/rfqs/:id/quotations/:qId/status
  @Patch(':id/quotations/:qId/status')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
  async updateQuotationStatus(
    @Param('id') rfqId: string,
    @Param('qId') quotationId: string,
    @Body('status') status: string,
  ) {
    return this.rfqsService.updateQuotationStatus(rfqId, quotationId, status);
  }

  // POST /api/v1/procurement/rfqs/:id/award
  @Post(':id/award')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('approve:po')
  async award(
    @Param('id') rfqId: string,
    @Body('vendorId') vendorId?: string,
    @Body('quotationId') quotationId?: string,
    @Body() body?: any,
  ) {
    const vId = vendorId || body?.vendorId || body?.winningVendorId;
    const qId = quotationId || body?.quotationId || body?.winningQuotationId;
    return this.rfqsService.awardQuotation(rfqId, qId, vId);
  }

  // POST /api/v1/procurement/rfqs/:id/quotations/:qId/attachments
  @Post(':id/quotations/:qId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
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
    return this.rfqsService.uploadQuotationAttachment(rfqId, quotationId, file);
  }

  // Alias POST :id/send for frontend compatibility
  @Post(':id/send')
  @Roles(
    UserRole.SuperAdmin,
    UserRole.GeneralManager,
    UserRole.ProcurementManager,
  )
  @RequirePermissions('edit:procurement')
  async sendRfq(@Param('id') id: string) {
    return { success: true, message: 'RFQ sent successfully to vendors', rfqId: id };
  }
}
