import asyncio
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright, Browser, Page
from models import Retailer, Availability

browser_instance: Optional[Browser] = None


async def get_browser() -> Browser:
    global browser_instance
    if browser_instance is None:
        playwright = await async_playwright().start()
        browser_instance = await playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage']
        )
    return browser_instance


async def close_browser():
    global browser_instance
    if browser_instance:
        await browser_instance.close()
        browser_instance = None


RETAILER_CONFIGS: Dict[Retailer, Dict[str, Any]] = {
    Retailer.NYKAA: {
        "search_url": "https://www.nykaa.com/search/result/?q={query}",
        "product_selector": ".product-listing-wrap a.product-item",
        "image_selector": "meta[property='og:image']",
        "price_selector": ".price-info .price, .product-price",
        "availability_selector": ".add-to-bag, .notify-me"
    },
    Retailer.AMAZON_IN: {
        "search_url": "https://www.amazon.in/s?k={query}&i=beauty",
        "product_selector": "[data-component-type='s-search-result'] a.a-link-normal",
        "image_selector": "meta[property='og:image']",
        "price_selector": ".a-price .a-offscreen",
        "availability_selector": "#availability span, #add-to-cart-button"
    },
    Retailer.AMAZON_US: {
        "search_url": "https://www.amazon.com/s?k={query}&i=beauty",
        "product_selector": "[data-component-type='s-search-result'] a.a-link-normal",
        "image_selector": "meta[property='og:image']",
        "price_selector": ".a-price .a-offscreen",
        "availability_selector": "#availability span, #add-to-cart-button"
    },
    Retailer.SEPHORA: {
        "search_url": "https://www.sephora.com/search?keyword={query}",
        "product_selector": "[data-comp='ProductTile'] a",
        "image_selector": "meta[property='og:image']",
        "price_selector": "[data-comp='Price'] span",
        "availability_selector": "[data-comp='AddToBasket']"
    }
}


async def scrape_product_page(url: str) -> Dict[str, Any]:
    result = {
        "image_url": None,
        "price": None,
        "availability": Availability.UNKNOWN,
        "title": None
    }
    
    try:
        browser = await get_browser()
        page = await browser.new_page()
        
        await page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(2)
        
        og_image = await page.query_selector("meta[property='og:image']")
        if og_image:
            result["image_url"] = await og_image.get_attribute("content")
        
        og_title = await page.query_selector("meta[property='og:title']")
        if og_title:
            result["title"] = await og_title.get_attribute("content")
        
        price_selectors = [
            ".price", ".product-price", ".a-price .a-offscreen",
            "[data-comp='Price']", ".final-price", ".offer-price"
        ]
        for selector in price_selectors:
            try:
                price_elem = await page.query_selector(selector)
                if price_elem:
                    price_text = await price_elem.inner_text()
                    if price_text:
                        result["price"] = price_text.strip()
                        break
            except:
                continue
        
        try:
            add_to_cart = await page.query_selector(
                "button:has-text('Add to Cart'), button:has-text('Add to Bag'), "
                "[data-action='add-to-cart'], .add-to-bag"
            )
            if add_to_cart:
                is_disabled = await add_to_cart.get_attribute("disabled")
                if is_disabled:
                    result["availability"] = Availability.OUT_OF_STOCK
                else:
                    result["availability"] = Availability.IN_STOCK
            
            out_of_stock = await page.query_selector(
                ":text('out of stock'), :text('unavailable'), :text('sold out'), .notify-me"
            )
            if out_of_stock:
                result["availability"] = Availability.OUT_OF_STOCK
        except:
            pass
        
        await page.close()
        
    except Exception as e:
        print(f"Scraping error for {url}: {e}")
    
    return result


async def search_and_scrape(
    product_name: str,
    retailer: Retailer
) -> Dict[str, Any]:
    config = RETAILER_CONFIGS.get(retailer)
    if not config:
        return {"error": f"No config for retailer {retailer}"}
    
    result = {
        "image_url": None,
        "price": None,
        "availability": Availability.UNKNOWN,
        "product_url": None,
        "source": "scraper"
    }
    
    try:
        browser = await get_browser()
        page = await browser.new_page()
        
        await page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        
        search_url = config["search_url"].format(query=product_name.replace(' ', '+'))
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)
        
        product_link = await page.query_selector(config["product_selector"])
        if product_link:
            href = await product_link.get_attribute("href")
            if href:
                if not href.startswith("http"):
                    base_urls = {
                        Retailer.NYKAA: "https://www.nykaa.com",
                        Retailer.AMAZON_IN: "https://www.amazon.in",
                        Retailer.AMAZON_US: "https://www.amazon.com",
                        Retailer.SEPHORA: "https://www.sephora.com"
                    }
                    href = base_urls.get(retailer, "") + href
                
                result["product_url"] = href
                
                page_data = await scrape_product_page(href)
                result.update(page_data)
        
        await page.close()
        
    except Exception as e:
        result["error"] = str(e)
        print(f"Search scrape error for {retailer}: {e}")
    
    return result
