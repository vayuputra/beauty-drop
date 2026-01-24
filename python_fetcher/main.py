import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import (
    Retailer, FetchRequest, FetchResponse, ProductData
)
from fetcher import fetch_all_retailers, fetch_product_data
from cache import (
    get_cache_key, get_cached_data, set_cached_data, 
    is_cache_stale, clear_cache, get_cache_stats, cleanup_expired
)
from scraper import close_browser


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Python Price Fetcher Service...")
    yield
    print("Shutting down...")
    await close_browser()


app = FastAPI(
    title="Beauty Drop Price Fetcher",
    description="Real-time price and image fetching for beauty products",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SingleProductRequest(BaseModel):
    product_name: str
    brand: Optional[str] = None
    retailer: Retailer
    verify_image: bool = True


class RefreshRequest(BaseModel):
    product_name: str
    brand: Optional[str] = None
    retailers: List[Retailer] = [
        Retailer.NYKAA, Retailer.AMAZON_IN, 
        Retailer.AMAZON_US, Retailer.SEPHORA
    ]


async def background_refresh(request: FetchRequest):
    try:
        cache_key = get_cache_key(request.product_name, request.retailers)
        result = await fetch_all_retailers(request)
        set_cached_data(cache_key, result)
        print(f"Background refresh complete for: {request.product_name}")
    except Exception as e:
        print(f"Background refresh error: {e}")


@app.get("/")
async def root():
    return {
        "service": "Beauty Drop Price Fetcher",
        "status": "running",
        "endpoints": [
            "/fetch - Fetch product data from all retailers",
            "/fetch/single - Fetch from a single retailer",
            "/refresh - Trigger background refresh",
            "/cache/stats - View cache statistics",
            "/health - Health check"
        ]
    }


@app.post("/fetch", response_model=FetchResponse)
async def fetch_product(
    request: FetchRequest,
    background_tasks: BackgroundTasks,
    force_refresh: bool = Query(False, description="Force refresh even if cached")
):
    cache_key = get_cache_key(request.product_name, request.retailers)
    
    if not force_refresh:
        cached = get_cached_data(cache_key)
        if cached:
            response = FetchResponse(
                product_name=cached.product_name,
                results=cached.results,
                cache_hit=True,
                fetch_duration_ms=cached.fetch_duration_ms
            )
            return response
    
    result = await fetch_all_retailers(request)
    set_cached_data(cache_key, result)
    
    return result


@app.post("/fetch/single", response_model=ProductData)
async def fetch_single_retailer(request: SingleProductRequest):
    result = await fetch_product_data(
        request.product_name,
        request.brand,
        request.retailer,
        request.verify_image
    )
    return result


@app.post("/refresh")
async def trigger_refresh(
    request: RefreshRequest,
    background_tasks: BackgroundTasks
):
    fetch_request = FetchRequest(
        product_name=request.product_name,
        brand=request.brand,
        retailers=request.retailers,
        verify_images=True
    )
    
    cache_key = get_cache_key(request.product_name, request.retailers)
    
    if is_cache_stale(cache_key):
        background_tasks.add_task(background_refresh, fetch_request)
        return {
            "status": "refresh_triggered",
            "message": "Background refresh started",
            "product": request.product_name
        }
    else:
        return {
            "status": "cache_valid",
            "message": "Data is fresh, no refresh needed",
            "product": request.product_name
        }


@app.get("/cache/stats")
async def cache_statistics():
    return get_cache_stats()


@app.post("/cache/clear")
async def clear_all_cache():
    count = clear_cache()
    return {"cleared": count, "message": f"Cleared {count} cache entries"}


@app.post("/cache/cleanup")
async def cleanup_cache():
    count = cleanup_expired()
    return {"cleaned": count, "message": f"Removed {count} expired entries"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "cache": get_cache_stats()
    }


@app.get("/retailers")
async def list_retailers():
    return {
        "retailers": [r.value for r in Retailer],
        "india": [Retailer.NYKAA.value, Retailer.AMAZON_IN.value, 
                  Retailer.MYNTRA.value, Retailer.PURPLLE.value],
        "us": [Retailer.AMAZON_US.value, Retailer.SEPHORA.value, 
               Retailer.ULTA.value]
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_FETCHER_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
