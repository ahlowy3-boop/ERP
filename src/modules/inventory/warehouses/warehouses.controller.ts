import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  Put,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  // POST /api/v1/inventory/warehouses
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateWarehouseDto) {
    return this.warehousesService.create(createDto);
  }

  // GET /api/v1/inventory/warehouses
  @Get()
  async findAll(@Query() query: any) {
    return this.warehousesService.findAll(
      query.page ? parseInt(query.page) : 1,
      query.limit ? parseInt(query.limit) : 50,
      query.status,
    );
  }

  // GET /api/v1/inventory/warehouses/:id
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  // PATCH /api/v1/inventory/warehouses/:id
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: any) {
    return this.warehousesService.update(id, updateDto);
  }

  // PUT /api/v1/inventory/warehouses/:id
  @Put(':id')
  async replace(@Param('id') id: string, @Body() dto: any) {
    return this.warehousesService.update(id, dto);
  }

  // DELETE /api/v1/inventory/warehouses/:id
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }
}
