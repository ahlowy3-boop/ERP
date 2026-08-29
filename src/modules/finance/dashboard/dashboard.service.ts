import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SupplierInvoiceModelName } from '../entities/ap.model';
import { BankAccountModelName, CashAccountModelName } from '../entities/cash-bank.model';
import { ProjectBudgetModelName } from '../entities/budget.model';
import { JournalEntryModelName, SalesInvoiceModelName } from '../../billing/invoices/entities/billing.model';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(SupplierInvoiceModelName) private apInvoiceModel: Model<any>,
    @InjectModel(SalesInvoiceModelName)    private salesInvoiceModel: Model<any>,
    @InjectModel(BankAccountModelName)     private bankAccountModel: Model<any>,
    @InjectModel(CashAccountModelName)     private cashAccountModel: Model<any>,
    @InjectModel(ProjectBudgetModelName)   private budgetModel: Model<any>,
    @InjectModel(JournalEntryModelName)    private journalEntryModel: Model<any>,
  ) {}

  async getKpis(query: { period?: string; dateFrom?: string; dateTo?: string }) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Revenue from sales invoices this year
    const revenueAgg = await this.salesInvoiceModel.aggregate([
      { $match: { invoiceDate: { $gte: yearStart } } },
      { $group: { _id: null, total: { $sum: '$netPayable' }, collected: { $sum: '$totalCollected' } } },
    ]);
    const revenueData = revenueAgg[0] || { total: 0, collected: 0 };

    // Expenses from AP invoices this year
    const expAgg = await this.apInvoiceModel.aggregate([
      { $match: { invoiceDate: { $gte: yearStart } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const expenseData = expAgg[0] || { total: 0 };

    // Cash position
    const banks = await this.bankAccountModel.find({ status: 'Active' }).lean();
    const cashes = await this.cashAccountModel.find().lean();
    const totalBankBalance = banks.reduce((s: number, b: any) => s + (b.balance || 0), 0);
    const totalCashBalance = cashes.reduce((s: number, c: any) => s + (c.balance || 0), 0);

    // AR outstanding
    const arAgg = await this.salesInvoiceModel.aggregate([
      { $match: { status: { $in: ['Sent', 'Partially Paid'] } } },
      { $group: { _id: null, outstanding: { $sum: '$balanceDue' }, count: { $sum: 1 } } },
    ]);
    const arOverdueAgg = await this.salesInvoiceModel.aggregate([
      { $match: { status: { $in: ['Sent', 'Partially Paid'] }, dueDate: { $lt: now } } },
      { $group: { _id: null, overdue: { $sum: '$balanceDue' }, count: { $sum: 1 } } },
    ]);
    const arData = arAgg[0] || { outstanding: 0, count: 0 };
    const arOverdue = arOverdueAgg[0] || { overdue: 0, count: 0 };

    // AP outstanding
    const apAgg = await this.apInvoiceModel.aggregate([
      { $match: { status: { $in: ['Unpaid', 'Pending Review', 'Approved', 'Ready for Payment'] } } },
      { $group: { _id: null, outstanding: { $sum: '$balanceDue' }, count: { $sum: 1 } } },
    ]);
    const apOverdueAgg = await this.apInvoiceModel.aggregate([
      { $match: { status: { $in: ['Unpaid'] }, dueDate: { $lt: now } } },
      { $group: { _id: null, overdue: { $sum: '$balanceDue' }, count: { $sum: 1 } } },
    ]);
    const apData = apAgg[0] || { outstanding: 0, count: 0 };
    const apOverdue = apOverdueAgg[0] || { overdue: 0, count: 0 };

    // Budget
    const budgets = await this.budgetModel.find({ status: 'Active' }).lean();
    const totalBudget = budgets.reduce((s: number, b: any) => s + (b.totalBudget || 0), 0);
    const totalSpent = budgets.reduce((s: number, b: any) => s + (b.actualCost || 0), 0);

    // Monthly chart (last 6 months)
    const monthlyChart: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
      const [revAgg, expAgg2] = await Promise.all([
        this.salesInvoiceModel.aggregate([{ $match: { invoiceDate: { $gte: mStart, $lte: mEnd } } }, { $group: { _id: null, v: { $sum: '$netPayable' } } }]),
        this.apInvoiceModel.aggregate([{ $match: { invoiceDate: { $gte: mStart, $lte: mEnd } } }, { $group: { _id: null, v: { $sum: '$totalAmount' } } }]),
      ]);
      const rev = revAgg[0]?.v || 0;
      const exp = expAgg2[0]?.v || 0;
      monthlyChart.push({ month: label, revenue: rev, expenses: exp, profit: rev - exp });
    }

    // Recent journals
    const recentJournals = await this.journalEntryModel.find({ status: 'Posted' }).sort({ date: -1 }).limit(5).lean();

    return {
      revenue: { total: revenueData.total, vsLastMonth: 0, collected: revenueData.collected },
      expenses: { total: expenseData.total, vsLastMonth: 0 },
      cashPosition: { totalBankBalance, totalCashBalance, totalAvailable: totalBankBalance + totalCashBalance },
      ar: { totalOutstanding: arData.outstanding, totalOverdue: arOverdue.overdue, overdueCount: arOverdue.count },
      ap: { totalUnpaid: apData.outstanding, totalOverdue: apOverdue.overdue, overdueCount: apOverdue.count },
      budget: { totalBudget, totalSpent, utilizationPct: totalBudget > 0 ? +(totalSpent / totalBudget * 100).toFixed(1) : 0 },
      monthlyChart,
      recentJournals: recentJournals.map((j: any) => ({ id: j._id?.toString(), journalNumber: j.journalNumber, description: j.description, date: j.date, totalDebit: j.totalDebit, status: j.status })),
      recentCollections: [],
      apAgingBuckets: { current: 0, thirtyToSixty: 0, sixtyToNinety: 0, overNinety: 0 },
      arAgingBuckets: { current: 0, thirtyToSixty: 0, sixtyToNinety: 0, overNinety: 0 },
    };
  }
}
