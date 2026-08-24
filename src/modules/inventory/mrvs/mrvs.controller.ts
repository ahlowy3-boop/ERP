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
import { MrvsService } from './mrvs.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('inventory/mrvs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MrvsController {
  constructor(private readonly mrvsService: MrvsService) {}

  @Post()
  @RequirePermissions('edit:inventory')
  async create(@Body() createMrvDto: any, @CurrentUser('id') userId: string) {
    // نمرر الـ userId لتسجيل من قام بإنشاء الإذن في قاعدة البيانات
    return this.mrvsService.create(createMrvDto, userId);
  }

  @Get()
  @RequirePermissions('view:inventory')
  async findAll(@Query() query: any) {
    return this.mrvsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('view:inventory')
  async findOne(@Param('id') id: string) {
    return this.mrvsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('edit:inventory')
  async update(
    @Param('id') id: string,
    @Body() updateMrvDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mrvsService.update(id, updateMrvDto, userId);
  }

  @Put(':id')
  @RequirePermissions('edit:inventory')
  async replace(
    @Param('id') id: string,
    @Body() updateMrvDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mrvsService.update(id, updateMrvDto, userId);
  }

  @Delete(':id')
  @RequirePermissions('edit:inventory')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.mrvsService.remove(id, userId);
  }
}
