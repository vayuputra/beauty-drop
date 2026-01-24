import os
import asyncio
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime

from models import (
    Retailer, ProductData, FetchRequest, FetchResponse,
    Availability, PriceData, Currency
)
from price_normalizer import create_price_data, parse_price_string
from image_verifier import verify_product_image
from scraper import search_and_scrape

SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
BRIGHTDATA_API_KEY = os.environ.get("BRIGHTDATA_API_KEY")


RETAILER_SEARCH_SITES: Dict[Retailer, Dict[str, Any]] = {
    Retailer.NYKAA: {
        "domain": "nykaa.com",
        "gl": "in",
        "hl": "en",
        "currency": Currency.INR
    },
    Retailer.AMAZON_IN: {
        "domain": "amazon.in", 
        "gl": "in",
        "hl": "en",
        "currency": Currency.INR
    },
    Retailer.AMAZON_US: {
        "domain": "amazon.com",
        "gl": "us", 
        "hl": "en",
        "currency": Currency.USD
    },
    Retailer.SEPHORA: {
        "domain": "sephora.com",
        "gl": "us",
        "hl": "en", 
        "currency": Currency.USD
    },
    Retailer.SEPHORA_IN: {
        "domain": "sephora.nnnow.com",
        "gl": "in",
        "hl": "en",
        "currency": Currency.INR
    },
    Retailer.ULTA: {
        "domain": "ulta.com",
        "gl": "us",
        "hl": "en",
        "currency": Currency.USD
    },
    Retailer.MYNTRA: {
        "domain": "myntra.com",
        "gl": "in",
        "hl": "en",
        "currency": Currency.INR
    },
    Retailer.PURPLLE: {
        "domain": "purplle.com",
        "gl": "in",
        "hl": "en",
        "currency": Currency.INR
    }
}


async def fetch_from_serpapi(
    product_name: str,
    brand: Optional[str],
    retailer: Retailer
) -> Optional[Dict[str, Any]]:
    if not SERPAPI_KEY:
        return None
    
    config = RETAILER_SEARCH_SITES.get(retailer)
    if not config:
        return None
    
    search_query = f"{brand} {product_name}" if brand else product_name
    search_query += f" site:{config['domain']}"
    
    params = {
        "engine": "google_shopping",
        "q": search_query,
        "api_key": SERPAPI_KEY,
        "gl": config["gl"],
        "hl": config["hl"],
        "num": 5
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("https://serpapi.com/search", params=params)
            if response.status_code == 200:
                data = response.json()
                shopping_results = data.get("shopping_results", [])
                if shopping_results:
                    return shopping_results[0]
    except Exception as e:
        print(f"SerpAPI error for {retailer}: {e}")
    
    return None


async def fetch_from_google_images(
    product_name: str,
    brand: Optional[str],
    retailer: Retailer
) -> Optional[Dict[str, Any]]:
    if not SERPAPI_KEY:
        return None
    
    config = RETAILER_SEARCH_SITES.get(retailer)
    if not config:
        return None
    
    search_query = f"{brand} {product_name}" if brand else product_name
    search_query += f" site:{config['domain']}"
    
    params = {
        "engine": "google_images",
        "q": search_query,
        "api_key": SERPAPI_KEY,
        "gl": config["gl"],
        "hl": config["hl"],
        "num": 5
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("https://serpapi.com/search", params=params)
            if response.status_code == 200:
                data = response.json()
                image_results = data.get("images_results", [])
                if image_results:
                    first_result = image_results[0]
                    return {
                        "thumbnail": first_result.get("original") or first_result.get("thumbnail"),
                        "link": first_result.get("link"),
                        "source": first_result.get("source")
                    }
    except Exception as e:
        print(f"Google Images API error for {retailer}: {e}")
    
    return None


async def fetch_product_data(
    product_name: str,
    brand: Optional[str],
    retailer: Retailer,
    verify_image: bool = True
) -> ProductData:
    result = ProductData(
        product_name=product_name,
        retailer=retailer,
        source="none"
    )
    
    api_result = await fetch_from_serpapi(product_name, brand, retailer)
    
    if api_result:
        result.source = "serpapi"
        result.image_url = api_result.get("thumbnail")
        result.product_url = api_result.get("link")
        
        price_str = api_result.get("price") or api_result.get("extracted_price")
        if price_str:
            price_data = create_price_data(str(price_str))
            if price_data:
                result.price = price_data
        
        if api_result.get("in_stock") is not None:
            result.availability = Availability.IN_STOCK if api_result["in_stock"] else Availability.OUT_OF_STOCK
    else:
        image_result = await fetch_from_google_images(product_name, brand, retailer)
        if image_result:
            result.source = "google_images"
            result.image_url = image_result.get("thumbnail")
            result.product_url = image_result.get("link")
    
    needs_scrape = (
        not result.image_url or 
        not result.product_url or 
        result.price is None
    )
    
    if needs_scrape:
        scrape_result = await search_and_scrape(product_name, retailer)
        if not scrape_result.get("error"):
            if result.source == "none":
                result.source = "scraper"
            else:
                result.source = f"{result.source}+scraper"
            
            if not result.image_url and scrape_result.get("image_url"):
                result.image_url = scrape_result["image_url"]
            if not result.product_url and scrape_result.get("product_url"):
                result.product_url = scrape_result["product_url"]
            if result.price is None and scrape_result.get("price"):
                price_data = create_price_data(scrape_result["price"])
                if price_data:
                    result.price = price_data
            if result.availability == Availability.UNKNOWN and scrape_result.get("availability"):
                result.availability = scrape_result["availability"]
    
    if verify_image and result.image_url:
        verification = await verify_product_image(product_name, brand, result.image_url)
        result.image_verified = verification.is_valid
        result.verification_confidence = verification.confidence
        
        if not verification.is_valid and verification.confidence < 50:
            result.error = f"Image mismatch: detected {verification.detected_brand} {verification.detected_product}"
    
    result.fetched_at = datetime.utcnow()
    
    return result


async def fetch_all_retailers(request: FetchRequest) -> FetchResponse:
    start_time = datetime.utcnow()
    
    tasks = [
        fetch_product_data(
            request.product_name,
            request.brand,
            retailer,
            request.verify_images
        )
        for retailer in request.retailers
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    product_results = []
    for r in results:
        if isinstance(r, Exception):
            print(f"Fetch error: {r}")
        elif isinstance(r, ProductData):
            product_results.append(r)
    
    duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
    
    return FetchResponse(
        product_name=request.product_name,
        results=product_results,
        fetch_duration_ms=duration_ms
    )
