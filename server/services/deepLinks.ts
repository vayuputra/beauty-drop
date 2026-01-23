interface DeepLinkResult {
  universalLink: string;
  appScheme: string | null;
  intentUrl: string | null;
  webFallback: string;
  platform: 'ios' | 'android' | 'web';
}

const APP_CONFIG: Record<string, { 
  iosScheme: string; 
  androidPackage: string;
  androidScheme: string;
  universalDomain: string;
}> = {
  'Nykaa': { 
    iosScheme: 'nykaa://', 
    androidPackage: 'com.fsn.nykaa',
    androidScheme: 'nykaa://',
    universalDomain: 'www.nykaa.com'
  },
  'Amazon': { 
    iosScheme: 'com.amazon.mobile.shopping://', 
    androidPackage: 'com.amazon.mShop.android.shopping',
    androidScheme: 'amazon://',
    universalDomain: 'www.amazon.com'
  },
  'Amazon India': { 
    iosScheme: 'com.amazon.mobile.shopping://', 
    androidPackage: 'in.amazon.mShop.android.shopping',
    androidScheme: 'amazon://',
    universalDomain: 'www.amazon.in'
  },
  'Sephora': { 
    iosScheme: 'sephora://', 
    androidPackage: 'com.sephora',
    androidScheme: 'sephora://',
    universalDomain: 'www.sephora.com'
  },
  'Sephora India': { 
    iosScheme: 'sephora://', 
    androidPackage: 'com.sephora',
    androidScheme: 'sephora://',
    universalDomain: 'www.sephora.com'
  },
  'Ulta Beauty': { 
    iosScheme: 'ulta://', 
    androidPackage: 'com.ulta.ulta',
    androidScheme: 'ulta://',
    universalDomain: 'www.ulta.com'
  },
  'Myntra': { 
    iosScheme: 'myntra://', 
    androidPackage: 'com.myntra.android',
    androidScheme: 'myntra://',
    universalDomain: 'www.myntra.com'
  },
  'Purplle': { 
    iosScheme: 'purplle://', 
    androidPackage: 'com.manash.purplle',
    androidScheme: 'purplle://',
    universalDomain: 'www.purplle.com'
  },
  'Tata CLiQ': { 
    iosScheme: 'tatacliq://', 
    androidPackage: 'com.tatadigital.tcp',
    androidScheme: 'tatacliq://',
    universalDomain: 'www.tatacliq.com'
  }
};

export function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}

export function generateDeepLink(
  retailerName: string,
  affiliateUrl: string,
  userAgent: string
): DeepLinkResult {
  const platform = detectPlatform(userAgent);
  const config = APP_CONFIG[retailerName];
  
  if (!config) {
    return {
      universalLink: affiliateUrl,
      appScheme: null,
      intentUrl: null,
      webFallback: affiliateUrl,
      platform
    };
  }
  
  const appScheme = platform === 'ios' ? config.iosScheme : config.androidScheme;
  
  let universalLink = affiliateUrl;
  let intentUrl: string | null = null;
  
  try {
    const url = new URL(affiliateUrl);
    universalLink = `https://${config.universalDomain}${url.pathname}${url.search}`;
    
    if (platform === 'android') {
      intentUrl = `intent://${config.universalDomain}${url.pathname}${url.search}#Intent;scheme=https;package=${config.androidPackage};S.browser_fallback_url=${encodeURIComponent(affiliateUrl)};end`;
    }
  } catch {
    universalLink = affiliateUrl;
  }
  
  return {
    universalLink,
    appScheme,
    intentUrl,
    webFallback: affiliateUrl,
    platform
  };
}

export function generateSmartLink(
  retailerName: string,
  affiliateUrl: string,
  userAgent: string
): string {
  const deepLink = generateDeepLink(retailerName, affiliateUrl, userAgent);
  
  if (deepLink.platform === 'web' || !deepLink.appScheme) {
    return deepLink.webFallback;
  }
  
  if (deepLink.platform === 'android' && deepLink.intentUrl) {
    return deepLink.intentUrl;
  }
  
  return deepLink.universalLink;
}
