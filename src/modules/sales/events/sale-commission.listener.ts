import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SALE_COMPLETED_EVENT } from '../../whatsapp/events/whatsapp.events';
import type { SaleCompletedEvent } from '../../whatsapp/events/whatsapp.events';
import { SaleEnquiry, SaleEnquiryDocument, SaleEnquiryStatus, SaleEnquiryType, CommissionStatus } from '../schemas/sale-enquiry.schema';
import { CustomersService } from '../../customers/customers.service';
import { UsersService } from '../../../users/users.service';
import { SettingsService } from '../../settings/settings.service';
import { UserRole } from '../../../users/schemas/user.schema';

/** Whole calendar-agnostic month difference, based on elapsed days / 30.44 avg month length — mirrors SalesService. */
function monthsBetween(from: Date, to: Date): number {
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  return (to.getTime() - from.getTime()) / msPerMonth;
}

/**
 * Whenever ANY item sale completes (cashier/manager/admin sale, sale-request approval, or a
 * sales-agent's own enquiry approval), auto-credit the customer's relationship manager with
 * commission — as long as they're a sales agent and the customer is still inside the
 * admin-configured commission window. This is what makes "every item that customer buys within
 * N months earns their onboarding agent commission" true, not just claims the agent files
 * themselves via a Sales Enquiry.
 */
@Injectable()
export class SaleCommissionListener {
  private readonly logger = new Logger(SaleCommissionListener.name);

  constructor(
    @InjectModel(SaleEnquiry.name) private readonly enquiryModel: Model<SaleEnquiryDocument>,
    private readonly customersService: CustomersService,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
  ) {}

  @OnEvent(SALE_COMPLETED_EVENT, { async: true })
  async onSaleCompleted(payload: SaleCompletedEvent): Promise<void> {
    try {
      if (!payload.customerPhone) return;
      const amount = payload.amount ?? 0;
      if (amount <= 0) return;

      const customer = await this.customersService.findByPhone(payload.customerPhone);
      const relationshipManagerId = (customer as any)?.relationship_manager?.toString();
      if (!customer || !relationshipManagerId) return;

      const relationshipManager = await this.usersService.findById(relationshipManagerId);
      if (!relationshipManager || (relationshipManager as any).role !== UserRole.SALES) return;

      const settings = await this.settingsService.get();
      const windowMonths = settings.sales_commission_window_months;
      const onboardedAt = (customer as any).createdAt as Date;
      if (!onboardedAt || monthsBetween(onboardedAt, new Date()) > windowMonths) return;

      const reference = payload.itemCode || payload.saleReference || '';

      // Already credited via the agent's own Sales Enquiry claim for this exact item — don't double-count.
      if (reference) {
        const existing = await this.enquiryModel.findOne({
          sales_agent_id: new Types.ObjectId(relationshipManagerId),
          reference,
          status: SaleEnquiryStatus.APPROVED,
        }).exec();
        if (existing) return;
      }

      const ratePct = settings.sales_commission_rate_percentage;
      const doc = new this.enquiryModel({
        sales_agent_id: new Types.ObjectId(relationshipManagerId),
        customer_id: (customer as any)._id,
        type: SaleEnquiryType.ITEM_SALE,
        description: payload.itemName || payload.itemCode || 'Store purchase',
        amount,
        reference,
        status: SaleEnquiryStatus.APPROVED,
        admin_note: 'Auto-credited — customer purchase within relationship-manager commission window',
        reviewed_at: new Date(),
        commission_amount: Math.round((amount * ratePct) / 100),
        commission_status: CommissionStatus.UNPAID,
      });
      await doc.save();
      this.logger.log(`Auto-credited ₹${doc.commission_amount} commission to sales agent ${relationshipManagerId} for ${customer.name}'s purchase (${reference || 'no ref'})`);
    } catch (err) {
      this.logger.error(`Failed to auto-credit relationship-manager commission: ${err}`);
    }
  }
}
