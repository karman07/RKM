from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    GEMINI_API_KEY: str
    MONGODB_URI: str
    DATABASE_NAME: str = "jewellery_db"
    COLLECTION_NAME: str = "products"
    
    # Model Names
    GEMINI_CHAT_MODEL: str = "gemini-2.5-flash"
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIMENSIONS: int = 768
    VECTOR_INDEX_NAME: str = "vector_index"
    VECTOR_NUM_CANDIDATES: int = 150
    RETRIEVAL_POOL_SIZE: int = 24

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
