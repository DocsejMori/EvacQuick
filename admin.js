/* =========================================================================
   ADMIN DASHBOARD
   ========================================================================= */

import { auth } from "./auth.js";

import {
    db,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs
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

    activeTab: "Pending",

    selectedIds: new Set(),

    rejectTarget: null,

    rejectInProgress: false
};


/* =========================================================================
   DOM
   ========================================================================= */

const DOM = {

    adminEmail: document.getElementById("admin-email"),

    signOutBtn: document.getElementById("admin-signout-btn"),

    dashboard: document.getElementById("admin-dashboard"),

    denied: document.getElementById("admin-denied"),

    queue: document.getElementById("admin-queue"),

    refreshBtn: document.getElementById("admin-refresh-btn"),

    lightbox: document.getElementById("admin-lightbox"),

    lightboxImg: document.getElementById("admin-lightbox-img"),

    statPending: document.getElementById("stat-pending"),

    statApproved: document.getElementById("stat-approved"),

    statRejected: document.getElementById("stat-rejected"),

    statTotal: document.getElementById("stat-total"),

    reportCountBadge: document.getElementById("report-count-badge"),

    bulkApproveBtn: document.getElementById("admin-bulk-approve-btn"),

    exportCsvBtn: document.getElementById("admin-export-csv-btn"),

    bulkBar: document.getElementById("admin-bulk-bar"),

    selectAllCheckbox: document.getElementById("admin-select-all"),

    selectedCount: document.getElementById("admin-selected-count"),

    rejectModal: document.getElementById("admin-reject-modal"),

    rejectBackdrop: document.getElementById("admin-reject-backdrop"),

    rejectCloseBtn: document.getElementById("admin-reject-close-btn"),

    rejectCancelBtn: document.getElementById("admin-reject-cancel-btn"),

    rejectConfirmBtn: document.getElementById("admin-reject-confirm-btn"),

    rejectReason: document.getElementById("admin-reject-reason"),

    rejectMessage: document.getElementById("admin-reject-message"),

    rejectSubtitle: document.getElementById("admin-reject-subtitle")
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
            showDenied();
            return;
        }

        state.currentRole = await loadRole(user);

        if (state.currentRole !== "admin") {
            showDenied();
            return;
        }

        DOM.dashboard.classList.remove("hidden");
        DOM.denied.classList.add("hidden");

        if (DOM.adminEmail) {
            DOM.adminEmail.textContent = user.email || "admin";
        }

        await loadFacilities();
        await loadReports();
    });
}


function showDenied() {

    DOM.dashboard.classList.add("hidden");
    DOM.denied.classList.remove("hidden");
}


/* =========================================================================
   DATA — FACILITIES
   ========================================================================= */

async function loadFacilities() {

    if (DOM.queue) {
        DOM.queue.innerHTML =
            `<p class="admin-loading">Loading facilities…</p>`;
    }

    try {

        const snap = await getDocs(collection(db, "facilities"));

        state.facilities = [];

        snap.forEach(ds => {

            const data = ds.data();

            state.facilities.push({

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

                verificationStatus:
                    data.verificationStatus || "Pending",

                rejectionReason: data.rejectionReason || "",

                submittedBy: data.submittedBy || "",
                submittedByEmail: data.submittedByEmail || ""
            });
        });

        updateStats();
        renderQueue();

    } catch (e) {

        console.error("Failed to load facilities:", e);

        if (DOM.queue) {
            DOM.queue.innerHTML =
                `<p class="admin-error">Failed to load facilities: ${e.message}</p>`;
        }
    }
}


function updateStats() {

    const counts = {
        Pending: 0,
        Approved: 0,
        Rejected: 0,
        Total: state.facilities.length
    };

    for (const f of state.facilities) {

        if (counts[f.verificationStatus] !== undefined) {
            counts[f.verificationStatus]++;
        }
    }

    if (DOM.statPending) DOM.statPending.textContent = counts.Pending;
    if (DOM.statApproved) DOM.statApproved.textContent = counts.Approved;
    if (DOM.statRejected) DOM.statRejected.textContent = counts.Rejected;
    if (DOM.statTotal) DOM.statTotal.textContent = counts.Total;
}


/* =========================================================================
   DATA — REPORTS
   ========================================================================= */

async function loadReports() {

    try {

        const snap = await getDocs(collection(db, "reports"));

        state.reports = [];

        snap.forEach(ds => {

            const data = ds.data();

            state.reports.push({
                id: ds.id,
                facilityId: data.facilityId || "",
                facilityName: data.facilityName || "(unknown)",
                reportedBy: data.reportedBy || "",
                reportedByEmail: data.reportedByEmail || "",
                reason: data.reason || "",
                note: data.note || "",
                status: data.status || "open"
            });
        });

        const openCount =
            state.reports.filter(r => r.status === "open").length;

        if (DOM.reportCountBadge) {
            DOM.reportCountBadge.textContent = openCount;
            DOM.reportCountBadge.classList.toggle("hidden", openCount === 0);
        }

    } catch (e) {

        console.error("Failed to load reports:", e);
    }
}


/* =========================================================================
   BULK UI
   ========================================================================= */

function updateBulkUI() {

    const count = state.selectedIds.size;

    if (DOM.selectedCount) {
        DOM.selectedCount.textContent =
            count === 1 ? "1 selected" : `${count} selected`;
    }

    if (DOM.bulkApproveBtn) {
        DOM.bulkApproveBtn.hidden = count === 0;
    }

    if (DOM.bulkBar) {
        const pendingCount =
            state.facilities.filter(f =>
                f.verificationStatus === "Pending"
            ).length;

        DOM.bulkBar.hidden = pendingCount === 0;

        if (DOM.selectAllCheckbox) {
            DOM.selectAllCheckbox.checked =
                pendingCount > 0 && count === pendingCount;
        }
    }
}


/* =========================================================================
   RENDER QUEUE
   ========================================================================= */

function renderQueue() {

    if (!DOM.queue) return;

    if (state.activeTab === "Reports") {
        renderReports();
        updateBulkUI();
        return;
    }

    DOM.queue.innerHTML = "";

    let list = state.facilities;

    if (state.activeTab !== "All") {
        list = list.filter(f => f.verificationStatus === state.activeTab);
    }

    list = [...list].reverse();

    if (!list.length) {

        DOM.queue.innerHTML =
            `<p class="admin-empty">No facilities in this category.</p>`;

        updateBulkUI();
        return;
    }

    for (const f of list) {
        DOM.queue.appendChild(buildFacilityCard(f));
    }

    updateBulkUI();
}


function renderReports() {

    if (!DOM.queue) return;

    DOM.queue.innerHTML = "";

    if (!state.reports.length) {
        DOM.queue.innerHTML =
            `<p class="admin-empty">No reports yet.</p>`;
        return;
    }

    const sorted = [...state.reports].sort((a, b) => {

        if (a.status === "open" && b.status !== "open") return -1;
        if (a.status !== "open" && b.status === "open") return 1;

        return 0;
    });

    for (const r of sorted) {
        DOM.queue.appendChild(buildReportCard(r));
    }
}


/* =========================================================================
   FACILITY CARD
   ========================================================================= */

function buildFacilityCard(f) {

    const card = document.createElement("article");

    card.className = "admin-card";

    if (f.verificationStatus === "Approved") {
        card.classList.add("is-approved");
    } else if (f.verificationStatus === "Rejected") {
        card.classList.add("is-rejected");
    } else {
        card.classList.add("is-pending");
    }


    const header = document.createElement("div");
    header.className = "admin-card-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "admin-card-header-left";

    if (f.verificationStatus === "Pending") {

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "admin-card-checkbox";
        checkbox.dataset.id = f.id;
        checkbox.checked = state.selectedIds.has(f.id);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                state.selectedIds.add(f.id);
            } else {
                state.selectedIds.delete(f.id);
            }
            updateBulkUI();
        });

        headerLeft.appendChild(checkbox);
    }

    const title = document.createElement("h3");
    title.className = "admin-card-title";
    title.textContent = f.name;

    headerLeft.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "admin-badge";
    badge.textContent = f.verificationStatus;

    header.appendChild(headerLeft);
    header.appendChild(badge);


    const meta = document.createElement("div");
    meta.className = "admin-card-meta";

    addMeta(meta, "Manager", f.managerName);
    addMeta(meta, "Address", f.address);
    addMeta(meta, "Type", f.facilityType);
    addMeta(meta, "Capacity", `${f.currentOccupancy} / ${f.capacity} people`);
    addMeta(meta, "Status", f.status);
    addMeta(meta, "Real-Time", f.realTimeStatus);
    addMeta(meta, "Submitted by", f.submittedByEmail || f.submittedBy);
    addMeta(
        meta,
        "Coordinates",
        `${f.latitude.toFixed(5)}, ${f.longitude.toFixed(5)}`
    );

    if (f.contactNumber) addMeta(meta, "Contact", f.contactNumber);
    if (f.notes) addMeta(meta, "Notes", f.notes);


    const rejectNote = null;

    if (f.verificationStatus === "Rejected" && f.rejectionReason) {

        const note = document.createElement("div");
        note.className = "admin-reject-note";

        const label = document.createElement("strong");
        label.textContent = "Reason for rejection";

        const text = document.createElement("div");
        text.textContent = f.rejectionReason;

        note.appendChild(label);
        note.appendChild(text);

        card.appendChild(note);
    }


    const photos = document.createElement("div");
    photos.className = "admin-photos";

    if (f.idPhotoUrl) {
        photos.appendChild(buildPhoto(f.idPhotoUrl, "Photo of Valid ID"));
    } else {
        photos.appendChild(buildNoPhoto("No ID photo"));
    }

    if (f.centerPhotoUrl) {
        photos.appendChild(buildPhoto(f.centerPhotoUrl, "Photo of Facility"));
    } else {
        photos.appendChild(buildNoPhoto("No facility photo"));
    }


    const actions = document.createElement("div");
    actions.className = "admin-card-actions";


    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn btn-primary admin-approve";
    approveBtn.textContent = "✓ Approve";

    if (f.verificationStatus === "Approved") {
        approveBtn.disabled = true;
        approveBtn.title = "Already approved";
    } else {
        approveBtn.addEventListener("click", () => {
            setStatus(f.id, "Approved");
        });
    }

    actions.appendChild(approveBtn);


    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "btn btn-ghost admin-reject";
    rejectBtn.textContent = "✗ Reject";

    if (f.verificationStatus === "Rejected") {
        rejectBtn.disabled = true;
        rejectBtn.title = "Already rejected";
    } else {
        rejectBtn.addEventListener("click", () => {
            openRejectModal(f);
        });
    }

    actions.appendChild(rejectBtn);


    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-ghost admin-delete";
    deleteBtn.textContent = "🗑 Delete";

    deleteBtn.addEventListener("click", () => {
        confirmDelete(f);
    });

    actions.appendChild(deleteBtn);


    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(photos);
    card.appendChild(actions);

    return card;
}


/* =========================================================================
   REPORT CARD
   ========================================================================= */

function buildReportCard(r) {

    const card = document.createElement("article");

    card.className = "admin-card";

    if (r.status === "open") {
        card.classList.add("is-pending");
    } else if (r.status === "resolved") {
        card.classList.add("is-approved");
    } else {
        card.classList.add("is-rejected");
    }


    const header = document.createElement("div");
    header.className = "admin-card-header";

    const title = document.createElement("h3");
    title.className = "admin-card-title";
    title.textContent = r.facilityName;

    const badge = document.createElement("span");
    badge.className = "admin-badge";
    badge.textContent = r.status;

    header.appendChild(title);
    header.appendChild(badge);


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

        resolveBtn.addEventListener("click", () => {
            setReportStatus(r.id, "resolved");
        });

        actions.appendChild(resolveBtn);


        const dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "btn btn-ghost";
        dismissBtn.textContent = "Dismiss";

        dismissBtn.addEventListener("click", () => {
            setReportStatus(r.id, "dismissed");
        });

        actions.appendChild(dismissBtn);
    }


    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-ghost admin-delete";
    deleteBtn.textContent = "🗑 Delete report";

    deleteBtn.addEventListener("click", async () => {

        if (!confirm("Delete this report?")) return;

        try {
            await deleteDoc(doc(db, "reports", r.id));
            await loadReports();
            renderReports();
        } catch (e) {
            console.error(e);
            alert("Failed to delete report: " + e.message);
        }
    });

    actions.appendChild(deleteBtn);


    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(actions);

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

    row.appendChild(l);
    row.appendChild(v);

    parent.appendChild(row);
}


function buildPhoto(url, caption) {

    const wrapper = document.createElement("div");
    wrapper.className = "admin-photo";

    const img = document.createElement("img");
    img.src = url;
    img.alt = caption;
    img.loading = "lazy";

    img.addEventListener("click", () => {
        openPhotoLightbox(url);
    });

    const label = document.createElement("div");
    label.className = "admin-photo-label";
    label.textContent = caption;

    wrapper.appendChild(img);
    wrapper.appendChild(label);

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
   REJECT WITH REASON
   ========================================================================= */

function openRejectModal(f) {

    if (!DOM.rejectModal) return;

    state.rejectTarget = f;
    state.rejectInProgress = false;

    if (DOM.rejectReason) DOM.rejectReason.value = "";

    if (DOM.rejectSubtitle) {
        DOM.rejectSubtitle.textContent =
            `Rejecting: ${f.name}. This reason will be shown to the submitter.`;
    }

    if (DOM.rejectMessage) {
        DOM.rejectMessage.textContent = "";
        DOM.rejectMessage.classList.remove(
            "is-success", "is-error", "is-loading"
        );
    }

    if (DOM.rejectConfirmBtn) {
        DOM.rejectConfirmBtn.disabled = false;
        DOM.rejectConfirmBtn.textContent = "✗ Reject Facility";
    }

    DOM.rejectModal.classList.remove("hidden");
    DOM.rejectModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    setTimeout(() => DOM.rejectReason?.focus(), 50);
}


function closeRejectModal() {

    if (!DOM.rejectModal) return;

    DOM.rejectModal.classList.add("hidden");
    DOM.rejectModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";

    state.rejectTarget = null;
    state.rejectInProgress = false;
}


async function confirmReject() {

    if (state.rejectInProgress) return;
    if (!state.rejectTarget) return;

    const reason = String(DOM.rejectReason?.value || "").trim();

    if (!reason) {

        if (DOM.rejectMessage) {
            DOM.rejectMessage.textContent =
                "Please enter a reason for the rejection.";
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

        await updateDoc(
            doc(db, "facilities", target.id),
            {
                verificationStatus: "Rejected",
                rejectionReason: reason,
                rejectedAt: new Date(),
                rejectedBy: state.currentUser.uid,
                verifiedAt: new Date(),
                verifiedBy: state.currentUser.uid
            }
        );

        const f = state.facilities.find(x => x.id === target.id);

        if (f) {
            f.verificationStatus = "Rejected";
            f.rejectionReason = reason;
        }

        state.selectedIds.delete(target.id);

        updateStats();
        renderQueue();
        closeRejectModal();

    } catch (e) {

        console.error("Reject failed:", e);

        if (DOM.rejectMessage) {
            DOM.rejectMessage.textContent =
                "Could not save rejection: " + e.message;
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
   ACTIONS
   ========================================================================= */

async function setStatus(facilityId, status) {

    try {

        await updateDoc(
            doc(db, "facilities", facilityId),
            {
                verificationStatus: status,
                verifiedAt: new Date(),
                verifiedBy: state.currentUser.uid
            }
        );

        const f = state.facilities.find(x => x.id === facilityId);

        if (f) {
            f.verificationStatus = status;
        }

        state.selectedIds.delete(facilityId);

        updateStats();
        renderQueue();

    } catch (e) {

        console.error("Failed to update status:", e);

        alert("Could not update status: " + e.message);
    }
}


async function approveSelected() {

    const ids = Array.from(state.selectedIds);

    if (!ids.length) return;

    const ok = window.confirm(
        `Approve ${ids.length} facilit${ids.length > 1 ? "ies" : "y"}?`
    );

    if (!ok) return;

    if (DOM.bulkApproveBtn) {
        DOM.bulkApproveBtn.disabled = true;
        DOM.bulkApproveBtn.textContent =
            `Approving ${ids.length}…`;
    }

    try {

        for (const id of ids) {

            await updateDoc(
                doc(db, "facilities", id),
                {
                    verificationStatus: "Approved",
                    verifiedAt: new Date(),
                    verifiedBy: state.currentUser.uid
                }
            );

            const f = state.facilities.find(x => x.id === id);
            if (f) f.verificationStatus = "Approved";
        }

        state.selectedIds.clear();

        updateStats();
        renderQueue();

    } catch (e) {

        console.error("Bulk approve failed:", e);
        alert("Bulk approve failed: " + e.message);

    } finally {

        if (DOM.bulkApproveBtn) {
            DOM.bulkApproveBtn.disabled = false;
            DOM.bulkApproveBtn.textContent = "✓ Approve Selected";
        }
    }
}


function exportFacilitiesCSV() {

    if (!state.facilities.length) {
        alert("No facilities to export.");
        return;
    }

    const headers = [
        "Name",
        "Manager",
        "Address",
        "Type",
        "Capacity",
        "Current Occupancy",
        "Status",
        "Verification",
        "Latitude",
        "Longitude",
        "Contact",
        "Submitted By",
        "Notes",
        "Rejection Reason"
    ];

    const rows = state.facilities.map(f => [
        f.name,
        f.managerName,
        f.address,
        f.facilityType,
        f.capacity,
        f.currentOccupancy,
        f.status,
        f.verificationStatus,
        f.latitude,
        f.longitude,
        f.contactNumber,
        f.submittedByEmail,
        f.notes,
        f.rejectionReason || ""
    ]);

    const escape = (val) => {

        if (val === null || val === undefined) return "";

        const str = String(val).replace(/"/g, '""');

        return /[",\n]/.test(str) ? `"${str}"` : str;
    };

    const csv = [
        headers.map(escape).join(","),
        ...rows.map(r => r.map(escape).join(","))
    ].join("\n");

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `evacquick-facilities-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}


async function setReportStatus(reportId, status) {

    try {

        await updateDoc(
            doc(db, "reports", reportId),
            { status }
        );

        const r = state.reports.find(x => x.id === reportId);

        if (r) r.status = status;

        await loadReports();
        renderReports();

    } catch (e) {

        console.error("Failed to update report:", e);

        alert("Could not update report: " + e.message);
    }
}


async function confirmDelete(f) {

    const ok = window.confirm(
        `Delete "${f.name}"?\n\nThis cannot be undone.`
    );

    if (!ok) return;

    try {

        await deleteDoc(doc(db, "facilities", f.id));

        state.facilities = state.facilities.filter(x => x.id !== f.id);
        state.selectedIds.delete(f.id);

        updateStats();
        renderQueue();

    } catch (e) {

        console.error("Delete failed:", e);

        alert("Could not delete: " + e.message);
    }
}


/* =========================================================================
   PHOTO LIGHTBOX
   ========================================================================= */

function openPhotoLightbox(url) {

    if (!DOM.lightbox || !DOM.lightboxImg) return;

    if (!url) return;

    DOM.lightboxImg.onerror = () => {
        DOM.lightboxImg.src = "";
        DOM.lightboxImg.alt =
            "Photo unavailable — it may have been deleted";
    };

    DOM.lightboxImg.src = url;

    DOM.lightbox.classList.remove("hidden");

    DOM.lightbox.onclick = closePhotoLightbox;

    document.addEventListener("keydown", escapePhotoLightbox);
}


function closePhotoLightbox() {

    if (!DOM.lightbox) return;

    DOM.lightbox.classList.add("hidden");

    DOM.lightboxImg.src = "";

    document.removeEventListener("keydown", escapePhotoLightbox);
}


function escapePhotoLightbox(e) {

    if (e.key === "Escape") {
        closePhotoLightbox();
    }
}


/* =========================================================================
   EVENTS
   ========================================================================= */

function setupEvents() {

    DOM.signOutBtn?.addEventListener("click", async () => {

        try {
            await signOut(auth);
        } catch (e) {
            console.warn(e);
        }

        window.location.href = "index.html";
    });


    document.querySelectorAll(".admin-tab").forEach(btn => {

        btn.addEventListener("click", () => {

            document.querySelectorAll(".admin-tab")
                .forEach(b => b.classList.remove("is-active"));

            btn.classList.add("is-active");

            state.activeTab = btn.dataset.tab;

            renderQueue();
        });
    });


    DOM.refreshBtn?.addEventListener("click", async () => {

        await loadFacilities();
        await loadReports();
    });


    DOM.bulkApproveBtn?.addEventListener("click", approveSelected);

    DOM.exportCsvBtn?.addEventListener("click", exportFacilitiesCSV);

    DOM.selectAllCheckbox?.addEventListener("change", (e) => {

        const checked = e.target.checked;

        state.selectedIds.clear();

        if (checked) {
            state.facilities
                .filter(f => f.verificationStatus === "Pending")
                .forEach(f => state.selectedIds.add(f.id));
        }

        renderQueue();
    });


    DOM.rejectCloseBtn?.addEventListener("click", closeRejectModal);
    DOM.rejectCancelBtn?.addEventListener("click", closeRejectModal);
    DOM.rejectBackdrop?.addEventListener("click", closeRejectModal);
    DOM.rejectConfirmBtn?.addEventListener("click", confirmReject);

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && DOM.rejectModal &&
            !DOM.rejectModal.classList.contains("hidden")) {
            closeRejectModal();
        }
    });
}


/* =========================================================================
   BOOT
   ========================================================================= */

setupEvents();
watchAuth();