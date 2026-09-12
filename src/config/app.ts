/**
 * 应用运行时配置中心
 * ==================
 * 部署后修改 dist/app-config.json 中的 apiBaseUrl，
 * 可将前端请求指向任意网关地址，无需重新构建。
 */

let _apiBaseUrl = '/api';

export function setApiBaseUrl(url: string): void {
  _apiBaseUrl = url.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  return _apiBaseUrl;
}

/**
 * 根据当前脚本标签的 src 推导应用根路径，支持子路径部署。
 * 例如前端部署在 /hr-web/ 时，返回 /hr-web/；部署在根目录时返回 /。
 */
export function getAppBasePath(): string {
  const script = document.querySelector('script[src*="/assets/index-"]') as HTMLScriptElement | null;
  if (script?.src) {
    // script.src 是绝对 URL，例如 http://host/hr-web/assets/index-xxx.js
    // 需要提取 pathname 部分再处理
    const url = new URL(script.src);
    // pathname: /hr-web/assets/index-xxx.js -> /hr-web/
    return url.pathname.replace(/assets\/[^/]+\.js\/?$/, '').replace(/\/?$/, '/');
  }
  return '/';
}

export async function loadAppConfig(): Promise<void> {
  try {
    const basePath = getAppBasePath();
    const res = await fetch(`${basePath}app-config.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const json = await res.json();
    if (json.apiBaseUrl) {
      setApiBaseUrl(json.apiBaseUrl);
      console.log('[AppConfig] API base URL:', _apiBaseUrl);
    }
  } catch (e) {
    console.log('[AppConfig] 使用默认 API base URL:', _apiBaseUrl);
  }
}
