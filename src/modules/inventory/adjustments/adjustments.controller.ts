import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('inventory/adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  @RequirePermissions('edit:inventory')
  async create(
    @Body() createAdjustmentDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.adjustmentsService.create(createAdjustmentDto, userId);
  }

  @Get()
  @RequirePermissions('view:inventory')
  async findAll(@Query() query: any) {
    return this.adjustmentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('view:inventory')
  async findOne(@Param('id') id: string) {
    return this.adjustmentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('edit:inventory')
  async update(
    @Param('id') id: string,
    @Body() updateAdjustmentDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.adjustmentsService.update(id, updateAdjustmentDto, userId);
  }

  @Put(':id')
  @RequirePermissions('edit:inventory')
  async replace(
    @Param('id') id: string,
    @Body() updateAdjustmentDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.adjustmentsService.update(id, updateAdjustmentDto, userId);
  }

  @Delete(':id')
  @RequirePermissions('edit:inventory')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.adjustmentsService.remove(id, userId);
  }
}
