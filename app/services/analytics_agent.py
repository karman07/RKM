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
    get_staff_profile,
    get_attendance_summary,
    get_leave_requests,
    get_location_violations,
    get_customer_feedback,
    get_purchase_orders,
    get_refunds_summary,
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
    "get_attendance_summary": get_attendance_summary,
    "get_leave_requests": get_leave_requests,
    "get_location_violations": get_location_violations,
    "get_customer_feedback": get_customer_feedback,
    "get_purchase_orders": get_purchase_orders,
    "get_refunds_summary": get_refunds_summary,
    "get_staff_profile": get_staff_profile,
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
        description="Staff attendance for a specific date — who was present, who was absent, attendance rate. Use for 'attendance today', 'who came yesterday', 'how many staff present' queries.",
        parameters=types.Schema(
            type="OBJECT",
            properties={"date": types.Schema(type="STRING", description="'today', 'yesterday', or a date string YYYY-MM-DD. Default 'today'.")},
        ),
    ),
    types.FunctionDeclaration(
        name="get_attendance_summary",
        description="Attendance summary over N days: attendance rate per staff member, overall average. Use for 'attendance this month', 'most absent staff', 'attendance trend' queries.",
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
]

SYSTEM_PROMPT = """You are RKM Business Intelligence — the private AI analyst for RKM Jewellers with FULL access to the live business database.

COMPLETE DATABASE ACCESS — you can query ALL of these:
- SALES: inventory_items (sold items, revenue, payment mode, staff, branch)
- PROFIT: selling_price minus purchase_price (cost) for every sold item
- PRODUCTS: product catalogue, metal types, purities
- STAFF PERFORMANCE: top cashiers and managers by sales
- STAFF ATTENDANCE: daily present/absent, check-in records (attendances collection)
- LEAVE REQUESTS: who applied, leave type, approval status (leaverequests collection)
- LOCATION VIOLATIONS: staff who clocked in outside branch geofence (locationviolations)
- CUSTOMERS: customer count, new joins, repeat buyers
- CUSTOMER FEEDBACK: satisfaction scores, visit-again rate, recommendations (feedbacks)
- OLD GOLD: buy-back transactions, exchange value, status (oldgoldtransactions)
- ONLINE ORDERS: website/app orders count and revenue (onlineorders)
- INVENTORY STATUS: available/sold/reserved/damaged stock counts
- PURCHASE ORDERS: supplier orders, spend, status (purchase_orders)
- REFUNDS/RETURNS: return requests count and refunded amounts
- BRANCHES: branch-wise sales and revenue

MANDATORY RULES — NEVER BREAK:
1. ALWAYS call tool(s) first. NEVER say "I don't have access", "my tools don't support", or "I can't calculate" — you have access to everything.
2. PROFIT = revenue (selling_price × (1 - manager_discount%)) MINUS purchase_price. Use get_profit_summary.
3. ATTENDANCE: "how many staff present today/yesterday" → use get_staff_attendance(date="today" or "yesterday"). Always mention BOTH who was present AND who was absent (staff_absent list). Absent = no check-in record for that day.
4. STAFF PROFILE: "tell me about X", "who is X", "which branch is X from" → ALWAYS use get_staff_profile(name="X"). This returns branch, avatar, email, sales, attendance. Never say you don't have branch info — always call this tool.
4. LEAVE: "leave requests" → use get_leave_requests.
5. Period mapping (apply automatically, NEVER ask user):
   - "today" → get_today_snapshot + get_staff_attendance(date="today")
   - "yesterday" → days=1, get_staff_attendance(date="yesterday")
   - "this week" → days=7  |  "this month" → days=30
   - "all time" / "ever" / no period → days=730
6. If 0 results for a short period → auto-retry with days=730.
7. For broad questions, call multiple tools in parallel then compose one answer.

OUTPUT FORMAT:
- Bold (**) all key numbers and names
- Bullet lists for rankings
- ₹ prefix; use L (lakhs) or Cr (crores) for large numbers
- Brief one-line insight after data
- Never add caveats or disclaimers"""


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
