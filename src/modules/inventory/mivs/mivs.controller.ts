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
import { MivsService } from './mivs.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('inventory/mivs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MivsController {
  constructor(private readonly mivsService: MivsService) {}

  @Post()
  @RequirePermissions('edit:inventory')
  async create(@Body() createMivDto: any, @CurrentUser('id') userId: string) {
    return this.mivsService.create(createMivDto, userId);
  }

  @Get()
  @RequirePermissions('view:inventory')
  async findAll(@Query() query: any) {
    return this.mivsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('view:inventory')
  async findOne(@Param('id') id: string) {
    return this.mivsService.findOne(id);
  }

  @Post(':id/post')
  @RequirePermissions('edit:inventory')
  async postMiv(
    @Param('id') id: string,
    @Body() postDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mivsService.postMiv(id, postDto, userId);
  }

  @Patch(':id/post')
  @RequirePermissions('edit:inventory')
  async postMivPatch(
    @Param('id') id: string,
    @Body() postDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mivsService.postMiv(id, postDto, userId);
  }

  @Post(':id/approve')
  @RequirePermissions('edit:inventory')
  async approvePost(
    @Param('id') id: string,
    @Body() postDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mivsService.postMiv(id, postDto, userId);
  }

  @Patch(':id')
  @RequirePermissions('edit:inventory')
  async update(
    @Param('id') id: string,
    @Body() updateMivDto: any,
    @CurrentUser('id') userId: string,
  ) {
    // Support: PATCH /mivs/:id with { status: "Posted" } → approve and deduct inventory
    if (updateMivDto.status === 'Posted' || updateMivDto.status === 'Approved') {
      return this.mivsService.postMiv(id, updateMivDto, userId);
    }
    return this.mivsService.update(id, updateMivDto, userId);
  }

  @Put(':id')
  @RequirePermissions('edit:inventory')
  async replace(
    @Param('id') id: string,
    @Body() updateMivDto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.mivsService.update(id, updateMivDto, userId);
  }

  @Delete(':id')
  @RequirePermissions('edit:inventory')
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.mivsService.remove(id, userId);
  }
}
