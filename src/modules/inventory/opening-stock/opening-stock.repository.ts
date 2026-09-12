import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AbstractRepository } from 'src/DB/repositories/abstract.repository';
import {
  OpeningStockDocument,
  OpeningStockModelName,
} from './entities/opening-stock.model';

@Injectable()
export class OpeningStockRepository extends AbstractRepository<OpeningStockDocument> {
  constructor(
    @InjectModel(OpeningStockModelName)
    model: Model<OpeningStockDocument>,
  ) {
    super(model);
  }
}
