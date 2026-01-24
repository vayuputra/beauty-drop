import os
import base64
import httpx
from typing import Optional
from openai import OpenAI
from models import ImageVerificationResult

client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    global client
    if client is None:
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not found in environment variables")
        client = OpenAI(api_key=api_key)
    return client


async def download_image_as_base64(image_url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.get(image_url, follow_redirects=True)
            if response.status_code == 200:
                return base64.b64encode(response.content).decode('utf-8')
    except Exception as e:
        print(f"Error downloading image: {e}")
    return None


async def verify_product_image(
    product_name: str,
    brand: Optional[str],
    image_url: str
) -> ImageVerificationResult:
    try:
        openai_client = get_openai_client()
        
        search_term = f"{brand} {product_name}" if brand else product_name
        
        prompt = f"""Analyze this product image and determine if it matches the expected product.

Expected Product: {search_term}

Please analyze the image and respond with:
1. Does this image show the expected product? (yes/no)
2. What product/brand do you see in the image?
3. Confidence level (0-100)
4. Brief reason for your assessment

Format your response as:
MATCH: [yes/no]
DETECTED_PRODUCT: [product name you see]
DETECTED_BRAND: [brand name you see]
CONFIDENCE: [0-100]
REASON: [brief explanation]"""

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url, "detail": "low"}
                        }
                    ]
                }
            ],
            max_tokens=300
        )
        
        result_text = response.choices[0].message.content or ""
        
        is_valid = "MATCH: yes" in result_text.lower() or "match: yes" in result_text
        
        confidence = 50.0
        if "CONFIDENCE:" in result_text:
            try:
                conf_line = [l for l in result_text.split('\n') if 'CONFIDENCE:' in l][0]
                confidence = float(conf_line.split(':')[1].strip().replace('%', ''))
            except:
                pass
        
        detected_product = None
        if "DETECTED_PRODUCT:" in result_text:
            try:
                prod_line = [l for l in result_text.split('\n') if 'DETECTED_PRODUCT:' in l][0]
                detected_product = prod_line.split(':', 1)[1].strip()
            except:
                pass
        
        detected_brand = None
        if "DETECTED_BRAND:" in result_text:
            try:
                brand_line = [l for l in result_text.split('\n') if 'DETECTED_BRAND:' in l][0]
                detected_brand = brand_line.split(':', 1)[1].strip()
            except:
                pass
        
        reason = None
        if "REASON:" in result_text:
            try:
                reason_line = [l for l in result_text.split('\n') if 'REASON:' in l][0]
                reason = reason_line.split(':', 1)[1].strip()
            except:
                pass
        
        return ImageVerificationResult(
            is_valid=is_valid,
            confidence=confidence,
            detected_product=detected_product,
            detected_brand=detected_brand,
            reason=reason
        )
        
    except Exception as e:
        print(f"Image verification error: {e}")
        return ImageVerificationResult(
            is_valid=True,
            confidence=0.0,
            reason=f"Verification failed: {str(e)}"
        )
