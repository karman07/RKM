from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Product(BaseModel):
    name: str
    sku: str
    description: str
    category_id: Optional[str] = None
    brand: Optional[str] = None
    collection_name: Optional[str] = None
    gender: Optional[str] = None
    occasion: Optional[str] = None
    status: str = "active"
    
    metal_type: Optional[str] = None
    purity: Optional[str] = None
    metal_color: Optional[str] = None
    
    gross_weight: float = 0.0
    net_weight: float = 0.0
    stone_weight: float = 0.0
    
    has_stones: bool = False
    stone_type: Optional[str] = None
    stone_price: float = 0.0
    
    dimensions: Optional[str] = None
    ring_size: Optional[str] = None
    
    making_charge_type: Optional[str] = None
    making_charge_rate: float = 0.0
    
    tax_percentage: float = 3.0
    discount_percentage: float = 0.0
    price_override: Optional[float] = None
    
    images: List[str] = []
    
    # Required additions
    embedding: Optional[List[float]] = None
    searchable_text: Optional[str] = None
    
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    query: str

class ChatResponseProduct(BaseModel):
    name: str
    price: float
    url: str
    image: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    products: List[ChatResponseProduct]
    filters_applied: dict
    suggestions: List[str]
