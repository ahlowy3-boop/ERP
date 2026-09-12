import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OpeningStockService } from './opening-stock.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';
import { UserRole } from 'src/DB/enums/user.enum';

@Controller('inventory/opening-stock')
export class OpeningStockController {
  constructor(private readonly svc: OpeningStockService) {}

  // POST /api/v1/inventory/opening-stock
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  create(
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.create(dto, userId);
  }

  // POST /api/v1/inventory/opening-stock/import
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.importFromExcel(file, userId);
  }

  // GET /api/v1/inventory/opening-stock
  @Get()
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper,
    UserRole.OperationsManager, UserRole.ProjectManager,
  )
  @RequirePermissions('view:inventory')
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  // GET /api/v1/inventory/opening-stock/:id
  @Get(':id')
  @Roles(
    UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper,
    UserRole.OperationsManager, UserRole.ProjectManager,
  )
  @RequirePermissions('view:inventory')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  // PATCH /api/v1/inventory/opening-stock/:id/post
  @Patch(':id/post')
  @Roles(UserRole.SuperAdmin, UserRole.GeneralManager, UserRole.StoreKeeper)
  @RequirePermissions('edit:inventory')
  post(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.post(id, userId);
  }
}
