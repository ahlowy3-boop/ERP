import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ── Bank Account Sub-Schema ────────────────────────────────────────────────
@Schema({ _id: true })
export class BankAccount {
  @Prop({ type: String, required: true }) bankName!: string;
  @Prop({ type: String, required: true }) accountNumber!: string;
  @Prop({ type: String, required: true }) iban!: string;
  @Prop({ type: String, default: 'USD' })  currency!: string;
}
const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

// ── Contact Person Sub-Schema ──────────────────────────────────────────────
@Schema({ _id: true })
export class VendorContact {
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String })                 role?: string;
  @Prop({ type: String, required: true }) email!: string;
  @Prop({ type: String, required: true }) phone!: string;
}
const VendorContactSchema = SchemaFactory.createForClass(VendorContact);

// ── Main Vendor Schema ─────────────────────────────────────────────────────
@Schema({ timestamps: true })
export class Vendor {
  // ── Identity & Classification ──────────────────────────────────────────
  @Prop({ type: String, unique: true, sparse: true, index: true })
  vendorCode?: string; // VND-2026-0001

  @Prop({ type: String, required: true }) vendorName!: string;
  @Prop({ type: String })                 arabicName?: string;

  @Prop({
    type: String,
    enum: [
      'Drilling Services', 'Chemicals', 'Tubulars', 'HSE',
      'Logistics', 'General', 'Electrical & Instrumentation',
      'Engineering Services', 'Drilling', 'Supply', 'Services',
      'Catering', 'Transport', 'Other',
    ],
  })
  category?: string;

  // ── Legal & Tax ────────────────────────────────────────────────────────
  @Prop({ type: String }) taxNumber?: string;
  @Prop({ type: String }) vatNumber?: string;
  @Prop({ type: String }) commercialRegistration?: string;
  @Prop({ type: String }) commercialRegNo?: string; // legacy alias

  // ── Location ───────────────────────────────────────────────────────────
  @Prop({ type: String }) country?: string;
  @Prop({ type: String }) address?: string;
  @Prop({ type: String }) website?: string;
  @Prop({ type: String }) annualRevenue?: string;

  // ── Primary Contact (legacy single contact) ────────────────────────────
  @Prop({ type: String }) contactPerson?: string;
  @Prop({ type: String }) contactEmail?: string;
  @Prop({ type: String }) contactPhone?: string;

  // ── Financial Terms ────────────────────────────────────────────────────
  @Prop({
    type: String,
    enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Immediate', 'Net15', 'Net30', 'Net45', 'Net60'],
    default: 'Net 30',
  })
  paymentTerms?: string;

  @Prop({ type: String, enum: ['SAR', 'USD', 'EUR'], default: 'USD' })
  currency?: string;

  // ── Status & Approval Workflow ─────────────────────────────────────────
  @Prop({
    type: String,
    enum: ['Active', 'Inactive', 'Pending', 'Blacklisted'],
    default: 'Pending',
  })
  status!: string;

  @Prop({
    type: String,
    enum: ['Pending', 'Approved', 'Blacklisted'],
    default: 'Pending',
  })
  approvalStatus!: string;

  @Prop({ type: String }) blacklistReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' }) approvedBy?: Types.ObjectId;
  @Prop({ type: Date })                          approvedAt?: Date;

  // ── Multiple Bank Accounts ─────────────────────────────────────────────
  @Prop({ type: [BankAccountSchema], default: [] })
  bankAccounts!: BankAccount[];

  // ── Multiple Contact Persons ───────────────────────────────────────────
  @Prop({ type: [VendorContactSchema], default: [] })
  contactPersons!: VendorContact[];

  // ── Legacy single bank fields ──────────────────────────────────────────
  @Prop({ type: String }) bankName?: string;
  @Prop({ type: String }) bankIBAN?: string;
  @Prop({ type: String }) bankAccountNo?: string;

  // ── KPI Counters ───────────────────────────────────────────────────────
  @Prop({ type: Number, default: 0 }) totalOrders!: number;
  @Prop({ type: Number, default: 0 }) totalSpend!: number;
  @Prop({ type: Date })               lastTransactionDate?: Date;
  @Prop({ type: Number, default: 0 }) totalRFQs!: number;
  @Prop({ type: Number, default: 0 }) awardedRFQs!: number;
  @Prop({ type: Number, default: 0 }) participatedRFQs!: number;
  @Prop({ type: Number, default: 0 }) totalDeliveries!: number;
  @Prop({ type: Number, default: 0 }) onTimeDeliveries!: number;
  @Prop({ type: Number, default: 0 }) totalDeliveredQty!: number;
  @Prop({ type: Number, default: 0 }) acceptedQty!: number;
  @Prop({ type: Number, default: 0 }) lateDeliveries!: number;
  @Prop({ type: Number, default: 0 }) rejectedDeliveries!: number;
  @Prop({ type: Number, default: 0 }) openInvoices!: number;
  @Prop({ type: Number, default: 0 }) paidInvoices!: number;
  @Prop({ type: Number, default: 5 }) rating!: number; // 0-5

  // ── Legacy performance fields ──────────────────────────────────────────
  @Prop({ type: Number, default: 0 }) performanceScore!: number;
  @Prop({ type: Number, default: 0 }) totalPOsValue!: number;
  @Prop({ type: Number, default: 0 }) totalPOsCount!: number;

  // ── Soft Delete ────────────────────────────────────────────────────────
  @Prop({ type: Boolean, default: false }) isDeleted!: boolean;

  // ── Audit ──────────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);

export const VendorModelName = Vendor.name;
export type VendorDocument = HydratedDocument<Vendor>;

export const VendorMongooseModel = MongooseModule.forFeature([
  { name: VendorModelName, schema: VendorSchema },
]);

// Legacy export for existing code
export const VendorModel = { name: VendorModelName, schema: VendorSchema };
