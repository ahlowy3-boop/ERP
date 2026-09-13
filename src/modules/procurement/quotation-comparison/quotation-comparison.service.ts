import { Injectable, NotFoundException } from '@nestjs/common';
import { RfqsRepository } from '../rfqs/rfqs.repository';
import { QuotationsRepository } from '../rfqs/quotations.repository';
import { PurchaseRequestRepository } from '../purchase-requests/purchase-requests.repository';

@Injectable()
export class QuotationComparisonService {
  constructor(
    private readonly _RfqsRepository: RfqsRepository,
    private readonly _QuotationsRepository: QuotationsRepository,
    private readonly _PRRepository: PurchaseRequestRepository,
  ) {}

  // ─── 1. Get All Quotation Comparisons (Matrix) ────────────────────────────
  async getAllComparisons(page: number = 1, limit: number = 20, rfqId?: string) {
    const filter: any = {
      isDeleted: { $ne: true },
    };

    if (rfqId) {
      filter._id = rfqId;
    } else {
      filter.status = {
        $in: ['Sent', 'Partially Responded', 'Fully Responded', 'Awarded', 'Closed'],
      };
    }

    const rfqs = await this._RfqsRepository.findAll({
      filter,
      paginate: { page, limit },
      sort: { createdAt: -1 },
    });

    const total = await this._RfqsRepository.model.countDocuments(filter);

    return {
      statusCode: 200,
      message: 'Quotation comparisons retrieved successfully',
      data: rfqs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 2. Get Single Comparison by RFQ ID ───────────────────────────────────
  async getComparisonDetails(rfqId: string) {
    // 1. Fetch RFQ
    const rfq = await this._RfqsRepository.findOne({ filter: { _id: rfqId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    // 2. Fetch PR
    const pr = await this._PRRepository.findOne({
      filter: { _id: rfq.purchaseRequestId },
    });

    // 3. Fetch Quotations submitted for this RFQ sorted by totalAmount ascending
    const quotationsResult = await this._QuotationsRepository.findAll({
      filter: { rfqId: rfq._id },
      sort: { totalAmount: 1 },
    });

    const quotations = quotationsResult || [];

    // 4. Determine Best Price flag
    if (quotations.length > 0) {
      quotations[0].isBestPrice = true;
      for (let i = 1; i < quotations.length; i++) {
        quotations[i].isBestPrice = false;
      }
    }

    // 5. Calculate Metrics
    const lowestPrice = quotations.length > 0
      ? Math.min(...quotations.map((q: any) => q.totalAmount || 0))
      : 0;

    const validLeadTimes = quotations
      .map((q: any) => q.deliveryWeeks)
      .filter((w: any) => typeof w === 'number' && w > 0);
    const fastestDeliveryWeeks = validLeadTimes.length > 0
      ? Math.min(...validLeadTimes)
      : 0;

    // 6. Build side-by-side comparison table for each line item
    const baseItems = (rfq.items && rfq.items.length > 0)
      ? rfq.items
      : (pr?.items || []);

    const comparisonTable = baseItems.map((item: any) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      requestedQuantity: item.quantity,
      uom: item.uom,
      bids: quotations.map((q: any) => {
        const matchingItem = (q.items || []).find(
          (qi: any) =>
            (qi.itemCode && qi.itemCode === item.itemCode) ||
            (qi.itemName && qi.itemName.toLowerCase() === (item.itemName || '').toLowerCase()),
        );
        return {
          vendorId: q.vendorId,
          vendorName: q.vendorName,
          unitPrice: matchingItem ? matchingItem.unitPrice : 0,
          totalPrice: matchingItem ? matchingItem.totalPrice : 0,
          deliveryWeeks: q.deliveryWeeks || 0,
        };
      }),
    }));

    return {
      statusCode: 200,
      message: 'Quotation comparison details retrieved successfully',
      data: {
        rfq: {
          id: rfq._id,
          rfqNumber: rfq.rfqNumber,
          title: rfq.title,
          status: rfq.status,
          deadlineDate: rfq.deadlineDate,
          awardedVendorId: rfq.awardedVendorId,
          awardedVendorName: rfq.awardedVendorName,
        },
        pr: pr
          ? {
              id: pr._id,
              requestNumber: pr.requestNumber,
              department: pr.department,
              requestedBy: (pr as any).requestedBy || (pr as any).requesterName,
            }
          : null,
        metrics: {
          totalBids: quotations.length,
          lowestPrice,
          fastestDeliveryWeeks,
        },
        lowestPrice,
        fastestDeliveryWeeks,
        quotations: quotations.map((q: any) => ({
          id: q._id,
          quotationNumber: q.quotationNumber,
          vendorId: q.vendorId,
          vendorName: q.vendorName,
          totalAmount: q.totalAmount,
          deliveryWeeks: q.deliveryWeeks,
          paymentTerms: q.paymentTerms,
          isBestPrice: q.isBestPrice,
          isRecommended: q.isRecommended,
          status: q.status,
          items: q.items,
        })),
        comparisonTable,
      },
    };
  }
}
