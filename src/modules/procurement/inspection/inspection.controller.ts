import { Controller, Post, Body, Param, Get, Patch } from '@nestjs/common';
import { InspectionService } from './inspection.service';
import { SubmitInspectionDto } from './dto/submit-inspection.dto';
import { CreateNcrDto } from './dto/create-ncr.dto';
import { Query, ParseIntPipe } from '@nestjs/common';
// ...

@Controller('procurement/inspection')
export class InspectionController {
  constructor(private readonly inspectionService: InspectionService) {}

  @Post(':id/submit')
  async submitInspection(
    @Param('id') id: string,
    @Body() submitData: SubmitInspectionDto,
  ) {
    return this.inspectionService.submitInspection(id, submitData);
  }

  @Post(':id/ncr')
  async raiseNcr(
    @Param('id') inspectionId: string,
    @Body() ncrData: CreateNcrDto,
  ) {
    return this.inspectionService.createNcr(inspectionId, ncrData);
  }

  @Patch('ncrs/:id/resolve')
  async resolveNcr(
    @Param('id') ncrId: string,
    @Body('resolvedBy') resolvedBy: string,
  ) {
    return this.inspectionService.resolveNcr(ncrId, resolvedBy);
  }

  @Get()
  async findAllInspections(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.inspectionService.findAllInspections(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      status,
    );
  }

  @Get('ncrs')
  async findAllNcrs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inspectionService.findAllNcrs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  async findOneInspection(@Param('id') id: string) {
    return this.inspectionService.findOneInspection(id);
  }
}
