/**
 * Runs before paint and before hydration. Reads the existing theme cookie
 * without calling cookies() during server render, so the root layout can stay
 * cacheable. The server HTML defaults to dark; this adds `light` only when
 * the cookie says so. <html suppressHydrationWarning> absorbs the class diff.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var parts=String(document.cookie||'').split(';');for(var i=0;i<parts.length;i++){if(parts[i].replace(/^\\s+|\\s+$/g,'')==='theme=light'){document.documentElement.classList.add('light');break;}}}catch(e){}})();`;
