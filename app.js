/**
 * =============================================================================
 * EvacQuick — app.js
 * -----------------------------------------------------------------------------
 * EvacQuick discovers nearby facilities DYNAMICALLY from real OpenStreetMap
 * data based on the user's live GPS position. There is no hardcoded list of
 * evacuation centers anywhere in this file — every marker and card on screen
 * is derived from an Overpass API response for the user's current location.
 *
 * File organization (matches the project's architecture spec):
 *   1. Configuration
 *   2. Application State
 *   3. DOM References
 *   4. Map Initialization
 *   5. Geolocation
 *   6. Bounding Box / Spatial Calculations
 *   7. Overpass API
 *   8. Facility Normalization
 *   9. Distance Calculation
 *  10. Facility Sorting
 *  11. Marker Rendering
 *  12. Sidebar Rendering
 *  13. OSRM Routing
 *  14. Route Rendering
 *  15. Error Handling / Loading States
 *  16. Event Listeners
 *  17. Application Initialization
 * =============================================================================
 */

/* ============================================================================
   1. CONFIGURATION
   ========================================================================= */

const SEARCH_RADIUS_KM = 5;

const CONFIG = {
  // Fallback map center used only until the user's GPS position is known.
  FALLBACK_CENTER: { latitude: 14.5995, longitude: 120.9842 }, // Manila, PH
  FALLBACK_ZOOM: 12,
  USER_ZOOM: 14,

  SEARCH_RADIUS_KM,

  // Primary + backup Overpass mirrors. If the primary is unreachable, rate
  // limited, or times out, the next endpoint in the list is attempted.
  OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ],
  OVERPASS_TIMEOUT_MS: 20000,

  OSRM_BASE_URL: 'https://router.project-osrm.org/route/v1/driving',
  OSRM_TIMEOUT_MS: 15000,

  // Candidate facility categories and their display metadata. These are NOT
  // "official evacuation centers" — see FACILITY_DESIGNATION below.
  FACILITY_TYPES: {
    school: { label: 'School', color: '#16324F' },
    sports_centre: { label: 'Sports Center', color: '#1E7145' },
    social_facility: { label: 'Community Facility', color: '#E8590C' }
  },

  // Required wording per data-integrity policy: OSM facilities are candidate
  // / potential evacuation points, never presented as officially designated.
  FACILITY_DESIGNATION: 'Potential Evacuation Facility',

  NOT_AVAILABLE: 'Not available'
};

/* ============================================================================
   2. APPLICATION STATE
   ========================================================================= */

const state = {
  userLocation: null,       // { latitude, longitude }
  facilities: [],           // normalized + sorted facility objects
  selectedFacility: null,   // currently routed-to facility object
  userMarker: null,         // L.Marker for "Your Location"
  facilityMarkers: [],      // [{ id, marker }]
  routeLayer: null,         // L.GeoJSON route layer

  map: null,
  activeFilter: 'all',
  isLocating: false,
  isSearching: false
};

/* ============================================================================
   3. DOM REFERENCES
   ========================================================================= */

const dom = {
  statusLine: document.getElementById('status-line'),
  locateBtn: document.getElementById('locate-btn'),

  locationStatus: document.getElementById('location-status'),
  searchStatus: document.getElementById('search-status'),
  searchRadiusValue: document.getElementById('search-radius-value'),
  facilityCount: document.getElementById('facility-count'),

  facilityList: document.getElementById('facility-list'),
  sidebarMessages: document.getElementById('sidebar-messages'),
  filterRow: document.querySelector('.filter-row'),

  routeSummary: document.getElementById('route-summary'),
  routeDestName: document.getElementById('route-dest-name'),
  routeDistance: document.getElementById('route-distance'),
  routeDuration: document.getElementById('route-duration'),
  clearRouteBtn: document.getElementById('clear-route-btn')
};

/* ============================================================================
   4. MAP INITIALIZATION
   ========================================================================= */

function initializeMap() {
  state.map = L.map('map', {
    zoomControl: true,
    minZoom: 3,
    maxZoom: 19
  }).setView(
    [CONFIG.FALLBACK_CENTER.latitude, CONFIG.FALLBACK_CENTER.longitude],
    CONFIG.FALLBACK_ZOOM
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(state.map);
}

/* ============================================================================
   5. GEOLOCATION
   ========================================================================= */

function requestUserLocation() {
  if (state.isLocating) return;

  if (!('geolocation' in navigator)) {
    handleLocationError({ code: 0, unsupported: true });
    return;
  }

  state.isLocating = true;
  dom.locateBtn.disabled = true;
  showLoading('Detecting your location\u2026');
  dom.locationStatus.textContent = 'Detecting\u2026';
  dom.locationStatus.className = 'info-block-value';

  navigator.geolocation.getCurrentPosition(
    handleLocationSuccess,
    handleLocationError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function handleLocationSuccess(position) {
  state.isLocating = false;
  dom.locateBtn.disabled = false;

  const { latitude, longitude } = position.coords;
  state.userLocation = { latitude, longitude };

  renderUserMarker(state.userLocation);
  state.map.setView([latitude, longitude], CONFIG.USER_ZOOM);

  dom.locationStatus.textContent = 'GPS detected';
  dom.locationStatus.className = 'info-block-value is-ok';

  showLoading('Searching nearby facilities\u2026');
  fetchAndDisplayFacilities(state.userLocation);
}

function handleLocationError(error) {
  state.isLocating = false;
  dom.locateBtn.disabled = false;

  let message = 'Couldn\u2019t determine your location.';
  if (error.unsupported) {
    message = 'Geolocation isn\u2019t supported by this browser.';
  } else {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location access denied. Enable location permissions, or the app will use a default area.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Your location is currently unavailable. Try again.';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out. Try again.';
        break;
    }
  }

  dom.locationStatus.textContent = 'Not detected';
  dom.locationStatus.className = 'info-block-value is-error';
  showError(message);
}

/** Places (or moves) the distinct "Your Location" marker. */
function renderUserMarker(location) {
  const icon = L.divIcon({
    className: '',
    html: '<div class="user-marker" title="Your location"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (state.userMarker) {
    state.userMarker.setLatLng([location.latitude, location.longitude]);
  } else {
    state.userMarker = L.marker([location.latitude, location.longitude], {
      icon,
      zIndexOffset: 1000,
      keyboard: false
    })
      .addTo(state.map)
      .bindPopup('<strong>Your Location</strong>');
  }
}

/* ============================================================================
   6. BOUNDING BOX / SPATIAL CALCULATIONS
   ========================================================================= */

/**
 * Converts a center point + radius (km) into an approximate lat/lon
 * bounding box. This is a fast planar approximation, adequate for the
 * few-kilometer radii this app searches within.
 */
function calculateSearchBounds(latitude, longitude, radiusKm) {
  const EARTH_RADIUS_KM = 6371;
  const radiusMeters = radiusKm * 1000;

  const latDelta = (radiusMeters / (EARTH_RADIUS_KM * 1000)) * (180 / Math.PI);
  const lonDelta =
    (radiusMeters / (EARTH_RADIUS_KM * 1000 * Math.cos((latitude * Math.PI) / 180))) *
    (180 / Math.PI);

  return {
    south: latitude - latDelta,
    west: longitude - lonDelta,
    north: latitude + latDelta,
    east: longitude + lonDelta
  };
}

/* ============================================================================
   7. OVERPASS API
   ========================================================================= */

function buildOverpassQuery(bbox) {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `
    [out:json][timeout:25];
    (
      node["amenity"="school"](${bboxStr});
      way["amenity"="school"](${bboxStr});
      node["leisure"="sports_centre"](${bboxStr});
      way["leisure"="sports_centre"](${bboxStr});
      node["amenity"="social_facility"](${bboxStr});
      way["amenity"="social_facility"](${bboxStr});
    );
    out center tags;
  `.trim();
}

/** Fetches a single Overpass endpoint with an abort-based timeout. */
async function queryOverpassEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });

    if (response.status === 429) {
      throw new Error('Overpass endpoint is rate-limiting requests.');
    }
    if (!response.ok) {
      throw new Error(`Overpass endpoint responded with status ${response.status}`);
    }

    const json = await response.json();
    if (!json || !Array.isArray(json.elements)) {
      throw new Error('Overpass endpoint returned an unexpected response shape.');
    }
    return json.elements;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tries each configured Overpass endpoint in order until one succeeds.
 * Throws only if every endpoint fails.
 */
async function fetchNearbyFacilities(userLocation) {
  const bbox = calculateSearchBounds(
    userLocation.latitude,
    userLocation.longitude,
    CONFIG.SEARCH_RADIUS_KM
  );
  const query = buildOverpassQuery(bbox);

  let lastError = null;

  for (const endpoint of CONFIG.OVERPASS_ENDPOINTS) {
    try {
      const elements = await queryOverpassEndpoint(endpoint, query);
      return elements;
    } catch (err) {
      console.warn(`Overpass endpoint failed (${endpoint}):`, err.message);
      lastError = err;
      // Continue to the next endpoint in the list.
    }
  }

  throw lastError || new Error('All Overpass endpoints failed.');
}

/* ============================================================================
   8. FACILITY NORMALIZATION
   ========================================================================= */

/** Maps raw OSM tags back to one of our three facility categories, or null. */
function classifyFacility(tags) {
  if (tags.amenity === 'school') return 'school';
  if (tags.leisure === 'sports_centre') return 'sports_centre';
  if (tags.amenity === 'social_facility') return 'social_facility';
  return null;
}

/** Builds a human-readable address from whatever addr:* tags are present. */
function extractAddress(tags) {
  if (tags['addr:full']) return tags['addr:full'];

  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:barangay'],
    tags['addr:city']
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Converts one raw Overpass element (node, or way exposing a computed
 * "center" via `out center`) into the app's normalized facility shape.
 * Returns null for elements that can't be classified or lack coordinates —
 * those are simply skipped, never backfilled with invented data.
 */
function normalizeFacility(element) {
  const coords = element.type === 'node'
    ? { latitude: element.lat, longitude: element.lon }
    : element.center
      ? { latitude: element.center.lat, longitude: element.center.lon }
      : null;

  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) return null;

  const tags = element.tags || {};
  const type = classifyFacility(tags);
  if (!type) return null;

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || 'Unnamed Nearby Facility',
    type,
    latitude: coords.latitude,
    longitude: coords.longitude,
    distanceKm: null,
    address: extractAddress(tags),
    capacity: tags.capacity ? tags.capacity : null,
    status: tags.opening_hours ? tags.opening_hours : null
  };
}

/** Normalizes a raw Overpass element list and removes duplicate facilities. */
function normalizeFacilityList(elements) {
  const seen = new Set();
  const facilities = [];

  for (const element of elements) {
    const facility = normalizeFacility(element);
    if (!facility) continue;

    // De-duplicate cases where the same real-world facility is mapped as
    // both a node and a way (or overlapping ways) by rounding coordinates.
    const dedupeKey = `${facility.name}|${facility.latitude.toFixed(4)}|${facility.longitude.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    facilities.push(facility);
  }

  return facilities;
}

/* ============================================================================
   9. DISTANCE CALCULATION (HAVERSINE)
   ========================================================================= */

/**
 * Haversine formula — great-circle distance between two lat/lon points,
 * in kilometers. Used to rank facilities by straight-line proximity.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // mean Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ============================================================================
   10. FACILITY SORTING
   ========================================================================= */

function sortFacilitiesByDistance(facilities, userLocation) {
  return facilities
    .map((facility) => ({
      ...facility,
      distanceKm: calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        facility.latitude,
        facility.longitude
      )
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Orchestrates the full discovery flow: fetch -> normalize -> compute
 * distance -> sort -> render list + markers.
 */
async function fetchAndDisplayFacilities(userLocation) {
  if (state.isSearching) return;
  state.isSearching = true;

  dom.searchRadiusValue.textContent = String(CONFIG.SEARCH_RADIUS_KM);
  clearFacilityMarkers();

  try {
    const rawElements = await fetchNearbyFacilities(userLocation);
    const normalized = normalizeFacilityList(rawElements);

    if (normalized.length === 0) {
      state.facilities = [];
      renderFacilities();
      dom.facilityCount.textContent = '0 nearby facilities found';
      setSidebarMessage(
        'No nearby facilities found. Try increasing the search radius or moving to another location.'
      );
      hideLoading();
      setStatus('No nearby facilities found.', 'error');
      return;
    }

    state.facilities = sortFacilitiesByDistance(normalized, userLocation);
    setSidebarMessage('');
    renderFacilities();
    renderFacilityMarkers();
    dom.facilityCount.textContent = `${state.facilities.length} nearby facilities found`;
    hideLoading();
    setStatus(`${state.facilities.length} facility(ies) found nearby.`, 'ok');
  } catch (err) {
    console.error('Facility search failed:', err);
    state.facilities = [];
    renderFacilities();
    dom.facilityCount.textContent = '0 nearby facilities found';
    hideLoading();
    showError('Couldn\u2019t reach OpenStreetMap\u2019s facility data service. Check your connection and try again.');
  } finally {
    state.isSearching = false;
  }
}

/* ============================================================================
   11. MARKER RENDERING
   ========================================================================= */

function facilityDivIcon(type) {
  const color = CONFIG.FACILITY_TYPES[type].color;
  const svg = `
    <svg viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 18 12 18s12-9 12-18c0-6.6-5.4-12-12-12z" fill="${color}"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    className: 'facility-marker',
    html: svg,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
  });
}

/** Builds the popup content as real DOM nodes (never raw HTML string
 * interpolation) so facility names/addresses pulled from OSM can never be
 * interpreted as markup. */
function buildPopupElement(facility) {
  const wrapper = document.createElement('div');
  wrapper.className = 'popup-card';

  const heading = document.createElement('h3');
  heading.textContent = facility.name;
  wrapper.appendChild(heading);

  const meta = document.createElement('p');
  const typeLabel = CONFIG.FACILITY_TYPES[facility.type].label;
  meta.textContent = `${typeLabel} \u00b7 ${facility.distanceKm.toFixed(1)} km away`;
  wrapper.appendChild(meta);

  const designation = document.createElement('p');
  designation.textContent = CONFIG.FACILITY_DESIGNATION;
  designation.style.fontWeight = '600';
  wrapper.appendChild(designation);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary btn-sm';
  button.textContent = 'Route Here';
  button.addEventListener('click', () => routeToFacility(facility.id));
  wrapper.appendChild(button);

  return wrapper;
}

function renderFacilityMarkers() {
  clearFacilityMarkers();

  getVisibleFacilities().forEach((facility) => {
    const marker = L.marker([facility.latitude, facility.longitude], {
      icon: facilityDivIcon(facility.type)
    }).addTo(state.map);

    marker.bindPopup(buildPopupElement(facility));
    marker.on('click', () => selectFacilityCard(facility.id));

    state.facilityMarkers.push({ id: facility.id, marker });
  });
}

function clearFacilityMarkers() {
  state.facilityMarkers.forEach(({ marker }) => state.map.removeLayer(marker));
  state.facilityMarkers = [];
}

function getVisibleFacilities() {
  if (state.activeFilter === 'all') return state.facilities;
  return state.facilities.filter((f) => f.type === state.activeFilter);
}

/* ============================================================================
   12. SIDEBAR RENDERING
   ========================================================================= */

function renderFacilities() {
  const visible = getVisibleFacilities();
  dom.facilityList.innerHTML = '';

  visible.forEach((facility, index) => {
    dom.facilityList.appendChild(buildFacilityCard(facility, index + 1));
  });
}

/** Builds one sidebar card via DOM APIs (textContent, not innerHTML) for
 * every field sourced from OSM data, so nothing from the API can inject
 * markup into the page. */
function buildFacilityCard(facility, rank) {
  const li = document.createElement('li');
  li.className = 'facility-card';
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute(
    'aria-label',
    `${facility.name}, ${facility.distanceKm.toFixed(1)} kilometers away`
  );
  if (state.selectedFacility && facility.id === state.selectedFacility.id) {
    li.classList.add('is-selected');
  }

  // ---- top row: rank, name, distance ----
  const top = document.createElement('div');
  top.className = 'facility-card-top';

  const rankEl = document.createElement('span');
  rankEl.className = 'facility-rank';
  rankEl.textContent = String(rank);

  const nameEl = document.createElement('p');
  nameEl.className = 'facility-name';
  nameEl.textContent = facility.name;

  const distanceEl = document.createElement('span');
  distanceEl.className = 'facility-distance';
  distanceEl.textContent = facility.distanceKm.toFixed(1);
  const kmSuffix = document.createElement('small');
  kmSuffix.textContent = ' km';
  distanceEl.appendChild(kmSuffix);

  top.append(rankEl, nameEl, distanceEl);
  li.appendChild(top);

  // ---- facility type tag ----
  const typeTag = document.createElement('span');
  typeTag.className = 'tag-type';
  typeTag.textContent = CONFIG.FACILITY_TYPES[facility.type].label;
  li.appendChild(typeTag);

  // ---- designation badge (never claims "official") ----
  const badge = document.createElement('span');
  badge.className = 'facility-badge';
  badge.textContent = CONFIG.FACILITY_DESIGNATION;
  li.appendChild(badge);

  // ---- meta rows: address / capacity / status ----
  const meta = document.createElement('div');
  meta.className = 'facility-meta';
  meta.appendChild(buildMetaRow('Address', facility.address || CONFIG.NOT_AVAILABLE));
  meta.appendChild(buildMetaRow('Capacity', facility.capacity || CONFIG.NOT_AVAILABLE));
  meta.appendChild(buildMetaRow('Status', facility.status || CONFIG.NOT_AVAILABLE));
  li.appendChild(meta);

  // ---- action ----
  const actions = document.createElement('div');
  actions.className = 'facility-card-actions';
  const routeBtn = document.createElement('button');
  routeBtn.type = 'button';
  routeBtn.className = 'btn btn-primary btn-sm';
  routeBtn.textContent = 'Route Here';
  actions.appendChild(routeBtn);
  li.appendChild(actions);

  const activate = () => selectFacilityCard(facility.id);
  li.addEventListener('click', activate);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
  routeBtn.addEventListener('click', (e) => { e.stopPropagation(); activate(); });

  return li;
}

function buildMetaRow(label, value) {
  const row = document.createElement('div');
  row.className = 'facility-meta-row';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'label';
  labelSpan.textContent = `${label}: `;
  row.appendChild(labelSpan);
  row.appendChild(document.createTextNode(value));
  return row;
}

function applyFilter(filterValue) {
  state.activeFilter = filterValue;

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.filter === filterValue);
  });

  renderFacilities();
  renderFacilityMarkers();
}

/** Selecting a card both highlights it and triggers routing. */
function selectFacilityCard(facilityId) {
  renderFacilities(); // clears any stale selection highlight first
  routeToFacility(facilityId);
}

/* ============================================================================
   13. OSRM ROUTING
   ========================================================================= */

function isValidCoordinate(lat, lon) {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

/**
 * Entry point when a facility is chosen (sidebar card, "Route Here" button,
 * or map popup). Validates coordinates, requests the OSRM driving route,
 * and updates the map + route summary.
 */
async function routeToFacility(facilityId) {
  if (!state.userLocation) {
    showError('Find your location first to get directions.');
    return;
  }

  const facility = state.facilities.find((f) => f.id === facilityId);
  if (!facility) return;

  if (
    !isValidCoordinate(state.userLocation.latitude, state.userLocation.longitude) ||
    !isValidCoordinate(facility.latitude, facility.longitude)
  ) {
    showError('Invalid coordinates \u2014 can\u2019t calculate a route.');
    return;
  }

  state.selectedFacility = facility;
  renderFacilities();

  const markerEntry = state.facilityMarkers.find((m) => m.id === facilityId);
  if (markerEntry) markerEntry.marker.openPopup();

  showLoading('Calculating route\u2026');

  try {
    const route = await fetchOsrmRoute(state.userLocation, facility);
    renderRoute(route.geometry);
    renderRouteSummary(facility, route.distance, route.duration);
    hideLoading();
    setStatus('Route ready.', 'ok');
  } catch (err) {
    console.error('Routing failed:', err);
    hideLoading();
    showError('Couldn\u2019t calculate a driving route right now. Straight-line distance is still shown in the list.');
  }
}

async function fetchOsrmRoute(userLocation, facility) {
  // OSRM expects "longitude,latitude" order, not "latitude,longitude".
  const coordsStr =
    `${userLocation.longitude},${userLocation.latitude};` +
    `${facility.longitude},${facility.latitude}`;
  const url = `${CONFIG.OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OSRM_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OSRM responded with status ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new Error('OSRM returned no usable route.');
    }

    return data.routes[0];
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ============================================================================
   14. ROUTE RENDERING
   ========================================================================= */

function renderRoute(geojsonGeometry) {
  clearRouteLayer();

  state.routeLayer = L.geoJSON(geojsonGeometry, {
    style: { color: '#E8590C', weight: 5, opacity: 0.9 }
  }).addTo(state.map);

  state.map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });
}

function clearRouteLayer() {
  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

function renderRouteSummary(facility, distanceMeters, durationSeconds) {
  dom.routeSummary.classList.remove('hidden');
  dom.routeDestName.textContent = facility.name;
  dom.routeDistance.textContent = (distanceMeters / 1000).toFixed(1);
  dom.routeDuration.textContent = String(Math.round(durationSeconds / 60));
}

function clearRoute() {
  clearRouteLayer();
  state.selectedFacility = null;
  dom.routeSummary.classList.add('hidden');
  renderFacilities();
}

/* ============================================================================
   15. ERROR HANDLING / LOADING STATES
   ========================================================================= */

function setStatus(message, kind) {
  dom.statusLine.textContent = message;
  dom.statusLine.classList.remove('is-ok', 'is-error', 'is-loading');
  if (kind === 'ok') dom.statusLine.classList.add('is-ok');
  if (kind === 'error') dom.statusLine.classList.add('is-error');
}

function showLoading(message) {
  dom.statusLine.textContent = message;
  dom.statusLine.classList.remove('is-ok', 'is-error');
  dom.statusLine.classList.add('is-loading');
  setSidebarMessage(message, false, true);
}

function hideLoading() {
  setSidebarMessage('');
}

function showError(message) {
  setStatus(message, 'error');
  setSidebarMessage(message, true);
}

function setSidebarMessage(message, isError, isLoading) {
  dom.sidebarMessages.textContent = message || '';
  dom.sidebarMessages.classList.toggle('is-error', Boolean(isError));
  dom.sidebarMessages.classList.toggle('is-loading', Boolean(isLoading));
}

/* ============================================================================
   16. EVENT LISTENERS
   ========================================================================= */

function attachEventListeners() {
  dom.locateBtn.addEventListener('click', requestUserLocation);
  dom.clearRouteBtn.addEventListener('click', clearRoute);

  dom.filterRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    applyFilter(chip.dataset.filter);
  });
}

/* ============================================================================
   17. APPLICATION INITIALIZATION
   ========================================================================= */

function initializeApplication() {
  initializeMap();
  attachEventListeners();
  // Automatic geolocation attempt on load; the "Find My Location" button
  // calls the exact same function for manual retry.
  requestUserLocation();
}

document.addEventListener('DOMContentLoaded', initializeApplication);
