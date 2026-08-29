import { Schema } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

export const PeriodCloseModelName = 'PeriodClose';

const ChecklistItemSchema = new Schema(
  { item: String, completed: { type: Boolean, default: false } },
  { _id: false },
);

const ValidationIssueSchema = new Schema(
  { severity: String, message: String },
  { _id: false },
);

export const PeriodCloseSchema = new Schema(
  {
    periodName: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    fiscalYear: { type: Number, required: true },
    status: { type: String, enum: ['Open', 'Closing', 'Closed'], default: 'Open' },
    checklist: {
      type: [ChecklistItemSchema],
      default: [
        { item: 'All AP Invoices Posted', completed: false },
        { item: 'All AR Collections Posted', completed: false },
        { item: 'Depreciation Posted', completed: false },
        { item: 'VAT Settlement Posted', completed: false },
        { item: 'Bank Reconciliation Completed', completed: false },
      ],
    },
    validationIssues: { type: [ValidationIssueSchema], default: [] },
    closedBy: { type: String, default: null },
    closedAt: { type: Date, default: null },
    notes: { type: String },
  },
  { timestamps: true },
);

export const PeriodCloseModel = MongooseModule.forFeature([
  { name: PeriodCloseModelName, schema: PeriodCloseSchema },
]);
