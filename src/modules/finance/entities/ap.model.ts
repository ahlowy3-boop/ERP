import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

// ──────────────────────────────────────────────────────────────
// SUPPLIER INVOICE (فاتورة المورد)
// ──────────────────────────────────────────────────────────────
export const SupplierInvoiceModelName = 'SupplierInvoice';

@Schema({ timestamps: true, collection: 'supplier_invoices' })
export class SupplierInvoice extends Document {
  @Prop({ required: true, unique: true, trim: true })
  invoiceNumber!: string; // SINV-YYYY-XXXX

  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder', default: null })
  poId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  poNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Vendor', default: null })
  vendorId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  vendorName!: string;

  @Prop({ type: Date, required: true })
  invoiceDate!: Date;

  @Prop({ type: Date, required: true })
  dueDate!: Date;

  @Prop({ type: Number, required: true, min: 0 })
  subTotal!: number;

  @Prop({ type: Number, default: 0 })
  taxAmount!: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalAmount!: number;

  @Prop({ type: Number, default: 0 })
  paidAmount!: number;

  @Prop({ type: Number, default: 0 })
  balanceDue!: number;

  @Prop({
    type: String,
    enum: ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'],
    default: 'Unpaid',
  })
  status!: string;

  @Prop({ type: String, default: 'Net 30' })
  paymentTerms!: string;

  @Prop({ type: String, default: 'Materials' })
  chargeType!: string;

  @Prop({ type: String, default: '521000' })
  chargeAccountCode!: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  projectCode?: string;

  @Prop({ type: String, default: null })
  costCenter?: string;

  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', default: null })
  glEntryId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  glEntryNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const SupplierInvoiceSchema = SchemaFactory.createForClass(SupplierInvoice);
SupplierInvoiceSchema.index({ vendorId: 1 });
SupplierInvoiceSchema.index({ status: 1 });
SupplierInvoiceSchema.index({ dueDate: 1 });
SupplierInvoiceSchema.index({ invoiceDate: -1 });

export const SupplierInvoiceModel = MongooseModule.forFeature([
  { name: SupplierInvoiceModelName, schema: SupplierInvoiceSchema },
]);

// ──────────────────────────────────────────────────────────────
// PAYMENT VOUCHER (سند الصرف)
// ──────────────────────────────────────────────────────────────
export const PaymentVoucherModelName = 'PaymentVoucher';

const InvoicePaidLineSchema = new (require('mongoose').Schema)(
  {
    invoiceId:     { type: Types.ObjectId, ref: 'SupplierInvoice', required: true },
    invoiceNumber: { type: String, required: true },
    amountPaid:    { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

@Schema({ timestamps: true, collection: 'payment_vouchers' })
export class PaymentVoucher extends Document {
  @Prop({ required: true, unique: true, trim: true })
  voucherNumber!: string; // PV-YYYY-XXXX

  @Prop({ type: Date, required: true })
  paymentDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'Vendor', default: null })
  vendorId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  vendorName!: string;

  @Prop({ type: Types.ObjectId, ref: 'BankAccount', default: null })
  bankAccountId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  bankAccountName?: string;

  @Prop({
    type: String,
    enum: ['Bank Transfer', 'Cheque', 'Cash'],
    default: 'Bank Transfer',
  })
  paymentMethod!: string;

  @Prop({ type: String, default: null })
  referenceNumber?: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({
    type: String,
    enum: ['Draft', 'Posted', 'Cancelled'],
    default: 'Posted',
  })
  status!: string;

  @Prop({ type: [InvoicePaidLineSchema], default: [] })
  invoicesPaid!: {
    invoiceId: Types.ObjectId;
    invoiceNumber: string;
    amountPaid: number;
  }[];

  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', default: null })
  glEntryId?: Types.ObjectId;

  @Prop({ type: String, default: null })
  glEntryNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;
}

export const PaymentVoucherSchema = SchemaFactory.createForClass(PaymentVoucher);
PaymentVoucherSchema.index({ vendorId: 1 });
PaymentVoucherSchema.index({ status: 1 });
PaymentVoucherSchema.index({ paymentDate: -1 });

export const PaymentVoucherModel = MongooseModule.forFeature([
  { name: PaymentVoucherModelName, schema: PaymentVoucherSchema },
]);

// ──────────────────────────────────────────────────────────────
// AP SUPPLIER (مورد الحسابات الدائنة)
// ──────────────────────────────────────────────────────────────
export const ApSupplierModelName = 'ApSupplier';

@Schema({ timestamps: true, collection: 'ap_suppliers' })
export class ApSupplier extends Document {
  @Prop({ required: true, unique: true }) code!: string; // SUP-0001
  @Prop({ required: true }) nameEn!: string;
  @Prop({ type: String }) nameAr?: string;
  @Prop({ type: String, enum: ['Oil & Gas', 'Construction', 'IT', 'Services', 'General'], default: 'General' }) category!: string;
  @Prop({ type: String }) taxNumber?: string;
  @Prop({ type: String }) vatNumber?: string;
  @Prop({ type: String }) commercialReg?: string;
  @Prop({ required: true }) contactPerson!: string;
  @Prop({ required: true, unique: true }) contactEmail!: string;
  @Prop({ type: String }) contactPhone?: string;
  @Prop({ type: String }) address?: string;
  @Prop({ type: String, default: 'Net 30' }) paymentTerms!: string;
  @Prop({ type: String, default: 'SAR' }) currency!: string;
  @Prop({ type: String }) bankName?: string;
  @Prop({ type: String }) iban?: string;
  @Prop({ type: String, enum: ['Active', 'Inactive', 'Blacklisted'], default: 'Active' }) status!: string;
  @Prop({ type: Number, default: 0 }) totalInvoices!: number;
  @Prop({ type: Number, default: 0 }) totalPaid!: number;
  @Prop({ type: Number, default: 0 }) outstanding!: number;
  @Prop({ type: Number, default: 0, min: 0, max: 5 }) rating!: number;
  @Prop({ type: Boolean, default: false }) isDeleted!: boolean;
}

export const ApSupplierSchema = SchemaFactory.createForClass(ApSupplier);
export const ApSupplierModel = MongooseModule.forFeature([{ name: ApSupplierModelName, schema: ApSupplierSchema }]);

// ──────────────────────────────────────────────────────────────
// AR CUSTOMER (عميل الحسابات المدينة)
// ──────────────────────────────────────────────────────────────
export const ArCustomerModelName = 'ArCustomer';

@Schema({ timestamps: true, collection: 'ar_customers' })
export class ArCustomer extends Document {
  @Prop({ required: true, unique: true }) code!: string; // CUS-0001
  @Prop({ required: true }) nameEn!: string;
  @Prop({ type: String }) nameAr?: string;
  @Prop({ type: String }) industry?: string;
  @Prop({ type: String }) taxNumber?: string;
  @Prop({ required: true }) contactPerson!: string;
  @Prop({ required: true, unique: true }) contactEmail!: string;
  @Prop({ type: String }) contactPhone?: string;
  @Prop({ type: String }) address?: string;
  @Prop({ type: String, default: 'Net 30' }) paymentTerms!: string;
  @Prop({ type: String, default: 'SAR' }) currency!: string;
  @Prop({ type: Number, default: 0 }) creditLimit!: number;
  @Prop({ type: String, enum: ['Active', 'Inactive', 'Credit Hold'], default: 'Active' }) status!: string;
  @Prop({ type: Number, default: 0 }) totalInvoices!: number;
  @Prop({ type: Number, default: 0 }) totalCollected!: number;
  @Prop({ type: Number, default: 0 }) outstanding!: number;
  @Prop({ type: Boolean, default: false }) isDeleted!: boolean;
}

export const ArCustomerSchema = SchemaFactory.createForClass(ArCustomer);
export const ArCustomerModel = MongooseModule.forFeature([{ name: ArCustomerModelName, schema: ArCustomerSchema }]);

