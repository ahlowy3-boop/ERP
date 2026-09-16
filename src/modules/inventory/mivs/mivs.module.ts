import { Module } from '@nestjs/common';
import { MivsController } from './mivs.controller';
import { MivsService } from './mivs.service';
import { MIVModel } from './entities/miv.model';
import { MivsRepository } from './mivs.repository';
import { ItemsModule } from '../items/items.module';
import { ItemLedgerModel } from 'src/modules/inventory/reports/entities/item-ledger.model';
import { ItemLedgerRepository } from 'src/modules/inventory/reports/item-ledger.repository';

@Module({
  imports: [MIVModel, ItemLedgerModel, ItemsModule],
  controllers: [MivsController],
  providers: [MivsService, MivsRepository, ItemLedgerRepository],
  exports: [MivsService, MivsRepository],
})
export class MivsModule {}
