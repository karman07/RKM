import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { AiSession, AiSessionDocument } from './schemas/ai-session.schema';
import { AiConfig, AiConfigDocument } from './schemas/ai-config.schema';
import { decryptSecret, encryptSecret } from './ai-key.util';
import { ReportsService } from '../reports/reports.service';
import { GstReportService } from '../reports/gst-report.service';
import { AccountingService } from '../reports/accounting.service';
import { ReconciliationService } from '../reports/reconciliation.service';
import { TOOL_DEFS, runTool, type ToolContext } from './accounting-tools';

const MAX_TOOL_ROUNDS = 10;
/** How many earlier turns of a chat are sent back to the model. */
const HISTORY_TURNS = 20;

function systemPrompt(): string {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  return `You are the accounts and management assistant for RKM Jewellers, a gold and jewellery retailer in India. You help the owner and accounts team understand the business and prepare their books.

Today is ${today}. All money is in Indian rupees (₹); format large amounts the Indian way (₹12,34,567 or ₹12.3L / ₹1.2Cr).

How to work:
- Answer from the tools, not from memory. For any question about numbers, call the relevant tool first. Resolve phrases like "this month", "last quarter" or "this financial year" (India: 1 April – 31 March) into explicit YYYY-MM-DD dates and say which period you used.
- Never invent figures. If a tool returns nothing or an error, say so plainly. Mention any warnings a tool returns (missing branch state, no place of supply, etc.) because they affect accuracy.
- The books are derived from operational records (sales, returns, online orders, old gold, purchases, reimbursements), not a maintained ledger, and the balance sheet is an estimate. Say so when it matters, especially for statutory filings.
- For accounting work (journal entries, ledgers, trial balance, GST), show debits and credits clearly and confirm when debits equal credits. You may explain how to record a transaction or propose a journal entry for the accountant to review, but you cannot post anything: every tool is read-only.
- GST: taxable value and CGST/SGST/IGST in these reports are extracted from GST-inclusive invoice prices; credit notes are netted off. Do not give legal or tax-filing advice beyond that — suggest confirming with their CA.
- Be concise: lead with the answer, then the few numbers that support it. Use short tables or bullet lists for comparisons. When a visual would help, call create_chart once with up to 12 points.`;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | null = null;
  private clientKey = '';

  constructor(
    @InjectModel(AiSession.name) private sessionModel: Model<AiSessionDocument>,
    @InjectModel(AiConfig.name) private configModel: Model<AiConfigDocument>,
    private readonly reports: ReportsService,
    private readonly gst: GstReportService,
    private readonly accounting: AccountingService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /** Key saved from the admin panel wins; ANTHROPIC_API_KEY in the environment is the fallback. */
  private async resolveApiKey(): Promise<{ key: string; source: 'database' | 'env' | 'none' }> {
    const doc = await this.configModel.findOne({ singleton_key: 'global' }).lean();
    if (doc?.api_key_enc) {
      try { return { key: decryptSecret(doc.api_key_enc), source: 'database' }; }
      catch (e: any) { this.logger.error(`Could not decrypt the saved API key: ${e?.message}`); }
    }
    if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
    return { key: '', source: 'none' };
  }

  private async getClient(): Promise<Anthropic> {
    const { key } = await this.resolveApiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'The AI assistant is not configured yet — an admin can add the Claude API key from Analytics AI → API key.',
      );
    }
    if (!this.client || this.clientKey !== key) {
      this.client = new Anthropic({ apiKey: key });
      this.clientKey = key;
    }
    return this.client;
  }

  async getKeyStatus() {
    const doc = await this.configModel.findOne({ singleton_key: 'global' }).lean();
    const { key, source } = await this.resolveApiKey();
    return {
      configured: !!key,
      source,
      last4: source === 'database' ? doc?.api_key_last4 ?? '' : source === 'env' ? key.slice(-4) : '',
      updated_at: source === 'database' ? (doc as any)?.updatedAt ?? null : null,
      updated_by: source === 'database' ? doc?.updated_by_name ?? '' : '',
    };
  }

  /** Checks the key with a 1-token request before saving, so a typo never replaces a working key. */
  async saveKey(rawKey: string, updatedBy: string) {
    const key = (rawKey ?? '').trim();
    if (!key.startsWith('sk-ant-') || key.length < 20) {
      throw new BadRequestException('That does not look like an Anthropic API key (it should start with "sk-ant-").');
    }
    try {
      await new Anthropic({ apiKey: key }).messages.create({
        model: this.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }],
      });
    } catch (e: any) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('Anthropic rejected this key. Check it and try again.');
      }
      if (!(e instanceof Anthropic.APIError)) throw new ServiceUnavailableException(`Could not reach Anthropic to verify the key: ${e?.message}`);
      // Any other API error (rate limit, overloaded, bad model) still proves the key itself was accepted.
    }
    await this.configModel.findOneAndUpdate(
      { singleton_key: 'global' },
      { $set: { api_key_enc: encryptSecret(key), api_key_last4: key.slice(-4), updated_by_name: updatedBy } },
      { upsert: true },
    );
    this.client = null;
    return this.getKeyStatus();
  }

  async removeKey() {
    await this.configModel.findOneAndUpdate({ singleton_key: 'global' }, { $set: { api_key_enc: '', api_key_last4: '' } });
    this.client = null;
    return this.getKeyStatus();
  }

  private get model() { return process.env.AI_MODEL || 'claude-opus-5-5'; }

  toolCtx(charts?: any[]): ToolContext {
    return { reports: this.reports, gst: this.gst, accounting: this.accounting, reconciliation: this.reconciliation, charts };
  }

  listTools() { return TOOL_DEFS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })); }
  runTool(name: string, input: any) { return runTool(name, input, this.toolCtx([])); }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  async listSessions(userId: string, limit = 30) {
    return this.sessionModel.find({ user_id: new Types.ObjectId(userId) })
      .select('title createdAt updatedAt').sort({ updatedAt: -1 }).limit(limit).lean()
      .then(rows => rows.map((s: any) => ({ _id: String(s._id), title: s.title, created_at: s.createdAt, updated_at: s.updatedAt })));
  }

  async getSession(userId: string, id: string) {
    const s: any = await this.sessionModel.findOne({ _id: id, user_id: new Types.ObjectId(userId) }).lean();
    if (!s) throw new NotFoundException('Chat not found');
    return {
      _id: String(s._id), title: s.title, created_at: s.createdAt, updated_at: s.updatedAt,
      messages: s.messages.map((m: any) => ({ role: m.role, content: m.content, ts: m.ts, charts: m.charts ?? [] })),
    };
  }

  async deleteSession(userId: string, id: string) {
    const r = await this.sessionModel.deleteOne({ _id: id, user_id: new Types.ObjectId(userId) });
    return { deleted: r.deletedCount === 1 };
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────

  async chat(userId: string, message: string, sessionId?: string) {
    const client = await this.getClient();
    let session: AiSessionDocument | null = null;
    if (sessionId) session = await this.sessionModel.findOne({ _id: sessionId, user_id: new Types.ObjectId(userId) });
    if (!session) {
      session = new this.sessionModel({ user_id: new Types.ObjectId(userId), title: message.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat', messages: [] });
    }

    const history: Anthropic.MessageParam[] = session.messages.slice(-HISTORY_TURNS).map(m => ({ role: m.role, content: m.content }));
    // The API wants the conversation to start with a user turn.
    while (history.length && history[0].role !== 'user') history.shift();
    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: message }];

    const charts: any[] = [];
    const ctx = this.toolCtx(charts);
    let answer = '';

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create({
          model: this.model,
          max_tokens: 16000,
          system: systemPrompt(),
          tools: TOOL_DEFS,
          messages,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          cache_control: { type: 'ephemeral' },
        });

        if (response.stop_reason === 'refusal') { answer = 'I can’t help with that request.'; break; }

        const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();

        if (response.stop_reason !== 'tool_use') {
          answer = text || 'I could not produce an answer. Please try rephrasing.';
          if (response.stop_reason === 'max_tokens') answer += '\n\n_(The answer was cut short — ask me to continue or narrow the question.)_';
          break;
        }

        // Keep thinking + tool_use blocks exactly as returned, then answer every tool call in ONE user message.
        messages.push({ role: 'assistant', content: response.content });
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const results = await Promise.all(toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
          const out = await runTool(tu.name, tu.input, ctx);
          return { type: 'tool_result', tool_use_id: tu.id, content: out, is_error: out.startsWith('{"error"') };
        }));
        messages.push({ role: 'user', content: results });
        if (round === MAX_TOOL_ROUNDS - 1) answer = text || 'I needed too many lookups to answer that. Try asking about a narrower period or one topic at a time.';
      }
    } catch (e: any) {
      this.logger.error(`Claude request failed: ${e?.message}`);
      if (e instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException('The AI service rejected the API key. Update the key from Analytics AI → API key.');
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('The AI service is busy right now. Please try again in a moment.');
      if (e instanceof Anthropic.APIError) throw new ServiceUnavailableException(`AI request failed (${e.status ?? 'error'}): ${e.message}`);
      throw e;
    }

    session.messages.push({ role: 'user', content: message, ts: new Date(), charts: [] } as any);
    session.messages.push({ role: 'assistant', content: answer, ts: new Date(), charts } as any);
    await session.save();
    return { session_id: String(session._id), answer, title: session.title, charts };
  }
}
