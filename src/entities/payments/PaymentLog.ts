import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IPaymentLog extends mongoose.Document {
    userId: string;
    platform: string;
    data: any;
    createdAt: Date;
}

export const PaymentLogSchema = new mongoose.Schema<IPaymentLog>({
    userId: { type: String },
    platform: { type: String },
    data: { type: Mixed },
    createdAt: { type: Date, default: new Date() }
});

// PaymentLogSchema.index({ 'email': 1 });

export const PaymentLog = mongoose.model<IPaymentLog>('payments-logs', PaymentLogSchema);