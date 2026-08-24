import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VendorModelName } from './entities/vendor.model';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectModel(VendorModelName) private vendorModel: Model<any>,
  ) {}

  // ─── Generate Vendor Code ──────────────────────────────────────────────────
  private async generateVendorCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const count = await this.vendorModel.countDocuments();
      const seq = (count + 1 + i).toString().padStart(3, '0');
      const code = `VND-${seq}`;
      const exists = await this.vendorModel.findOne({ vendorCode: code });
      if (!exists) return code;
    }
    throw new BadRequestException('Could not generate unique vendor code');
  }

  // ─── Find All ──────────────────────────────────────────────────────────────
  async findAll(query: {
    search?: string;
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, category, page = 1, limit = 20 } = query;
    const filter: any = { isDeleted: false };

    if (search) {
      filter.$or = [
        { vendorName: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
        { commercialRegNo: { $regex: search, $options: 'i' } },
        { taxNumber: { $regex: search, $options: 'i' } },
      ];
    }
    if (status)   filter.status   = status;
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.vendorModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.vendorModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false }).lean();
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  async create(dto: any, userId: string) {
    // Check duplicates
    if (dto.commercialRegNo) {
      const existing = await this.vendorModel.findOne({ commercialRegNo: dto.commercialRegNo, isDeleted: false });
      if (existing) throw new ConflictException('Commercial registration number already exists');
    }
    if (dto.taxNumber) {
      const existing = await this.vendorModel.findOne({ taxNumber: dto.taxNumber, isDeleted: false });
      if (existing) throw new ConflictException('Tax number already exists');
    }

    const vendorCode = await this.generateVendorCode();
    const vendor = await this.vendorModel.create({
      ...dto,
      vendorCode,
      status: 'Pending',
      performanceScore: 0,
      totalPOsValue: 0,
      totalPOsCount: 0,
      createdBy: userId,
    });

    this.logger.log(`Vendor ${vendorCode} created by ${userId}`);
    return vendor;
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  async update(id: string, dto: any, userId: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Protect immutable field
    const { vendorCode: _vc, ...safeDto } = dto;

    // Validate blacklist reason
    if (safeDto.status === 'Blacklisted' && !safeDto.blacklistReason) {
      throw new BadRequestException('Blacklist reason is required when setting status to Blacklisted');
    }

    const updated = await this.vendorModel
      .findByIdAndUpdate(id, { $set: safeDto }, { new: true })
      .lean();

    this.logger.log(`Vendor ${vendor.vendorCode} updated by ${userId}`);
    return updated;
  }

  // ─── Update Status ─────────────────────────────────────────────────────────
  async updateStatus(
    id: string,
    dto: { status: string; reason?: string },
    userId: string,
  ) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (dto.status === 'Blacklisted' && !dto.reason) {
      throw new BadRequestException('Reason is required when blacklisting a vendor');
    }

    const updateData: any = { status: dto.status };
    if (dto.reason) updateData.blacklistReason = dto.reason;

    await this.vendorModel.findByIdAndUpdate(id, { $set: updateData });

    this.logger.log(`Vendor ${vendor.vendorCode} status → ${dto.status} by ${userId}`);
    return { message: 'Vendor status updated', status: dto.status };
  }

  // ─── Remove (Soft Delete) ──────────────────────────────────────────────────
  async remove(id: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, isDeleted: false });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // TODO: Check for active POs before allowing delete
    // const activePOs = await this.poModel.countDocuments({ vendorId: id, status: { $in: ['Draft','Approved','In Progress'] } });
    // if (activePOs > 0) throw new BadRequestException('Cannot delete vendor with active purchase orders');

    await this.vendorModel.findByIdAndUpdate(id, {
      $set: { isDeleted: true, status: 'Inactive' },
    });

    this.logger.log(`Vendor ${vendor.vendorCode} soft-deleted`);
    return { message: 'Vendor deactivated successfully' };
  }
}
