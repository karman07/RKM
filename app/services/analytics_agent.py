"""
Business analytics agent — uses Gemini native function calling to answer
questions about the jewellery business by querying MongoDB directly.
"""
import json
import logging
from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.services.analytics_tools import (
    get_sales_summary,
    get_daily_sales_trend,
    get_top_products,
    get_inventory_status,
    get_top_staff,
    get_branch_performance,
    get_customer_stats,
    get_old_gold_summary,
    get_today_snapshot,
    get_profit_summary,
    get_online_orders_summary,
    get_staff_attendance,
    get_branch_attendance,
    get_staff_profile,
    get_attendance_summary,
    get_leave_requests,
    get_location_violations,
    get_customer_feedback,
    get_purchase_orders,
    get_refunds_summary,
    get_holidays,
    get_reimbursements_summary,
    get_payroll_summary,
    get_damaged_items,
    get_stolen_items,
    get_item_attendance_summary,
    get_gold_investment_summary,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ─────────────────────────────────────────────────────────────────────────────
# Tool registry
# ─────────────────────────────────────────────────────────────────────────────

TOOL_HANDLERS: dict[str, Any] = {
    "get_sales_summary": get_sales_summary,
    "get_daily_sales_trend": get_daily_sales_trend,
    "get_top_products": get_top_products,
    "get_inventory_status": get_inventory_status,
    "get_top_staff": get_top_staff,
    "get_branch_performance": get_branch_performance,
    "get_customer_stats": get_customer_stats,
    "get_old_gold_summary": get_old_gold_summary,
    "get_today_snapshot": get_today_snapshot,
    "get_profit_summary": get_profit_summary,
    "get_online_orders_summary": get_online_orders_summary,
    "get_staff_attendance": get_staff_attendance,
    "get_branch_attendance": get_branch_attendance,
    "get_attendance_summary": get_attendance_summary,
    "get_leave_requests": get_leave_requests,
    "get_location_violations": get_location_violations,
    "get_customer_feedback": get_customer_feedback,
    "get_purchase_orders": get_purchase_orders,
    "get_refunds_summary": get_refunds_summary,
    "get_staff_profile": get_staff_profile,
    "get_holidays": get_holidays,
    "get_reimbursements_summary": get_reimbursements_summary,
    "get_payroll_summary": get_payroll_summary,
    "get_damaged_items": get_damaged_items,
    "get_stolen_items": get_stolen_items,
    "get_item_attendance_summary": get_item_attendance_summary,
    "get_gold_investment_summary": get_gold_investment_summary,
}

TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="get_today_snapshot",
        description="Quick snapshot of today's sales count, revenue, and top product. Use for 'today' queries.",
        parameters=types.Schema(type="OBJECT", properties={}, required=[]),
    ),
    types.FunctionDeclaration(
        name="get_sales_summary",
        description="Total sales count, revenue, avg ticket, and payment mode breakdown for N days. Use for 'yesterday' (days=1 but since yesterday 00:00), 'this week' (days=7), 'this month' (days=30), 'all time' (days=730).",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Number of past days. Default 30. Use 730 for 'all time'.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_profit_summary",
        description="Gross profit = revenue minus purchase cost. Use whenever the user asks about profit, margin, earnings, or how much money was made. Has access to cost price (purchase_price) for every sold item.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Number of past days. Default 30. Use 1 for yesterday, 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_daily_sales_trend",
        description="Day-by-day sales and revenue trend. Use for 'trend', 'over time', 'chart', 'daily breakdown' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Number of past days. Default 14.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_top_products",
        description="Top-selling products by units sold. Use for 'best product', 'most sold', 'popular items' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time."),
                "limit": types.Schema(type="INTEGER", description="Number of products. Default 5."),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_inventory_status",
        description="Current stock counts (available, sold, reserved, damaged) and total available stock value.",
        parameters=types.Schema(type="OBJECT", properties={}, required=[]),
    ),
    types.FunctionDeclaration(
        name="get_top_staff",
        description="Top cashiers and/or managers by sales count and revenue. Use for 'best cashier', 'top manager', 'staff performance' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time."),
                "limit": types.Schema(type="INTEGER", description="Number of staff. Default 5."),
                "role": types.Schema(type="STRING", description="'cashier', 'manager', or 'all'. Default 'all'."),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_branch_performance",
        description="Sales and revenue by branch. Use for 'branch performance', 'top branch', 'which branch' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_customer_stats",
        description="Customer counts, new customers, and repeat buyers. Use for 'customer' related queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_online_orders_summary",
        description="Online orders count, revenue, and status breakdown. Use for 'online orders', 'website orders', 'ecommerce' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_old_gold_summary",
        description="Old gold buy-back transactions: count, value, status breakdown. Use for 'old gold', 'buyback', 'gold exchange' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_staff_attendance",
        description=(
            "All-staff attendance for a specific date — who was present, absent, on leave, and the overall rate. "
            "Use for: 'attendance today', 'who came in yesterday', 'how many staff present', "
            "'show me today\\'s attendance', 'who\\'s absent today'. "
            "Returns two lists: staff_present and staff_absent with names and roles."
        ),
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "date": types.Schema(
                    type="STRING",
                    description="'today', 'yesterday', or a YYYY-MM-DD date string. Default 'today'.",
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_branch_attendance",
        description=(
            "Attendance broken down by branch for a given date. "
            "Use for: 'attendance at Mohalli branch', 'which branch had most absences today', "
            "'how many staff at [branch name] came in', 'branch-wise attendance today/yesterday'. "
            "Can also return overall multi-branch summary when no specific branch is named. "
            "Returns per-branch counts of present, absent, on-leave staff plus full staff lists."
        ),
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "date": types.Schema(
                    type="STRING",
                    description="'today', 'yesterday', or YYYY-MM-DD. Default 'today'.",
                ),
                "branch_name": types.Schema(
                    type="STRING",
                    description=(
                        "Partial or full branch name to filter by (e.g. 'Mohalli', 'Sector 17'). "
                        "Leave empty to get all branches."
                    ),
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_attendance_summary",
        description=(
            "Attendance summary over N days per staff member: present days, absent days, attendance rate %. "
            "Use for: 'attendance this month', 'most absent staff', 'who has lowest attendance', "
            "'attendance trend', 'show me attendance for last 30 days'."
        ),
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_leave_requests",
        description="Leave requests submitted by staff: count, status (approved/pending/rejected), leave type. Use for 'leaves', 'leave requests', 'who applied for leave' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time."),
                "status": types.Schema(type="STRING", description="'approved', 'rejected', 'pending', or 'all'. Default 'all'."),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_location_violations",
        description="Staff location check-in violations: who tried to clock in from outside the branch geofence. Use for 'location violations', 'geo violations', 'who clocked in outside'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_customer_feedback",
        description="Customer feedback/survey data: experience ratings, visit-again rate, recommendations. Use for 'feedback', 'customer satisfaction', 'reviews', 'ratings'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_purchase_orders",
        description="Purchase orders from suppliers: total spend, order count, status. Use for 'purchase orders', 'supplier orders', 'how much we spent on stock'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 90. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_refunds_summary",
        description="Customer return/refund requests on inventory items: count and amounts by status. Use for 'refunds', 'returns', 'how many items returned'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_staff_profile",
        description="Full profile of a specific staff member: name, role, branch, email, avatar image, joining date, all-time sales, revenue, and attendance. Use whenever user asks about a specific person by name — 'tell me about X', 'who is X', 'which branch is X from', 'show me X profile'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"name": types.Schema(type="STRING", description="The staff member's name or partial name to search for.")},
            required=["name"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_holidays",
        description="List company holidays — all or only upcoming. Use for 'holidays', 'upcoming holidays', 'when is the next holiday', 'holiday calendar'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"upcoming_only": types.Schema(type="BOOLEAN", description="True to return only future holidays. Default false.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_reimbursements_summary",
        description="Staff expense reimbursement requests: total amounts, category breakdown (travel/food/supplies/maintenance), status (pending/approved/rejected). Use for 'reimbursements', 'expense claims', 'who claimed expenses', 'how much reimbursement pending'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time."),
                "status": types.Schema(type="STRING", description="'approved', 'rejected', 'pending', or 'all'. Default 'all'."),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_payroll_summary",
        description="Payroll summary for all staff in a given month: base salaries, absence deductions, and net payable totals. Use for 'payroll', 'salary summary', 'how much salary this month', 'total payroll cost'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "month": types.Schema(type="INTEGER", description="Month number 1–12. Defaults to previous month."),
                "year": types.Schema(type="INTEGER", description="4-digit year. Defaults to current year."),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="get_damaged_items",
        description="Damaged inventory items: count, total value at risk, which branch/staff caused damage, and recent damaged items. Use for 'damaged items', 'damage report', 'which staff damaged items', 'damage by branch'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 30. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_stolen_items",
        description="Stolen inventory items: count, total value, and breakdown by branch. Use for 'stolen items', 'theft report', 'how many items stolen', 'stolen jewellery'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 90. Use 730 for all time.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_item_attendance_summary",
        description="Item attendance (daily physical scanning of inventory items per branch): scan counts by branch and daily trend. Use for 'item attendance', 'item scan', 'which branch is scanning inventory', 'daily item scans'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days. Default 7.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_gold_investment_summary",
        description="Gold investment plan subscriptions: active/cancelled/completed counts, total accumulated amount, new sign-ups, and redemptions. Use for 'gold investment', 'investment plans', 'subscriptions', 'how many customers investing', 'gold plan summary'.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"days": types.Schema(type="INTEGER", description="Past days for new sign-ups and redemptions. Default 30. Use 730 for all time.")},
        ),
    ),
]

SYSTEM_PROMPT = """You are RKM Business Intelligence — the private AI analyst for RKM Jewellers with FULL access to the live business database.

━━━ DATABASE ACCESS ━━━
- SALES & REVENUE: inventory_items (sold items, payment mode, cashier, branch)
- PROFIT: selling_price minus purchase_price per item
- PRODUCTS: catalogue, metal types, purities, SKUs
- STAFF PERFORMANCE: top cashiers/managers by sales count and revenue
- ATTENDANCE (three tools — pick the right one):
    • get_staff_attendance   → who came in company-wide on a specific DATE
    • get_branch_attendance  → attendance split by BRANCH (or one specific branch) on a date
    • get_attendance_summary → per-staff attendance RATE over N days (trends, most absent)
- LEAVE REQUESTS: approvals, types, pending (leaverequests)
- LOCATION VIOLATIONS: staff who clocked in outside geofence
- HOLIDAYS: company holiday calendar (yearly recurring + one-time)
- REIMBURSEMENTS: staff expense claims — travel, food, supplies, maintenance; status and amounts
- PAYROLL: monthly salary summary — base salary, absence deductions, net payable per staff
- CUSTOMERS: total, new joins, repeat buyers
- CUSTOMER FEEDBACK: satisfaction, visit-again, recommendations
- OLD GOLD: buy-back count, value, status
- ONLINE ORDERS: count, revenue, status breakdown
- INVENTORY STATUS: available/sold/reserved/damaged/stolen stock counts
- DAMAGED ITEMS: detailed damaged items — who, when, which branch, value
- STOLEN ITEMS: stolen item count, value, branch breakdown
- ITEM ATTENDANCE: daily physical scanning of inventory items per branch
- PURCHASE ORDERS: supplier orders, spend, status
- REFUNDS/RETURNS: return counts and amounts
- BRANCHES: sales and revenue by branch
- GOLD INVESTMENT: subscription plans — active/cancelled counts, accumulated amount, new sign-ups, redemptions

━━━ ATTENDANCE ROUTING — FOLLOW EXACTLY ━━━
| Query type                                      | Tool to call                                   |
|------------------------------------------------|------------------------------------------------|
| "attendance today / yesterday / on [date]"     | get_staff_attendance(date=...)                 |
| "attendance at [branch]"                       | get_branch_attendance(date=..., branch_name=...)|
| "which branch had most absences"               | get_branch_attendance(date=...)                |
| "attendance this month / last N days / trend"  | get_attendance_summary(days=N)                 |
| "who has worst/best attendance"                | get_attendance_summary(days=30)                |

Always include BOTH present AND absent staff by name when get_staff_attendance is called.
Always show per-branch breakdown when get_branch_attendance is called.

━━━ MANDATORY RULES ━━━
1. ALWAYS call tool(s) first — never say "I don't have access" or "I can't calculate".
2. PROFIT = revenue (selling_price × (1 − manager_discount%)) MINUS purchase_price → use get_profit_summary.
3. STAFF PROFILE: "tell me about X" / "who is X" / "X's branch" → get_staff_profile(name="X"). Returns branch, avatar, email, sales, attendance. Never claim you lack this info.
4. Period mapping (auto-apply, never ask the user):
   - "today"            → get_today_snapshot + get_staff_attendance(date="today")
   - "yesterday"        → get_staff_attendance(date="yesterday") + days=1 for sales tools
   - "this week"        → days=7   |   "this month" → days=30
   - "all time" / "ever" / no period → days=730
5. 0 results for a short period → auto-retry with days=730.
6. Broad questions → call multiple tools in one round, compose one answer.
7. PAYROLL: "payroll this month" / "salary summary" → get_payroll_summary(). Returns per-staff net payable.
8. HOLIDAYS: "next holiday" / "upcoming holidays" → get_holidays(upcoming_only=True). "all holidays" → get_holidays().
9. REIMBURSEMENTS: "expense claims" / "reimbursements pending" → get_reimbursements_summary(). Filter by status when asked.
10. DAMAGED/STOLEN: "damaged items" → get_damaged_items(). "stolen items" / "theft" → get_stolen_items().
11. ITEM ATTENDANCE: "item scans" / "item attendance" / "which branch is scanning" → get_item_attendance_summary().
12. GOLD INVESTMENT: "gold plan" / "investment subscriptions" / "how many subscribers" → get_gold_investment_summary().

━━━ OUTPUT FORMAT ━━━
- **Bold** all key numbers and names
- Bullet lists for rankings and staff lists
- ₹ prefix; use L (lakhs) or Cr (crores) for large numbers
- One-line insight after data (e.g. "Mohalli branch leads with 95% attendance")
- Never add disclaimers or say "based on the data provided" """


# ─────────────────────────────────────────────────────────────────────────────
# Agent
# ─────────────────────────────────────────────────────────────────────────────

class AnalyticsAgent:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model = settings.GEMINI_CHAT_MODEL
        self.tools = [types.Tool(function_declarations=TOOL_DECLARATIONS)]

    async def _call_tool(self, name: str, args: dict) -> tuple[str, list]:
        """Returns (json_for_model, charts_list)."""
        handler = TOOL_HANDLERS.get(name)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {name}"}), []
        try:
            result = await handler(**args)
            charts = result.pop("_charts", []) if isinstance(result, dict) else []
            return json.dumps(result, default=str), charts
        except Exception as e:
            logger.error(f"Tool {name} failed: {e}")
            return json.dumps({"error": str(e)}), []

    async def chat(self, message: str, history: list[dict]) -> tuple[str, list]:
        """
        Run one turn of the analytics agent.
        history: list of {"role": "user"|"model", "content": str}
        Returns the assistant's text response.
        """
        # Build contents from history + new message
        contents: list[types.Content] = []

        for h in history[-20:]:  # last 20 turns for context window efficiency
            role = "user" if h["role"] == "user" else "model"
            contents.append(types.Content(
                role=role,
                parts=[types.Part(text=h["content"])],
            ))

        contents.append(types.Content(
            role="user",
            parts=[types.Part(text=message)],
        ))

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=self.tools,
            temperature=0.3,
        )

        all_charts: list = []

        # Agentic loop — keep going until model stops calling functions
        max_rounds = 6
        for _ in range(max_rounds):
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            candidate = response.candidates[0]
            parts = candidate.content.parts

            fn_calls = [p for p in parts if p.function_call]
            text_parts = [p for p in parts if p.text]

            if not fn_calls:
                text = "".join(p.text for p in text_parts if p.text).strip()
                return text, all_charts

            contents.append(types.Content(role="model", parts=parts))

            tool_result_parts = []
            for part in fn_calls:
                fc = part.function_call
                tool_output, charts = await self._call_tool(fc.name, dict(fc.args) if fc.args else {})
                all_charts.extend(charts)
                logger.info(f"Tool {fc.name} → {tool_output[:200]}")
                tool_result_parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": tool_output},
                        )
                    )
                )

            contents.append(types.Content(role="user", parts=tool_result_parts))

        return "I gathered the data but hit a processing limit. Please ask a more specific question.", all_charts


analytics_agent = AnalyticsAgent()
