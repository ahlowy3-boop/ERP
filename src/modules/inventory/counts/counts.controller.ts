import { Controller, Post, Body, Param, Patch } from '@nestjs/common';
import { CountsService } from './counts.service';
import { CreateCountDto } from './dto/create-count.dto';
@Controller('inventory/counts')
export class CountsController {
  constructor(private readonly countsService: CountsService) {}

  @Post()
  async create(@Body() data: CreateCountDto) {
    return this.countsService.createCount(data);
  }

  @Patch(':id/complete')
  async complete(@Param('id') id: string) {
    return this.countsService.completeCount(id);
  }

  // Alias POST /api/v1/inventory/counts/:id/complete (frontend compatibility)
  @Post(':id/complete')
  async completePost(@Param('id') id: string) {
    return this.countsService.completeCount(id);
  }
}
