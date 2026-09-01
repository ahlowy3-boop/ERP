import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { ContractModelName } from './entities/contract.model';
import { ProjectModelName } from '../../projects/entities/project.model';
import { CostCenterModelName } from '../../cost-centers/entities/cost-center.model';
import { EquipmentModelName } from '../../assets/equipment/entities/equipment.model';
import {
  CreateContractDto,
  UpdateContractStatusDto,
} from './dto/contract.dto';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectModel(ContractModelName) private contractModel: Model<any>,
    @InjectModel(ProjectModelName) private projectModel: Model<any>,
    @InjectModel(CostCenterModelName) private ccModel: Model<any>,
    @InjectModel(EquipmentModelName) private equipmentModel: Model<any>,
    @InjectConnection() private connection: Connection,
  ) {}

  // ─── Auto-Number Generator ─────────────────────────────────────────────────
  private async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CON-${year}-`;
    const last = await this.contractModel
      .findOne({ contractNumber: { $regex: `^${prefix}` } })
      .sort({ contractNumber: -1 })
      .lean()
      .exec();

    let seq = 1;
    if (last) {
      const parts = last.contractNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // ─── Get All ───────────────────────────────────────────────────────────────
  async findAll(query: {
    search?: string;
    status?: string;
    clientName?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, clientName, page = 1, limit = 20 } = query;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { contractNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { clientName: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (clientName) filter.clientName = { $regex: clientName, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, totalItems] = await Promise.all([
      this.contractModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean()
        .exec(),
      this.contractModel.countDocuments(filter),
    ]);

    return {
      items,
      totalItems,
      currentPage: Number(page),
      totalPages: Math.ceil(totalItems / Number(limit)),
    };
  }

  // ─── Get One ───────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const contract = await this.contractModel.findById(id).lean().exec();
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  async create(dto: CreateContractDto, userId: string) {
    const contractNumber = await this.generateContractNumber();

    // Validate rig exists if provided
    if (dto.rigId) {
      const rig = await this.equipmentModel.findById(dto.rigId).lean().exec();
      if (!rig) throw new NotFoundException(`Equipment "${dto.rigId}" not found`);
      if (rig.status === 'Active') {
        throw new BadRequestException(
          `Equipment "${rig.equipmentName}" is already active on another project`,
        );
      }
    }

    const contract = await this.contractModel.create({
      ...dto,
      contractNumber,
      rigId: dto.rigId ? new Types.ObjectId(dto.rigId) : undefined,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      status: 'Draft',
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Contract created: ${contractNumber} by ${userId}`);
    return contract;
  }

  // ─── Update (Draft only) ───────────────────────────────────────────────────
  async update(id: string, dto: Partial<CreateContractDto>, userId: string) {
    const contract = await this.contractModel.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'Draft') {
      throw new BadRequestException(
        'Only Draft contracts can be edited. Change status to Draft first.',
      );
    }

    const updated = await this.contractModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .lean()
      .exec();

    return updated;
  }

  // ─── Update Status (+ Auto-Engine) ────────────────────────────────────────
  async updateStatus(
    id: string,
    dto: UpdateContractStatusDto,
    userId: string,
  ) {
    const contract = await this.contractModel.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');

    // If transitioning to Active → run Auto-Engine
    if (dto.status === 'Active' && contract.status !== 'Active') {
      return this._activateContractWithAutoEngine(contract, userId);
    }

    // Any other status change
    const updated = await this.contractModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: dto.status,
            ...(dto.status === 'Active'
              ? { approvedBy: new Types.ObjectId(userId), approvedAt: new Date() }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    this.logger.log(`Contract ${contract.contractNumber} → ${dto.status}`);
    return updated;
  }

  // ─── ⚡ AUTO-ENGINE (Database Transaction) ─────────────────────────────────
  private async _activateContractWithAutoEngine(
    contract: any,
    userId: string,
  ) {
    // Codes
    const projectCode = `PROJ-${contract.contractNumber}`;
    const ccCode = `CC-PROJ-${contract.contractNumber}`;

    // Check no duplicate project/CC
    const [existingProject, existingCC] = await Promise.all([
      this.projectModel.findOne({ code: projectCode }).lean(),
      this.ccModel.findOne({ code: ccCode }).lean(),
    ]);

    if (existingProject)
      throw new ConflictException(
        `Project "${projectCode}" already exists for this contract`,
      );
    if (existingCC)
      throw new ConflictException(
        `Cost Center "${ccCode}" already exists for this contract`,
      );

    // ── Begin Transaction ──
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Resolve parent cost center
      // Priority: parentCostCenterCode > parentCostCenter > costCenterCode > 'CC-PRJ-000'
      const parentCode =
        contract.parentCostCenterCode ||
        contract.parentCostCenter ||
        contract.costCenterCode ||
        'CC-PRJ-000';

      // Resolve parentId and compute level from the actual parent document
      const parentCCDoc = await this.ccModel
        .findOne({ code: parentCode })
        .session(session)
        .lean();
      const parentId = parentCCDoc ? parentCCDoc._id : null;
      const level = parentCCDoc ? ((parentCCDoc as any).level || 1) + 1 : 2;

      const [ccDoc] = await this.ccModel.create(
        [
          {
            code: ccCode,
            name: `CC ${contract.title}`,
            nameEn: contract.title,
            nameAr: contract.title,
            type: 'Project',
            parentCode,
            parentId,
            level,
            branch: contract.branch || parentCCDoc?.['branch'] || 'HeadOffice',
            status: 'Active',
            contractId: contract._id,
            contractNumber: contract.contractNumber,
            projectCode,
            isActive: true,
            sourceType: 'Project',
            sourceId: contract._id,
            sourceCode: projectCode,
            autoCreated: true,
            budgetAmount: contract.value || 0,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session },
      );

      // Increment parent's childrenCount
      if (parentId) {
        await this.ccModel.updateOne(
          { _id: parentId },
          { $inc: { childrenCount: 1 } },
          { session },
        );
      }

      // 2. Create Project
      const [projectDoc] = await this.projectModel.create(
        [
          {
            code: projectCode,
            name: contract.title,
            contractId: contract._id,
            contractNumber: contract.contractNumber,
            costCenterId: ccDoc._id,
            costCenterCode: ccCode,
            customer: contract.clientName,
            clientContact: contract.clientContact,
            clientEmail: contract.clientEmail,
            rigId: contract.rigId,
            rigName: contract.rigName,
            contractValue: contract.value,
            budgetValue: contract.value,
            consumedValue: 0,
            remainingValue: contract.value,
            currency: contract.currency || 'USD',
            startDate: contract.startDate,
            endDate: contract.endDate,
            progressPercent: 0,
            status: 'Active',
            projectManager: contract.projectManager,
            siteLocation: contract.siteName,
            country: contract.country,
            region: contract.region,
            siteName: contract.siteName,
            gpsCoordinates: contract.gpsCoordinates,
            preferredWarehouse: contract.preferredWarehouse,
            nearestWarehouse: contract.nearestWarehouse,
            distanceKm: contract.distanceKm,
            estimatedTransportationCost: contract.estimatedTransportationCost,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session },
      );

      // 3. Update Cost Center with projectId back-reference
      await this.ccModel.updateOne(
        { _id: ccDoc._id },
        { $set: { projectId: projectDoc._id } },
        { session },
      );

      // 4. Activate Equipment/Rig
      if (contract.rigId) {
        const rig = await this.equipmentModel
          .findById(contract.rigId)
          .session(session);

        if (!rig) throw new NotFoundException('Assigned equipment not found');
        if (rig.status === 'Active') {
          throw new BadRequestException(
            `Equipment "${rig.equipmentName}" is already Active on another project`,
          );
        }

        await this.equipmentModel.updateOne(
          { _id: contract.rigId },
          {
            $set: {
              status: 'Active',
              projectAssignment: projectCode,
              projectId: projectDoc._id,
              location: contract.siteName || 'Project Site',
            },
          },
          { session },
        );
      }

      // 5. Update Contract with references
      await this.contractModel.updateOne(
        { _id: contract._id },
        {
          $set: {
            status: 'Active',
            projectId: projectDoc._id,
            projectCode,
            costCenterId: ccDoc._id,
            costCenterCode: ccCode,
            approvedBy: new Types.ObjectId(userId),
            approvedAt: new Date(),
          },
        },
        { session },
      );

      await session.commitTransaction();

      this.logger.log(
        `✅ Auto-Engine: Contract ${contract.contractNumber} activated → Project ${projectCode} + CC ${ccCode}`,
      );

      return {
        message: 'Contract activated successfully. Project and Cost Center generated.',
        contractNumber: contract.contractNumber,
        projectCode,
        costCenterCode: ccCode,
        projectId: projectDoc._id,
        costCenterId: ccDoc._id,
      };
    } catch (err) {
      await session.abortTransaction();
      this.logger.error(`Auto-Engine failed for ${contract.contractNumber}: ${err.message}`);
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ─── Delete (Draft only) ───────────────────────────────────────────────────
  async remove(id: string) {
    const contract = await this.contractModel.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'Draft') {
      throw new BadRequestException('Only Draft contracts can be deleted');
    }
    await this.contractModel.findByIdAndDelete(id);
    return { message: 'Contract deleted successfully' };
  }
}
