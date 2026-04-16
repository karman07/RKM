import asyncio
from app.core.database import connect_to_mongo, get_db
from app.core.config import get_settings

async def check():
    await connect_to_mongo()
    db = get_db()
    
    # Check total products
    count = await db.products.count_documents({})
    print(f"Total products in DB: {count}")
    
    # Check products with embeddings
    embed_count = await db.products.count_documents({"embedding": {"$exists": True}})
    print(f"Products with embeddings: {embed_count}")
    
    # List some product details
    cursor = db.products.find({})
    async for p in cursor:
        print(f"Product: {p.get('name')} | SKU: {p.get('sku')} | CatID: {p.get('category_id')} | Metal: {p.get('metal_type')} | Status: {p.get('status')} | HasEmbedding: {'embedding' in p}")

if __name__ == "__main__":
    asyncio.run(check())
