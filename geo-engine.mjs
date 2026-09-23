const EARTH_RADIUS_METERS = 6371000;

export function hasCoordinates(place) {
  return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);
}

export function distanceMeters(a, b) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return null;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = (b.longitude - a.longitude) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function addLocation(projects, geoSnapshot = {}) {
  const records = geoSnapshot.projects || {};
  return projects.map((project) => {
    const location = records[project.name];
    return Number.isFinite(location?.lat) && Number.isFinite(location?.lon)
      ? { ...project, latitude: location.lat, longitude: location.lon, nearby: location.nearby || {}, locationSource: geoSnapshot.geocoder, locationUpdatedAt: geoSnapshot.generatedAt }
      : { ...project, nearby: {}, locationUpdatedAt: geoSnapshot.generatedAt || null };
  });
}
