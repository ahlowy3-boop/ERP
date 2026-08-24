import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('assets/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // GET /api/v1/assets/categories
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  // POST /api/v1/assets/categories
  @Post()
  create(
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.categoriesService.create(dto);
  }

  // PUT /api/v1/assets/categories/:id
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.categoriesService.update(id, dto);
  }
}
