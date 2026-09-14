import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { PurchaseRequestRepository } from './purchase-requests.repository';
import { CreatePurchaseRequestDto } from './dto/create-pr.dto';
import { NumberingService } from 'src/shared/services/numbering.service';
import { InventoryEngineService } from 'src/shared/services/inventory-engine.service';
import { MivsService } from 'src/modules/inventory/mivs/mivs.service';
import { FindPrsDto } from './dto/find-prs.dto';
@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly _PRRepository: PurchaseRequestRepository,
    private readonly _NumberingService: NumberingService,
    private readonly _InventoryEngineService: InventoryEngineService,
    private readonly _MivsService: MivsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  async create(data: CreatePurchaseRequestDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const documentNumber =
        await this._NumberingService.generatePRNumber(session);
      const procurementChain = 'PR';
      const chainId = documentNumber;

      // ── Map frontend fields → schema required fields with full snapshotting ──
      const toObjId = (v?: string) =>
        v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : undefined;

      let itemModel: any = null;
      try {
        itemModel = this.connection.model('InventoryItem');
      } catch (e) {
        // model might not be initialized
      }

      const mappedItems: any[] = [];
      for (const item of data.items || []) {
        let itemId = toObjId(item.itemId);
        let itemCode = item.itemCode;
        let itemName = item.itemName;
        let arabicName = item.arabicName;
        let uom = item.uom;
        let category = item.category;
        let unitPrice = Number(item.unitPrice || item.estimatedUnitCost || 0);

        // Snapshot from Database if item details are not fully passed
        if (itemModel && (!itemCode || !itemName || !uom) && (itemId || itemCode)) {
          try {
            const dbItem = await itemModel
              .findOne(itemId ? { _id: itemId } : { itemCode })
              .session(session)
              .lean();
            if (dbItem) {
              itemId = itemId || dbItem._id;
              itemCode = itemCode || dbItem.itemCode;
              itemName = itemName || dbItem.itemName;
              arabicName = arabicName || dbItem.arabicName;
              uom = uom || dbItem.uom || 'EA';
              category = category || dbItem.category;
              if (!unitPrice && dbItem.unitPrice) {
                unitPrice = Number(dbItem.unitPrice);
              }
            }
          } catch (lookupErr) {
            // non-blocking
          }
        }

        const quantity = Number(item.quantity) || 1;
        const totalPrice =
          Number(item.totalPrice) || quantity * (unitPrice || 0);

        mappedItems.push({
          itemId,
          itemCode: itemCode || 'N/A',
          itemName: itemName || 'Item',
          arabicName,
          uom: uom || 'EA',
          quantity,
          unitPrice,
          totalPrice,
          category,
          notes: item.notes,
          fulfillFromStock: item.fulfillFromStock,
          fulfillByPurchase: item.fulfillByPurchase,
          currentStock: item.currentStock,
          availableQty: item.availableQty,
          shortageQty: item.shortageQty,
          allowPartialIssue: item.allowPartialIssue,
        });
      }

      const mivItemsToCreate: any[] = [];
      for (const item of mappedItems) {
        if (item.fulfillFromStock && item.fulfillFromStock > 0 && item.itemCode && item.itemCode !== 'N/A') {
          await this._InventoryEngineService.deductStock(
            item.itemCode,
            item.fulfillFromStock,
            documentNumber,
            'MIV',
            session,
          );
          mivItemsToCreate.push(item);
        }
      }

      const purchaseRequest = await this._PRRepository.create(
        {
          ...data,
          prNumber:             documentNumber,
          requestNumber:        documentNumber,
          documentNumber:       documentNumber,
          procurementChain,
          rootProcurementNumber: documentNumber,
          chainId,
          // ── Map required schema fields ──────────────────────────────────
          requesterId:  toObjId(data.requesterId),
          departmentId: toObjId(data.departmentId),
          requestDate:  data.requestDate ? new Date(data.requestDate) : new Date(),
          requiredDate: data.requiredDate ? new Date(data.requiredDate) : undefined,
          items: mappedItems,
        },
        { session },
      );

      if (mivItemsToCreate.length > 0) {
        await this._MivsService.createAutoFromPR(
          purchaseRequest,
          mivItemsToCreate,
          session,
        );
      }

      await session.commitTransaction();
      return {
        success: true,
        message: 'Purchase Request created successfully',
        data: this.formatPrItems(purchaseRequest),
      };
    } catch (error: any) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Failed to create PR: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // ── Helper to ensure full item snapshot details even for legacy PRs ─────────
  private formatPrItems(pr: any) {
    if (!pr) return pr;
    const prObj = typeof pr.toJSON === 'function' ? pr.toJSON() : (pr.toObject ? pr.toObject() : { ...pr });
    if (Array.isArray(prObj.items)) {
      prObj.items = prObj.items.map((it: any) => {
        const popItem = it.itemId && typeof it.itemId === 'object' ? it.itemId : null;
        return {
          ...it,
          itemId: popItem ? popItem._id : it.itemId,
          itemCode: (it.itemCode && it.itemCode !== 'N/A') ? it.itemCode : (popItem?.itemCode || it.itemCode || 'N/A'),
          itemName: (it.itemName && it.itemName !== 'Item') ? it.itemName : (popItem?.itemName || it.itemName || 'Item'),
          arabicName: it.arabicName || popItem?.arabicName,
          uom: it.uom || popItem?.uom || 'EA',
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice !== undefined ? it.unitPrice : (popItem?.unitPrice || 0),
          totalPrice: it.totalPrice !== undefined ? it.totalPrice : ((it.quantity || 1) * (it.unitPrice || popItem?.unitPrice || 0)),
          category: it.category || popItem?.category,
        };
      });
    }
    return prObj;
  }

  async updateStatus(id: string, status: string, approvedBy?: string) {
    const pr = await this._PRRepository.findOneAndUpdate(
      { _id: id },
      { status },
    );
    if (!pr) throw new NotFoundException('Purchase Request not found');
    return { message: `PR Status updated to ${status}`, data: this.formatPrItems(pr) };
  }

  // حذف طلب الشراء (مسودة فقط)
  async remove(id: string) {
    const pr = await this._PRRepository.findOne({ filter: { _id: id } });
    if (!pr) throw new NotFoundException('Purchase Request not found');

    if (pr.status !== 'Draft') {
      throw new BadRequestException(
        'Only Draft Purchase Requests can be deleted',
      );
    }

    await this._PRRepository.delete({ _id: id });
    return { message: 'Purchase Request deleted successfully' };
  }

  async findAll(query: FindPrsDto) {
    const filter: any = { isDeleted: { $ne: true } }; // تجاهل المحذوف

    if (query.status) filter.status = query.status;
    if (query.department) filter.department = query.department;

    if (query.search) {
      const searchRegex = { $regex: query.search, $options: 'i' };
      filter.$or = [
        { requestNumber: searchRegex },
        { department: searchRegex },
        { description: searchRegex },
        { costCenter: searchRegex },
      ];
    }

    const sortField = query.sortBy || 'requestNumber';
    const sortDirection = query.sortOrder === 'ASC' ? 1 : -1;

    const populateOptions = [
      {
        path: 'items.itemId',
        select: 'itemCode itemName arabicName uom category unitPrice quantity',
        model: 'InventoryItem',
      },
    ];

    const prs = await this._PRRepository.findAll({
      filter,
      populate: populateOptions,
      sort: { [sortField]: sortDirection },
      paginate: { page: query.page || 1, limit: query.limit || 20 },
    });

    return prs.map((p) => this.formatPrItems(p));
  }

  async findOne(id: string) {
    const pr = await this._PRRepository.findOne(
      { filter: { _id: id } },
      [
        {
          path: 'items.itemId',
          select: 'itemCode itemName arabicName uom category unitPrice quantity',
          model: 'InventoryItem',
        },
      ],
    );
    if (!pr) throw new NotFoundException('Purchase Request not found');
    return { data: this.formatPrItems(pr) };
  }
}
