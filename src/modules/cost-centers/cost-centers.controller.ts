import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto, UpdateCostCenterDto } from './dto/cost-center.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('finance/cost-centers')
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  // 1. GET /api/v1/finance/cost-centers
  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  findAll(@Query() query: any) {
    return this.costCentersService.findAll(query);
  }

  // 2. POST /api/v1/finance/cost-centers/seed (Setup default hierarchy)
  @Post('seed')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  seedDefaultHierarchy() {
    return this.costCentersService.seedDefaultCostCenters();
  }

  // 3. GET /api/v1/finance/cost-centers/:code/transactions
  @Get(':code/transactions')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  getTransactions(@Param('code') code: string, @Query() query: any) {
    return this.costCentersService.getTransactions(code, query);
  }

  // 4. GET /api/v1/finance/cost-centers/:code
  @Get(':code')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager, UserRole.ProjectManager)
  @RequirePermissions('view:finance')
  findByCode(@Param('code') code: string) {
    return this.costCentersService.findByCode(code);
  }

  // 5. POST /api/v1/finance/cost-centers
  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCostCenterDto, @CurrentUser('id') userId: string) {
    return this.costCentersService.create(dto, userId);
  }

  // 6. PUT /api/v1/finance/cost-centers/:code
  @Put(':code')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  updateByCode(@Param('code') code: string, @Body() dto: UpdateCostCenterDto) {
    return this.costCentersService.updateByCode(code, dto);
  }

  // 7. PATCH /api/v1/finance/cost-centers/:code/toggle-status
  @Patch(':code/toggle-status')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.FinanceManager)
  @RequirePermissions('edit:finance')
  toggleStatus(@Param('code') code: string) {
    return this.costCentersService.toggleStatus(code);
  }

  // 8. DELETE /api/v1/finance/cost-centers/:code
  @Delete(':code')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager)
  @RequirePermissions('edit:finance')
  removeByCode(@Param('code') code: string) {
    return this.costCentersService.removeByCode(code);
  }
}
