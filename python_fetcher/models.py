from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class Currency(str, Enum):
    INR = "INR"
    USD = "USD"


class Availability(str, Enum):
    IN_STOCK = "in_stock"
    OUT_OF_STOCK = "out_of_stock"
    LIMITED = "limited"
    UNKNOWN = "unknown"


class Retailer(str, Enum):
    NYKAA = "nykaa"
    AMAZON_IN = "amazon_in"
    AMAZON_US = "amazon_us"
    SEPHORA = "sephora"
    SEPHORA_IN = "sephora_in"
    ULTA = "ulta"
    MYNTRA = "myntra"
    PURPLLE = "purplle"


class PriceData(BaseModel):
    amount: float
    currency: Currency
    amount_usd: Optional[float] = None
    original_price: Optional[float] = None
    discount_percent: Optional[float] = None


class ProductData(BaseModel):
    product_name: str
    retailer: Retailer
    image_url: Optional[str] = None
    image_verified: bool = False
    verification_confidence: Optional[float] = None
    price: Optional[PriceData] = None
    availability: Availability = Availability.UNKNOWN
    product_url: Optional[str] = None
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    source: str = "api"
    error: Optional[str] = None


class FetchRequest(BaseModel):
    product_name: str
    brand: Optional[str] = None
    retailers: List[Retailer] = Field(default_factory=lambda: [
        Retailer.NYKAA, Retailer.AMAZON_IN, Retailer.AMAZON_US, Retailer.SEPHORA
    ])
    verify_images: bool = True


class FetchResponse(BaseModel):
    product_name: str
    results: List[ProductData]
    cache_hit: bool = False
    fetch_duration_ms: int = 0


class ImageVerificationResult(BaseModel):
    is_valid: bool
    confidence: float
    detected_product: Optional[str] = None
    detected_brand: Optional[str] = None
    reason: Optional[str] = None


class CacheEntry(BaseModel):
    data: FetchResponse
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
