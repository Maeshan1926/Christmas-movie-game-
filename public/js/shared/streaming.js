import { SUBSCRIBED_PROVIDERS } from './config.js';

/**
 * Normalized providers shape:
 * { flatrate:[{id,name,logo}], free:[], ads:[], rent:[], buy:[], link, asOf }
 * Returns 'included' | 'rent' | 'buy' | 'none' | 'unknown'.
 */
export function availability(p) {
  if (!p) return 'unknown';
  if ((p.flatrate?.length || 0) + (p.free?.length || 0) + (p.ads?.length || 0) > 0) return 'included';
  if (p.rent?.length) return 'rent';
  if (p.buy?.length) return 'buy';
  return 'none';
}

export function includedServices(p) {
  if (!p) return [];
  const seen = new Set();
  const out = [];
  for (const x of [...(p.flatrate || []), ...(p.free || []), ...(p.ads || [])]) {
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    out.push({ ...x, subscribed: x.id in SUBSCRIBED_PROVIDERS });
  }
  return out.sort((a, b) => Number(b.subscribed) - Number(a.subscribed));
}

export function onSubscribedService(p) {
  return includedServices(p).some((x) => x.subscribed);
}

export function allServiceNames(p) {
  if (!p) return [];
  return [...new Set([...(p.flatrate || []), ...(p.free || []), ...(p.ads || [])].map((x) => x.name))];
}

export const AVAILABILITY_LABEL = {
  included: 'Included with subscription',
  rent: 'Rent',
  buy: 'Buy',
  none: 'Not streaming in the US right now',
  unknown: 'Streaming info unavailable',
};
