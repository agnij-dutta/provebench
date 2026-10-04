export interface DeviceInfo {
  ua: string;
  browser: string;
  os: string;
  model: string | null;
  mobile: boolean;
  kind: 'phone' | 'tablet' | 'desktop';
  cores: number | null;
  memory_gb_hint: number | null;
  cross_origin_isolated: boolean;
  wasm_threads: boolean;
  screen: string;
  label: string;
}

function parseBrowser(ua: string): string {
  const m =
    ua.match(/(Edg|OPR|SamsungBrowser|Firefox|FxiOS|CriOS|Chrome)\/([\d.]+)/) ??
    (/Safari\//.test(ua) ? ua.match(/Version\/([\d.]+)/)?.slice(0, 2).map((x, i) => (i === 0 ? 'Safari' : x)) : null);
  if (!m) return 'Unknown browser';
  const names: Record<string, string> = { Edg: 'Edge', OPR: 'Opera', FxiOS: 'Firefox', CriOS: 'Chrome' };
  const [, name, ver] = m.length === 3 ? m : ['', m[0], m[1]];
  return `${names[name] ?? name} ${String(ver).split('.')[0]}`;
}

function parseOS(ua: string): string {
  if (/iPhone/.test(ua)) return `iOS ${ua.match(/OS (\d+)[_\d]*/)?.[1] ?? ''}`.trim();
  if (/iPad/.test(ua)) return `iPadOS ${ua.match(/OS (\d+)[_\d]*/)?.[1] ?? ''}`.trim();
  if (/Android/.test(ua)) return `Android ${ua.match(/Android ([\d.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

export async function detectDevice(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile: boolean; platform: string; getHighEntropyValues(h: string[]): Promise<Record<string, string>> };
  };
  let model: string | null = null;
  let platformVersion = '';
  try {
    const hi = await nav.userAgentData?.getHighEntropyValues(['model', 'platformVersion']);
    model = hi?.model || null;
    platformVersion = hi?.platformVersion ?? '';
  } catch { /* not available */ }

  // iPadOS reports itself as macOS; touch points give it away.
  const iPadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const mobile = nav.userAgentData?.mobile ?? /Mobi|iPhone|Android.+Mobile/.test(ua);
  const tablet = iPadAsMac || /iPad|Tablet|Android(?!.*Mobile)/.test(ua);
  const kind = tablet ? 'tablet' : mobile ? 'phone' : 'desktop';
  let os = iPadAsMac ? 'iPadOS' : parseOS(ua);
  if (os === 'Windows' && platformVersion) os = Number(platformVersion.split('.')[0]) >= 13 ? 'Windows 11' : 'Windows 10';
  const browser = parseBrowser(ua);
  const cores = navigator.hardwareConcurrency || null;
  const memory_gb_hint = nav.deviceMemory ?? null;
  let wasm_threads = false;
  try {
    wasm_threads = typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated;
  } catch { /* ignore */ }

  const device = model ?? (os.startsWith('iOS') ? 'iPhone' : os.startsWith('iPadOS') ? 'iPad' : os === 'macOS' ? 'Mac' : kind === 'phone' ? 'Phone' : 'Computer');
  return {
    ua,
    browser,
    os,
    model,
    mobile,
    kind,
    cores,
    memory_gb_hint,
    cross_origin_isolated: !!globalThis.crossOriginIsolated,
    wasm_threads,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}x`,
    label: `${device} · ${browser} · ${os}`,
  };
}
