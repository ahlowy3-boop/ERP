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
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  // POST /api/v1/inventory/warehouses
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  async create(@Body() createDto: CreateWarehouseDto) {
    return this.warehousesService.create(createDto);
  }

  // GET /api/v1/inventory/warehouses
  @Get()
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper,
    UserRole.OperationsManager, UserRole.ProjectManager, UserRole.ProcurementManager,
  )
  @RequirePermissions('view:inventory')
  async findAll(@Query() query: any) {
    return this.warehousesService.findAll(
      query.page  ? parseInt(query.page)  : 1,
      query.limit ? parseInt(query.limit) : 50,
      query.status,
    );
  }

  // GET /api/v1/inventory/warehouses/:id
  @Get(':id')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper,
    UserRole.OperationsManager, UserRole.ProjectManager, UserRole.ProcurementManager,
  )
  @RequirePermissions('view:inventory')
  async findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  // PATCH /api/v1/inventory/warehouses/:id
  @Patch(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  async update(@Param('id') id: string, @Body() updateDto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, updateDto);
  }

  // PUT /api/v1/inventory/warehouses/:id
  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  async replace(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  // DELETE /api/v1/inventory/warehouses/:id
  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('edit:inventory')
  async remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }
}
