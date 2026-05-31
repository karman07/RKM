"""
Business analytics query tools — each function queries MongoDB directly
and returns a plain dict that the AI agent passes back to Gemini.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId

from app.core.database import get_db
from app.core.config import get_settings


# Revenue after manager discount: selling_price × (1 − manager_discount / 100)
REVENUE = {"$multiply": [
    "$selling_price",
    {"$subtract": [1, {"$divide": [{"$ifNull": ["$manager_discount", 0]}, 100]}]},
]}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _start(days: int) -> datetime:
    return _now() - timedelta(days=days)


# ─────────────────────────────────────────────────────────────────────────────
# Sales
# ─────────────────────────────────────────────────────────────────────────────

async def get_sales_summary(days: int = 7) -> dict:
    """Total sales count, revenue, average ticket size, and payment breakdown for the last N days."""
    db = get_db()
    col = db["inventory_items"]
    since = _start(days)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$group": {
            "_id": None,
            "total_sales": {"$sum": 1},
            "total_revenue": {"$sum": REVENUE},
            "avg_ticket": {"$avg": REVENUE},
            "max_sale": {"$max": REVENUE},
            "min_sale": {"$min": REVENUE},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(1)
    summary = rows[0] if rows else {"total_sales": 0, "total_revenue": 0, "avg_ticket": 0}
    summary.pop("_id", None)

    # payment mode breakdown
    pay_pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$group": {"_id": "$payment_mode", "count": {"$sum": 1}, "revenue": {"$sum": REVENUE}}},
    ]
    pay_rows = await col.aggregate(pay_pipeline).to_list(20)
    summary["payment_breakdown"] = [
        {"mode": r["_id"] or "unknown", "count": r["count"], "revenue": round(r["revenue"] or 0)}
        for r in pay_rows
    ]
    summary["period_days"] = days
    summary["total_revenue"] = round(summary.get("total_revenue") or 0)
    summary["avg_ticket"] = round(summary.get("avg_ticket") or 0)
    summary["_charts"] = [
        {
            "type": "donut",
            "title": "Payment Mode Split",
            "data": [{"label": p["mode"].replace("_"," ").title(), "value": p["count"]} for p in summary.get("payment_breakdown", [])],
        },
        {
            "type": "stat",
            "title": f"Sales Summary — Last {days} Days",
            "data": [
                {"label": "Total Sales", "value": summary.get("total_sales", 0)},
                {"label": "Total Revenue", "value": summary.get("total_revenue", 0), "prefix": "₹"},
                {"label": "Avg Ticket", "value": summary.get("avg_ticket", 0), "prefix": "₹"},
            ],
        },
    ]
    return summary


async def get_daily_sales_trend(days: int = 14) -> dict:
    """Day-by-day sales count and revenue for the last N days."""
    db = get_db()
    col = db["inventory_items"]
    since = _start(days)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$group": {
            "_id": {
                "year": {"$year": "$sold_at"},
                "month": {"$month": "$sold_at"},
                "day": {"$dayOfMonth": "$sold_at"},
            },
            "count": {"$sum": 1},
            "revenue": {"$sum": REVENUE},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
    ]
    rows = await col.aggregate(pipeline).to_list(60)
    trend = []
    for r in rows:
        d = r["_id"]
        trend.append({
            "date": f"{d['year']}-{d['month']:02d}-{d['day']:02d}",
            "sales": r["count"],
            "revenue": round(r["revenue"] or 0),
        })
    return {
        "trend": trend,
        "period_days": days,
        "_charts": [{
            "type": "line",
            "title": f"Daily Sales — Last {days} Days",
            "x_label": "Date", "y_label": "Revenue (₹)",
            "data": [{"label": d["date"][-5:], "value": d["revenue"], "value2": d["sales"]} for d in trend],
        }],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Products
# ─────────────────────────────────────────────────────────────────────────────

async def get_top_products(days: int = 7, limit: int = 5) -> dict:
    """Top-selling products by units sold in the last N days."""
    db = get_db()
    col = db["inventory_items"]
    products = db["products"]
    since = _start(days)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$group": {
            "_id": "$product_id",
            "units_sold": {"$sum": 1},
            "revenue": {"$sum": REVENUE},
        }},
        {"$sort": {"units_sold": -1}},
        {"$limit": limit},
    ]
    rows = await col.aggregate(pipeline).to_list(limit)

    result = []
    for r in rows:
        p = await products.find_one({"_id": r["_id"]}, {"name": 1, "sku": 1, "metal_type": 1, "purity": 1})
        result.append({
            "name": p["name"] if p else str(r["_id"]),
            "sku": p.get("sku") if p else None,
            "metal_type": p.get("metal_type") if p else None,
            "units_sold": r["units_sold"],
            "revenue": round(r["revenue"] or 0),
        })
    return {
        "top_products": result,
        "period_days": days,
        "_charts": [{
            "type": "bar",
            "title": f"Top Products — Last {days} Days",
            "y_label": "Units Sold",
            "data": [{"label": p["name"], "value": p["units_sold"], "value2": p["revenue"]} for p in result],
        }],
    }


async def get_inventory_status() -> dict:
    """Current inventory counts by status and estimated available stock value."""
    db = get_db()
    col = db["inventory_items"]

    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    rows = await col.aggregate(pipeline).to_list(20)
    status_map = {r["_id"]: r["count"] for r in rows}

    # available stock value
    val_pipeline = [
        {"$match": {"status": "available"}},
        {"$group": {"_id": None, "total_value": {"$sum": "$selling_price"}}},
    ]
    val_rows = await col.aggregate(val_pipeline).to_list(1)
    stock_value = round(val_rows[0]["total_value"] or 0) if val_rows else 0

    return {
        "available": status_map.get("available", 0),
        "sold": status_map.get("sold", 0),
        "reserved": status_map.get("reserved", 0),
        "damaged": status_map.get("damaged", 0),
        "available_stock_value": stock_value,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Staff
# ─────────────────────────────────────────────────────────────────────────────

async def get_top_staff(days: int = 7, limit: int = 5, role: str = "all") -> dict:
    """Top performing cashiers and managers by sales count and revenue."""
    db = get_db()
    col = db["inventory_items"]
    users = db["users"]
    since = _start(days)

    async def _query(field: str) -> list:
        pipeline = [
            {"$match": {"status": "sold", "sold_at": {"$gte": since}, field: {"$ne": None}}},
            {"$group": {
                "_id": f"${field}",
                "sales": {"$sum": 1},
                "revenue": {"$sum": REVENUE},
            }},
            {"$sort": {"sales": -1}},
            {"$limit": limit},
        ]
        rows = await col.aggregate(pipeline).to_list(limit)
        result = []
        for r in rows:
            u = await users.find_one({"_id": r["_id"]}, {"name": 1, "role": 1})
            result.append({
                "name": u["name"] if u else str(r["_id"]),
                "role": u.get("role") if u else None,
                "sales": r["sales"],
                "revenue": round(r["revenue"] or 0),
            })
        return result

    out: dict = {"period_days": days}
    charts = []
    if role in ("all", "cashier"):
        out["top_cashiers"] = await _query("sold_by_user_id")
        charts.append({"type": "bar", "title": f"Top Cashiers — Last {days} Days", "y_label": "Sales",
                        "data": [{"label": s["name"], "value": s["sales"], "value2": s["revenue"]} for s in out["top_cashiers"]]})
    if role in ("all", "manager"):
        out["top_managers"] = await _query("sold_by_manager_id")
        charts.append({"type": "bar", "title": f"Top Managers — Last {days} Days", "y_label": "Sales",
                        "data": [{"label": s["name"], "value": s["sales"], "value2": s["revenue"]} for s in out["top_managers"]]})
    out["_charts"] = charts
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Branches
# ─────────────────────────────────────────────────────────────────────────────

async def get_branch_performance(days: int = 7) -> dict:
    """Sales revenue and unit count broken down by branch."""
    db = get_db()
    col = db["inventory_items"]
    branches = db["branches"]
    since = _start(days)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$group": {
            "_id": "$sold_at_branch_id",
            "sales": {"$sum": 1},
            "revenue": {"$sum": REVENUE},
        }},
        {"$sort": {"revenue": -1}},
    ]
    rows = await col.aggregate(pipeline).to_list(50)

    result = []
    for r in rows:
        b = await branches.find_one({"_id": r["_id"]}, {"name": 1}) if r["_id"] else None
        result.append({
            "branch": b["name"] if b else (str(r["_id"]) if r["_id"] else "Unknown"),
            "sales": r["sales"],
            "revenue": round(r["revenue"] or 0),
        })
    return {
        "branches": result,
        "period_days": days,
        "_charts": [{
            "type": "bar",
            "title": f"Branch Performance — Last {days} Days",
            "y_label": "Revenue (₹)",
            "data": [{"label": b["branch"], "value": b["revenue"], "value2": b["sales"]} for b in result],
        }],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────────────────────────────────────

async def get_customer_stats(days: int = 30) -> dict:
    """New customers added, total customer count, and top repeat buyers."""
    db = get_db()
    customers = db["customers"]
    col = db["inventory_items"]
    since = _start(days)

    total = await customers.count_documents({})
    new_count = await customers.count_documents({"createdAt": {"$gte": since}})

    # repeat buyers (customers with > 1 purchase)
    repeat_pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}, "sold_customer_phone": {"$ne": None}}},
        {"$group": {"_id": "$sold_customer_phone", "purchases": {"$sum": 1}, "spent": {"$sum": REVENUE}}},
        {"$match": {"purchases": {"$gt": 1}}},
        {"$sort": {"spent": -1}},
        {"$limit": 5},
    ]
    repeat = await col.aggregate(repeat_pipeline).to_list(5)
    repeat_buyers = [
        {"phone": r["_id"], "purchases": r["purchases"], "total_spent": round(r["spent"] or 0)}
        for r in repeat
    ]

    return {
        "total_customers": total,
        "new_customers_in_period": new_count,
        "repeat_buyers": repeat_buyers,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Profit
# ─────────────────────────────────────────────────────────────────────────────

async def get_profit_summary(days: int = 7) -> dict:
    """Gross profit = revenue (selling_price after manager discount) minus purchase_price (cost price)."""
    db = get_db()
    col = db["inventory_items"]
    since = _start(days)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": since}}},
        {"$addFields": {
            "final_revenue": REVENUE,
            "cost": {"$ifNull": ["$purchase_price", 0]},
        }},
        {"$group": {
            "_id": None,
            "total_sales": {"$sum": 1},
            "total_revenue": {"$sum": "$final_revenue"},
            "total_cost": {"$sum": "$cost"},
            "gross_profit": {"$sum": {"$subtract": ["$final_revenue", "$cost"]}},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(1)
    if not rows:
        return {"total_sales": 0, "total_revenue": 0, "total_cost": 0, "gross_profit": 0, "margin_pct": 0, "period_days": days}

    r = rows[0]
    r.pop("_id", None)
    rev = r.get("total_revenue") or 0
    profit = r.get("gross_profit") or 0
    r["gross_profit"] = round(profit)
    r["total_revenue"] = round(rev)
    r["total_cost"] = round(r.get("total_cost") or 0)
    r["margin_pct"] = round((profit / rev * 100) if rev else 0, 1)
    r["period_days"] = days
    return r


# ─────────────────────────────────────────────────────────────────────────────
# Online Orders
# ─────────────────────────────────────────────────────────────────────────────

async def get_online_orders_summary(days: int = 30) -> dict:
    """Summary of online orders: count, revenue, status breakdown, and average order value."""
    db = get_db()
    col = db["onlineorders"]
    since = _start(days)

    total = await col.count_documents({"createdAt": {"$gte": since}})
    if total == 0:
        all_time = await col.count_documents({})
        return {"total_orders": 0, "all_time_total": all_time, "period_days": days, "note": "No online orders in this period"}

    pipeline = [
        {"$match": {"createdAt": {"$gte": since}}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "revenue": {"$sum": "$total"},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(20)

    breakdown = {}
    grand_rev = 0
    grand_count = 0
    for r in rows:
        breakdown[r["_id"] or "unknown"] = {"count": r["count"], "revenue": round(r["revenue"] or 0)}
        grand_rev += r["revenue"] or 0
        grand_count += r["count"]

    avg_order = round(grand_rev / grand_count) if grand_count else 0
    return {
        "total_orders": grand_count,
        "total_revenue": round(grand_rev),
        "avg_order_value": avg_order,
        "by_status": breakdown,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Old Gold
# ─────────────────────────────────────────────────────────────────────────────

async def get_old_gold_summary(days: int = 30) -> dict:
    """Old gold buy-back transaction summary — count, value, status breakdown."""
    db = get_db()
    col = db["oldgoldtransactions"]

    since = _start(days)
    pipeline = [
        {"$match": {"createdAt": {"$gte": since}}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_value": {"$sum": "$total_value"},
            "total_weight": {"$sum": "$total_weight_grams"},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(20)

    breakdown = {}
    grand_value = 0
    grand_count = 0
    for r in rows:
        breakdown[r["_id"]] = {
            "count": r["count"],
            "total_value": round(r["total_value"] or 0),
            "total_weight_grams": round(r["total_weight"] or 0, 2),
        }
        grand_value += r["total_value"] or 0
        grand_count += r["count"]

    return {
        "total_transactions": grand_count,
        "total_value": round(grand_value),
        "by_status": breakdown,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Staff Attendance
# ─────────────────────────────────────────────────────────────────────────────

async def get_staff_attendance(date: str = "today") -> dict:
    """Staff attendance for a given date. Returns present/absent counts and who was present."""
    db = get_db()
    col = db["attendances"]
    users = db["users"]

    now = _now()
    if date == "today":
        target = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date == "yesterday":
        target = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        try:
            from datetime import datetime as dt
            target = dt.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            target = now.replace(hour=0, minute=0, second=0, microsecond=0)

    day_end = target + timedelta(days=1)

    records = await col.find({"date": {"$gte": target, "$lt": day_end}}).to_list(500)

    all_users = await users.find({}, {"name": 1, "role": 1}).to_list(200)
    total_staff = len(all_users)

    present_ids = {str(r["user_id"]) for r in records if r.get("status") in ("present", "half-day")}

    staff_list = []
    absent_list = []
    for u in all_users:
        uid = str(u["_id"])
        if uid in present_ids:
            rec = next((r for r in records if str(r["user_id"]) == uid), {})
            staff_list.append({"name": u["name"], "role": u.get("role", "staff"), "status": rec.get("status", "present")})
        else:
            absent_list.append({"name": u["name"], "role": u.get("role", "staff")})

    absent_count = len(absent_list)
    rate = round(len(staff_list) / total_staff * 100, 1) if total_staff else 0
    return {
        "date": target.strftime("%Y-%m-%d"),
        "total_staff": total_staff,
        "present": len(staff_list),
        "absent": absent_count,
        "attendance_rate_pct": rate,
        "staff_present": staff_list,
        "staff_absent": absent_list,
        "_charts": [{
            "type": "donut",
            "title": f"Attendance — {target.strftime('%d %b')}",
            "data": [
                {"label": "Present", "value": len(staff_list), "color": "#16a34a"},
                {"label": "Absent", "value": absent_count, "color": "#ef4444"},
            ],
        }],
    }


async def get_attendance_summary(days: int = 30) -> dict:
    """Attendance summary over N days. Absent = working days with no check-in record."""
    db = get_db()
    col = db["attendances"]
    users_col = db["users"]
    since = _start(days)

    # Fetch every record in the period
    all_records = await col.find({"date": {"$gte": since}}).to_list(10000)

    # Unique working dates = days where at least one person was marked (office was open)
    working_dates: set = set()
    for r in all_records:
        d = r["date"]
        working_dates.add(f"{d.year}-{d.month:02d}-{d.day:02d}")
    total_working_days = len(working_dates)

    # Count present days per user from records
    user_present: dict = {}
    for r in all_records:
        uid = str(r["user_id"])
        if r.get("status") in ("present", "half-day"):
            user_present[uid] = user_present.get(uid, 0) + 1

    # Build summary for ALL users — absent = working_days − present
    all_users = await users_col.find({}, {"name": 1, "role": 1}).to_list(200)
    staff_summary = []
    for u in all_users:
        uid = str(u["_id"])
        present = user_present.get(uid, 0)
        absent = max(0, total_working_days - present)
        rate = round(present / total_working_days * 100, 1) if total_working_days else 0
        staff_summary.append({
            "name": u["name"],
            "role": u.get("role"),
            "present_days": present,
            "absent_days": absent,
            "total_working_days": total_working_days,
            "attendance_rate_pct": rate,
        })

    staff_summary.sort(key=lambda x: x["attendance_rate_pct"], reverse=True)
    overall_rate = round(sum(s["attendance_rate_pct"] for s in staff_summary) / len(staff_summary), 1) if staff_summary else 0

    return {
        "period_days": days,
        "total_working_days": total_working_days,
        "staff_attendance": staff_summary,
        "overall_avg_attendance_pct": overall_rate,
        "_charts": [{
            "type": "bar",
            "title": f"Attendance — Last {days} Days ({total_working_days} working days)",
            "y_label": "Days Present",
            "data": [{"label": s["name"], "value": s["present_days"], "value2": s["absent_days"]} for s in staff_summary],
        }],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Leave Requests
# ─────────────────────────────────────────────────────────────────────────────

async def get_leave_requests(days: int = 30, status: str = "all") -> dict:
    """Leave requests submitted in the last N days, optionally filtered by status."""
    db = get_db()
    col = db["leaverequests"]
    users = db["users"]
    since = _start(days)

    match: dict = {"createdAt": {"$gte": since}}
    if status != "all":
        match["status"] = status

    records = await col.find(match).sort("createdAt", -1).to_list(100)

    by_status: dict = {}
    by_type: dict = {}
    detail = []
    for r in records:
        s = r.get("status", "pending")
        by_status[s] = by_status.get(s, 0) + 1
        lt = r.get("leave_type", "unknown")
        by_type[lt] = by_type.get(lt, 0) + 1

        u = await users.find_one({"_id": r.get("manager_id")}, {"name": 1, "role": 1})
        detail.append({
            "staff": u["name"] if u else str(r.get("manager_id")),
            "role": u.get("role") if u else None,
            "leave_type": lt,
            "from": str(r.get("from_date", ""))[:10],
            "to": str(r.get("to_date", ""))[:10],
            "status": s,
            "reason": r.get("reason", ""),
        })

    return {
        "total": len(records),
        "by_status": by_status,
        "by_type": by_type,
        "requests": detail[:20],
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Location Violations
# ─────────────────────────────────────────────────────────────────────────────

async def get_location_violations(days: int = 30) -> dict:
    """Location check-in violations: who tried to clock in from outside the branch geofence."""
    db = get_db()
    col = db["locationviolations"]
    since = _start(days)

    records = await col.find({"createdAt": {"$gte": since}}).sort("createdAt", -1).to_list(200)

    by_user: dict = {}
    by_branch: dict = {}
    for r in records:
        name = r.get("user_name", "Unknown")
        branch = r.get("branch_name", "Unknown")
        by_user[name] = by_user.get(name, 0) + 1
        by_branch[branch] = by_branch.get(branch, 0) + 1

    top_offenders = sorted(by_user.items(), key=lambda x: x[1], reverse=True)[:10]
    return {
        "total_violations": len(records),
        "period_days": days,
        "by_user": [{"name": n, "violations": c} for n, c in top_offenders],
        "by_branch": [{"branch": b, "violations": c} for b, c in sorted(by_branch.items(), key=lambda x: x[1], reverse=True)],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customer Feedback
# ─────────────────────────────────────────────────────────────────────────────

async def get_customer_feedback(days: int = 30) -> dict:
    """Customer feedback/survey responses: overall experience, visit-again rate, recommendations."""
    db = get_db()
    col = db["feedbacks"]
    since = _start(days)

    total = await col.count_documents({"createdAt": {"$gte": since}})
    if total == 0:
        all_time = await col.count_documents({})
        return {"total": 0, "all_time_total": all_time, "period_days": days}

    pipeline = [
        {"$match": {"createdAt": {"$gte": since}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "visit_again_yes": {"$sum": {"$cond": [{"$eq": ["$visitAgain", "Yes"]}, 1, 0]}},
            "recommend_yes": {"$sum": {"$cond": [{"$eq": ["$recommend", "Yes"]}, 1, 0]}},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(1)
    r = rows[0] if rows else {}
    r.pop("_id", None)

    experience_breakdown = {}
    exp_pipeline = [
        {"$match": {"createdAt": {"$gte": since}}},
        {"$group": {"_id": "$overallExperience", "count": {"$sum": 1}}},
    ]
    for row in await col.aggregate(exp_pipeline).to_list(20):
        experience_breakdown[row["_id"] or "Not specified"] = row["count"]

    visit_again_pct = round(r.get("visit_again_yes", 0) / total * 100, 1) if total else 0
    recommend_pct = round(r.get("recommend_yes", 0) / total * 100, 1) if total else 0

    return {
        "total_responses": total,
        "visit_again_pct": visit_again_pct,
        "recommend_pct": recommend_pct,
        "experience_breakdown": experience_breakdown,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Purchase Orders
# ─────────────────────────────────────────────────────────────────────────────

async def get_purchase_orders(days: int = 90) -> dict:
    """Purchase orders from suppliers: count, total amount, and status breakdown."""
    db = get_db()
    col = db["purchase_orders"]
    suppliers_col = db["suppliers"]
    since = _start(days)

    records = await col.find({"createdAt": {"$gte": since}}).sort("createdAt", -1).to_list(200)

    total_amount = 0
    by_status: dict = {}
    details = []
    for r in records:
        amt = r.get("total_amount", 0) or 0
        total_amount += amt
        s = r.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        details.append({
            "po_number": r.get("po_number"),
            "vendor": r.get("vendor_name"),
            "amount": round(amt),
            "status": s,
            "date": str(r.get("purchase_date", r.get("createdAt", "")))[:10],
        })

    return {
        "total_orders": len(records),
        "total_amount": round(total_amount),
        "by_status": by_status,
        "recent_orders": details[:10],
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Refunds / Returns
# ─────────────────────────────────────────────────────────────────────────────

async def get_refunds_summary(days: int = 30) -> dict:
    """Inventory return/refund requests: count, amounts, and status breakdown."""
    db = get_db()
    col = db["inventory_items"]
    since = _start(days)

    pipeline = [
        {"$match": {"return_status": {"$exists": True, "$ne": None}, "updatedAt": {"$gte": since}}},
        {"$group": {
            "_id": "$return_status",
            "count": {"$sum": 1},
            "total_refund": {"$sum": "$return_refund_amount"},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(20)

    total_count = 0
    total_refunded = 0
    by_status = {}
    for r in rows:
        by_status[r["_id"] or "unknown"] = {
            "count": r["count"],
            "total_refund": round(r.get("total_refund") or 0),
        }
        total_count += r["count"]
        total_refunded += r.get("total_refund") or 0

    return {
        "total_returns": total_count,
        "total_refunded": round(total_refunded),
        "by_status": by_status,
        "period_days": days,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Staff Profile
# ─────────────────────────────────────────────────────────────────────────────

async def get_staff_profile(name: str) -> dict:
    """Full profile of a staff member: role, branch, email, avatar, joining date, sales stats, attendance."""
    settings = get_settings()
    db = get_db()
    users = db["users"]
    branches = db["branches"]
    col = db["inventory_items"]
    att_col = db["attendances"]

    # Case-insensitive name search
    import re as _re
    user = await users.find_one({"name": {"$regex": _re.escape(name), "$options": "i"}})
    if not user:
        return {"error": f"No staff member found with name matching '{name}'"}

    # Resolve branch
    branch_doc = None
    if user.get("branch"):
        branch_doc = await branches.find_one({"_id": user["branch"]}, {"name": 1, "city": 1, "state": 1, "code": 1})

    # Avatar URL
    avatar_path = user.get("avatar")
    avatar_url = f"{settings.STATIC_BASE_URL}{avatar_path}" if avatar_path else None

    # All-time sales
    uid = user["_id"]
    sales_pipeline = [
        {"$match": {"status": "sold", "$or": [{"sold_by_user_id": uid}, {"sold_by_manager_id": uid}]}},
        {"$group": {"_id": None, "total_sales": {"$sum": 1}, "total_revenue": {"$sum": REVENUE}}},
    ]
    sales_rows = await col.aggregate(sales_pipeline).to_list(1)
    sales_data = sales_rows[0] if sales_rows else {}
    sales_data.pop("_id", None)

    # Attendance (last 30 days)
    since = _start(30)
    att_records = await att_col.find({"user_id": uid, "date": {"$gte": since}}).to_list(200)
    present_days = sum(1 for r in att_records if r.get("status") in ("present", "half-day"))
    # Calculate working days
    all_records_period = await att_col.find({"date": {"$gte": since}}).to_list(10000)
    working_dates = set()
    for r in all_records_period:
        d = r["date"]
        working_dates.add(f"{d.year}-{d.month:02d}-{d.day:02d}")
    total_working = len(working_dates)
    absent_days = max(0, total_working - present_days)

    profile = {
        "id": str(uid),
        "name": user["name"],
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "branch": branch_doc["name"] if branch_doc else "Not assigned",
        "branch_city": branch_doc.get("city") if branch_doc else None,
        "avatar_url": avatar_url,
        "joining_date": str(user.get("joining_date", ""))[:10] if user.get("joining_date") else None,
        "is_active": user.get("isActive", True),
        "base_salary": user.get("base_salary"),
        "salary_type": user.get("salary_type"),
        "total_sales": sales_data.get("total_sales", 0),
        "total_revenue": round(sales_data.get("total_revenue") or 0),
        "attendance_last_30d": {
            "present_days": present_days,
            "absent_days": absent_days,
            "total_working_days": total_working,
            "rate_pct": round(present_days / total_working * 100, 1) if total_working else 0,
        },
        "_charts": [{
            "type": "profile",
            "title": "Staff Profile",
            "data": [{
                "label": user["name"],
                "value": sales_data.get("total_sales", 0),
                "meta": {
                    "role": user.get("role", ""),
                    "branch": branch_doc["name"] if branch_doc else "Not assigned",
                    "branch_city": branch_doc.get("city") if branch_doc else "",
                    "email": user.get("email", ""),
                    "avatar_url": avatar_url,
                    "joining_date": str(user.get("joining_date", ""))[:10] if user.get("joining_date") else None,
                    "total_sales": sales_data.get("total_sales", 0),
                    "total_revenue": round(sales_data.get("total_revenue") or 0),
                    "present_days": present_days,
                    "absent_days": absent_days,
                    "attendance_rate": round(present_days / total_working * 100, 1) if total_working else 0,
                    "is_active": user.get("isActive", True),
                },
            }],
        }],
    }
    return profile


# ─────────────────────────────────────────────────────────────────────────────
# Today quick snapshot
# ─────────────────────────────────────────────────────────────────────────────

async def get_today_snapshot() -> dict:
    """Quick snapshot of today's activity: sales, revenue, top item."""
    db = get_db()
    col = db["inventory_items"]
    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"status": "sold", "sold_at": {"$gte": today_start}}},
        {"$group": {
            "_id": None,
            "sales": {"$sum": 1},
            "revenue": {"$sum": REVENUE},
            "max_sale": {"$max": REVENUE},
        }},
    ]
    rows = await col.aggregate(pipeline).to_list(1)
    snap = rows[0] if rows else {"sales": 0, "revenue": 0}
    snap.pop("_id", None)
    snap["revenue"] = round(snap.get("revenue") or 0)

    # top product today
    top_pip = [
        {"$match": {"status": "sold", "sold_at": {"$gte": today_start}}},
        {"$group": {"_id": "$product_id", "units": {"$sum": 1}}},
        {"$sort": {"units": -1}},
        {"$limit": 1},
    ]
    top_rows = await col.aggregate(top_pip).to_list(1)
    if top_rows:
        p = await db["products"].find_one({"_id": top_rows[0]["_id"]}, {"name": 1})
        snap["top_product_today"] = p["name"] if p else str(top_rows[0]["_id"])

    snap["date"] = today_start.strftime("%Y-%m-%d")
    return snap
