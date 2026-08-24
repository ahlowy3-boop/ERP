import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto, UpdateEquipmentStatusDto } from './dto/equipment.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('assets/equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  // GET /api/v1/assets/equipment
  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.equipmentService.findAll({ search, category, status, page, limit });
  }

  // GET /api/v1/assets/equipment/stats
  @Get('stats')
  getStats() {
    return this.equipmentService.getStats();
  }

  // GET /api/v1/assets/equipment/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.equipmentService.findOne(id);
  }

  // POST /api/v1/assets/equipment
  @Post()
  create(
    @Body() dto: CreateEquipmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.create(dto, userId);
  }

  // PUT /api/v1/assets/equipment/:id — Full update
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.update(id, dto, userId);
  }

  // PATCH /api/v1/assets/equipment/:id/status
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.updateStatus(id, dto, userId);
  }

  // DELETE /api/v1/assets/equipment/:id
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.equipmentService.remove(id);
  }

  // POST /api/v1/assets/equipment/:id/assign — إسناد معدة لمشروع أو سائق
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: { projectCode?: string; projectId?: string; assignedTo?: string; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.assign(id, dto, userId);
  }

  // POST /api/v1/assets/equipment/:id/transfer — نقل معدة بين مواقع
  @Post(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() dto: { toProjectCode?: string; toLocation?: string; reason?: string; transferDate?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.transfer(id, dto, userId);
  }

  // POST /api/v1/assets/equipment/:id/scrap — تخريد واستبعاد معدة
  @Post(':id/scrap')
  scrap(
    @Param('id') id: string,
    @Body() dto: { reason: string; scrapDate?: string; scrapValue?: number; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.equipmentService.scrap(id, dto, userId);
  }
}
