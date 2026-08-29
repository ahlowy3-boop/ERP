import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { PurchaseRequestsService } from './purchase-requests.service';
import { CreatePurchaseRequestDto } from './dto/create-pr.dto';
import { UpdatePrStatusDto } from './dto/update-pr-status.dto';
import { FindPrsDto } from './dto/find-prs.dto';

@Controller('procurement/purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly prService: PurchaseRequestsService) {}

  @Post()
  async create(@Body() createDto: CreatePurchaseRequestDto) {
    return this.prService.create(createDto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateData: UpdatePrStatusDto,
  ) {
    return this.prService.updateStatus(
      id,
      updateData.status,
      updateData.approvedBy,
    );
  }

  // Support frontend PATCH :id/approve with { action: 'approve' | 'reject', comments?: string }
  @Patch(':id/approve')
  async approveOrReject(
    @Param('id') id: string,
    @Body() body: { action?: string; comments?: string; approverName?: string },
  ) {
    const status = body.action === 'reject' ? 'Rejected' : 'Approved';
    return this.prService.updateStatus(id, status, body.approverName);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prService.remove(id);
  }

  @Get()
  async findAll(@Query() query: FindPrsDto) {
    return this.prService.findAll(query);
  }
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prService.findOne(id);
  }
}
