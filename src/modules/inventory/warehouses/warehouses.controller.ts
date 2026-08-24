import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  Put,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  async create(@Body() createDto: CreateWarehouseDto) {
    return this.warehousesService.create(createDto);
  }

  @Get()
  async findAll(@Query('page') page?: string) {
    return this.warehousesService.findAll(page ? parseInt(page) : 1);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: any) {
    return this.warehousesService.update(id, updateDto);
  }

  @Put(':id')
  async replace(@Param('id') id: string, @Body() dto: any) {
    return this.warehousesService.update(id, dto);
  }
}
