import { Model, Document } from 'mongoose';
import type { QueryFilter, UpdateQuery, QueryOptions } from 'mongoose';
import { Logger } from '@nestjs/common';

export abstract class AbstractRepository<TDocument extends Document> {
  protected readonly logger = new Logger(this.constructor.name);

  // جعل الموديل public ليكون متاحاً لبعض الخدمات التي تحتاجه مباشرة
  constructor(public readonly model: Model<TDocument>) {}

  async create(data: any, options?: QueryOptions): Promise<TDocument> {
    const createdDocument = new this.model(data);
    return (await createdDocument.save(options)) as TDocument;
  }

  async findOne(
    filterQuery: any,
    populate?: any,
  ): Promise<TDocument | null> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    const pop = populate || (filterQuery && filterQuery.populate);
    const query = this.model.findOne(filter);
    if (pop) query.populate(pop);
    return query.exec();
  }

  async findAll(
    options: {
      filter?: QueryFilter<TDocument>;
      populate?: any;
      select?: string;
      sort?: any;
      skip?: number;
      limit?: number;
      paginate?: { page?: number; limit: number };
      session?: any;
    } = {},
  ): Promise<TDocument[]> {
    const filter = options.filter || {};
    const query = this.model.find(filter);

    if (options.session) query.session(options.session);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    if (options.sort) query.sort(options.sort);

    // دعم الـ Pagination
    if (options.paginate) {
      const page = options.paginate.page ?? 1;
      const skip = (page - 1) * options.paginate.limit;
      query.skip(skip).limit(options.paginate.limit);
    } else {
      if (options.skip) query.skip(options.skip);
      if (options.limit) query.limit(options.limit);
    }

    return query.exec();
  }

  async findOneAndUpdate(
    filterQuery: any,
    updateData: UpdateQuery<TDocument>,
    options: QueryOptions = {},
  ): Promise<TDocument | null> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    return this.model
      .findOneAndUpdate(filter, updateData, { new: true, ...options })
      .exec();
  }

  async update(
    filterQuery: any,
    updateData: UpdateQuery<TDocument>,
    options: QueryOptions = {},
  ): Promise<any> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    return this.model.updateOne(filter, updateData, options as any).exec();
  }

  async delete(filterQuery: any): Promise<any> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    return this.model.deleteOne(filter).exec();
  }

  async deleteMany(
    filterQuery: any,
    options?: QueryOptions,
  ): Promise<any> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    return this.model.deleteMany(filter, options as any).exec();
  }

  async softDelete(
    filterQuery: any,
    options?: QueryOptions,
  ): Promise<any> {
    const filter =
      filterQuery && typeof filterQuery === 'object' && 'filter' in filterQuery
        ? filterQuery.filter
        : filterQuery;
    return this.model
      .updateMany(filter, { $set: { status: 'Inactive' } }, options as any)
      .exec();
  }
}
