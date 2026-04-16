import asyncio
from pymongo.operations import SearchIndexModel

from app.core.database import connect_to_mongo, close_mongo_connection, get_db
from app.core.config import get_settings
from app.services.gemini_service import gemini_service
from app.services.product_service import build_searchable_text

settings = get_settings()

async def ensure_vector_index(collection) -> None:
    existing_indexes = await collection.list_search_indexes().to_list(length=50)
    existing_names = {index.get("name") for index in existing_indexes}
    if settings.VECTOR_INDEX_NAME in existing_names:
        print(f"Vector index '{settings.VECTOR_INDEX_NAME}' already exists")
        return

    model = SearchIndexModel(
        name=settings.VECTOR_INDEX_NAME,
        type="vectorSearch",
        definition={
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": settings.EMBEDDING_DIMENSIONS,
                    "similarity": "cosine",
                },
                {"type": "filter", "path": "status"},
                {"type": "filter", "path": "deleted_at"},
                {"type": "filter", "path": "metal_type"},
                {"type": "filter", "path": "stone_type"},
                {"type": "filter", "path": "purity"},
                {"type": "filter", "path": "metal_color"},
                {"type": "filter", "path": "occasion"},
                {"type": "filter", "path": "gender"},
                {"type": "filter", "path": "collection_name"},
                {"type": "filter", "path": "brand"},
                {"type": "filter", "path": "category_id"},
            ]
        },
    )
    created_name = await collection.create_search_index(model)
    print(f"Created vector index: {created_name}")

async def update_products_with_embeddings():
    await connect_to_mongo()
    db = get_db()
    collection = db[settings.COLLECTION_NAME]
    categories = db["categories"]
    await ensure_vector_index(collection)
    category_docs = await categories.find({}, {"name": 1, "slug": 1}).to_list(length=500)
    category_map = {str(doc["_id"]): doc for doc in category_docs}
    
    products = await collection.find({}).to_list(length=1000)
    to_refresh = []
    for product in products:
        embedding = product.get("embedding")
        searchable_text = product.get("searchable_text")
        if not searchable_text or not isinstance(embedding, list) or len(embedding) != settings.EMBEDDING_DIMENSIONS:
            to_refresh.append(product)

    print(f"Found {len(to_refresh)} products that need searchable text or embeddings refreshed")
    
    for p in to_refresh:
        category_doc = category_map.get(str(p.get("category_id")), {})
        # Build searchable text
        searchable_text = build_searchable_text(
            type('obj', (object,), p),
            category_name=category_doc.get("name"),
            category_slug=category_doc.get("slug"),
        )
        
        # Generate embedding
        embedding = await gemini_service.get_embedding(searchable_text, task_type="RETRIEVAL_DOCUMENT")
        
        # Update product
        await collection.update_one(
            {"_id": p["_id"]},
            {"$set": {
                "searchable_text": searchable_text,
                "embedding": embedding
            }}
        )
        print(f"Updated product: {p.get('name')} (SKU: {p.get('sku')})")
        
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(update_products_with_embeddings())
