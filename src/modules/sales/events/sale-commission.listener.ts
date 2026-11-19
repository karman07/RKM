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
 * Whenever ANY item sale completes (cashier/manager/admin sale or sale-request approval), auto-credit commission to the
 * sales agent(s) who closed it (split equally if several), as long as the customer is still inside the admin-configured
 * commission window. If no sales agent is on the sale, the customer's relationship manager (the agent who onboarded them)
 * gets it instead. A sales agent's own enquiry books its own commission on approval. This is what makes "every item that customer buys within
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

      // A sales agent's own enquiry books its own commission when it is approved.
      if (payload.saleChannel === 'field_sales') return;

      const customer = await this.customersService.findByPhone(payload.customerPhone);
      if (!customer) return;

      const settings = await this.settingsService.get();
      const windowMonths = settings.sales_commission_window_months;
      const onboardedAt = (customer as any).createdAt as Date;
      if (!onboardedAt || monthsBetween(onboardedAt, new Date()) > windowMonths) return;

      // Commission goes to whoever CLOSED the sale: the sales agent(s) credited on it. Only when no sales agent is on the
      // sale (e.g. a cashier or admin billed it) does it fall back to the agent who onboarded the customer.
      const agentIds: string[] = [];
      for (const id of [...new Set(payload.soldByUserIds ?? [])]) {
        try {
          const u = await this.usersService.findById(id);
          if ((u as any)?.role === UserRole.SALES) agentIds.push(String((u as any)._id));
        } catch { /* user gone — skip */ }
      }
      if (!agentIds.length) {
        const rmId = (customer as any)?.relationship_manager?.toString();
        if (!rmId) return;
        const rm = await this.usersService.findById(rmId);
        if (!rm || (rm as any).role !== UserRole.SALES) return;
        agentIds.push(rmId);
      }

      const reference = payload.itemCode || payload.saleReference || '';
      const ratePct = settings.sales_commission_rate_percentage;
      const share = amount / agentIds.length; // shared sales are split equally

      for (const agentId of agentIds) {
        // Already credited via this agent's own Sales Enquiry claim for this exact item — don't double-count.
        if (reference) {
          const existing = await this.enquiryModel.findOne({
            sales_agent_id: new Types.ObjectId(agentId),
            reference,
            status: SaleEnquiryStatus.APPROVED,
          }).exec();
          if (existing) continue;
        }

        const doc = new this.enquiryModel({
          sales_agent_id: new Types.ObjectId(agentId),
          customer_id: (customer as any)._id,
          type: SaleEnquiryType.ITEM_SALE,
          description: payload.itemName || payload.itemCode || 'Store purchase',
          amount: Math.round(share),
          reference,
          status: SaleEnquiryStatus.APPROVED,
          admin_note: agentIds.length > 1
            ? `Auto-credited — sale closed by ${agentIds.length} sales agents (split equally)`
            : 'Auto-credited — sale closed by this sales agent',
          reviewed_at: new Date(),
          commission_amount: Math.round((share * ratePct) / 100),
          commission_status: CommissionStatus.UNPAID,
        });
        await doc.save();
        this.logger.log(`Auto-credited ₹${doc.commission_amount} commission to sales agent ${agentId} for ${customer.name}'s purchase (${reference || 'no ref'})`);
      }
    } catch (err) {
      this.logger.error(`Failed to auto-credit relationship-manager commission: ${err}`);
    }
  }
}
