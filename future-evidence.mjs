import { distanceMeters, hasCoordinates } from './geo-engine.mjs';

const FUTURE_STAGES = new Set(['規劃中', '施工中', '規劃／施工中']);

export function officialFutureFacilities(project, evidence = [], criterionRank, maxDistanceMeters = 300) {
  if (!hasCoordinates(project)) return [];
  return evidence.flatMap((lead) => (lead.stations || lead.sites || []).map((site) => ({
    ...site,
    leadTitle: lead.title,
    source: lead.source,
    sourceUrl: lead.url,
    stage: site.stage || lead.stage,
    criteria: site.criteria || lead.criteria || [],
  }))).map((site) => ({
    ...site,
    distanceMeters: distanceMeters(project, { latitude: site.latitude, longitude: site.longitude }),
  })).filter((site) => Array.isArray(site.criteria) && site.criteria.includes(criterionRank) &&
    FUTURE_STAGES.has(site.stage) && Number.isFinite(site.distanceMeters) && site.distanceMeters <= maxDistanceMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
