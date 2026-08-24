import { Schema } from 'mongoose';

export const VendorModelName = 'Vendor';

export const VendorSchema = new Schema(
  {
    vendorCode:        { type: String, unique: true, sparse: true },
    vendorName:        { type: String, required: true },
    vendorNameEn:      { type: String },
    category:          {
      type: String,
      enum: ['Drilling', 'Supply', 'Services', 'Catering', 'Transport', 'Other'],
      required: true,
    },
    contactPerson:     { type: String, required: true },
    contactEmail:      { type: String, required: true },
    contactPhone:      { type: String, required: true },
    address:           { type: String },
    taxNumber:         { type: String },
    commercialRegNo:   { type: String },
    bankName:          { type: String },
    bankIBAN:          { type: String },
    bankAccountNo:     { type: String },
    paymentTerms:      {
      type: String,
      enum: ['Net15', 'Net30', 'Net45', 'Net60', 'Immediate'],
      default: 'Net30',
    },
    currency:          { type: String, enum: ['SAR', 'USD', 'EUR'], default: 'SAR' },
    status:            {
      type: String,
      enum: ['Active', 'Inactive', 'Pending', 'Blacklisted'],
      default: 'Pending',
    },
    blacklistReason:   { type: String },
    performanceScore:  { type: Number, default: 0 },
    totalPOsValue:     { type: Number, default: 0 },
    totalPOsCount:     { type: Number, default: 0 },
    isDeleted:         { type: Boolean, default: false },
    createdBy:         { type: String },
  },
  { timestamps: true },
);

export const VendorModel = { name: VendorModelName, schema: VendorSchema };
