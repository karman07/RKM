from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.core.database import get_db
from app.core.config import get_settings
from app.services.gemini_service import gemini_service
from app.services.product_service import build_searchable_text

router = APIRouter()
settings = get_settings()


async def _sync_one(product_id: str) -> dict:
    """Core logic: fetch product, build text, generate embedding, save."""
    db = get_db()
    collection = db[settings.COLLECTION_NAME]
    categories = db["categories"]

    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid product id: {product_id}")

    product = await collection.find_one({"_id": oid})
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    # Resolve category
    category_doc = {}
    if product.get("category_id"):
        try:
            cat = await categories.find_one({"_id": ObjectId(str(product["category_id"]))})
            if cat:
                category_doc = cat
        except Exception:
            pass

    searchable_text = build_searchable_text(
        type("obj", (object,), product),
        category_name=category_doc.get("name"),
        category_slug=category_doc.get("slug"),
    )

    embedding = await gemini_service.get_embedding(searchable_text, task_type="RETRIEVAL_DOCUMENT")

    await collection.update_one(
        {"_id": oid},
        {"$set": {"searchable_text": searchable_text, "embedding": embedding}},
    )

    return {
        "product_id": product_id,
        "name": product.get("name"),
        "sku": product.get("sku"),
        "searchable_text": searchable_text,
        "embedding_dims": len(embedding),
    }


@router.post("/sync/product/{product_id}")
async def sync_product(product_id: str):
    """Sync a single product's embedding. Called by the main backend on create/update."""
    result = await _sync_one(product_id)
    return {"status": "synced", **result}


@router.post("/sync/all")
async def sync_all():
    """Re-sync every product that is missing or has a stale embedding. Admin use only."""
    db = get_db()
    collection = db[settings.COLLECTION_NAME]
    categories = db["categories"]

    category_docs = await categories.find({}, {"name": 1, "slug": 1}).to_list(length=500)
    category_map = {str(doc["_id"]): doc for doc in category_docs}

    products = await collection.find({}).to_list(length=5000)

    synced, skipped, failed = [], [], []
    for p in products:
        pid = str(p["_id"])
        embedding = p.get("embedding")
        searchable_text = p.get("searchable_text")
        if (
            searchable_text
            and isinstance(embedding, list)
            and len(embedding) == settings.EMBEDDING_DIMENSIONS
        ):
            skipped.append(pid)
            continue
        try:
            cat = category_map.get(str(p.get("category_id")), {})
            text = build_searchable_text(
                type("obj", (object,), p),
                category_name=cat.get("name"),
                category_slug=cat.get("slug"),
            )
            emb = await gemini_service.get_embedding(text, task_type="RETRIEVAL_DOCUMENT")
            await collection.update_one(
                {"_id": p["_id"]},
                {"$set": {"searchable_text": text, "embedding": emb}},
            )
            synced.append(pid)
            print(f"[sync/all] Synced: {p.get('name')} ({pid})")
        except Exception as e:
            failed.append({"id": pid, "error": str(e)})
            print(f"[sync/all] Failed: {pid} — {e}")

    return {
        "status": "complete",
        "synced": len(synced),
        "skipped": len(skipped),
        "failed": len(failed),
        "failures": failed,
    }
