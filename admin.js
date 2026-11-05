/* =========================================================================
   ADMIN DASHBOARD — Firestore-Real-Time Notifications
   ========================================================================= */

import { auth } from "./auth.js";

import {
    db,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    serverTimestamp,
    onSnapshot,
    writeBatch,
    addDoc,
    query,
    where
} from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


/* =========================================================================
   STATE
   ========================================================================= */

const state = {
    currentUser: null,
    currentRole: null,
    facilities: [],
    reports: [],
    notifications: [],
    activeTab: "Pending",
    currentPage: "dashboard",
    searchTerm: "",
    sortOrder: "newest",
    pageNumber: 1,
    pageSize: 10,
    selectedFacilityId: null,
    selectedIds: new Set(),
    statusUpdatesInProgress: new Set(),
    rejectTarget: null,
    rejectInProgress: false,
    confirmation: null,
    confirmationInProgress: false,
    confirmationCloseTimer: null,
    confirmationOpener: null,
    facilitiesLoaded: false,
        pageLoadTime: Date.now(),
    facilitiesUnsubscribe: null,
    reportsUnsubscribe: null,
    notificationsUnsubscribe: null,
    
    chartYear: "all",
    chartStatus: "all",
    chartGranularity: "month",
    dateFilterStart: null,
    dateFilterEnd: null,
    dateFilterLabel: ""
};


/* =========================================================================
   DOM
   ========================================================================= */

const DOM = {
    adminEmail: document.getElementById("admin-email"),
    signOutBtn: document.getElementById("admin-signout-btn"),
    brandBtn: document.getElementById("admin-brand-btn"),
    dataStatus: document.getElementById("admin-data-status"),
    lastUpdated: document.getElementById("admin-last-updated"),
    dashboard: document.getElementById("admin-dashboard"),
    denied: document.getElementById("admin-denied"),
    queue: document.getElementById("admin-queue"),
    reportQueue: document.getElementById("admin-report-queue"),
    recentTable: document.getElementById("admin-recent-table"),
    applicationsTitle: document.getElementById("admin-applications-title"),
    applicationsDescription: document.getElementById("admin-applications-description"),
    search: document.getElementById("admin-search"),
    sort: document.getElementById("admin-sort"),
    clearFilters: document.getElementById("admin-clear-filters"),
    pageSummary: document.getElementById("admin-page-summary"),
    pageNumber: document.getElementById("admin-page-number"),
    pagePrevious: document.getElementById("admin-page-previous"),
    pageNext: document.getElementById("admin-page-next"),
    detailView: document.getElementById("admin-facility-details"),
    detailBack: document.getElementById("admin-details-back"),
    reportApprovalRate: document.getElementById("report-approval-rate"),
    reportRejectionRate: document.getElementById("report-rejection-rate"),
    reportPendingCount: document.getElementById("report-pending-count"),
    reportTotalCount: document.getElementById("report-total-count"),
    monthlyChart: document.getElementById("admin-monthly-chart"),
    monthlyChartState: document.getElementById("admin-monthly-chart-state"),
    chartYear: document.getElementById("admin-chart-year"),
    chartStatus: document.getElementById("admin-chart-status"),
    chartGranularity: document.getElementById("admin-chart-granularity"),
    notificationToggle: document.getElementById("admin-notification-toggle"),
    notificationCount: document.getElementById("admin-notification-count"),
    notificationPanel: document.getElementById("admin-notification-panel"),
    notificationSummary: document.getElementById("admin-notification-summary"),
    notificationList: document.getElementById("admin-notification-list"),
    notificationsReadAll: document.getElementById("admin-notifications-read-all"),
    refreshBtn: document.getElementById("admin-refresh-btn"),
    lightbox: document.getElementById("admin-lightbox"),
    lightboxImg: document.getElementById("admin-lightbox-img"),
    statPending: document.getElementById("stat-pending"),
    statPendingCaption: document.getElementById("stat-pending-caption"),
    statApproved: document.getElementById("stat-approved"),
    statRejected: document.getElementById("stat-rejected"),
    statTotal: document.getElementById("stat-total"),
    reportCountBadge: document.getElementById("report-count-badge"),
    bulkApproveBtn: document.getElementById("admin-bulk-approve-btn"),
    bulkRejectBtn: document.getElementById("admin-bulk-reject-btn"),
    exportCsvBtn: document.getElementById("admin-export-csv-btn"),
    bulkBar: document.getElementById("admin-bulk-bar"),
    bulkSelectAllLabel: document.getElementById("admin-select-all-label"),
    selectAllCheckbox: document.getElementById("admin-select-all"),
    selectedCount: document.getElementById("admin-selected-count"),
    activeDateFilter: document.getElementById("admin-active-date-filter"),
    activeDateFilterLabel: document.getElementById("admin-active-date-filter-label"),
    clearDateFilter: document.getElementById("admin-clear-date-filter"),
    rejectModal: document.getElementById("admin-reject-modal"),
    rejectBackdrop: document.getElementById("admin-reject-backdrop"),
    rejectCloseBtn: document.getElementById("admin-reject-close-btn"),
    rejectCancelBtn: document.getElementById("admin-reject-cancel-btn"),
    rejectConfirmBtn: document.getElementById("admin-reject-confirm-btn"),
    rejectReason: document.getElementById("admin-reject-reason"),
    rejectMessage: document.getElementById("admin-reject-message"),
    rejectSubtitle: document.getElementById("admin-reject-subtitle"),
    confirmationModal: document.getElementById("admin-confirmation-modal"),
    confirmationBackdrop: document.getElementById("admin-confirmation-backdrop"),
    confirmationTitle: document.getElementById("admin-confirmation-title"),
    confirmationDescription: document.getElementById("admin-confirmation-description"),
    confirmationIcon: document.getElementById("admin-confirmation-icon"),
    confirmationCancelBtn: document.getElementById("admin-confirmation-cancel"),
    confirmationConfirmBtn: document.getElementById("admin-confirmation-confirm"),
    toastRegion: document.getElementById("admin-toast-region")
};


/* =========================================================================
   AUTH
   ========================================================================= */

async function loadRole(user) {
    if (!user) return null;
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return null;
        const role = snap.data().role || "";
        return String(role).trim().toLowerCase();
    } catch (e) {
        console.error("Role lookup failed:", e);
        return null;
    }
}

function watchAuth() {
    onAuthStateChanged(auth, async user => {
        state.currentUser = user || null;

        if (!user) {
            cleanupSubscriptions();
            showDenied();
            return;
        }

        state.currentRole = await loadRole(user);

        if (state.currentRole !== "admin") {
            cleanupSubscriptions();
            showDenied();
            return;
        }

        DOM.dashboard.classList.remove("hidden");
        DOM.denied.classList.add("hidden");
        if (DOM.adminEmail) DOM.adminEmail.textContent = user.email || "admin";

        subscribeFacilities();
        subscribeReports();
        subscribeNotifications();
        syncStateFromURL();
    });
}

function cleanupSubscriptions() {
    state.facilitiesUnsubscribe?.();
    state.reportsUnsubscribe?.();
    state.notificationsUnsubscribe?.();
    state.facilitiesUnsubscribe = null;
    state.reportsUnsubscribe = null;
    state.notificationsUnsubscribe = null;
}

function showDenied() {
    DOM.dashboard.classList.add("hidden");
    DOM.denied.classList.remove("hidden");
}


/* =========================================================================
   URL STATE
   ========================================================================= */

function readURLParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab")) {
        const t = params.get("tab");
        if (["all", "pending", "approved", "rejected"].includes(t)) {
            state.activeTab = t === "all" ? "All" : t[0].toUpperCase() + t.slice(1);
        }
    }
    if (params.has("q")) state.searchTerm = params.get("q");
    if (params.has("year")) state.chartYear = params.get("year");
    if (params.has("cstatus")) state.chartStatus = params.get("cstatus");
    if (params.has("grain")) state.chartGranularity = params.get("grain");
}

function writeURLParams() {
    const params = new URLSearchParams();
    if (state.activeTab !== "Pending") params.set("tab", state.activeTab.toLowerCase());
    if (state.searchTerm) params.set("q", state.searchTerm);
    if (state.chartYear !== "all") params.set("year", state.chartYear);
    if (state.chartStatus !== "all") params.set("cstatus", state.chartStatus);
    if (state.chartGranularity !== "month") params.set("grain", state.chartGranularity);

    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
}

function syncStateFromURL() {
    readURLParams();
    if (DOM.search) DOM.search.value = state.searchTerm;
    if (DOM.chartYear) DOM.chartYear.value = state.chartYear;
    if (DOM.chartStatus) DOM.chartStatus.value = state.chartStatus;
    if (DOM.chartGranularity) DOM.chartGranularity.value = state.chartGranularity;
    syncPageFromHash();
}


/* =========================================================================
   DATA — FACILITIES
   ========================================================================= */

function mapFacilitySnapshot(snap) {
    return snap.docs.map(ds => {
        const data = ds.data();
        return {
            id: ds.id,
            name: data.name || "(no name)",
            managerName: data.managerName || "—",
            address: data.address || "—",
            facilityType: data.facilityType || "—",
            capacity: Number(data.capacity) || 0,
            currentOccupancy: Number(data.currentOccupancy) || 0,
            status: data.status || "Unknown",
            realTimeStatus: data.realTimeStatus || "Unknown",
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            idPhotoUrl: data.idPhotoUrl || null,
            centerPhotoUrl: data.centerPhotoUrl || null,
            notes: data.notes || "",
            contactNumber: data.contactNumber || "",
            verificationStatus: data.verificationStatus || data.status || "Pending",
            rejectionReason: data.rejectionReason || "",
            submittedBy: data.submittedBy || "",
            submittedByEmail: data.submittedByEmail || "",
            submittedAt: data.submittedAt || data.createdAt || null,
            statusUpdatedAt: data.statusUpdatedAt || data.rejectedAt || data.verifiedAt || null,
            verifiedAt: data.verifiedAt || null,
            rejectedAt: data.rejectedAt || null,
            verifiedBy: data.verifiedBy || "",
            rejectedBy: data.rejectedBy || "",
            previousVerificationStatus: data.previousVerificationStatus || null,
            decisionChangedAt: data.decisionChangedAt || null,
            decisionChangedBy: data.decisionChangedBy || ""
        };
    });
}

function subscribeFacilities() {
 if (state.facilitiesUnsubscribe) return;
    updateDataStatus("Connecting to application data…", "loading");

    state.facilitiesUnsubscribe = onSnapshot(
        collection(db, "facilities"),
        snap => {
            const newFacilities = mapFacilitySnapshot(snap);

            // 🔥 CHECK FOR NEW SUBMISSIONS
            if (state.facilitiesLoaded) {
                snap.docChanges().forEach(change => {
                    if (change.type === "added") {
                        const data = change.doc.data();
                        if (data.verificationStatus === "Pending") {
                            // Check if it was submitted after the admin opened the page
                            const submittedAt = data.submittedAt?.toDate()?.getTime() || Date.now();
                            
                            if (submittedAt > state.pageLoadTime) {
                                pushNotificationToDB(
                                    "New Facility Submitted",
                                    `${data.name || "A facility"} was submitted by ${data.managerName || "a resident"} and is pending review.`,
                                    change.doc.id
                                );
                            }
                        }
                    }
                });
            }

            state.facilities = newFacilities;
            state.facilitiesLoaded = true;
            updateDataStatus("Live updates connected");
            markDataUpdated();
            repopulateYearFilter();
            updateStats();
            renderQueue();
            renderReports();
            updateReportStats();
            if (state.currentPage === "details") renderFacilityDetails();
        },
        error => {
            console.error("Facility subscription failed:", error);
            showFacilityLoadError(error);
        }
    );
}

async function loadFacilities() {
    updateDataStatus("Refreshing application data…", "loading");
    try {
        const snap = await getDocs(collection(db, "facilities"));
        state.facilities = mapFacilitySnapshot(snap);
        state.facilitiesLoaded = true;
        repopulateYearFilter();
        updateStats();
        renderQueue();
        updateReportStats();
        if (state.currentPage === "details") renderFacilityDetails();
        updateDataStatus("Live updates connected");
        markDataUpdated();
    } catch (e) {
        console.error("Failed to load facilities:", e);
        showFacilityLoadError(e);
    }
}

function showFacilityLoadError(error) {
    state.facilitiesLoaded = false;
    updateDataStatus("Could not load application data", "error");
    const message = `Unable to load application data: ${error.message}`;

    if (DOM.monthlyChartState) setChartState(DOM.monthlyChartState, message, true);
    if (DOM.recentTable) setChartState(DOM.recentTable, message, true);
    if (DOM.queue) {
        const errorMessage = document.createElement("p");
        errorMessage.className = "admin-error";
        errorMessage.textContent = message;
        DOM.queue.replaceChildren(errorMessage);
    }
}

function getApplicationCounts() {
    const counts = { Total: state.facilities.length, Pending: 0, Approved: 0, Rejected: 0 };
    for (const facility of state.facilities) {
        if (Object.hasOwn(counts, facility.verificationStatus)) {
            counts[facility.verificationStatus]++;
        }
    }
    return counts;
}

function updateStats() {
    const counts = getApplicationCounts();

    if (DOM.statPending) DOM.statPending.textContent = counts.Pending;
    if (DOM.statApproved) DOM.statApproved.textContent = counts.Approved;
    if (DOM.statRejected) DOM.statRejected.textContent = counts.Rejected;
    if (DOM.statTotal) DOM.statTotal.textContent = counts.Total;

    if (DOM.statPendingCaption) {
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        let thisWeek = 0, lastWeek = 0;
        for (const f of state.facilities) {
            if (f.verificationStatus !== "Pending") continue;
            const d = parseApplicationDate(f.submittedAt);
            if (!d) continue;
            const age = now - d.getTime();
            if (age < weekMs) thisWeek++;
            else if (age < 2 * weekMs) lastWeek++;
        }
        const diff = thisWeek - lastWeek;
        let trendHtml = 'Awaiting review';
        if (diff > 0) trendHtml = `Awaiting review <span class="trend up">↑ ${diff}</span>`;
        else if (diff < 0) trendHtml = `Awaiting review <span class="trend down">↓ ${Math.abs(diff)}</span>`;
        DOM.statPendingCaption.innerHTML = trendHtml;
    }

    if (state.currentPage === "dashboard") {
        renderMonthlyChart();
        renderDashboardRecent();
    }
    updateReportStats();
}

function updateReportStats() {
    const counts = getApplicationCounts();
    const total = counts.Total;
    if (DOM.reportApprovalRate) DOM.reportApprovalRate.textContent = `${total ? Math.round((counts.Approved / total) * 100) : 0}%`;
    if (DOM.reportRejectionRate) DOM.reportRejectionRate.textContent = `${total ? Math.round((counts.Rejected / total) * 100) : 0}%`;
    if (DOM.reportPendingCount) DOM.reportPendingCount.textContent = String(counts.Pending);
    if (DOM.reportTotalCount) DOM.reportTotalCount.textContent = String(total);
}


/* =========================================================================
   NOTIFICATIONS — FIRESTORE REAL-TIME
   ========================================================================= */

function subscribeNotifications() {
    if (state.notificationsUnsubscribe) return;

    state.notificationsUnsubscribe = onSnapshot(
        collection(db, "notifications"),
        snap => {
            state.notifications = snap.docs.map(ds => {
                const data = ds.data();
                return {
                    id: ds.id,
                    facilityId: data.facilityId || "",
                    title: data.title || "",
                    message: data.message || "",
                    createdAt: data.createdAt?.toDate()?.getTime() || Date.now(),
                    read: data.read || false
                };
            }).sort((a, b) => b.createdAt - a.createdAt);

            renderNotifications();
        },
        error => {
            console.error("Notification subscription failed:", error);
        }
    );
}

async function pushNotificationToDB(title, message, facilityId) {
    try {
        await addDoc(collection(db, "notifications"), {
            title,
            message,
            facilityId: facilityId || "",
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to save notification:", error);
    }
}

function renderNotifications() {
    if (!DOM.notificationList) return;

    const notifications = state.notifications;
    const unread = notifications.filter(n => !n.read).length;

    if (DOM.notificationCount) {
        DOM.notificationCount.textContent = unread > 99 ? "99+" : String(unread);
        DOM.notificationCount.hidden = unread === 0;
    }
    if (DOM.notificationToggle) {
        DOM.notificationToggle.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
    }
    if (DOM.notificationSummary) {
        DOM.notificationSummary.textContent = unread ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "No unread notifications";
    }
    if (DOM.notificationsReadAll) {
        DOM.notificationsReadAll.disabled = unread === 0;
    }

    DOM.notificationList.replaceChildren();
    if (!notifications.length) {
        const empty = document.createElement("p");
        empty.className = "admin-notification-empty";
        empty.textContent = "No notifications yet.";
        DOM.notificationList.appendChild(empty);
        return;
    }

    for (const notification of notifications) {
        const item = document.createElement("article");
        item.className = "admin-notification-item";
        if (!notification.read) item.classList.add("is-unread");

        const open = document.createElement("button");
        open.type = "button";
        open.className = "admin-notification-open";
        open.addEventListener("click", () => {
            markNotificationRead(notification.id);
            DOM.notificationPanel.hidden = true;
            DOM.notificationToggle.setAttribute("aria-expanded", "false");
            if (notification.facilityId) viewFacility(notification.facilityId);
        });

        const title = document.createElement("strong");
        title.textContent = notification.title;
        const message = document.createElement("span");
        message.textContent = notification.message;
        const readStatus = document.createElement("span");
        readStatus.className = `admin-notification-status${notification.read ? "" : " is-unread"}`;
        readStatus.textContent = notification.read ? "Read" : "Unread";
        
        const time = document.createElement("time");
        time.dateTime = new Date(notification.createdAt).toISOString();
        time.textContent = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium", timeStyle: "short"
        }).format(new Date(notification.createdAt));
        
        open.append(title, message, readStatus, time);
        item.appendChild(open);

        if (!notification.read) {
            const markRead = document.createElement("button");
            markRead.type = "button";
            markRead.className = "admin-notification-mark-read";
            markRead.textContent = "Mark as read";
            markRead.addEventListener("click", () => markNotificationRead(notification.id));
            item.appendChild(markRead);
        } else {
            const readState = document.createElement("span");
            readState.className = "admin-notification-read-state";
            readState.textContent = "Read";
            item.appendChild(readState);
        }

        DOM.notificationList.appendChild(item);
    }
}

async function markNotificationRead(notificationId) {
    const n = state.notifications.find(x => x.id === notificationId);
    if (!n || n.read) return;
    
    n.read = true; 
    renderNotifications();
    
    try {
        await updateDoc(doc(db, "notifications", notificationId), { read: true });
    } catch (e) {
        console.error("Failed to mark read:", e);
    }
}

async function markAllNotificationsRead() {
    const unread = state.notifications.filter(n => !n.read);
    if (!unread.length) return;

    state.notifications.forEach(n => n.read = true);
    renderNotifications();

    const batch = writeBatch(db);
    unread.forEach(n => {
        batch.update(doc(db, "notifications", n.id), { read: true });
    });

    try {
        await batch.commit();
    } catch (e) {
        console.error("Failed to mark all read:", e);
    }
}

function updateDataStatus(message, status = "live") {
    if (!DOM.dataStatus) return;
    DOM.dataStatus.textContent = message;
    const indicator = DOM.dataStatus.parentElement?.querySelector(".admin-live-indicator");
    if (indicator) {
        indicator.classList.toggle("is-error", status === "error");
        indicator.classList.toggle("is-loading", status === "loading");
    }
}

function markDataUpdated() {
    if (!DOM.lastUpdated) return;
    DOM.lastUpdated.dateTime = new Date().toISOString();
    DOM.lastUpdated.textContent = new Intl.DateTimeFormat(undefined, {
        hour: "numeric", minute: "2-digit"
    }).format(new Date());
}


/* =========================================================================
   DATA — REPORTS
   ========================================================================= */

function subscribeReports() {
    if (state.reportsUnsubscribe) return;
    state.reportsUnsubscribe = onSnapshot(
        collection(db, "reports"),
        renderReportSnapshot,
        error => console.error("Report subscription failed:", error)
    );
}

async function loadReports() {
    try {
        const snap = await getDocs(collection(db, "reports"));
        renderReportSnapshot(snap);
    } catch (e) {
        console.error("Failed to load reports:", e);
    }
}

function renderReportSnapshot(snap) {
    state.reports = snap.docs.map(ds => {
        const data = ds.data();
        return {
            id: ds.id,
            facilityId: data.facilityId || "",
            facilityName: data.facilityName || "(unknown)",
            reportedBy: data.reportedBy || "",
            reportedByEmail: data.reportedByEmail || "",
            reason: data.reason || "",
            note: data.note || "",
            status: data.status || "open"
        };
    });

    const openCount = state.reports.filter(r => r.status === "open").length;
    if (DOM.reportCountBadge) {
        DOM.reportCountBadge.textContent = openCount;
        DOM.reportCountBadge.classList.toggle("hidden", openCount === 0);
    }
    if (state.currentPage === "reports") renderReports();
}


/* =========================================================================
   CHARTS
   ========================================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}, text = "") {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    if (text) element.textContent = text;
    return element;
}

function clearSvg(svg) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function setChartState(element, message = "", isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.hidden = !message;
}

function repopulateYearFilter() {
    if (!DOM.chartYear) return;
    const years = new Set();
    for (const f of state.facilities) {
        const d = parseApplicationDate(f.submittedAt);
        if (d) years.add(d.getFullYear());
    }
    years.add(new Date().getFullYear());
    const sorted = [...years].sort((a, b) => b - a);
    const current = DOM.chartYear.value || state.chartYear;

    DOM.chartYear.replaceChildren();
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All years";
    DOM.chartYear.appendChild(allOpt);

    for (const year of sorted) {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        DOM.chartYear.appendChild(opt);
    }

    const stillValid = [...DOM.chartYear.options].some(o => o.value === current);
    DOM.chartYear.value = stillValid ? current : "all";
    state.chartYear = DOM.chartYear.value;
}

function buildBuckets(year, granularity) {
    const now = new Date();
    const buckets = [];

    if (granularity === "month") {
        const months = [];
        if (year === "all") {
            for (let offset = 11; offset >= 0; offset--) {
                months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1));
            }
        } else {
            const y = Number(year);
            for (let m = 0; m < 12; m++) months.push(new Date(y, m, 1));
        }
        for (const d of months) {
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
            buckets.push({
                start: d, end,
                axisLabel: new Intl.DateTimeFormat(undefined, { month: "short" }).format(d),
                tooltip: new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d),
                startISO: d.toISOString(),
                endISO: end.toISOString(),
                count: 0
            });
        }
    } else if (granularity === "quarter") {
        const y = year === "all" ? now.getFullYear() : Number(year);
        for (let q = 0; q < 4; q++) {
            const start = new Date(y, q * 3, 1);
            const end = new Date(y, q * 3 + 3, 0, 23, 59, 59);
            buckets.push({
                start, end, axisLabel: `Q${q + 1}`, tooltip: `Q${q + 1} ${y}`,
                startISO: start.toISOString(), endISO: end.toISOString(), count: 0
            });
        }
    } else if (granularity === "week") {
        const monday = new Date(now);
        monday.setHours(0, 0, 0, 0);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        for (let w = 11; w >= 0; w--) {
            const start = new Date(monday);
            start.setDate(start.getDate() - w * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23, 59, 59);
            buckets.push({
                start, end,
                axisLabel: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start),
                tooltip: `Week of ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(start)}`,
                startISO: start.toISOString(), endISO: end.toISOString(), count: 0
            });
        }
    }
    return buckets;
}

function renderMonthlyChart() {
    if (!DOM.monthlyChart) return;
    clearSvg(DOM.monthlyChart);

    if (!state.facilitiesLoaded) {
        setChartState(DOM.monthlyChartState, "Loading application data…");
        return;
    }

    const filtered = state.facilities.filter(f => {
        if (state.chartStatus !== "all" && f.verificationStatus !== state.chartStatus) return false;
        const d = parseApplicationDate(f.submittedAt);
        if (!d) return false;
        if (state.chartYear !== "all" && d.getFullYear() !== Number(state.chartYear)) return false;
        return true;
    });

    const buckets = buildBuckets(state.chartYear, state.chartGranularity);
    for (const f of filtered) {
        const d = parseApplicationDate(f.submittedAt);
        if (!d) continue;
        const b = buckets.find(x => d >= x.start && d <= x.end);
        if (b) b.count++;
    }

    if (!buckets.length) {
        setChartState(DOM.monthlyChartState, "No buckets to display.");
        return;
    }

    const plot = { left: 48, top: 24, right: 744, bottom: 224 };
    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    const step = Math.max(1, Math.ceil(maxCount / 4));
    const maximum = step * 4;

    for (let tick = 0; tick <= 4; tick++) {
        const value = tick * step;
        const y = plot.bottom - (value / maximum) * (plot.bottom - plot.top);
        DOM.monthlyChart.append(
            createSvgElement("line", { x1: plot.left, y1: y, x2: plot.right, y2: y, class: "admin-chart-gridline" }),
            createSvgElement("text", { x: plot.left - 12, y: y + 4, "text-anchor": "end", class: "admin-chart-axis-label" }, String(value))
        );
    }

    const slot = (plot.right - plot.left) / buckets.length;
    const barWidth = Math.min(32, slot * 0.58);

    for (const [index, bucket] of buckets.entries()) {
        const barHeight = (bucket.count / maximum) * (plot.bottom - plot.top);
        const x = plot.left + index * slot + (slot - barWidth) / 2;
        const y = plot.bottom - barHeight;

        const bar = createSvgElement("rect", {
            x, y, width: barWidth, height: Math.max(1, barHeight), rx: 5,
            class: "admin-chart-bar", tabindex: 0, role: "graphics-symbol",
            "aria-label": `${bucket.tooltip}: ${bucket.count} applications`
        });
        bar.appendChild(createSvgElement("title", {}, bucket.tooltip));
        bar.style.cursor = "pointer";

        const startISO = bucket.startISO;
        const endISO = bucket.endISO;
        const label = bucket.tooltip;
        bar.addEventListener("click", () => {
            state.dateFilterStart = startISO;
            state.dateFilterEnd = endISO;
            state.dateFilterLabel = label;
            state.activeTab = "All";
            state.pageNumber = 1;
            if (DOM.activeDateFilter) {
                DOM.activeDateFilter.hidden = false;
                if (DOM.activeDateFilterLabel) DOM.activeDateFilterLabel.textContent = label;
            }
            window.location.hash = "all";
            renderQueue();
        });

        DOM.monthlyChart.append(
            bar,
            createSvgElement("text", { x: x + barWidth / 2, y: Math.max(plot.top + 13, y - 7), "text-anchor": "middle", class: "admin-chart-value-label" }, String(bucket.count)),
            createSvgElement("text", { x: x + barWidth / 2, y: plot.bottom + 26, "text-anchor": "middle", class: "admin-chart-category-label" }, bucket.axisLabel)
        );
    }

    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    const yearSuffix = state.chartYear !== "all" ? ` in ${state.chartYear}` : "";
    const statusSuffix = state.chartStatus !== "all" ? ` (${state.chartStatus.toLowerCase()})` : "";
    setChartState(
        DOM.monthlyChartState,
        total === 0
            ? `No applications match these filters${yearSuffix}${statusSuffix}.`
            : `Showing ${total} application${total === 1 ? "" : "s"}${yearSuffix}${statusSuffix}. Click a bar to filter the queue.`
    );
}

function renderDashboardRecent() {
    if (!DOM.recentTable) return;
    DOM.recentTable.replaceChildren();

    const recent = [...state.facilities]
        .sort((a, b) => {
            const da = parseApplicationDate(a.submittedAt)?.getTime() || 0;
            const db2 = parseApplicationDate(b.submittedAt)?.getTime() || 0;
            return db2 - da;
        })
        .slice(0, 5);

    if (!state.facilitiesLoaded || !recent.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = state.facilitiesLoaded ? "No applications have been submitted." : "Loading recent applications…";
        DOM.recentTable.appendChild(empty);
        return;
    }

    for (const facility of recent) {
        const row = document.createElement("div");
        row.className = "admin-recent-row";

        const name = listCell(facility.name, "Facility");
        name.classList.add("admin-recent-name");
        const manager = listCell(facility.managerName, "Manager");
        const location = listCell(facility.address, "Location");
        const date = listCell(formatActivityDate(facility.submittedAt), "Submitted");

        const status = document.createElement("div");
        status.className = "admin-list-status-cell";
        status.dataset.label = "Status";
        const badge = document.createElement("span");
        badge.className = `admin-badge admin-status-${facility.verificationStatus.toLowerCase()}`;
        badge.textContent = facility.verificationStatus;
        status.appendChild(badge);

        row.append(name, manager, location, date, status);
        row.addEventListener("click", () => viewFacility(facility.id));
        row.tabIndex = 0;
        row.setAttribute("role", "link");
        row.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                viewFacility(facility.id);
            }
        });
        DOM.recentTable.appendChild(row);
    }
}


/* =========================================================================
   QUEUE + FILTERS
   ========================================================================= */

function applyDateFilter(facility) {
    if (!state.dateFilterStart || !state.dateFilterEnd) return true;
    const d = parseApplicationDate(facility.submittedAt);
    if (!d) return false;
    const start = new Date(state.dateFilterStart);
    const end = new Date(state.dateFilterEnd);
    return d >= start && d <= end;
}

function renderQueue() {
    if (!DOM.queue) return;

    const query = state.searchTerm.trim().toLowerCase();
    let list = state.facilities.filter(f => {
        if (state.activeTab !== "All" && f.verificationStatus !== state.activeTab) return false;
        if (query && !([f.name, f.managerName, f.address].some(value => value.toLowerCase().includes(query)))) return false;
        return applyDateFilter(f);
    });

    list.sort((a, b) => {
        if (state.sortOrder === "name") return a.name.localeCompare(b.name);
        const ta = parseApplicationDate(a.submittedAt)?.getTime() || 0;
        const tb = parseApplicationDate(b.submittedAt)?.getTime() || 0;
        return state.sortOrder === "oldest" ? ta - tb : tb - ta;
    });

    const pageCount = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.pageNumber = Math.min(state.pageNumber, pageCount);
    const offset = (state.pageNumber - 1) * state.pageSize;
    const pageItems = list.slice(offset, offset + state.pageSize);

    DOM.queue.replaceChildren();

    if (!pageItems.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = state.facilitiesLoaded
            ? query ? "No applications match your search."
                : state.dateFilterStart ? "No applications in the selected time range."
                : state.activeTab === "All" ? "No applications have been submitted."
                : `No ${state.activeTab.toLowerCase()} applications.`
            : "Loading applications…";
        DOM.queue.appendChild(empty);
    } else {
        for (const facility of pageItems) DOM.queue.appendChild(buildFacilityCard(facility));
    }

    if (DOM.pageSummary) {
        DOM.pageSummary.textContent = list.length
            ? `Showing ${offset + 1}–${Math.min(offset + pageItems.length, list.length)} of ${list.length} applications`
            : "Showing 0 applications";
    }
    if (DOM.pageNumber) DOM.pageNumber.textContent = `Page ${state.pageNumber} of ${pageCount}`;
    if (DOM.pagePrevious) DOM.pagePrevious.disabled = state.pageNumber <= 1;
    if (DOM.pageNext) DOM.pageNext.disabled = state.pageNumber >= pageCount;
    if (DOM.applicationsTitle) DOM.applicationsTitle.textContent = `${state.activeTab} Applications`;
    
    if (DOM.applicationsDescription) {
        DOM.applicationsDescription.textContent = state.activeTab === "Pending"
            ? "Review new submissions and make a decision."
            : `Browse and manage ${state.activeTab.toLowerCase()} evacuation center applications.`;
    }

    if (DOM.clearFilters) {
        DOM.clearFilters.hidden = !(!!state.searchTerm || state.activeTab !== "Pending");
    }

    updateBulkUI();
}

function updateBulkUI() {
    const count = state.selectedIds.size;
    if (DOM.selectedCount) DOM.selectedCount.textContent = count === 1 ? "1 selected" : `${count} selected`;

    const inApplicablePage = state.currentPage === "applications" && state.activeTab === "Pending";

    if (DOM.bulkApproveBtn) DOM.bulkApproveBtn.hidden = count === 0 || !inApplicablePage;
    if (DOM.bulkRejectBtn) DOM.bulkRejectBtn.hidden = count === 0 || !inApplicablePage;

    if (DOM.bulkBar) {
        const pendingCount = state.facilities.filter(f => f.verificationStatus === "Pending").length;
        DOM.bulkBar.hidden = !inApplicablePage || pendingCount === 0;

        if (DOM.selectAllCheckbox) {
            DOM.selectAllCheckbox.checked = pendingCount > 0 && state.facilities.filter(f => f.verificationStatus === "Pending").every(f => state.selectedIds.has(f.id));
        }
    }
}


/* =========================================================================
   FACILITY CARD
   ========================================================================= */

function buildFacilityCard(f) {
    const card = document.createElement("article");
    card.className = "admin-card";
    card.classList.add(`is-${f.verificationStatus.toLowerCase()}`);

    const facilityCell = document.createElement("div");
    facilityCell.className = "admin-list-facility";

    if (f.verificationStatus === "Pending") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "admin-card-checkbox";
        checkbox.dataset.id = f.id;
        checkbox.checked = state.selectedIds.has(f.id);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) state.selectedIds.add(f.id);
            else state.selectedIds.delete(f.id);
            updateBulkUI();
        });
        facilityCell.appendChild(checkbox);
    }

    if (f.centerPhotoUrl) {
        const thumb = document.createElement("img");
        thumb.className = "admin-list-thumbnail";
        thumb.src = f.centerPhotoUrl;
        thumb.alt = `${f.name} facility`;
        thumb.loading = "lazy";
        thumb.addEventListener("click", () => viewFacility(f.id));
        facilityCell.appendChild(thumb);
    } else {
        const thumb = document.createElement("span");
        thumb.className = "admin-list-thumbnail admin-list-thumbnail-empty";
        thumb.setAttribute("aria-hidden", "true");
        thumb.textContent = f.name.slice(0, 1).toUpperCase();
        facilityCell.appendChild(thumb);
    }

    const facilityCopy = document.createElement("div");
    facilityCopy.className = "admin-list-facility-copy";
    const title = document.createElement("strong");
    title.textContent = f.name;
    const viewLink = document.createElement("button");
    viewLink.type = "button";
    viewLink.className = "admin-inline-link";
    viewLink.textContent = "View details";
    viewLink.addEventListener("click", () => viewFacility(f.id));
    facilityCopy.append(title, viewLink);
    facilityCell.appendChild(facilityCopy);

    const manager = listCell(f.managerName, "Manager");
    const location = listCell(f.address, "Location");
    const submitted = listCell(formatActivityDate(f.submittedAt), "Submitted");

    const statusCell = document.createElement("div");
    statusCell.className = "admin-list-status-cell";
    const badge = document.createElement("span");
    badge.className = `admin-badge admin-status-${f.verificationStatus.toLowerCase()}`;
    badge.textContent = f.verificationStatus;
    statusCell.appendChild(badge);

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";

    const busy = state.statusUpdatesInProgress.has(f.id);
    const makeBtn = (label, className, onClick, extraClass = "") => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-ghost ${extraClass}`.trim();
        btn.textContent = label;
        if (busy) btn.disabled = true;
        btn.addEventListener("click", onClick);
        return btn;
    };

    actions.appendChild(makeBtn("View", "", () => viewFacility(f.id)));

    if (f.verificationStatus === "Pending") {
        actions.appendChild(makeBtn("Approve", "admin-approve", () => requestApprove(f)));
        actions.appendChild(makeBtn("Reject", "admin-reject", () => requestReject(f)));
    } else if (f.verificationStatus === "Approved") {
        actions.appendChild(makeBtn("Reject instead", "admin-reject", () => requestReject(f)));
    } else if (f.verificationStatus === "Rejected") {
        actions.appendChild(makeBtn("Approve instead", "admin-approve", () => requestApprove(f)));
    }

    actions.appendChild(makeBtn("Delete", "admin-delete", () => confirmDelete(f)));

    card.append(facilityCell, manager, location, submitted, statusCell, actions);
    return card;
}

function listCell(value, label) {
    const cell = document.createElement("div");
    cell.className = "admin-list-cell";
    cell.dataset.label = label;
    cell.textContent = value || "—";
    cell.title = value || "";
    return cell;
}


/* =========================================================================
   REPORTS UI
   ========================================================================= */

function renderReports() {
    if (!DOM.reportQueue) return;
    DOM.reportQueue.replaceChildren();

    if (!state.reports.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = "No reports yet.";
        DOM.reportQueue.appendChild(empty);
        return;
    }

    const sorted = [...state.reports].sort((a, b) => {
        if (a.status === "open" && b.status !== "open") return -1;
        if (a.status !== "open" && b.status === "open") return 1;
        return 0;
    });

    for (const r of sorted) DOM.reportQueue.appendChild(buildReportCard(r));
}

function buildReportCard(r) {
    const card = document.createElement("article");
    card.className = "admin-report-card";
    if (r.status === "open") card.classList.add("is-pending");
    else if (r.status === "resolved") card.classList.add("is-approved");
    else card.classList.add("is-rejected");

    const header = document.createElement("div");
    header.className = "admin-card-header";
    const title = document.createElement("h3");
    title.className = "admin-card-title";
    title.textContent = r.facilityName;
    const badge = document.createElement("span");
    badge.className = "admin-badge";
    badge.textContent = r.status;
    header.append(title, badge);

    const meta = document.createElement("div");
    meta.className = "admin-card-meta";
    addMeta(meta, "Reason", r.reason);
    addMeta(meta, "Reported by", r.reportedByEmail || r.reportedBy);
    if (r.note) addMeta(meta, "Note", r.note);
    addMeta(meta, "Facility ID", r.facilityId);

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";

    if (r.status === "open") {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "btn btn-primary admin-approve";
        resolveBtn.textContent = "✓ Mark Resolved";
        resolveBtn.addEventListener("click", () => setReportStatus(r.id, "resolved"));
        actions.appendChild(resolveBtn);

        const dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "btn btn-ghost";
        dismissBtn.textContent = "Dismiss";
        dismissBtn.addEventListener("click", () => setReportStatus(r.id, "dismissed"));
        actions.appendChild(dismissBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-ghost admin-delete";
    deleteBtn.textContent = "🗑 Delete report";
    deleteBtn.addEventListener("click", () => {
        openConfirmationModal({
            title: "Delete Report?",
            description: "Are you sure you want to permanently delete this report? This action cannot be undone.",
            icon: "delete",
            confirmText: "Yes, Delete",
            tone: "delete",
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, "reports", r.id));
                    await loadReports();
                    if (state.currentPage === "reports") renderReports();
                    showAdminToast("Report deleted.", "success");
                    return true;
                } catch (e) {
                    console.error("Failed to delete report:", e);
                    showAdminToast("Could not delete report: " + e.message, "error");
                    return false;
                }
            }
        });
    });
    actions.appendChild(deleteBtn);

    card.append(header, meta, actions);
    return card;
}

function addMeta(parent, label, value) {
    const row = document.createElement("div");
    row.className = "admin-meta-row";
    const l = document.createElement("span");
    l.className = "admin-meta-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "admin-meta-value";
    v.textContent = value || "—";
    row.append(l, v);
    parent.appendChild(row);
}


/* =========================================================================
   DETAILS VIEW
   ========================================================================= */

function detailSection(title, fields) {
    const section = document.createElement("section");
    section.className = "admin-detail-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const grid = document.createElement("div");
    grid.className = "admin-detail-grid";
    for (const [label, value] of fields) {
        const field = document.createElement("div");
        field.className = "admin-detail-field";
        const name = document.createElement("span");
        name.textContent = label;
        const content = document.createElement("strong");
        content.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
        field.append(name, content);
        grid.appendChild(field);
    }
    section.append(heading, grid);
    return section;
}

function renderFacilityDetails() {
    if (!DOM.detailView) return;
    DOM.detailView.replaceChildren();

    const facility = state.facilities.find(item => item.id === state.selectedFacilityId);

    if (!facility) {
        const empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = state.facilitiesLoaded ? "This application could not be found. It may have been removed." : "Loading application details…";
        DOM.detailView.appendChild(empty);
        return;
    }

    const heading = document.createElement("header");
    heading.className = "admin-detail-heading";
    const titleGroup = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "admin-section-eyebrow";
    eyebrow.textContent = "APPLICATION DETAILS";
    const title = document.createElement("h2");
    title.textContent = facility.name;
    const status = document.createElement("span");
    status.className = `admin-badge admin-status-${facility.verificationStatus.toLowerCase()}`;
    status.textContent = facility.verificationStatus;
    titleGroup.append(eyebrow, title);

    if (facility.previousVerificationStatus && facility.previousVerificationStatus !== facility.verificationStatus && facility.decisionChangedAt) {
        const history = document.createElement("p");
        history.className = "admin-decision-history";
        history.textContent = `Previously ${facility.previousVerificationStatus.toLowerCase()} — changed to ${facility.verificationStatus.toLowerCase()} on ${formatActivityDate(facility.decisionChangedAt)}.`;
        titleGroup.appendChild(history);
    }

    heading.append(titleGroup, status);
    DOM.detailView.appendChild(heading);

    DOM.detailView.appendChild(detailSection("Facility information", [
        ["Facility type", facility.facilityType],
        ["Capacity", `${facility.capacity} people`],
        ["Current occupancy", `${facility.currentOccupancy} people`],
        ["Facility status", facility.status],
        ["Live status", facility.realTimeStatus],
        ["Submitted", formatActivityDate(facility.submittedAt)]
    ]));

    DOM.detailView.appendChild(detailSection("Manager and contact", [
        ["Manager", facility.managerName],
        ["Contact number", facility.contactNumber],
        ["Submitted by", facility.submittedByEmail || facility.submittedBy]
    ]));

    DOM.detailView.appendChild(detailSection("Location", [
        ["Address", facility.address],
        ["Latitude", Number.isFinite(facility.latitude) ? facility.latitude.toFixed(6) : "—"],
        ["Longitude", Number.isFinite(facility.longitude) ? facility.longitude.toFixed(6) : "—"]
    ]));

    if (facility.notes) DOM.detailView.appendChild(detailSection("Additional notes", [["Notes", facility.notes]]));

    if (facility.verificationStatus === "Rejected") {
        DOM.detailView.appendChild(detailSection("Review decision", [
            ["Rejection reason", facility.rejectionReason || "No reason recorded"],
            ["Reviewed", formatActivityDate(facility.statusUpdatedAt || facility.rejectedAt)]
        ]));
    } else if (facility.verificationStatus === "Approved") {
        DOM.detailView.appendChild(detailSection("Review decision", [
            ["Reviewed", formatActivityDate(facility.statusUpdatedAt || facility.verifiedAt)]
        ]));
    }

    const photos = document.createElement("section");
    photos.className = "admin-detail-section admin-detail-photos";
    const photosHeading = document.createElement("h3");
    photosHeading.textContent = "Uploaded images";
    const gallery = document.createElement("div");
    gallery.className = "admin-photos";
    gallery.append(
        facility.idPhotoUrl ? buildPhoto(facility.idPhotoUrl, "Photo of valid ID") : buildNoPhoto("No ID photo was uploaded"),
        facility.centerPhotoUrl ? buildPhoto(facility.centerPhotoUrl, "Evacuation facility") : buildNoPhoto("No facility photo was uploaded")
    );
    photos.append(photosHeading, gallery);
    DOM.detailView.appendChild(photos);

    const actions = document.createElement("div");
    actions.className = "admin-detail-actions";

    const busy = state.statusUpdatesInProgress.has(facility.id);
    const makeAction = (label, className, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn ${className}`.trim();
        btn.textContent = label;
        if (busy) btn.disabled = true;
        btn.addEventListener("click", onClick);
        return btn;
    };

    if (facility.verificationStatus === "Pending") {
        actions.appendChild(makeAction("Approve application", "btn-primary", () => requestApprove(facility)));
        actions.appendChild(makeAction("Reject application", "btn-ghost admin-reject", () => requestReject(facility)));
    } else if (facility.verificationStatus === "Approved") {
        actions.appendChild(makeAction("Reject instead", "btn-ghost admin-reject", () => requestReject(facility)));
    } else if (facility.verificationStatus === "Rejected") {
        actions.appendChild(makeAction("Approve instead", "btn-primary admin-approve", () => requestApprove(facility)));
    }

    actions.appendChild(makeAction("Delete application", "btn-ghost admin-delete", () => confirmDelete(facility)));
    DOM.detailView.appendChild(actions);
}

function buildPhoto(url, caption) {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-photo";
    const img = document.createElement("img");
    img.src = url;
    img.alt = caption;
    img.loading = "lazy";
    img.addEventListener("click", () => openPhotoLightbox(url));
    const label = document.createElement("div");
    label.className = "admin-photo-label";
    label.textContent = caption;
    wrapper.append(img, label);
    return wrapper;
}

function buildNoPhoto(caption) {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-photo is-empty";
    const empty = document.createElement("div");
    empty.className = "admin-photo-empty";
    empty.textContent = caption;
    wrapper.appendChild(empty);
    return wrapper;
}


/* =========================================================================
   ROUTING
   ========================================================================= */

function setAdminPage(page, options = {}) {
    const requested = ["dashboard", "all", "pending", "approved", "rejected", "reports", "details"].includes(page) ? page : "dashboard";

    state.currentPage = ["pending", "all", "approved", "rejected"].includes(requested) ? "applications" : requested;

    if (["pending", "approved", "rejected"].includes(requested)) {
        state.activeTab = requested[0].toUpperCase() + requested.slice(1);
        state.pageNumber = 1;
    }
    if (requested === "all") {
        state.activeTab = "All";
        state.pageNumber = 1;
    }

    for (const view of document.querySelectorAll("[data-page-view]")) {
        view.hidden = view.dataset.pageView !== state.currentPage;
    }

    for (const button of document.querySelectorAll(".admin-sidebar-nav [data-page]")) {
        const active = requested === button.dataset.page || (requested === "details" && button.dataset.page === state.activeTab.toLowerCase());
        button.classList.toggle("is-active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    }

    const pageTitle = requested === "details" ? "Application details"
        : requested === "reports" ? "Reports & Analytics"
        : requested === "dashboard" ? "Dashboard"
        : `${state.activeTab} Applications`;
    const title = document.querySelector(".admin-topbar-title h1");
    if (title) title.textContent = pageTitle;

    if (state.currentPage === "applications") renderQueue();
    if (state.currentPage === "reports") renderReports();
    if (state.currentPage === "details") renderFacilityDetails();
    if (state.currentPage === "dashboard") {
        renderMonthlyChart();
        renderDashboardRecent();
    }

    writeURLParams();
    if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: "auto" });
}

function viewFacility(facilityId) {
    state.selectedFacilityId = facilityId;
    window.location.hash = `application/${encodeURIComponent(facilityId)}`;
    setAdminPage("details");
}

function syncPageFromHash() {
    const route = window.location.hash.replace(/^#\/?/, "");
    const [page, id] = route.split("/");

    if (page === "application" && id) {
        state.selectedFacilityId = decodeURIComponent(id);
        setAdminPage("details");
        return;
    }
    setAdminPage(page || "dashboard");
}


/* =========================================================================
   ACTIONS — STATUS CHANGES + NOTIFICATIONS
   ========================================================================= */

const confirmationIcons = {
    approve: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/></svg>',
    reject: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'
};

function openConfirmationModal(options) {
    if (!DOM.confirmationModal || state.confirmationInProgress) return;
    clearTimeout(state.confirmationCloseTimer);
    state.confirmation = options;
    state.confirmationOpener = document.activeElement;
    DOM.confirmationTitle.textContent = options.title;
    DOM.confirmationDescription.textContent = options.description;
    DOM.confirmationIcon.innerHTML = confirmationIcons[options.icon] || confirmationIcons.approve;
    DOM.confirmationIcon.className = `admin-confirmation-icon is-${options.tone || "approve"}`;
    DOM.confirmationConfirmBtn.className = `btn admin-confirmation-confirm is-${options.tone || "approve"}`;
    DOM.confirmationConfirmBtn.textContent = options.confirmText || "Confirm";
    DOM.confirmationConfirmBtn.disabled = false;
    DOM.confirmationCancelBtn.disabled = false;
    DOM.confirmationModal.classList.remove("hidden", "is-closing");
    DOM.confirmationModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.body.classList.add("admin-modal-open");
    DOM.confirmationCancelBtn.focus();
}

function closeConfirmationModal(afterClose) {
    if (!DOM.confirmationModal || state.confirmationInProgress) return;
    const opener = state.confirmationOpener;
    state.confirmation = null;
    state.confirmationOpener = null;
    DOM.confirmationModal.setAttribute("aria-hidden", "true");
    DOM.confirmationModal.classList.add("is-closing");
    clearTimeout(state.confirmationCloseTimer);
    state.confirmationCloseTimer = setTimeout(() => {
        DOM.confirmationModal.classList.add("hidden");
        DOM.confirmationModal.classList.remove("is-closing");
        const rejectionOpen = DOM.rejectModal && !DOM.rejectModal.classList.contains("hidden");
        document.body.style.overflow = rejectionOpen ? "hidden" : "";
        document.body.classList.toggle("admin-modal-open", Boolean(rejectionOpen));
        if (afterClose) afterClose();
        else if (opener?.isConnected) opener.focus();
    }, 160);
}

async function confirmAdminAction() {
    const action = state.confirmation;
    if (!action || state.confirmationInProgress) return;
    state.confirmationInProgress = true;
    DOM.confirmationConfirmBtn.disabled = true;
    DOM.confirmationCancelBtn.disabled = true;
    DOM.confirmationConfirmBtn.textContent = action.processingText || "Working…";

    try {
        const succeeded = await action.onConfirm();
        if (succeeded !== false) {
            state.confirmationInProgress = false;
            closeConfirmationModal(action.afterConfirm);
            return;
        }
    } catch (error) {
        console.error("Confirmed action failed:", error);
        showAdminToast("Could not complete the action: " + error.message, "error");
    }

    state.confirmationInProgress = false;
    DOM.confirmationConfirmBtn.disabled = false;
    DOM.confirmationCancelBtn.disabled = false;
    DOM.confirmationConfirmBtn.textContent = action.confirmText || "Confirm";
}

function showAdminToast(message, type = "success") {
    if (!DOM.toastRegion) return;
    const toast = document.createElement("div");
    toast.className = `admin-toast is-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    DOM.toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

async function setStatus(facilityId, status) {
    if (state.statusUpdatesInProgress.has(facilityId)) return false;
    const facility = state.facilities.find(item => item.id === facilityId);
    if (!facility) {
        showAdminToast("This application is no longer available.", "error");
        return false;
    }
    if (facility.verificationStatus === status) {
        showAdminToast(`"${facility.name}" is already ${status.toLowerCase()}.`, "error");
        return false;
    }

    state.statusUpdatesInProgress.add(facilityId);
    renderQueue();
    if (state.currentPage === "details") renderFacilityDetails();

    try {
        const isFlip = ["Approved", "Rejected"].includes(facility.verificationStatus);
        const payload = {
            verificationStatus: status,
            statusUpdatedAt: serverTimestamp(),
            verifiedAt: serverTimestamp(),
            verifiedBy: state.currentUser.uid
        };
        if (isFlip) {
            payload.previousVerificationStatus = facility.verificationStatus;
            payload.decisionChangedAt = serverTimestamp();
            payload.decisionChangedBy = state.currentUser.uid;
        }
        if (status === "Approved") {
            payload.rejectionReason = "";
            payload.rejectedAt = null;
            payload.rejectedBy = "";
        }

        await updateDoc(doc(db, "facilities", facilityId), payload);
        
        // REMOVED REDUNDANT NOTIFICATION

        facility.verificationStatus = status;
        facility.statusUpdatedAt = new Date();
        facility.verifiedAt = new Date();
        if (status === "Approved") {
            facility.rejectionReason = "";
            facility.rejectedAt = null;
            facility.rejectedBy = "";
        }
        if (isFlip) {
            facility.previousVerificationStatus = facility.previousVerificationStatus || facility.verificationStatus;
            facility.decisionChangedAt = new Date();
        }

        state.selectedIds.delete(facilityId);
        updateStats();
        renderQueue();
        if (state.currentPage === "details") renderFacilityDetails();
        showAdminToast(`"${facility.name}" ${status.toLowerCase()}.`, "success");
        return true;

    } catch (e) {
        console.error("Failed to update status:", e);
        showAdminToast("Could not update status: " + e.message, "error");
        return false;
    } finally {
        state.statusUpdatesInProgress.delete(facilityId);
        renderQueue();
        if (state.currentPage === "details") renderFacilityDetails();
    }
}


/* =========================================================================
   BULK OPERATIONS
   ========================================================================= */

async function bulkUpdateStatus(ids, status) {
    if (!ids.length) return;

    const verb = status === "Approved" ? "Approve" : "Reject";
    const facilities = ids.map(id => state.facilities.find(facility => facility.id === id)).filter(Boolean);
    const description = facilities.length === 1
        ? `Are you sure you want to ${verb.toLowerCase()} "${facilities[0].name}"?`
        : `Are you sure you want to ${verb.toLowerCase()} these ${ids.length} selected facilities?`;
    openConfirmationModal({
        title: `${verb} ${ids.length === 1 ? "Application" : "Applications"}?`,
        description,
        icon: status === "Approved" ? "approve" : "reject",
        confirmText: `Yes, ${verb}`,
        tone: status === "Approved" ? "approve" : "reject",
        processingText: `${verb}ing…`,
        onConfirm: () => performBulkUpdateStatus(ids, status)
    });
}

async function performBulkUpdateStatus(ids, status) {
    const verb = status === "Approved" ? "Approve" : "Reject";
    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) chunks.push(ids.slice(i, i + 400));

    const btn = status === "Approved" ? DOM.bulkApproveBtn : DOM.bulkRejectBtn;
    const original = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.textContent = `${verb}ing ${ids.length}…`;
    }

    try {
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            for (const id of chunk) {
                const ref = doc(db, "facilities", id);
                const payload = {
                    verificationStatus: status,
                    statusUpdatedAt: serverTimestamp(),
                    verifiedAt: serverTimestamp(),
                    verifiedBy: state.currentUser.uid
                };
                if (status === "Approved") {
                    payload.rejectionReason = "";
                    payload.rejectedAt = null;
                    payload.rejectedBy = "";
                }
                batch.update(ref, payload);
            }
            await batch.commit();
        }
        
        // REMOVED REDUNDANT BULK NOTIFICATION

        for (const id of ids) {
            const f = state.facilities.find(x => x.id === id);
            if (f) {
                f.verificationStatus = status;
                f.statusUpdatedAt = new Date();
                f.verifiedAt = new Date();
                if (status === "Approved") {
                    f.rejectionReason = "";
                    f.rejectedAt = null;
                    f.rejectedBy = "";
                }
            }
        }

        state.selectedIds.clear();
        updateStats();
        renderQueue();
        showAdminToast(`${ids.length} application${ids.length === 1 ? "" : "s"} ${status.toLowerCase()}.`, "success");
        return true;
    } catch (e) {
        console.error("Bulk update failed:", e);
        showAdminToast("Bulk update failed: " + e.message, "error");
        return false;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = original;
        }
    }
}

async function approveSelected() { await bulkUpdateStatus(Array.from(state.selectedIds), "Approved"); }
async function rejectSelected() { await bulkUpdateStatus(Array.from(state.selectedIds), "Rejected"); }


/* =========================================================================
   REJECT MODAL
   ========================================================================= */

function requestApprove(facility) {
    openConfirmationModal({
        title: "Approve Application?",
        description: `Are you sure you want to approve "${facility.name}"? This application will be moved to Approved Applications and may become visible to residents.`,
        icon: "approve",
        confirmText: "Yes, Approve",
        tone: "approve",
        onConfirm: () => setStatus(facility.id, "Approved")
    });
}

function requestReject(facility) {
    openConfirmationModal({
        title: "Reject Application?",
        description: `Are you sure you want to reject "${facility.name}"? This application will be moved to Rejected Applications and will not be visible to residents.`,
        icon: "reject",
        confirmText: "Yes, Reject",
        tone: "reject",
        afterConfirm: () => openRejectModal(facility),
        onConfirm: async () => true
    });
}

function openRejectModal(f) {
    if (!DOM.rejectModal) return;

    state.rejectTarget = f;
    state.rejectInProgress = false;

    if (DOM.rejectReason) DOM.rejectReason.value = "";
    if (DOM.rejectSubtitle) DOM.rejectSubtitle.textContent = `Rejecting: ${f.name}. This reason will be shown to the submitter.`;
    if (DOM.rejectMessage) {
        DOM.rejectMessage.textContent = "";
        DOM.rejectMessage.classList.remove("is-success", "is-error", "is-loading");
    }
    if (DOM.rejectConfirmBtn) {
        DOM.rejectConfirmBtn.disabled = false;
        DOM.rejectConfirmBtn.textContent = "✗ Reject Facility";
    }

    DOM.rejectModal.classList.remove("hidden");
    DOM.rejectModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.body.classList.add("admin-modal-open");
    setTimeout(() => DOM.rejectReason?.focus(), 50);
}

function closeRejectModal(force = false) {
    if (!DOM.rejectModal || (state.rejectInProgress && !force)) return;
    DOM.rejectModal.classList.add("hidden");
    DOM.rejectModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    document.body.classList.toggle(
        "admin-modal-open",
        Boolean(DOM.confirmationModal && !DOM.confirmationModal.classList.contains("hidden"))
    );
    state.rejectTarget = null;
    state.rejectInProgress = false;
}

async function confirmReject() {
    if (state.rejectInProgress || !state.rejectTarget) return;

    const reason = String(DOM.rejectReason?.value || "").trim();
    if (!reason) {
        if (DOM.rejectMessage) {
            DOM.rejectMessage.textContent = "Please enter a reason for the rejection.";
            DOM.rejectMessage.classList.remove("is-loading", "is-success");
            DOM.rejectMessage.classList.add("is-error");
        }
        return;
    }

    state.rejectInProgress = true;
    if (DOM.rejectConfirmBtn) {
        DOM.rejectConfirmBtn.disabled = true;
        DOM.rejectConfirmBtn.textContent = "Rejecting…";
    }
    if (DOM.rejectMessage) {
        DOM.rejectMessage.textContent = "Saving rejection…";
        DOM.rejectMessage.classList.remove("is-error", "is-success");
        DOM.rejectMessage.classList.add("is-loading");
    }

    const target = state.rejectTarget;

    try {
        const isFlip = target.verificationStatus === "Approved";
        const payload = {
            verificationStatus: "Rejected",
            rejectionReason: reason,
            statusUpdatedAt: serverTimestamp(),
            rejectedAt: serverTimestamp(),
            rejectedBy: state.currentUser.uid
        };
        if (isFlip) {
            payload.previousVerificationStatus = "Approved";
            payload.decisionChangedAt = serverTimestamp();
            payload.decisionChangedBy = state.currentUser.uid;
        }

        await updateDoc(doc(db, "facilities", target.id), payload);
        
        // REMOVED REDUNDANT REJECTION NOTIFICATION

        const f = state.facilities.find(x => x.id === target.id);
        if (f) {
            if (isFlip) f.previousVerificationStatus = "Approved";
            f.verificationStatus = "Rejected";
            f.rejectionReason = reason;
            f.statusUpdatedAt = new Date();
            f.rejectedAt = new Date();
            if (isFlip) f.decisionChangedAt = new Date();
        }

        state.selectedIds.delete(target.id);
        updateStats();
        renderQueue();
        if (state.currentPage === "details") renderFacilityDetails();
        showAdminToast(`"${target.name}" rejected.`, "success");
        closeRejectModal(true);
    } catch (e) {
        console.error("Reject failed:", e);
        showAdminToast("Could not save rejection: " + e.message, "error");
        if (DOM.rejectMessage) {
            DOM.rejectMessage.textContent = "Could not save rejection: " + e.message;
            DOM.rejectMessage.classList.remove("is-loading");
            DOM.rejectMessage.classList.add("is-error");
        }
        if (DOM.rejectConfirmBtn) {
            DOM.rejectConfirmBtn.disabled = false;
            DOM.rejectConfirmBtn.textContent = "✗ Reject Facility";
        }
        state.rejectInProgress = false;
    }
}


/* =========================================================================
   DELETE
   ========================================================================= */

function confirmDelete(f) {
    openConfirmationModal({
        title: "Delete Application?",
        description: `Are you sure you want to permanently delete "${f.name}"? This action cannot be undone.`,
        icon: "delete",
        confirmText: "Yes, Delete",
        tone: "delete",
        onConfirm: () => deleteFacility(f)
    });
}

async function deleteFacility(f) {
    try {
        await deleteDoc(doc(db, "facilities", f.id));
        state.facilities = state.facilities.filter(x => x.id !== f.id);
        state.selectedIds.delete(f.id);

        if (state.selectedFacilityId === f.id) {
            window.location.hash = state.activeTab.toLowerCase();
            state.selectedFacilityId = null;
        }

        updateStats();
        renderQueue();
        showAdminToast(`"${f.name}" deleted.`, "success");
        return true;
    } catch (e) {
        console.error("Delete failed:", e);
        showAdminToast("Could not delete application: " + e.message, "error");
        return false;
    }
}


/* =========================================================================
   CSV EXPORT
   ========================================================================= */

function exportFacilitiesCSV() {
    if (!state.facilities.length) {
        showAdminToast("There are no facilities to export.", "error");
        return;
    }

    const headers = ["Name", "Manager", "Address", "Type", "Capacity", "Current Occupancy", "Status", "Verification", "Latitude", "Longitude", "Contact", "Submitted By", "Notes", "Rejection Reason"];
    const query = state.searchTerm.trim().toLowerCase();
    
    const selected = state.facilities.filter(f =>
        (state.currentPage !== "applications" || state.activeTab === "All" || f.verificationStatus === state.activeTab) &&
        (state.currentPage !== "applications" || !query || [f.name, f.managerName, f.address].some(value => value.toLowerCase().includes(query)))
    );

    const rows = selected.map(f => [
        f.name, f.managerName, f.address, f.facilityType, f.capacity,
        f.currentOccupancy, f.status, f.verificationStatus, f.latitude,
        f.longitude, f.contactNumber, f.submittedByEmail, f.notes, f.rejectionReason || ""
    ]);

    const escape = (val) => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return /[",\n]/.test(str) ? `"${str}"` : str;
    };

    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `evacquick-facilities-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}


/* =========================================================================
   REPORT ACTIONS
   ========================================================================= */

async function setReportStatus(reportId, status) {
    try {
        await updateDoc(doc(db, "reports", reportId), { status });
        const r = state.reports.find(x => x.id === reportId);
        if (r) r.status = status;
        await loadReports();
        if (state.currentPage === "reports") renderReports();
        showAdminToast(`Report marked ${status}.`, "success");
    } catch (e) {
        console.error("Failed to update report:", e);
        showAdminToast("Could not update report: " + e.message, "error");
    }
}


/* =========================================================================
   LIGHTBOX
   ========================================================================= */

function openPhotoLightbox(url) {
    if (!DOM.lightbox || !DOM.lightboxImg || !url) return;
    DOM.lightboxImg.onerror = () => {
        DOM.lightboxImg.src = "";
        DOM.lightboxImg.alt = "Photo unavailable — it may have been deleted";
    };
    DOM.lightboxImg.src = url;
    DOM.lightbox.classList.remove("hidden");
    DOM.lightbox.onclick = (e) => {
        if (e.target === DOM.lightbox) closePhotoLightbox();
    };
    document.addEventListener("keydown", escapePhotoLightbox);
}

function closePhotoLightbox() {
    if (!DOM.lightbox) return;
    DOM.lightbox.classList.add("hidden");
    DOM.lightboxImg.src = "";
    document.removeEventListener("keydown", escapePhotoLightbox);
}

function escapePhotoLightbox(e) {
    if (e.key === "Escape") closePhotoLightbox();
}


/* =========================================================================
   HELPERS
   ========================================================================= */

function parseApplicationDate(value) {
    if (!value) return null;
    let date;
    if (value instanceof Date) date = value;
    else if (typeof value.toDate === "function") date = value.toDate();
    else if (typeof value === "number" || typeof value === "string") date = new Date(value);
    else return null;
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatActivityDate(value) {
    const date = parseApplicationDate(value);
    if (!date) return "Date not recorded";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}


/* =========================================================================
   EVENTS
   ========================================================================= */

function setupEvents() {
    DOM.brandBtn?.addEventListener("click", () => { window.location.hash = "dashboard"; });

    DOM.signOutBtn?.addEventListener("click", async () => {
        try { await signOut(auth); } catch (e) { console.warn(e); }
        window.location.href = "index.html";
    });

    document.querySelectorAll(".admin-sidebar-nav [data-page]").forEach(btn => {
        btn.addEventListener("click", () => { window.location.hash = btn.dataset.page; });
    });

    document.querySelectorAll("[data-page-link]").forEach(button => {
        button.addEventListener("click", () => { window.location.hash = button.dataset.pageLink; });
    });

    window.addEventListener("hashchange", syncPageFromHash);
    window.addEventListener("popstate", syncPageFromHash);

    DOM.search?.addEventListener("input", () => {
        state.searchTerm = DOM.search.value;
        state.pageNumber = 1;
        renderQueue();
        writeURLParams();
    });

    DOM.sort?.addEventListener("change", () => {
        state.sortOrder = DOM.sort.value;
        state.pageNumber = 1;
        renderQueue();
    });

    DOM.clearFilters?.addEventListener("click", () => {
        state.searchTerm = "";
        if (DOM.search) DOM.search.value = "";
        state.activeTab = "All";
        state.pageNumber = 1;
        window.location.hash = "all";
        renderQueue();
        writeURLParams();
    });

    DOM.clearDateFilter?.addEventListener("click", () => {
        state.dateFilterStart = null;
        state.dateFilterEnd = null;
        state.dateFilterLabel = "";
        if (DOM.activeDateFilter) DOM.activeDateFilter.hidden = true;
        renderQueue();
    });

    DOM.pagePrevious?.addEventListener("click", () => {
        state.pageNumber = Math.max(1, state.pageNumber - 1);
        renderQueue();
    });

    DOM.pageNext?.addEventListener("click", () => {
        state.pageNumber++;
        renderQueue();
    });

    DOM.detailBack?.addEventListener("click", () => {
        window.location.hash = state.activeTab.toLowerCase();
    });

    DOM.chartYear?.addEventListener("change", () => {
        state.chartYear = DOM.chartYear.value;
        renderMonthlyChart();
        writeURLParams();
    });
    DOM.chartStatus?.addEventListener("change", () => {
        state.chartStatus = DOM.chartStatus.value;
        renderMonthlyChart();
        writeURLParams();
    });
    DOM.chartGranularity?.addEventListener("change", () => {
        state.chartGranularity = DOM.chartGranularity.value;
        renderMonthlyChart();
        writeURLParams();
    });

    DOM.notificationToggle?.addEventListener("click", () => {
        const willOpen = DOM.notificationPanel.hidden;
        DOM.notificationPanel.hidden = !willOpen;
        DOM.notificationToggle.setAttribute("aria-expanded", String(willOpen));
    });
    DOM.notificationsReadAll?.addEventListener("click", markAllNotificationsRead);

    document.addEventListener("click", event => {
        if (DOM.notificationPanel && !DOM.notificationPanel.hidden && !event.target.closest(".admin-notification-wrap")) {
            DOM.notificationPanel.hidden = true;
            DOM.notificationToggle?.setAttribute("aria-expanded", "false");
        }
    });

    document.querySelectorAll("[data-export-reports]").forEach(btn => {
        btn.addEventListener("click", exportFacilitiesCSV);
    });

    DOM.refreshBtn?.addEventListener("click", async () => {
        await loadFacilities();
        await loadReports();
    });

    DOM.bulkApproveBtn?.addEventListener("click", approveSelected);
    DOM.bulkRejectBtn?.addEventListener("click", rejectSelected);
    
    DOM.selectAllCheckbox?.addEventListener("change", (e) => {
        const checked = e.target.checked;
        state.selectedIds.clear();
        if (checked) {
            state.facilities.filter(f => f.verificationStatus === "Pending").forEach(f => state.selectedIds.add(f.id));
        }
        renderQueue();
    });

    DOM.rejectCloseBtn?.addEventListener("click", closeRejectModal);
    DOM.rejectCancelBtn?.addEventListener("click", closeRejectModal);
    DOM.rejectBackdrop?.addEventListener("click", closeRejectModal);
    DOM.rejectConfirmBtn?.addEventListener("click", confirmReject);
    DOM.confirmationCancelBtn?.addEventListener("click", () => closeConfirmationModal());
    DOM.confirmationBackdrop?.addEventListener("click", () => closeConfirmationModal());
    DOM.confirmationConfirmBtn?.addEventListener("click", confirmAdminAction);

    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (DOM.confirmationModal && !DOM.confirmationModal.classList.contains("hidden")) {
            closeConfirmationModal();
        } else if (DOM.rejectModal && !DOM.rejectModal.classList.contains("hidden")) {
            closeRejectModal();
        }
    });
}


/* =========================================================================
   BOOT
   ========================================================================= */

setupEvents();
watchAuth();