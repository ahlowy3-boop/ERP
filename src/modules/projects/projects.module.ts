import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectModel } from './entities/project.model';
import { CostCentersModule } from '../cost-centers/cost-centers.module';

@Module({
  imports: [ProjectModel, CostCentersModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService, ProjectModel],
})
export class ProjectsModule {}
