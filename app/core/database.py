from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import get_settings

settings = get_settings()

class Database:
    client: AsyncIOMotorClient = None
    db = None

db = Database()

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(settings.MONGODB_URI)
    db.db = db.client[settings.DATABASE_NAME]
    print(f"Connected to MongoDB: {settings.DATABASE_NAME}")

async def close_mongo_connection():
    db.client.close()
    print("Closed MongoDB connection")

def get_db():
    return db.db
