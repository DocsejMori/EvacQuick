/* =========================================================================
   IMPORTS
   ========================================================================= */

import { auth } from "./auth.js";

import {
    db,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp
} from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    uploadImageToImgBB
} from "./imgbb-config.js";


/* =========================================================================
   1. CONFIGURATION
   ========================================================================= */

const CONFIG = {

    FALLBACK_CENTER: {
        latitude: 14.5995,
        longitude: 120.9842
    },

    FALLBACK_ZOOM: 12,

    USER_ZOOM: 14,

    DEFAULT_SEARCH_RADIUS_KM: 5,

    SEARCH_RADIUS_OPTIONS: [1, 2, 3, 5, 10, 15],

    OSRM_BASE_URL:
        "https://router.project-osrm.org/route/v1/driving",

    OSRM_TIMEOUT_MS: 15000,

    FIRESTORE_FACILITIES_COLLECTION: "facilities",

    FIRESTORE_USERS_COLLECTION: "users",

    FACILITY_TYPES: [
        "Government Evacuation Center",
        "School / Campus",
        "Barangay / Community Center",
        "Sports / Covered Court",
        "Other"
    ],

    AVAILABILITY_STATUSES: [
        "Available",
        "Limited Capacity",
        "Full",
        "Temporarily Closed"
    ],

    REALTIME_STATUSES: [
        "Accepting Evacuees Now",
        "Open – Accepting Soon",
        "Open – Standing By",
        "At Capacity – Not Accepting",
        "Closed Temporarily"
    ],

    FACILITY_DESIGNATION: "Resident-Submitted Facility",

    RESIDENT_DESIGNATION: "Resident Submitted",

    VERIFICATION_PENDING: "Pending",

    VERIFICATION_APPROVED: "Approved",

    VERIFICATION_REJECTED: "Rejected",

    NOT_AVAILABLE: "Not available",

    MAX_UPLOAD_BYTES: 5 * 1024 * 1024
};


/* =========================================================================
   2. RATE LIMITING (soft, per-browser)
   ========================================================================= */

const RATE_LIMIT_MS = 5 * 60 * 1000; /* 5 minutes */

function checkRateLimit(key) {

    const last = localStorage.getItem(key);

    if (!last) return { allowed: true };

    const elapsed = Date.now() - Number(last);
    const remaining = RATE_LIMIT_MS - elapsed;

    if (remaining > 0) {

        const seconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const remSec = seconds % 60;

        const timeText = minutes > 0
            ? `${minutes} min ${remSec} sec`
            : `${seconds} sec`;

        return {
            allowed: false,
            message: `Please wait ${timeText} before doing this again.`
        };
    }

    return { allowed: true };
}


function markRateLimit(key) {

    localStorage.setItem(key, String(Date.now()));
}


/* =========================================================================
   2.5 SPINNER / BUTTON LOADING HELPERS
   ========================================================================= */

function setButtonLoading(button, text) {

    if (!button) return;

    button.disabled = true;

    button.innerHTML =
        `<span class="spinner"></span>${text}`;
}


function resetButton(button, text) {

    if (!button) return;

    button.disabled = false;

    button.textContent = text;
}


/* =========================================================================
   3. APPLICATION STATE
   ========================================================================= */

const state = {

    userLocation: null,

    facilities: [],

    selectedFacility: null,

    editingFacilityId: null,

    userMarker: null,

    facilityMarkers: [],

    routeLayer: null,

    map: null,

    isLocating: false,

    isSearching: false,

    isSubmitting: false,

    searchRadiusKm: CONFIG.DEFAULT_SEARCH_RADIUS_KM,

    currentUser: null,

    currentUserRole: null,

    isAuthResolved: false,

    filters: {
        type: "all",
        status: "all",
        capacity: "all"
    }
};


/* =========================================================================
   4. DOM REFERENCES
   ========================================================================= */

const DOM = {

    statusLine: document.getElementById("status-line"),

    locateButton: document.getElementById("locate-btn"),

    headerActions:
        document.querySelector(".header-actions"),

    authUserLabel:
        document.getElementById("auth-user-label"),

    signInButton:
        document.getElementById("signin-btn"),

    signOutButton:
        document.getElementById("signout-btn"),

    adminDashboardButton:
        document.getElementById("admin-dashboard-btn"),

    locationStatus:
        document.getElementById("location-status"),

    searchRadiusSelect:
        document.getElementById("search-radius-select"),

    facilityCount:
        document.getElementById("facility-count"),

    facilityList:
        document.getElementById("facility-list"),

    sidebarMessages:
        document.getElementById("sidebar-messages"),

    routeSummary:
        document.getElementById("route-summary"),

    routeDestination:
        document.getElementById("route-dest-name"),

    routeDistance:
        document.getElementById("route-distance"),

    routeDuration:
        document.getElementById("route-duration"),

    clearRouteButton:
        document.getElementById("clear-route-btn"),

    facilityTypeFilter:
        document.getElementById("facility-type-select"),

    availabilityFilter:
        document.getElementById("availability-select"),

    capacityFilter:
        document.getElementById("capacity-select"),

    facilityModal:
        document.getElementById("facility-modal"),

    facilityModalBackdrop:
        document.getElementById("facility-modal-backdrop"),

    facilityModalTitle:
        document.getElementById("facility-modal-title"),

    facilityModalSubtitle:
        document.getElementById("facility-modal-subtitle"),

    closeFacilityModalButton:
        document.getElementById("close-facility-modal-btn"),

    cancelFacilityButton:
        document.getElementById("cancel-facility-btn"),

    facilityForm:
        document.getElementById("facility-submission-form"),

    facilityFormMessage:
        document.getElementById("facility-form-message"),

    submitFacilityButton:
        document.getElementById("submit-facility-btn"),

    photoSectionHelp:
        document.getElementById("photo-section-help"),

    idPhotoRequired:
        document.getElementById("id-photo-required"),

    centerPhotoRequired:
        document.getElementById("center-photo-required"),

    currentIdPhotoPreview:
        document.getElementById("current-id-photo-preview"),

    currentCenterPhotoPreview:
        document.getElementById("current-center-photo-preview"),

    useMyLocationButton:
        document.getElementById("use-my-location-btn"),

    submissionLocationStatus:
        document.getElementById("submission-location-status"),

    facilityLatitude:
        document.getElementById("facility-latitude"),

    facilityLongitude:
        document.getElementById("facility-longitude"),

    zoomInButton:
        document.getElementById("map-zoom-in"),

    zoomOutButton:
        document.getElementById("map-zoom-out"),

    facilityDetailsModal:
        document.getElementById("facility-details-modal"),

    facilityDetailsBackdrop:
        document.getElementById("facility-details-backdrop"),

    facilityDetailsTitle:
        document.getElementById("facility-details-title"),

    facilityDetailsSubtitle:
        document.getElementById("facility-details-subtitle"),

    facilityDetailsBody:
        document.getElementById("facility-details-body"),

    closeFacilityDetailsButton:
        document.getElementById("close-facility-details-btn"),

    reportModal:
        document.getElementById("report-modal"),

    reportModalBackdrop:
        document.getElementById("report-modal-backdrop"),

    reportModalSubtitle:
        document.getElementById("report-modal-subtitle"),

    closeReportModalButton:
        document.getElementById("close-report-modal-btn"),

    cancelReportButton:
        document.getElementById("cancel-report-btn"),

    reportForm:
        document.getElementById("report-form"),

    reportFormMessage:
        document.getElementById("report-form-message"),

    submitReportButton:
        document.getElementById("submit-report-btn")
};


/* =========================================================================
   4.5 FILE INPUT PREVIEW
   ========================================================================= */

function attachFilePreview(inputId, previewId) {

    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!input || !preview) return;

    input.addEventListener("change", () => {

        preview.innerHTML = "";

        const file = input.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            preview.textContent = "Selected file is not an image.";
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "file-preview-wrap";

        const img = document.createElement("img");
        img.className = "file-preview-thumb";
        img.alt = "Selected photo preview";

        const url = URL.createObjectURL(file);
        img.src = url;

        img.onload = () => URL.revokeObjectURL(url);

        const label = document.createElement("div");
        label.className = "file-preview-label";
        label.textContent = file.name;

        wrapper.appendChild(img);
        wrapper.appendChild(label);

        preview.appendChild(wrapper);
    });
}


/* =========================================================================
   5. MAP INITIALIZATION
   ========================================================================= */

function initializeMap() {

    state.map = L.map("map", {
        zoomControl: false,
        minZoom: 3,
        maxZoom: 19,
        preferCanvas: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        wheelPxPerZoomLevel: 120,
        zoomSnap: 0.25,
        zoomDelta: 0.5
    }).setView(
        [
            CONFIG.FALLBACK_CENTER.latitude,
            CONFIG.FALLBACK_CENTER.longitude
        ],
        CONFIG.FALLBACK_ZOOM
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            tileSize: 256,
            updateWhenIdle: false,
            updateWhenZooming: false,
            keepBuffer: 4,
            crossOrigin: true,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(state.map);

    const refresh = () => state.map.invalidateSize();

    requestAnimationFrame(refresh);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);

    if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(refresh);
        observer.observe(document.getElementById("map"));
    }


    /* Hide the map loading overlay once Leaflet is ready */

    const overlay = document.getElementById("map-loading-overlay");

    if (overlay) {
        setTimeout(() => {
            overlay.classList.add("hidden");
        }, 400);
    }
}


/* =========================================================================
   6. STATUS HELPERS
   ========================================================================= */

function setStatus(message, type = "") {

    if (!DOM.statusLine) return;

    DOM.statusLine.textContent = message;

    DOM.statusLine.classList.remove("is-ok", "is-error", "is-loading");

    if (type) DOM.statusLine.classList.add(`is-${type}`);
}


function showSidebarMessage(message, type = "") {

    if (!DOM.sidebarMessages) return;

    DOM.sidebarMessages.innerHTML = "";

    const el = document.createElement("div");
    el.className = "sidebar-message";
    if (type) el.classList.add(`is-${type}`);
    el.textContent = message;

    DOM.sidebarMessages.appendChild(el);
}


function clearSidebarMessage() {

    if (DOM.sidebarMessages) DOM.sidebarMessages.innerHTML = "";
}


/* =========================================================================
   7. AUTHENTICATION + ROLE
   ========================================================================= */

async function loadUserRole(user) {

    if (!user) return null;

    try {

        const userRef = doc(
            db,
            CONFIG.FIRESTORE_USERS_COLLECTION,
            user.uid
        );

        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) return null;

        const data = snapshot.data();

        const rawRole =
            data.role || data.userRole || data.userType || "";

        const normalized = String(rawRole).trim().toLowerCase();

        if (normalized === "resident" || normalized === "residents") {
            return "resident";
        }

        if (normalized === "admin" || normalized === "administrator") {
            return "admin";
        }

        return normalized || null;

    } catch (error) {

        console.error("Failed to load user role:", error);
        return null;
    }
}


function isResident() {

    return (
        state.currentUser !== null &&
        state.currentUserRole === "resident"
    );
}


function isAdmin() {

    return (
        state.currentUser !== null &&
        state.currentUserRole === "admin"
    );
}


function isOwner(facility) {

    return (
        state.currentUser !== null &&
        facility &&
        facility.submittedBy === state.currentUser.uid
    );
}


function canEdit(facility) {

    return isOwner(facility) || isAdmin();
}


function applyAuthUI() {

    if (!DOM.headerActions) return;


    let existingAddBtn = document.getElementById("add-facility-btn");

    if (isResident() || isAdmin()) {

        if (!existingAddBtn) {

            const button = document.createElement("button");
            button.id = "add-facility-btn";
            button.type = "button";
            button.className = "btn btn-ghost";
            button.textContent = "Add Evacuation Center";
            button.addEventListener("click", () => openFacilityModal(null));
            DOM.headerActions.appendChild(button);
        }

    } else {

        if (existingAddBtn) existingAddBtn.remove();

        if (DOM.facilityModal &&
            !DOM.facilityModal.classList.contains("hidden")) {
            closeFacilityModal();
        }
    }


    const signedIn = !!state.currentUser;

    if (DOM.signInButton) {
        DOM.signInButton.hidden = signedIn;
    }

    if (DOM.signOutButton) {
        DOM.signOutButton.hidden = !signedIn;
    }

    if (DOM.adminDashboardButton) {
        DOM.adminDashboardButton.hidden = !isAdmin();
    }


    if (DOM.authUserLabel) {

        if (signedIn) {

            const email = state.currentUser.email || "";
            const role = state.currentUserRole || "user";

            DOM.authUserLabel.textContent = `${email} (${role})`;

        } else {

            DOM.authUserLabel.textContent = "Guest";
        }
    }
}


function watchAuthState() {

    onAuthStateChanged(auth, async user => {

        state.currentUser = user || null;

        if (!user) {

            state.currentUserRole = null;
            state.isAuthResolved = true;

            applyAuthUI();
            return;
        }

        state.currentUserRole = await loadUserRole(user);
        state.isAuthResolved = true;

        applyAuthUI();

        if (state.userLocation) {
            fetchAndDisplayFacilities();
        }
    });
}


/* =========================================================================
   8. GEOLOCATION
   ========================================================================= */

function requestUserLocation() {

    if (state.isLocating) return;

    if (!navigator.geolocation) {

        handleLocationError({
            code: 0,
            message: "Geolocation is not supported by this browser."
        });

        return;
    }


    state.isLocating = true;

    if (DOM.locateButton) {
        DOM.locateButton.disabled = true;
        DOM.locateButton.textContent = "Finding Location...";
    }

    if (DOM.locationStatus) {
        DOM.locationStatus.textContent = "Detecting your location...";
    }

    setStatus("Detecting location...", "loading");


    navigator.geolocation.getCurrentPosition(

        position => {

            const latitude = Number(position.coords.latitude);
            const longitude = Number(position.coords.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {

                handleLocationError({
                    code: 0,
                    message: "The browser returned an invalid location."
                });

                return;
            }

            state.userLocation = { latitude, longitude };

            renderUserMarker();

            state.map.setView([latitude, longitude], CONFIG.USER_ZOOM);

            if (DOM.locationStatus) {
                DOM.locationStatus.textContent = "Location detected.";
            }

            setStatus("Location detected.", "ok");

            state.isLocating = false;

            if (DOM.locateButton) {
                DOM.locateButton.disabled = false;
                DOM.locateButton.textContent = "Find My Location";
            }

            fetchAndDisplayFacilities();
        },

        error => handleLocationError(error),

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}


function handleLocationError(error) {

    state.isLocating = false;

    if (DOM.locateButton) {
        DOM.locateButton.disabled = false;
        DOM.locateButton.textContent = "Find My Location";
    }


    let message = "Unable to determine your location.";

    switch (error.code) {
        case 1:
            message = "Location permission was denied. Please allow location access.";
            break;
        case 2:
            message = "Your location could not be determined.";
            break;
        case 3:
            message = "Location detection timed out. Please try again.";
            break;
    }


    if (DOM.locationStatus) {
        DOM.locationStatus.textContent = "Location unavailable.";
    }

    setStatus("Location unavailable.", "error");

    showSidebarMessage(message, "error");
}


/* =========================================================================
   9. USER MAP MARKER
   ========================================================================= */

function renderUserMarker() {

    if (!state.userLocation || !state.map) return;

    const icon = L.divIcon({
        className: "",
        html: '<div class="user-location-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });


    if (!state.userMarker) {

        state.userMarker =
            L.marker(
                [state.userLocation.latitude, state.userLocation.longitude],
                { icon, zIndexOffset: 1000 }
            ).addTo(state.map);

    } else {

        state.userMarker.setLatLng(
            [state.userLocation.latitude, state.userLocation.longitude]
        );

        state.userMarker.setIcon(icon);
    }
}


/* =========================================================================
   10. FACILITY NORMALIZATION
   ========================================================================= */

function normalizeCapacity(value) {

    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numeric =
        Number(String(value).replace(/,/g, "").trim());

    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    return Math.round(numeric);
}


function getCapacityCategory(capacity) {

    const numeric = normalizeCapacity(capacity);

    if (numeric === null) return "unknown";
    if (numeric < 100) return "small";
    if (numeric <= 500) return "medium";

    return "large";
}


function normalizeResidentFacility(documentSnapshot) {

    const data = documentSnapshot.data();

    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    const capacity = normalizeCapacity(data.capacity);

    return {

        id: documentSnapshot.id,

        source: "Resident Submission",

        name: data.name || "Unnamed Submitted Facility",

        managerName: data.managerName || CONFIG.NOT_AVAILABLE,

        facilityType: data.facilityType || "Other",

        latitude,
        longitude,

        distanceKm: null,

        address: data.address || CONFIG.NOT_AVAILABLE,

        capacity,
        capacityCategory: getCapacityCategory(capacity),

        currentOccupancy:
            Number.isFinite(Number(data.currentOccupancy))
                ? Number(data.currentOccupancy)
                : null,

        status: data.status || "Unknown",

        realTimeStatus: data.realTimeStatus || "Unknown",

        openingTime: data.openingTime || null,
        closingTime: data.closingTime || null,

        contactNumber: data.contactNumber || null,
        notes: data.notes || null,

        idPhotoUrl: data.idPhotoUrl || null,
        centerPhotoUrl: data.centerPhotoUrl || null,

        verificationStatus:
            data.verificationStatus || CONFIG.VERIFICATION_PENDING,

        designation: CONFIG.RESIDENT_DESIGNATION,

        submittedBy: data.submittedBy || null
    };
}


/* =========================================================================
   11. LOAD FACILITIES (with query filtering to satisfy Firestore rules)
   ========================================================================= */

async function fetchResidentFacilities() {

    const col = collection(
        db,
        CONFIG.FIRESTORE_FACILITIES_COLLECTION
    );

    const uid = auth.currentUser?.uid || null;
    const admin = state.currentUserRole === "admin";

    const results = new Map();

    try {

        try {

            const approvedSnap = await getDocs(
                query(col, where("verificationStatus", "==", "Approved"))
            );

            approvedSnap.forEach(ds => {
                results.set(ds.id, ds);
            });

        } catch (e) {
            console.warn("Could not read approved facilities:", e.message);
        }


        if (uid) {

            try {

                const mineSnap = await getDocs(
                    query(col, where("submittedBy", "==", uid))
                );

                mineSnap.forEach(ds => {
                    results.set(ds.id, ds);
                });

            } catch (e) {
                console.warn("Could not read own submissions:", e.message);
            }
        }


        if (admin) {

            try {

                const allSnap = await getDocs(col);

                allSnap.forEach(ds => {
                    results.set(ds.id, ds);
                });

            } catch (e) {
                console.warn("Could not read all facilities (admin):", e.message);
            }
        }


        const facilities = [];

        results.forEach(ds => {

            const facility = normalizeResidentFacility(ds);

            if (facility) facilities.push(facility);
        });

        return facilities;

    } catch (error) {

        console.error("Failed to load resident facilities:", error);
        return [];
    }
}


/* =========================================================================
   12. DEDUPLICATION
   ========================================================================= */

function deduplicateFacilities(facilities) {

    const seen = new Set();
    const result = [];

    for (const facility of facilities) {

        const key = [
            facility.name.trim().toLowerCase(),
            facility.latitude.toFixed(5),
            facility.longitude.toFixed(5)
        ].join("|");

        if (seen.has(key)) continue;

        seen.add(key);
        result.push(facility);
    }

    return result;
}


/* =========================================================================
   13. DISTANCE
   ========================================================================= */

function calculateDistanceKm(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}


function calculateFacilityDistances(facilities) {

    if (!state.userLocation) return facilities;

    return facilities.map(facility => {

        facility.distanceKm = calculateDistanceKm(
            state.userLocation.latitude,
            state.userLocation.longitude,
            facility.latitude,
            facility.longitude
        );

        return facility;
    });
}


function sortFacilities(facilities) {

    return [...facilities].sort((a, b) => {

        const dA = Number.isFinite(a.distanceKm) ? a.distanceKm : Infinity;
        const dB = Number.isFinite(b.distanceKm) ? b.distanceKm : Infinity;

        return dA - dB;
    });
}


/* =========================================================================
   14. FILTERS
   ========================================================================= */

function matchesCapacityFilter(facility) {

    const selected = state.filters.capacity;

    if (selected === "all") return true;

    return facility.capacityCategory === selected;
}


function getVisibleFacilities() {

    return state.facilities.filter(facility => {

        const typeMatches =
            state.filters.type === "all" ||
            facility.facilityType === state.filters.type;

        const statusMatches =
            state.filters.status === "all" ||
            facility.status === state.filters.status;

        const capacityMatches = matchesCapacityFilter(facility);

        return typeMatches && statusMatches && capacityMatches;
    });
}


/* =========================================================================
   15. FORMATTERS
   ========================================================================= */

function formatDistance(distanceKm) {

    if (!Number.isFinite(distanceKm)) return "Distance unavailable";

    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;

    return `${distanceKm.toFixed(1)} km away`;
}


function formatCapacity(capacity) {

    const numeric = normalizeCapacity(capacity);

    if (numeric === null) return CONFIG.NOT_AVAILABLE;

    return `${numeric.toLocaleString()} people`;
}


function formatOccupancy(facility) {

    if (facility.currentOccupancy === null) return CONFIG.NOT_AVAILABLE;

    const capacity = normalizeCapacity(facility.capacity);

    if (capacity === null) {
        return `${facility.currentOccupancy.toLocaleString()} people`;
    }

    return `${facility.currentOccupancy.toLocaleString()} / ${capacity.toLocaleString()} people`;
}


function formatOperatingHours(facility) {

    if (!facility.openingTime && !facility.closingTime) {
        return CONFIG.NOT_AVAILABLE;
    }

    if (facility.openingTime && facility.closingTime) {
        return `${formatTime(facility.openingTime)} – ${formatTime(facility.closingTime)}`;
    }

    if (facility.openingTime) {
        return `From ${formatTime(facility.openingTime)}`;
    }

    return `Until ${formatTime(facility.closingTime)}`;
}


function formatTime(time) {

    if (!time) return "";

    const parts = String(time).split(":");

    if (parts.length < 2) return time;

    const hours = Number(parts[0]);
    const minutes = parts[1];

    if (!Number.isFinite(hours)) return time;

    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes} ${suffix}`;
}


function getStatusClass(status) {

    switch (status) {

        case "Available":
            return "is-available";

        case "Limited Capacity":
            return "is-limited";

        case "Full":
        case "Temporarily Closed":
            return "is-full";

        default:
            return "is-unknown";
    }
}


/* =========================================================================
   16. VERIFICATION BADGE HELPERS
   ========================================================================= */

function getVerificationBadge(facility) {

    const status = facility.verificationStatus;

    if (status === "Approved") {
        return {
            text: "✓ Verified",
            cls: "facility-badge is-verified"
        };
    }

    if (status === "Rejected") {
        return {
            text: "✗ Rejected",
            cls: "facility-badge is-rejected"
        };
    }

    return {
        text: "⏳ Pending Verification",
        cls: "facility-badge is-pending"
    };
}


/* =========================================================================
   17. RENDER FACILITY MARKERS
   ========================================================================= */

function clearFacilityMarkers() {

    for (const marker of state.facilityMarkers) {
        state.map.removeLayer(marker);
    }

    state.facilityMarkers = [];
}


function renderFacilityMarkers() {

    clearFacilityMarkers();

    const visibleFacilities = getVisibleFacilities();

    for (const facility of visibleFacilities) {

        const isResident = facility.source === "Resident Submission";

        const icon = L.divIcon({

            className: "",

            html:
                `<div class="facility-map-marker${isResident ? " is-resident" : ""}"></div>`,

            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15]
        });


        const marker = L.marker(
            [facility.latitude, facility.longitude],
            { icon }
        );


        marker.bindPopup(buildFacilityPopup(facility));

        marker.on("click", () => {

            state.selectedFacility = facility;
            renderFacilities();
        });


        marker.addTo(state.map);
        state.facilityMarkers.push(marker);
    }
}


/* =========================================================================
   18. FACILITY POPUP
   ========================================================================= */

function buildFacilityPopup(facility) {

    const container = document.createElement("div");
    container.className = "map-popup";


    const name = document.createElement("h3");
    name.className = "map-popup-name";
    name.textContent = facility.name;


    const type = document.createElement("div");
    type.className = "map-popup-type";
    type.textContent = facility.facilityType;


    const designation = document.createElement("div");
    designation.className = "map-popup-designation";
    designation.textContent =
        facility.realTimeStatus || facility.designation;


    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "btn btn-ghost btn-sm";
    viewButton.textContent = "View Details";
    viewButton.style.marginBottom = "6px";

    viewButton.addEventListener("click", () => {
        openFacilityDetails(facility);
    });


    const routeButton = document.createElement("button");
    routeButton.type = "button";
    routeButton.className = "btn btn-primary btn-sm map-popup-route";
    routeButton.textContent = "Route Here";

    routeButton.addEventListener("click", () => {
        routeToFacility(facility);
    });


    container.appendChild(name);
    container.appendChild(type);
    container.appendChild(designation);
    container.appendChild(viewButton);
    container.appendChild(routeButton);

    return container;
}


/* =========================================================================
   19. RENDER FACILITY LIST
   ========================================================================= */

function renderFacilities() {

    if (!DOM.facilityList) return;

    DOM.facilityList.innerHTML = "";

    const visibleFacilities = getVisibleFacilities();

    if (!visibleFacilities.length) {

        const emptyItem = document.createElement("li");
        emptyItem.className = "sidebar-message";

        emptyItem.textContent =
            state.facilities.length
                ? "No facilities match the selected filters."
                : "No resident-submitted evacuation centers yet.";

        DOM.facilityList.appendChild(emptyItem);

        updateFacilityCount(0);
        return;
    }


    visibleFacilities.forEach((facility, index) => {
        DOM.facilityList.appendChild(
            buildFacilityCard(facility, index + 1)
        );
    });


    updateFacilityCount(visibleFacilities.length);
}


/* =========================================================================
   20. FACILITY CARD
   ========================================================================= */

function buildFacilityCard(facility, rank) {

    const item = document.createElement("li");

    const card = document.createElement("article");
    card.className = "facility-card";

    if (
        state.selectedFacility &&
        state.selectedFacility.id === facility.id
    ) {
        card.classList.add("is-selected");
    }


    const header = document.createElement("div");
    header.className = "facility-card-header";


    if (facility.centerPhotoUrl) {

        const thumb = document.createElement("img");
        thumb.className = "facility-card-thumb";
        thumb.src = facility.centerPhotoUrl;
        thumb.alt = facility.name;
        thumb.loading = "lazy";
        thumb.addEventListener("click", event => {
            event.stopPropagation();
            openLightbox(facility.centerPhotoUrl);
        });

        header.appendChild(thumb);
    }


    const titleWrap = document.createElement("div");
    titleWrap.className = "facility-card-title-wrap";

    const name = document.createElement("h3");
    name.className = "facility-name";
    name.textContent = facility.name;

    const distance = document.createElement("div");
    distance.className = "facility-distance";
    distance.textContent = formatDistance(facility.distanceKm);

    titleWrap.appendChild(name);
    titleWrap.appendChild(distance);

    header.appendChild(titleWrap);


    const type = document.createElement("div");
    type.className = "facility-type";
    type.textContent = facility.facilityType;


    const badgeInfo = getVerificationBadge(facility);

    const designation = document.createElement("div");
    designation.className = badgeInfo.cls;
    designation.textContent = badgeInfo.text;


    const metadata = document.createElement("div");
    metadata.className = "facility-meta";

    appendMetaRow(metadata, "Manager", facility.managerName);
    appendMetaRow(metadata, "Status", facility.status);
    appendMetaRow(metadata, "Real-Time", facility.realTimeStatus);


    const actions = document.createElement("div");
    actions.className = "facility-card-actions";


    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "btn btn-ghost";
    viewButton.textContent = "View Details";

    viewButton.addEventListener("click", event => {
        event.stopPropagation();
        openFacilityDetails(facility);
    });


    const routeButton = document.createElement("button");
    routeButton.type = "button";
    routeButton.className = "btn btn-primary";
    routeButton.textContent = "Route Here";

    routeButton.addEventListener("click", event => {
        event.stopPropagation();
        routeToFacility(facility);
    });


    actions.appendChild(viewButton);
    actions.appendChild(routeButton);


    if (canEdit(facility)) {

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "btn btn-ghost";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", event => {
            event.stopPropagation();
            openFacilityModal(facility);
        });

        actions.appendChild(editButton);
    }


    card.appendChild(header);
    card.appendChild(type);
    card.appendChild(designation);
    card.appendChild(metadata);
    card.appendChild(actions);


    card.addEventListener("click", () => selectFacility(facility));


    item.appendChild(card);

    return item;
}


function appendMetaRow(container, label, value) {

    const row = document.createElement("div");
    row.className = "facility-meta-row";

    const labelElement = document.createElement("span");
    labelElement.className = "facility-meta-label";
    labelElement.textContent = label + ":";

    const valueElement = document.createElement("span");
    valueElement.className = "facility-meta-value";
    valueElement.textContent = value || CONFIG.NOT_AVAILABLE;

    row.appendChild(labelElement);
    row.appendChild(valueElement);

    container.appendChild(row);

    return row;
}


/* =========================================================================
   21. FACILITY COUNT
   ========================================================================= */

function updateFacilityCount(count) {

    if (!DOM.facilityCount) return;

    const text =
        count === 1
            ? "1 facility shown"
            : `${count} facilities shown`;

    DOM.facilityCount.textContent = text;
}


/* =========================================================================
   22. SELECT FACILITY
   ========================================================================= */

function selectFacility(facility) {

    state.selectedFacility = facility;

    if (state.map) {
        state.map.setView(
            [facility.latitude, facility.longitude],
            Math.max(state.map.getZoom(), 15)
        );
    }

    renderFacilities();
}


/* =========================================================================
   23. SEARCH RADIUS
   ========================================================================= */

function setSearchRadius(radiusKm) {

    const numeric = Number(radiusKm);

    if (!Number.isFinite(numeric) || numeric <= 0) return;

    if (!CONFIG.SEARCH_RADIUS_OPTIONS.includes(numeric)) return;

    state.searchRadiusKm = numeric;

    if (DOM.searchRadiusSelect) {
        DOM.searchRadiusSelect.value = String(numeric);
    }

    state.facilities = [];
    state.selectedFacility = null;

    renderFacilities();
    clearFacilityMarkers();
    clearRoute();

    if (state.userLocation) {
        fetchAndDisplayFacilities();
    } else {
        setStatus(`Search area set to ${numeric} km.`, "ok");
    }
}


/* =========================================================================
   24. FACILITY SEARCH
   ========================================================================= */

async function fetchAndDisplayFacilities() {

    if (state.isSearching || !state.userLocation) return;

    state.isSearching = true;

    clearSidebarMessage();

    if (DOM.searchRadiusSelect) {
        DOM.searchRadiusSelect.value = String(state.searchRadiusKm);
    }

    setStatus("Loading evacuation centers...", "loading");


    try {

        let facilities = await fetchResidentFacilities();

        if (state.userLocation) {

            facilities = calculateFacilityDistances(facilities)
                .filter(f =>
                    Number.isFinite(f.distanceKm) &&
                    f.distanceKm <= state.searchRadiusKm
                );
        }

        facilities = deduplicateFacilities(facilities);
        facilities = sortFacilities(facilities);

        state.facilities = facilities;

        renderFacilities();
        renderFacilityMarkers();


        if (!facilities.length) {

            showSidebarMessage(
                `No resident-submitted evacuation centers within ${state.searchRadiusKm} km.`
            );

            setStatus("No nearby facilities found.", "ok");

        } else {

            setStatus(
                `${facilities.length} facilities found within ${state.searchRadiusKm} km.`,
                "ok"
            );
        }


    } catch (error) {

        console.error("Facility loading error:", error);

        showSidebarMessage(
            "Facility data could not be loaded. Please try again later.",
            "error"
        );

        setStatus("Facility data unavailable.", "error");

    } finally {

        state.isSearching = false;
    }
}


/* =========================================================================
   25. FILTERS
   ========================================================================= */

function applyFilters() {

    state.filters.type = DOM.facilityTypeFilter?.value || "all";
    state.filters.status = DOM.availabilityFilter?.value || "all";
    state.filters.capacity = DOM.capacityFilter?.value || "all";

    renderFacilities();
    renderFacilityMarkers();

    state.selectedFacility = null;
}


/* =========================================================================
   26. CLEAR ROUTE
   ========================================================================= */

function clearRoute() {

    if (state.routeLayer && state.map) {
        state.map.removeLayer(state.routeLayer);
    }

    state.routeLayer = null;
    state.selectedFacility = null;

    if (DOM.routeSummary) {
        DOM.routeSummary.classList.add("hidden");
    }

    renderFacilities();
}


/* =========================================================================
   27. OSRM ROUTING
   ========================================================================= */

async function fetchRoute(origin, destination) {

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.OSRM_TIMEOUT_MS
    );

    const coordinates = [
        `${origin.longitude},${origin.latitude}`,
        `${destination.longitude},${destination.latitude}`
    ].join(";");

    const url =
        `${CONFIG.OSRM_BASE_URL}/${coordinates}` +
        "?overview=full&geometries=geojson";


    try {

        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(
                `Routing request failed: ${response.status}`
            );
        }

        const json = await response.json();

        if (json.code !== "Ok" || !json.routes?.length) {
            throw new Error("No driving route was found.");
        }

        return json.routes[0];

    } finally {
        clearTimeout(timeout);
    }
}


async function routeToFacility(facility) {

    if (!state.userLocation) {

        showSidebarMessage(
            "Find your location before requesting a route.",
            "error"
        );

        return;
    }

    state.selectedFacility = facility;
    renderFacilities();

    setStatus("Calculating route...", "loading");


    try {

        const route = await fetchRoute(
            state.userLocation,
            {
                latitude: facility.latitude,
                longitude: facility.longitude
            }
        );

        renderRoute(route, facility);

        setStatus("Route ready.", "ok");

    } catch (error) {

        console.error("Routing error:", error);

        showSidebarMessage(
            "Unable to calculate a route to this facility.",
            "error"
        );

        setStatus("Route unavailable.", "error");
    }
}


function renderRoute(route, facility) {

    if (state.routeLayer && state.map) {
        state.map.removeLayer(state.routeLayer);
    }

    state.routeLayer = L.geoJSON(
        route.geometry,
        {
            style: {
                color: "#E8590C",
                weight: 6,
                opacity: 0.88
            }
        }
    ).addTo(state.map);


    const bounds = state.routeLayer.getBounds();

    state.map.fitBounds(bounds, { padding: [30, 30] });

    if (DOM.routeSummary) {
        DOM.routeSummary.classList.remove("hidden");
    }

    if (DOM.routeDestination) {
        DOM.routeDestination.textContent = facility.name;
    }

    if (DOM.routeDistance) {
        DOM.routeDistance.textContent =
            (route.distance / 1000).toFixed(1);
    }

    if (DOM.routeDuration) {
        DOM.routeDuration.textContent =
            Math.round(route.duration / 60);
    }
}


/* =========================================================================
   28. FACILITY DETAILS MODAL
   ========================================================================= */

function openFacilityDetails(facility) {

    if (!DOM.facilityDetailsModal) return;

    state.selectedFacility = facility;

    if (DOM.facilityDetailsTitle) {
        DOM.facilityDetailsTitle.textContent = facility.name;
    }

    if (DOM.facilityDetailsSubtitle) {
        DOM.facilityDetailsSubtitle.textContent =
            `${facility.facilityType} · ${formatDistance(facility.distanceKm)}`;
    }

    if (DOM.facilityDetailsBody) {

        DOM.facilityDetailsBody.innerHTML = "";

        const grid = document.createElement("div");
        grid.className = "facility-details-grid";

        appendDetail(grid, "Manager in Charge", facility.managerName);
        appendDetail(grid, "Address", facility.address, true);
        appendDetail(grid, "Facility Type", facility.facilityType);
        appendDetail(grid, "Availability Status", facility.status);
        appendDetail(grid, "Real-Time Status", facility.realTimeStatus);
        appendDetail(grid, "Capacity", formatCapacity(facility.capacity));
        appendDetail(grid, "Current Occupancy", formatOccupancy(facility));
        appendDetail(grid, "Operating Hours", formatOperatingHours(facility));
        appendDetail(grid, "Contact Number", facility.contactNumber || CONFIG.NOT_AVAILABLE);

        const badgeInfo = getVerificationBadge(facility);
        appendDetail(grid, "Verification", badgeInfo.text);

        appendDetail(grid, "Notes", facility.notes || CONFIG.NOT_AVAILABLE, true);
        appendDetail(
            grid,
            "Coordinates",
            `${facility.latitude.toFixed(5)}, ${facility.longitude.toFixed(5)}`,
            true
        );

        DOM.facilityDetailsBody.appendChild(grid);


        const photoSection = document.createElement("div");

        if (facility.idPhotoUrl || facility.centerPhotoUrl) {

            const photos = document.createElement("div");
            photos.className = "facility-detail-photos";

            if (facility.idPhotoUrl) {
                photos.appendChild(
                    buildDetailPhoto(facility.idPhotoUrl, "Photo of Valid ID")
                );
            }

            if (facility.centerPhotoUrl) {
                photos.appendChild(
                    buildDetailPhoto(facility.centerPhotoUrl, "Photo of Evacuation Center")
                );
            }

            photoSection.appendChild(photos);

        } else {

            const empty = document.createElement("div");
            empty.className = "facility-details-empty";
            empty.textContent = "No photos were uploaded for this facility.";

            photoSection.appendChild(empty);
        }

        DOM.facilityDetailsBody.appendChild(photoSection);


        const actions = document.createElement("div");
        actions.className = "facility-details-actions";


        const routeButton = document.createElement("button");
        routeButton.type = "button";
        routeButton.className = "btn btn-primary";
        routeButton.textContent = "Route Here";

        routeButton.addEventListener("click", () => {
            closeFacilityDetails();
            routeToFacility(facility);
        });

        actions.appendChild(routeButton);


        if (state.currentUser && !isOwner(facility)) {

            const reportButton = document.createElement("button");
            reportButton.type = "button";
            reportButton.className = "btn btn-ghost";
            reportButton.textContent = "⚠ Report";
            reportButton.style.color = "var(--color-danger)";
            reportButton.style.borderColor = "var(--color-danger)";

            reportButton.addEventListener("click", () => {
                closeFacilityDetails();
                openReportModal(facility);
            });

            actions.appendChild(reportButton);
        }


        if (canEdit(facility)) {

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "btn btn-ghost";
            editButton.textContent = "Edit Facility";

            editButton.addEventListener("click", () => {
                closeFacilityDetails();
                openFacilityModal(facility);
            });

            actions.appendChild(editButton);


            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "btn btn-ghost";
            deleteButton.textContent = "Delete";
            deleteButton.style.color = "var(--color-danger)";
            deleteButton.style.borderColor = "var(--color-danger)";

            deleteButton.addEventListener("click", () => {
                confirmDeleteFacility(facility);
            });

            actions.appendChild(deleteButton);
        }


        DOM.facilityDetailsBody.appendChild(actions);
    }


    DOM.facilityDetailsModal.classList.remove("hidden");
    DOM.facilityDetailsModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
}


function appendDetail(grid, label, value, fullWidth = false) {

    const item = document.createElement("div");
    item.className = "facility-detail-item";
    if (fullWidth) item.classList.add("facility-detail-full");

    const labelElement = document.createElement("span");
    labelElement.className = "facility-detail-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("div");
    valueElement.className = "facility-detail-value";
    valueElement.textContent = value || CONFIG.NOT_AVAILABLE;

    item.appendChild(labelElement);
    item.appendChild(valueElement);

    grid.appendChild(item);
}


function buildDetailPhoto(url, label) {

    const wrapper = document.createElement("div");
    wrapper.className = "facility-detail-photo";

    const img = document.createElement("img");
    img.src = url;
    img.alt = label;
    img.loading = "lazy";

    img.addEventListener("click", () => openLightbox(url));

    const labelEl = document.createElement("div");
    labelEl.className = "facility-detail-photo-label";
    labelEl.textContent = label;

    wrapper.appendChild(img);
    wrapper.appendChild(labelEl);

    return wrapper;
}


function closeFacilityDetails() {

    if (!DOM.facilityDetailsModal) return;

    DOM.facilityDetailsModal.classList.add("hidden");
    DOM.facilityDetailsModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";
}


/* =========================================================================
   29. PHOTO LIGHTBOX
   ========================================================================= */

function openLightbox(url) {

    if (!url) return;

    const box = document.createElement("div");
    box.className = "photo-lightbox";

    const img = document.createElement("img");
    img.src = url;
    img.alt = "Enlarged photo";

    box.appendChild(img);

    const close = () => {
        box.remove();
        document.removeEventListener("keydown", onKey);
    };

    const onKey = (event) => {
        if (event.key === "Escape") close();
    };

    box.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(box);
}


/* =========================================================================
   30. MODAL OPEN / CLOSE (Add / Edit)
   ========================================================================= */

function openFacilityModal(facility = null) {

    if (!isResident() && !isAdmin()) {

        showSidebarMessage(
            "Only signed-in residents can submit an evacuation center.",
            "error"
        );

        return;
    }

    if (!DOM.facilityModal) return;


    if (DOM.facilityForm) DOM.facilityForm.reset();
    clearFacilityFormMessage();

    if (DOM.facilityLatitude) DOM.facilityLatitude.value = "";
    if (DOM.facilityLongitude) DOM.facilityLongitude.value = "";

    if (DOM.submissionLocationStatus) {
        DOM.submissionLocationStatus.textContent = "Location not selected.";
        DOM.submissionLocationStatus.classList.remove(
            "is-success",
            "is-error"
        );
    }

    if (DOM.currentIdPhotoPreview) DOM.currentIdPhotoPreview.innerHTML = "";
    if (DOM.currentCenterPhotoPreview) DOM.currentCenterPhotoPreview.innerHTML = "";


    if (facility) {

        state.editingFacilityId = facility.id;

        if (DOM.facilityModalTitle) {
            DOM.facilityModalTitle.textContent = "Edit Evacuation Center";
        }

        if (DOM.facilityModalSubtitle) {
            DOM.facilityModalSubtitle.textContent =
                "Update the information about this evacuation center.";
        }

        if (DOM.submitFacilityButton) {
            DOM.submitFacilityButton.textContent = "Save Changes";
        }

        if (DOM.idPhotoRequired) DOM.idPhotoRequired.textContent = "";
        if (DOM.centerPhotoRequired) DOM.centerPhotoRequired.textContent = "";
        if (DOM.photoSectionHelp) {
            DOM.photoSectionHelp.textContent =
                "Leave the photo inputs empty to keep the existing photos, or upload new ones to replace them.";
        }

        const idPhotoEl = document.getElementById("facility-id-photo");
        if (idPhotoEl) idPhotoEl.required = false;

        const centerPhotoEl = document.getElementById("facility-center-photo");
        if (centerPhotoEl) centerPhotoEl.required = false;


        setField("facility-name", facility.name);
        setField("facility-manager", facility.managerName);
        setField("facility-address", facility.address);
        setField("facility-type", facility.facilityType);
        setField("facility-capacity", facility.capacity);
        setField("facility-current-occupancy", facility.currentOccupancy);
        setField("facility-status", facility.status);
        setField("facility-real-time", facility.realTimeStatus);
        setField("facility-opening-time", facility.openingTime || "");
        setField("facility-closing-time", facility.closingTime || "");
        setField("facility-contact", facility.contactNumber || "");
        setField("facility-notes", facility.notes || "");


        if (DOM.facilityLatitude) {
            DOM.facilityLatitude.value = facility.latitude ?? "";
        }

        if (DOM.facilityLongitude) {
            DOM.facilityLongitude.value = facility.longitude ?? "";
        }

        if (DOM.submissionLocationStatus) {

            if (
                Number.isFinite(facility.latitude) &&
                Number.isFinite(facility.longitude)
            ) {
                DOM.submissionLocationStatus.textContent =
                    `Location already set: ${facility.latitude.toFixed(5)}, ${facility.longitude.toFixed(5)}`;
                DOM.submissionLocationStatus.classList.add("is-success");
                DOM.submissionLocationStatus.classList.remove("is-error");
            }
        }


        if (DOM.currentIdPhotoPreview && facility.idPhotoUrl) {
            DOM.currentIdPhotoPreview.appendChild(
                buildCurrentPhotoPreview(facility.idPhotoUrl, "Current ID photo")
            );
        }

        if (DOM.currentCenterPhotoPreview && facility.centerPhotoUrl) {
            DOM.currentCenterPhotoPreview.appendChild(
                buildCurrentPhotoPreview(facility.centerPhotoUrl, "Current facility photo")
            );
        }

    } else {

        state.editingFacilityId = null;

        if (DOM.facilityModalTitle) {
            DOM.facilityModalTitle.textContent = "Add Evacuation Center";
        }

        if (DOM.facilityModalSubtitle) {
            DOM.facilityModalSubtitle.textContent =
                "Submit an evacuation facility for administrator verification. Both photos are required.";
        }

        if (DOM.submitFacilityButton) {
            DOM.submitFacilityButton.textContent = "Submit Evacuation Center";
        }

        if (DOM.idPhotoRequired) DOM.idPhotoRequired.textContent = "*";
        if (DOM.centerPhotoRequired) DOM.centerPhotoRequired.textContent = "*";
        if (DOM.photoSectionHelp) {
            DOM.photoSectionHelp.textContent =
                "Both photos are required. They help administrators verify that the evacuation center is real and that you are authorized to register it.";
        }

        const idPhotoEl = document.getElementById("facility-id-photo");
        if (idPhotoEl) idPhotoEl.required = true;

        const centerPhotoEl = document.getElementById("facility-center-photo");
        if (centerPhotoEl) centerPhotoEl.required = true;
    }


    DOM.facilityModal.classList.remove("hidden");
    DOM.facilityModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    setTimeout(() => {
        document.getElementById("facility-name")?.focus();
    }, 50);
}


function buildCurrentPhotoPreview(url, caption) {

    const wrapper = document.createElement("div");
    wrapper.className = "current-photo-preview";

    const img = document.createElement("img");
    img.src = url;
    img.alt = caption;
    img.addEventListener("click", () => openLightbox(url));

    const label = document.createElement("div");
    label.className = "current-photo-label";
    label.innerHTML = `<strong>${caption}</strong>Tap the thumbnail to view it full size. Upload a new file above to replace it.`;

    wrapper.appendChild(img);
    wrapper.appendChild(label);

    return wrapper;
}


function setField(id, value) {

    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
}


function closeFacilityModal() {

    if (!DOM.facilityModal) return;

    DOM.facilityModal.classList.add("hidden");
    DOM.facilityModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";

    state.editingFacilityId = null;
}


/* =========================================================================
   31. FORM MESSAGE HELPERS
   ========================================================================= */

function showFacilityFormMessage(message, type = "") {

    if (!DOM.facilityFormMessage) return;

    DOM.facilityFormMessage.textContent = message;

    DOM.facilityFormMessage.classList.remove(
        "is-success",
        "is-error",
        "is-loading"
    );

    if (type) {
        DOM.facilityFormMessage.classList.add(`is-${type}`);
    }
}


function clearFacilityFormMessage() {

    if (!DOM.facilityFormMessage) return;

    DOM.facilityFormMessage.textContent = "";

    DOM.facilityFormMessage.classList.remove(
        "is-success",
        "is-error",
        "is-loading"
    );
}


/* =========================================================================
   32. SUBMISSION LOCATION
   ========================================================================= */

function captureSubmissionLocation() {

    if (!navigator.geolocation) {

        setSubmissionLocationError(
            "Geolocation is not supported by this browser."
        );

        return;
    }

    if (DOM.useMyLocationButton) {
        DOM.useMyLocationButton.disabled = true;
        DOM.useMyLocationButton.textContent = "Getting Location...";
    }

    if (DOM.submissionLocationStatus) {

        DOM.submissionLocationStatus.textContent =
            "Detecting your current location...";

        DOM.submissionLocationStatus.classList.remove(
            "is-success",
            "is-error"
        );
    }


    navigator.geolocation.getCurrentPosition(

        position => {

            const latitude = Number(position.coords.latitude);
            const longitude = Number(position.coords.longitude);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {

                setSubmissionLocationError(
                    "The browser returned an invalid location."
                );

                return;
            }

            DOM.facilityLatitude.value = latitude.toFixed(7);
            DOM.facilityLongitude.value = longitude.toFixed(7);

            if (DOM.submissionLocationStatus) {

                DOM.submissionLocationStatus.textContent =
                    `Location captured: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

                DOM.submissionLocationStatus.classList.add("is-success");
                DOM.submissionLocationStatus.classList.remove("is-error");
            }

            if (DOM.useMyLocationButton) {
                DOM.useMyLocationButton.disabled = false;
                DOM.useMyLocationButton.textContent = "Use My Location";
            }
        },

        error => {

            let message = "Unable to capture your location.";

            if (error.code === 1) {
                message =
                    "Location permission was denied. Please allow location access and try again.";
            }

            if (error.code === 2) {
                message =
                    "Your current location could not be determined.";
            }

            if (error.code === 3) {
                message =
                    "Location detection timed out. Please try again.";
            }

            setSubmissionLocationError(message);
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}


function setSubmissionLocationError(message) {

    if (DOM.submissionLocationStatus) {

        DOM.submissionLocationStatus.textContent = message;

        DOM.submissionLocationStatus.classList.add("is-error");
        DOM.submissionLocationStatus.classList.remove("is-success");
    }

    if (DOM.useMyLocationButton) {
        DOM.useMyLocationButton.disabled = false;
        DOM.useMyLocationButton.textContent = "Use My Location";
    }
}


/* =========================================================================
   33. FORM VALIDATION
   ========================================================================= */

function validateFacilitySubmission(formData, isEditing) {

    const name = String(formData.get("name") || "").trim();
    const managerName = String(formData.get("managerName") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const facilityType = String(formData.get("facilityType") || "").trim();
    const status = String(formData.get("status") || "").trim();
    const realTimeStatus = String(formData.get("realTimeStatus") || "").trim();

    const capacity = Number(formData.get("capacity"));
    const currentOccupancy = Number(formData.get("currentOccupancy"));

    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));

    const idPhoto = formData.get("idPhoto");
    const centerPhoto = formData.get("centerPhoto");


    if (!name) return "Please enter the evacuation center name.";

    if (!managerName) return "Please enter the manager's full name.";

    if (!address) return "Please enter the address.";

    if (!CONFIG.FACILITY_TYPES.includes(facilityType)) {
        return "Please select a valid facility type.";
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
        return "Capacity must be a positive number.";
    }

    if (
        !Number.isFinite(currentOccupancy) ||
        currentOccupancy < 0
    ) {
        return "Current occupancy must be zero or greater.";
    }

    if (currentOccupancy > capacity) {
        return "Current occupancy cannot exceed total capacity.";
    }

    if (!CONFIG.AVAILABILITY_STATUSES.includes(status)) {
        return "Please select a valid availability status.";
    }

    if (!CONFIG.REALTIME_STATUSES.includes(realTimeStatus)) {
        return "Please select a valid real-time status.";
    }

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
    ) {
        return "Please use 'Use My Location' to capture the facility's coordinates.";
    }


    const hasIdPhoto = idPhoto instanceof File && idPhoto.size > 0;
    const hasCenterPhoto = centerPhoto instanceof File && centerPhoto.size > 0;

    if (!isEditing) {

        if (!hasIdPhoto) return "Please upload a photo of a valid ID.";
        if (!hasCenterPhoto) return "Please upload a photo of the evacuation center.";
    }

    if (hasIdPhoto && idPhoto.size > CONFIG.MAX_UPLOAD_BYTES) {
        return "The ID photo must be 5 MB or smaller.";
    }

    if (hasCenterPhoto && centerPhoto.size > CONFIG.MAX_UPLOAD_BYTES) {
        return "The center photo must be 5 MB or smaller.";
    }

    if (hasIdPhoto && !idPhoto.type.startsWith("image/")) {
        return "The ID file must be an image.";
    }

    if (hasCenterPhoto && !centerPhoto.type.startsWith("image/")) {
        return "The center file must be an image.";
    }

    return null;
}


/* =========================================================================
   34. SUBMIT / UPDATE FACILITY
   ========================================================================= */

async function submitFacility(event) {

    event.preventDefault();

    if (state.isSubmitting) return;
    if (!DOM.facilityForm) return;


    let isEditing = false;
    let existingFacility = null;

    if (state.editingFacilityId !== null) {

        existingFacility = state.facilities.find(
            f => f.id === state.editingFacilityId
        );

        if (existingFacility) {
            isEditing = true;
        } else {
            state.editingFacilityId = null;
        }
    }


    if (!isEditing) {

        const rateCheck = checkRateLimit("evacquick:lastFacilitySubmit");

        if (!rateCheck.allowed) {
            showFacilityFormMessage(rateCheck.message, "error");
            return;
        }
    }


    const formData = new FormData(DOM.facilityForm);

    const validationError = validateFacilitySubmission(formData, isEditing);

    if (validationError) {
        showFacilityFormMessage(validationError, "error");
        return;
    }


    const currentUser = auth.currentUser;

    if (!currentUser) {

        showFacilityFormMessage(
            "You must be signed in to submit an evacuation center.",
            "error"
        );

        return;
    }

    if (!isResident() && !isAdmin()) {

        showFacilityFormMessage(
            "Only authenticated residents can submit evacuation centers.",
            "error"
        );

        return;
    }


    if (isEditing && !canEdit(existingFacility)) {

        showFacilityFormMessage(
            "You can only edit facilities you submitted.",
            "error"
        );

        return;
    }


    state.isSubmitting = true;

    setButtonLoading(
        DOM.submitFacilityButton,
        isEditing ? "Saving…" : "Submitting…"
    );

    showFacilityFormMessage(
        isEditing
            ? "Saving changes to evacuation center..."
            : "Uploading photos and submitting evacuation center...",
        "loading"
    );


    try {

        const capacity = Number(formData.get("capacity"));
        const currentOccupancy = Number(formData.get("currentOccupancy"));

        const idPhoto = formData.get("idPhoto");
        const centerPhoto = formData.get("centerPhoto");

        const hasIdPhoto = idPhoto instanceof File && idPhoto.size > 0;
        const hasCenterPhoto = centerPhoto instanceof File && centerPhoto.size > 0;


        let idPhotoUrl = existingFacility?.idPhotoUrl || null;
        let centerPhotoUrl = existingFacility?.centerPhotoUrl || null;

        const uploads = [];

        if (hasIdPhoto) {
            uploads.push(
                uploadImageToImgBB(idPhoto).then(url => {
                    idPhotoUrl = url;
                })
            );
        }

        if (hasCenterPhoto) {
            uploads.push(
                uploadImageToImgBB(centerPhoto).then(url => {
                    centerPhotoUrl = url;
                })
            );
        }

        if (uploads.length) {
            await Promise.all(uploads);
        }


        const facilityData = {

            name: String(formData.get("name")).trim(),

            managerName: String(formData.get("managerName")).trim(),

            address: String(formData.get("address")).trim(),

            facilityType: String(formData.get("facilityType")),

            capacity,
            currentOccupancy,

            status: String(formData.get("status")),
            realTimeStatus: String(formData.get("realTimeStatus")),

            openingTime: String(formData.get("openingTime") || ""),
            closingTime: String(formData.get("closingTime") || ""),

            contactNumber:
                String(formData.get("contactNumber") || "").trim(),

            notes:
                String(formData.get("notes") || "").trim(),

            latitude: Number(formData.get("latitude")),
            longitude: Number(formData.get("longitude")),

            idPhotoUrl,
            centerPhotoUrl,

            submittedBy: currentUser.uid,
            submittedByEmail: currentUser.email || ""
        };


        if (isEditing) {

            facilityData.updatedAt = serverTimestamp();
            facilityData.verificationStatus = CONFIG.VERIFICATION_PENDING;

            await updateDoc(
                doc(
                    db,
                    CONFIG.FIRESTORE_FACILITIES_COLLECTION,
                    state.editingFacilityId
                ),
                facilityData
            );

            showFacilityFormMessage(
                "Evacuation center updated. It will need to be re-verified by an admin.",
                "success"
            );

        } else {

            facilityData.submittedAt = serverTimestamp();
            facilityData.source = "Resident Submission";
            facilityData.verificationStatus = CONFIG.VERIFICATION_PENDING;

            await addDoc(
                collection(db, CONFIG.FIRESTORE_FACILITIES_COLLECTION),
                facilityData
            );

            markRateLimit("evacquick:lastFacilitySubmit");

            showFacilityFormMessage(
                "Evacuation center submitted successfully. Your submission is pending verification.",
                "success"
            );
        }


        await refreshFacilitiesAfterSubmission();


        setTimeout(() => {
            closeFacilityModal();
        }, 1400);


    } catch (error) {

        console.error("Facility submission error:", error);

        showFacilityFormMessage(
            `Submission failed: ${error.message || "unknown error"}`,
            "error"
        );

    } finally {

        state.isSubmitting = false;

        resetButton(
            DOM.submitFacilityButton,
            state.editingFacilityId
                ? "Save Changes"
                : "Submit Evacuation Center"
        );
    }
}


/* =========================================================================
   35. DELETE FACILITY
   ========================================================================= */

async function confirmDeleteFacility(facility) {

    const confirmed = window.confirm(
        `Delete "${facility.name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {

        if (!canEdit(facility)) {
            window.alert("You can only delete facilities you submitted.");
            return;
        }

        await deleteDoc(
            doc(db, CONFIG.FIRESTORE_FACILITIES_COLLECTION, facility.id)
        );

        closeFacilityDetails();

        showSidebarMessage(
            "Evacuation center deleted successfully.",
            "ok"
        );

        await refreshFacilitiesAfterSubmission();

    } catch (error) {

        console.error("Delete failed:", error);

        showSidebarMessage(
            "Could not delete the evacuation center. Please try again.",
            "error"
        );
    }
}


/* =========================================================================
   36. REPORT FACILITY
   ========================================================================= */

let reportingFacility = null;

function openReportModal(facility) {

    if (!state.currentUser) {

        showSidebarMessage(
            "Please sign in to report a facility.",
            "error"
        );

        return;
    }

    reportingFacility = facility;

    if (!DOM.reportModal) return;

    if (DOM.reportModalSubtitle) {
        DOM.reportModalSubtitle.textContent =
            `Reporting: ${facility.name}`;
    }

    if (DOM.reportForm) DOM.reportForm.reset();
    clearReportFormMessage();

    DOM.reportModal.classList.remove("hidden");
    DOM.reportModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}


function closeReportModal() {

    if (!DOM.reportModal) return;

    DOM.reportModal.classList.add("hidden");
    DOM.reportModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    reportingFacility = null;
}


function showReportFormMessage(message, type = "") {

    if (!DOM.reportFormMessage) return;

    DOM.reportFormMessage.textContent = message;
    DOM.reportFormMessage.classList.remove(
        "is-success",
        "is-error",
        "is-loading"
    );

    if (type) DOM.reportFormMessage.classList.add(`is-${type}`);
}


function clearReportFormMessage() {

    if (!DOM.reportFormMessage) return;

    DOM.reportFormMessage.textContent = "";
    DOM.reportFormMessage.classList.remove(
        "is-success",
        "is-error",
        "is-loading"
    );
}


async function submitReport(event) {

    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
        showReportFormMessage("Please sign in to report.", "error");
        return;
    }

    if (!reportingFacility) {
        showReportFormMessage("No facility selected.", "error");
        return;
    }


    const rateCheck = checkRateLimit("evacquick:lastReportSubmit");

    if (!rateCheck.allowed) {
        showReportFormMessage(rateCheck.message, "error");
        return;
    }


    const formData = new FormData(DOM.reportForm);

    const reason = String(formData.get("reason") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (!reason) {
        showReportFormMessage("Please select a reason.", "error");
        return;
    }

    setButtonLoading(
        DOM.submitReportButton,
        "Submitting…"
    );

    showReportFormMessage("Submitting report...", "loading");

    try {

        await addDoc(collection(db, "reports"), {
            facilityId: reportingFacility.id,
            facilityName: reportingFacility.name,
            reportedBy: user.uid,
            reportedByEmail: user.email || "",
            reason,
            note,
            status: "open",
            createdAt: serverTimestamp()
        });

        markRateLimit("evacquick:lastReportSubmit");

        showReportFormMessage(
            "Report submitted. Thank you — an admin will review this shortly.",
            "success"
        );

        setTimeout(() => closeReportModal(), 1500);

    } catch (error) {

        console.error("Report submission failed:", error);
        showReportFormMessage(
            `Failed to submit: ${error.message || "unknown error"}`,
            "error"
        );

    } finally {

        resetButton(DOM.submitReportButton, "Submit Report");
    }
}


/* =========================================================================
   37. REFRESH AFTER CHANGE
   ========================================================================= */

async function refreshFacilitiesAfterSubmission() {

    if (!state.userLocation) return;

    try {

        let facilities = await fetchResidentFacilities();

        facilities = calculateFacilityDistances(facilities)
            .filter(f =>
                Number.isFinite(f.distanceKm) &&
                f.distanceKm <= state.searchRadiusKm
            );

        facilities = deduplicateFacilities(facilities);
        state.facilities = sortFacilities(facilities);

        renderFacilities();
        renderFacilityMarkers();

    } catch (error) {

        console.error("Facility refresh failed:", error);
    }
}


/* =========================================================================
   38. EVENT LISTENERS
   ========================================================================= */

function setupEventListeners() {

    DOM.locateButton?.addEventListener("click", requestUserLocation);

    DOM.closeFacilityModalButton?.addEventListener(
        "click",
        closeFacilityModal
    );

    DOM.cancelFacilityButton?.addEventListener(
        "click",
        closeFacilityModal
    );

    DOM.facilityModalBackdrop?.addEventListener(
        "click",
        closeFacilityModal
    );

    DOM.closeFacilityDetailsButton?.addEventListener(
        "click",
        closeFacilityDetails
    );

    DOM.facilityDetailsBackdrop?.addEventListener(
        "click",
        closeFacilityDetails
    );

    DOM.closeReportModalButton?.addEventListener(
        "click",
        closeReportModal
    );

    DOM.cancelReportButton?.addEventListener(
        "click",
        closeReportModal
    );

    DOM.reportModalBackdrop?.addEventListener(
        "click",
        closeReportModal
    );

    DOM.reportForm?.addEventListener("submit", submitReport);

    document.addEventListener("keydown", event => {

        if (event.key !== "Escape") return;

        if (DOM.reportModal &&
            !DOM.reportModal.classList.contains("hidden")) {
            closeReportModal();
            return;
        }

        if (DOM.facilityDetailsModal &&
            !DOM.facilityDetailsModal.classList.contains("hidden")) {
            closeFacilityDetails();
            return;
        }

        if (DOM.facilityModal &&
            !DOM.facilityModal.classList.contains("hidden")) {
            closeFacilityModal();
        }
    });

    DOM.useMyLocationButton?.addEventListener(
        "click",
        captureSubmissionLocation
    );

    DOM.facilityForm?.addEventListener("submit", submitFacility);

    DOM.facilityTypeFilter?.addEventListener("change", applyFilters);
    DOM.availabilityFilter?.addEventListener("change", applyFilters);
    DOM.capacityFilter?.addEventListener("change", applyFilters);

    DOM.searchRadiusSelect?.addEventListener("change", event => {
        setSearchRadius(event.target.value);
    });

    DOM.clearRouteButton?.addEventListener("click", clearRoute);

    DOM.zoomInButton?.addEventListener("click", () => {
        state.map?.zoomIn();
    });

    DOM.zoomOutButton?.addEventListener("click", () => {
        state.map?.zoomOut();
    });


    DOM.signInButton?.addEventListener("click", () => {
        window.location.href = "index.html";
    });

    DOM.signOutButton?.addEventListener("click", async () => {

        const confirmed = window.confirm("Sign out?");

        if (!confirmed) return;

        try {
            await signOut(auth);
        } catch (e) {
            console.warn("Sign out failed:", e);
        }

        window.location.href = "index.html";
    });

    DOM.adminDashboardButton?.addEventListener("click", () => {
        window.location.href = "admin.html";
    });
}


/* =========================================================================
   39. APPLICATION INITIALIZATION
   ========================================================================= */

function initializeApplication() {

    initializeMap();

    setupEventListeners();

    attachFilePreview(
        "facility-id-photo",
        "current-id-photo-preview"
    );

    attachFilePreview(
        "facility-center-photo",
        "current-center-photo-preview"
    );

    state.filters = {
        type: "all",
        status: "all",
        capacity: "all"
    };

    if (DOM.searchRadiusSelect) {
        DOM.searchRadiusSelect.value = String(state.searchRadiusKm);
    }

    watchAuthState();

    requestUserLocation();
}


/* =========================================================================
   40. START APPLICATION
   ========================================================================= */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApplication);
} else {
    initializeApplication();
}
