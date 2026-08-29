import { Schema, Document } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';

// ─── 1. INCIDENTS ─────────────────────────────────────────────────────────────
export const HseIncidentModelName = 'HseIncident';

export const HseIncidentSchema = new Schema(
  {
    incidentNumber:       { type: String, unique: true },
    type:                 { type: String, enum: ['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time Injury (LTI)', 'Property Damage', 'Environmental', 'Other'], required: true },
    severity:             { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    date:                 { type: Date, required: true },
    location:             { type: String, required: true },
    description:          { type: String, required: true },
    immediateActionTaken: { type: String },
    reportedBy:           { type: String, required: true },
    status:               { type: String, enum: ['Open', 'Investigating', 'Closed'], default: 'Open' },
    rootCause:            { type: String },
    correctiveAction:     { type: String },
    isDeleted:            { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'hse_incidents' },
);

export const HseIncidentModel = MongooseModule.forFeature([
  { name: HseIncidentModelName, schema: HseIncidentSchema },
]);

// ─── 2. PERMIT TO WORK (PTW) ──────────────────────────────────────────────────
export const HsePtwModelName = 'HsePtw';

export const HsePtwSchema = new Schema(
  {
    ptwNumber:          { type: String, unique: true },
    type:               { type: String, enum: ['Hot Work', 'Cold Work', 'Confined Space', 'Working at Height', 'Electrical Isolation', 'Other'], required: true },
    requestDate:        { type: Date, default: Date.now },
    validFrom:          { type: Date, required: true },
    validTo:            { type: Date, required: true },
    location:           { type: String, required: true },
    assignedProjectCode:{ type: String },
    applicantName:      { type: String, required: true },
    gasTestRequired:    { type: Boolean, default: false },
    gasTestResults:     { type: String },
    status:             { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Closed', 'Expired'], default: 'Pending' },
    approverRole:       { type: String },
    approvedBy:         { type: String },
    approvedAt:         { type: Date },
    notes:              { type: String },
    isDeleted:          { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'hse_ptws' },
);

export const HsePtwModel = MongooseModule.forFeature([
  { name: HsePtwModelName, schema: HsePtwSchema },
]);

// ─── 3. SAFETY INSPECTIONS ────────────────────────────────────────────────────
export const HseInspectionModelName = 'HseInspection';

export const HseInspectionSchema = new Schema(
  {
    inspectionNumber:   { type: String, unique: true },
    date:               { type: Date, required: true },
    location:           { type: String, required: true },
    inspectorName:      { type: String, required: true },
    itemsAuditedCount:  { type: Number, default: 0 },
    violationsCount:    { type: Number, default: 0 },
    scorePercentage:    { type: Number, default: 100 },
    findings:           { type: String },
    correctiveActions:  { type: String },
    status:             { type: String, enum: ['Passed', 'Action Required', 'Failed'], default: 'Passed' },
    isDeleted:          { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'hse_inspections' },
);

export const HseInspectionModel = MongooseModule.forFeature([
  { name: HseInspectionModelName, schema: HseInspectionSchema },
]);

// ─── 4. RISK REGISTER ─────────────────────────────────────────────────────────
export const HseRiskModelName = 'HseRisk';

export const HseRiskSchema = new Schema(
  {
    riskNumber:          { type: String, unique: true },
    activityDescription: { type: String, required: true },
    hazardDescription:   { type: String, required: true },
    initialSeverity:     { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], required: true },
    controlMeasures:     { type: String, required: true },
    residualSeverity:    { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
    status:              { type: String, enum: ['Open', 'Mitigated', 'Closed'], default: 'Open' },
    assignedTo:          { type: String },
    isDeleted:           { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'hse_risks' },
);

export const HseRiskModel = MongooseModule.forFeature([
  { name: HseRiskModelName, schema: HseRiskSchema },
]);
