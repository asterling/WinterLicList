// Toronto Winterlicious / Summerlicious menu explorer
(() => {
    "use strict";

    const DATA_FILE = "menus-latest.json";
    const SEASON_FILE = "season.json";
    const FAVS_KEY = "winterlicious_favs";
    const THEME_KEY = "winterlicious_theme";

    const ALL_COURSES = ["appetizers", "main_dishes", "desserts"];
    const ALL_MEALS = ["Lunch", "Dinner"];

    // Cuisine → emoji + gradient stops.
    // Anything missing falls back to DEFAULT.
    const CUISINE_META = {
        Italian:        { emoji: "🍝", from: "#c0392b", to: "#7d1f12" },
        Canadian:       { emoji: "🍁", from: "#d62828", to: "#7c1313" },
        American:       { emoji: "🍔", from: "#2563eb", to: "#1e3a8a" },
        "Comfort Food": { emoji: "🥧", from: "#b45309", to: "#7c2d12" },
        Mediterranean: { emoji: "🫒", from: "#0d9488", to: "#115e59" },
        Asian:         { emoji: "🥡", from: "#dc2626", to: "#7f1d1d" },
        French:        { emoji: "🥐", from: "#7c3aed", to: "#3b0764" },
        Indian:        { emoji: "🍛", from: "#ea580c", to: "#7c2d12" },
        Japanese:      { emoji: "🍣", from: "#0f172a", to: "#1e293b" },
        Sushi:         { emoji: "🍣", from: "#0f172a", to: "#1e293b" },
        Seafood:       { emoji: "🦞", from: "#0369a1", to: "#0c4a6e" },
        Bistro:        { emoji: "🍷", from: "#6d28d9", to: "#3b0764" },
        Thai:          { emoji: "🌶️", from: "#16a34a", to: "#14532d" },
        European:      { emoji: "🍽️", from: "#475569", to: "#1e293b" },
        Steakhouse:    { emoji: "🥩", from: "#7f1d1d", to: "#450a0a" },
        Korean:        { emoji: "🥢", from: "#0f172a", to: "#312e81" },
        Mexican:       { emoji: "🌮", from: "#f59e0b", to: "#92400e" },
        "Middle Eastern": { emoji: "🥙", from: "#a16207", to: "#713f12" },
        Greek:         { emoji: "🇬🇷", from: "#1d4ed8", to: "#1e3a8a" },
        British:       { emoji: "🇬🇧", from: "#1e3a8a", to: "#0c1e3f" },
        Portuguese:    { emoji: "🐟", from: "#15803d", to: "#14532d" },
        International: { emoji: "🌍", from: "#0891b2", to: "#155e75" },
        Global:        { emoji: "🌍", from: "#0891b2", to: "#155e75" },
        Vegan:         { emoji: "🥗", from: "#16a34a", to: "#14532d" },
        Contemporary:  { emoji: "✨", from: "#334155", to: "#0f172a" },
        Fusion:        { emoji: "🔀", from: "#9333ea", to: "#4c1d95" },
        Spanish:       { emoji: "🥘", from: "#dc2626", to: "#7f1d1d" },
        Caribbean:     { emoji: "🌴", from: "#0d9488", to: "#134e4a" },
        Jamaican:      { emoji: "🌴", from: "#15803d", to: "#14532d" },
        Chinese:       { emoji: "🥟", from: "#dc2626", to: "#7f1d1d" },
        Argentinian:   { emoji: "🥩", from: "#0ea5e9", to: "#075985" },
        Brazilian:     { emoji: "🥩", from: "#16a34a", to: "#14532d" },
        "Latin American": { emoji: "🌶️", from: "#f59e0b", to: "#92400e" },
        Barbeque:      { emoji: "🔥", from: "#b91c1c", to: "#7f1d1d" },
        Southern:      { emoji: "🍗", from: "#a16207", to: "#713f12" },
        Burmese:       { emoji: "🍜", from: "#dc2626", to: "#7c2d12" },
        Malaysian:     { emoji: "🍜", from: "#dc2626", to: "#7c2d12" },
        Moroccan:      { emoji: "🥙", from: "#b45309", to: "#7c2d12" },
        "Iranian/Persian": { emoji: "🥙", from: "#a16207", to: "#713f12" },
        "Eastern European": { emoji: "🥟", from: "#475569", to: "#1e293b" },
        Georgian:      { emoji: "🥟", from: "#475569", to: "#1e293b" },
        Ukrainian:     { emoji: "🥟", from: "#1d4ed8", to: "#1e3a8a" },
        Venezuelan:    { emoji: "🫓", from: "#f59e0b", to: "#92400e" },
        Dutch:         { emoji: "🧀", from: "#ea580c", to: "#7c2d12" },
        Indonesian:    { emoji: "🍛", from: "#dc2626", to: "#7c2d12" },
        "Cajun/Creole": { emoji: "🦐", from: "#b91c1c", to: "#7f1d1d" },
        Peruvian:      { emoji: "🐟", from: "#dc2626", to: "#7c2d12" },
        "Pacific-inspired": { emoji: "🌺", from: "#0d9488", to: "#134e4a" },
        German:        { emoji: "🥨", from: "#a16207", to: "#713f12" },
        Filipino:      { emoji: "🍢", from: "#dc2626", to: "#7c2d12" },
        Egyptian:      { emoji: "🥙", from: "#b45309", to: "#7c2d12" },
        Continental:   { emoji: "🍽️", from: "#475569", to: "#1e293b" },
        Armenian:      { emoji: "🥙", from: "#a16207", to: "#713f12" },
        Hakka:         { emoji: "🥟", from: "#dc2626", to: "#7c2d12" },
    };
    const DEFAULT_META = { emoji: "🍽️", from: "#0056b3", to: "#003c80" };

    function cuisineMeta(r) {
        const list = Array.isArray(r.cuisines) ? r.cuisines : [];
        for (const c of list) if (CUISINE_META[c]) return { ...CUISINE_META[c], name: c };
        return { ...DEFAULT_META, name: list[0] || "" };
    }

    // ---------- State ----------
    let restaurants = [];
    let favorites = new Set();
    let map = null;
    let markerLayer = null; // L.markerClusterGroup
    let lastFiltered = [];
    let userPos = null; // {lat, lng} when geolocation granted
    let seasonMeta = null;

    // ---------- DOM ----------
    const $ = (id) => document.getElementById(id);
    const grid = $("restaurantGrid");
    const mapView = $("map-view");
    const searchInput = $("searchInput");
    const cuisineFilter = $("cuisineFilter");
    const neighbourhoodFilter = $("neighbourhoodFilter");
    const priceFilter = $("priceFilter");
    const vegFilter = $("vegFilter");
    const favFilter = $("favFilter");
    const michelinFilter = $("michelinFilter");
    const lunchFilter = $("lunchFilter");
    const dinnerFilter = $("dinnerFilter");
    const bookableFilter = $("bookableFilter");
    const sortBy = $("sortBy");
    const resultCount = $("result-count");
    const resetBtn = $("resetBtn");
    const surpriseBtn = $("surpriseBtn");
    const themeBtn = $("themeBtn");
    const nearMeBtn = $("nearMeBtn");
    const statsBanner = $("statsBanner");
    const cuisineTrigger = $("cuisineTrigger");
    const cuisinePopover = $("cuisinePopover");
    const fileInputContainer = $("file-input-container");
    const appContent = $("app-content");
    const statusMsg = $("status-message");
    const modalOverlay = $("modalOverlay");
    const closeModalBtn = $("closeModal");

    // ---------- Utilities ----------
    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function safeUrl(url) {
        if (!url) return "";
        const trimmed = String(url).trim();
        if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
        if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return "https://" + trimmed;
        return "";
    }

    // Strict variant for reservation fields. The City's data uses these fields
    // to hold any URL (OpenTable, Tock, Toast, SevenRooms, restaurant sites…),
    // and sometimes literal strings like "Reservations Available". Only accept
    // actual http(s) URLs so we never construct a broken link.
    function reservationUrl(value) {
        if (!value) return "";
        const trimmed = String(value).trim();
        return /^https?:\/\//i.test(trimmed) ? trimmed : "";
    }

    function hasVegOption(menu) {
        if (!menu) return false;
        return ALL_COURSES.some(
            (c) =>
                Array.isArray(menu[c]) &&
                menu[c].some((i) => i.vegetarian_opt === "Yes" || i.vegan_opt === "Yes")
        );
    }

    function isMichelin(r) {
        return !!(r && r.description && /\bmichelin\b/i.test(r.description));
    }

    function priceNumber(menu) {
        if (!menu || !menu.price) return null;
        const m = String(menu.price).match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
    }

    function dishHaystack(r) {
        if (r.__dishText !== undefined) return r.__dishText;
        const parts = [];
        for (const meal of ALL_MEALS) {
            const m = r[meal];
            if (!m) continue;
            for (const c of ALL_COURSES) {
                const items = m[c];
                if (!Array.isArray(items)) continue;
                for (const i of items) {
                    if (i.name) parts.push(i.name);
                    if (i.description) parts.push(i.description);
                }
            }
        }
        r.__dishText = parts.join(" \n ").toLowerCase();
        return r.__dishText;
    }

    function matchesSearch(r, term) {
        if (!term) return true;
        const name = (r.restaurant_name || "").toLowerCase();
        if (name.includes(term)) return true;
        const cuisines = Array.isArray(r.cuisines) ? r.cuisines.join(" ").toLowerCase() : "";
        if (cuisines.includes(term)) return true;
        const hoods = Array.isArray(r.neighbourhoods) ? r.neighbourhoods.join(" ").toLowerCase() : "";
        if (hoods.includes(term)) return true;
        return dishHaystack(r).includes(term);
    }

    function sortRestaurants(list, mode) {
        const byName = (a, b) =>
            (a.restaurant_name || "").localeCompare(b.restaurant_name || "");
        const byPrice = (meal, dir) => (a, b) => {
            const pa = priceNumber(a[meal]);
            const pb = priceNumber(b[meal]);
            if (pa === null && pb === null) return byName(a, b);
            if (pa === null) return 1;
            if (pb === null) return -1;
            return dir === "asc" ? pa - pb : pb - pa;
        };
        const byDistance = (a, b) => {
            const da = a.__dist; const db = b.__dist;
            if (da == null && db == null) return byName(a, b);
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db;
        };
        switch (mode) {
            case "name-asc":    return [...list].sort(byName);
            case "lunch-asc":   return [...list].sort(byPrice("Lunch", "asc"));
            case "lunch-desc":  return [...list].sort(byPrice("Lunch", "desc"));
            case "dinner-asc":  return [...list].sort(byPrice("Dinner", "asc"));
            case "dinner-desc": return [...list].sort(byPrice("Dinner", "desc"));
            case "distance":    return [...list].sort(byDistance);
            default:            return list;
        }
    }

    function haversineKm(a, b) {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    function computeDistances() {
        if (!userPos) return;
        for (const r of restaurants) {
            if (!r.geo_lat || !r.geo_long) { r.__dist = null; continue; }
            const lat = parseFloat(r.geo_lat);
            const lng = parseFloat(r.geo_long);
            if (isNaN(lat) || isNaN(lng)) { r.__dist = null; continue; }
            r.__dist = haversineKm(userPos, { lat, lng });
        }
    }

    function formatDistance(km) {
        if (km == null) return "";
        if (km < 1) return `${Math.round(km * 1000)} m`;
        return `${km.toFixed(km < 10 ? 1 : 0)} km`;
    }

    function requestNearMe() {
        if (!navigator.geolocation) { toast("Geolocation unavailable"); return; }
        nearMeBtn.disabled = true;
        nearMeBtn.textContent = "📍 Locating…";
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                computeDistances();
                const distOpt = sortBy.querySelector('option[value="distance"]');
                if (distOpt) distOpt.disabled = false;
                sortBy.value = "distance";
                nearMeBtn.classList.add("active");
                nearMeBtn.disabled = false;
                nearMeBtn.textContent = "📍 Near me";
                filterRestaurants();
                toast("Sorted by distance");
            },
            () => {
                nearMeBtn.disabled = false;
                nearMeBtn.textContent = "📍 Near me";
                toast("Location permission denied");
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
        );
    }

    nearMeBtn.addEventListener("click", requestNearMe);

    function slugify(s) {
        return String(s || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    function toast(msg) {
        const el = document.createElement("div");
        el.className = "toast";
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add("show"));
        setTimeout(() => {
            el.classList.remove("show");
            setTimeout(() => el.remove(), 250);
        }, 1800);
    }

    // ---------- Load ----------
    window.addEventListener("DOMContentLoaded", async () => {
        loadTheme();
        loadFavorites();
        applySeasonMetadata(await loadSeason());
        try {
            await loadData(DATA_FILE);
        } catch (e) {
            console.warn("Auto-fetch failed:", e);
            showFilePicker();
        }
    });

    async function loadSeason() {
        try {
            const r = await fetch(SEASON_FILE);
            if (!r.ok) return null;
            return await r.json();
        } catch { return null; }
    }

    function applySeasonMetadata(meta) {
        seasonMeta = meta;
        if (!meta) return;
        const label = meta.label || `${meta.season || ""} ${meta.year || ""}`.trim();
        if (label) {
            const title = $("seasonTitle");
            if (title) title.textContent = label;
            document.title = `${label} — Toronto Prix-Fixe Menus`;
        }
        const subtitle = $("seasonSubtitle");
        if (subtitle && meta.dates_label) {
            subtitle.textContent = `${meta.dates_label} · Explore Toronto's culinary celebration`;
        } else if (subtitle && (meta.dates_start && meta.dates_end)) {
            subtitle.textContent = `${formatDateRange(meta.dates_start, meta.dates_end)} · Explore Toronto's culinary celebration`;
        }
    }

    function formatDateRange(startIso, endIso) {
        try {
            const s = new Date(startIso + "T12:00:00");
            const e = new Date(endIso + "T12:00:00");
            const fmt = { month: "short", day: "numeric" };
            return `${s.toLocaleDateString("en-US", fmt)} – ${e.toLocaleDateString("en-US", fmt)}, ${e.getFullYear()}`;
        } catch {
            return `${startIso} – ${endIso}`;
        }
    }

    async function loadData(url) {
        statusMsg.textContent = "Loading menus...";
        statusMsg.style.display = "block";
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const data = await response.json();
        initApp(data);
        statusMsg.style.display = "none";
    }

    function showFilePicker() {
        statusMsg.textContent = "Could not auto-load data. Please use the file picker below.";
        statusMsg.classList.add("error-message");
        fileInputContainer.style.display = "block";
    }

    function showError(msg) {
        statusMsg.textContent = msg;
        statusMsg.classList.add("error-message");
        statusMsg.style.display = "block";
    }

    function initApp(data) {
        restaurants = data;
        populateFilters();
        renderCuisineChips();
        renderStatsBanner();
        applyUrlState();
        filterRestaurants();
        appContent.style.display = "block";
        openFromHash();
    }

    function isBookable(r) {
        return !!(reservationUrl(r.opentable_lunch) || reservationUrl(r.opentable_dinner) ||
                  reservationUrl(r.reservations_lunch) || reservationUrl(r.reservations_dinner));
    }

    // ---------- Stats banner ----------
    function renderStatsBanner() {
        const lunchPrices = restaurants.map((r) => priceNumber(r.Lunch)).filter((n) => n !== null);
        const dinnerPrices = restaurants.map((r) => priceNumber(r.Dinner)).filter((n) => n !== null);
        const vegCount = restaurants.filter((r) => hasVegOption(r.Lunch) || hasVegOption(r.Dinner)).length;
        const bookableCount = restaurants.filter(isBookable).length;

        const fmt = (n) => `$${Math.round(n)}`;
        const parts = [
            statHTML(restaurants.length, "Restaurants"),
        ];
        if (lunchPrices.length) parts.push(statHTML(`${fmt(Math.min(...lunchPrices))}–${fmt(Math.max(...lunchPrices))}`, "Lunch"));
        if (dinnerPrices.length) parts.push(statHTML(`${fmt(Math.min(...dinnerPrices))}–${fmt(Math.max(...dinnerPrices))}`, "Dinner"));
        parts.push(statHTML(vegCount, "Veg-friendly"));
        parts.push(statHTML(bookableCount, "Bookable"));
        if (seasonMeta && (seasonMeta.dates_label || (seasonMeta.dates_start && seasonMeta.dates_end))) {
            const label = seasonMeta.dates_label || formatDateRange(seasonMeta.dates_start, seasonMeta.dates_end);
            parts.push(statHTML(label, "Festival"));
        }

        statsBanner.innerHTML = parts.join('<span class="stat-sep">·</span>');
        statsBanner.hidden = false;
    }

    function statHTML(value, label) {
        return `<span class="stat"><strong>${escapeHtml(String(value))}</strong><span class="stat-label">${escapeHtml(label)}</span></span>`;
    }

    // ---------- Cuisine picker (trigger button + popover) ----------
    let cuisineList = []; // [{name, count}] sorted by frequency

    function renderCuisineChips() {
        const counts = new Map();
        restaurants.forEach((r) => {
            (r.cuisines || []).forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
        });
        cuisineList = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, count]) => ({ name, count }));

        updateTriggerLabel();
        renderPopoverGrid("");

        cuisineTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePopover();
        });

        cuisinePopover.addEventListener("click", (e) => {
            const chip = e.target.closest(".cuisine-chip");
            if (!chip) return;
            selectCuisine(chip.dataset.value || "");
            closePopover();
        });

        cuisinePopover.addEventListener("input", (e) => {
            if (e.target.classList.contains("cuisine-popover-search")) {
                renderPopoverGrid(e.target.value.trim().toLowerCase());
            }
        });

        document.addEventListener("click", (e) => {
            if (!cuisinePopover.classList.contains("open")) return;
            if (e.target.closest(".cuisine-picker")) return;
            closePopover();
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && cuisinePopover.classList.contains("open")) closePopover();
        });
    }

    function selectCuisine(value) {
        cuisineFilter.value = value;
        updateTriggerLabel();
        filterRestaurants();
    }

    function updateTriggerLabel() {
        const value = cuisineFilter.value || "";
        const emojiEl = cuisineTrigger.querySelector(".cuisine-trigger-emoji");
        const labelEl = cuisineTrigger.querySelector(".cuisine-trigger-label");
        if (!value) {
            emojiEl.textContent = "🍽️";
            labelEl.textContent = "All cuisines";
            cuisineTrigger.classList.remove("selected");
        } else {
            const meta = CUISINE_META[value] || DEFAULT_META;
            emojiEl.textContent = meta.emoji;
            labelEl.textContent = value;
            cuisineTrigger.classList.add("selected");
        }
    }

    function renderPopoverGrid(query) {
        const rows = [{ name: "", count: restaurants.length, emoji: "🍽️", label: "All cuisines" }];
        const filtered = query
            ? cuisineList.filter((c) => c.name.toLowerCase().includes(query))
            : cuisineList;
        filtered.forEach(({ name, count }) => {
            const meta = CUISINE_META[name] || DEFAULT_META;
            rows.push({ name, count, emoji: meta.emoji, label: name });
        });

        const grid = rows.map(({ name, count, emoji, label }) => chipHTML(name, label, count, emoji)).join("");
        cuisinePopover.innerHTML = `
            <input type="text" class="cuisine-popover-search" placeholder="Search cuisines…" value="${escapeHtml(query)}">
            ${filtered.length || !query
                ? `<div class="cuisine-popover-grid">${grid}</div>`
                : `<div class="cuisine-popover-empty">No cuisines match "${escapeHtml(query)}"</div>`}
        `;
        // Highlight the active cuisine inside the popover too
        const selected = cuisineFilter.value || "";
        cuisinePopover.querySelectorAll(".cuisine-chip").forEach((c) => {
            const dv = c.dataset.value || "";
            c.classList.toggle("active", dv === selected);
        });
    }

    function togglePopover() {
        if (cuisinePopover.classList.contains("open")) closePopover();
        else openPopover();
    }
    function openPopover() {
        renderPopoverGrid("");
        cuisinePopover.classList.add("open");
        cuisineTrigger.setAttribute("aria-expanded", "true");
        const search = cuisinePopover.querySelector(".cuisine-popover-search");
        if (search) setTimeout(() => search.focus(), 0);
    }
    function closePopover() {
        cuisinePopover.classList.remove("open");
        cuisineTrigger.setAttribute("aria-expanded", "false");
    }

    function chipHTML(value, label, count, emoji) {
        return `<button class="cuisine-chip" data-value="${escapeHtml(value)}" type="button">
            <span>${emoji}</span><span>${escapeHtml(label)}</span><span class="chip-count">${count}</span>
        </button>`;
    }

    function updateActiveChip() {
        updateTriggerLabel();
        if (cuisinePopover.classList.contains("open")) {
            const value = cuisineFilter.value || "";
            cuisinePopover.querySelectorAll(".cuisine-chip").forEach((c) => {
                c.classList.toggle("active", (c.dataset.value || "") === value);
            });
        }
    }

    // File picker fallback
    $("jsonFile").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                initApp(data);
                fileInputContainer.style.display = "none";
                statusMsg.style.display = "none";
            } catch (err) {
                showError("Invalid JSON file.");
            }
        };
        reader.readAsText(file);
    });

    // ---------- URL state + deep links ----------
    function applyUrlState() {
        const params = new URLSearchParams(window.location.search);
        if (params.has("q")) searchInput.value = params.get("q");
        if (params.has("cuisine")) cuisineFilter.value = params.get("cuisine");
        if (params.has("hood")) neighbourhoodFilter.value = params.get("hood");
        if (params.has("price")) priceFilter.value = params.get("price");
        if (params.get("veg") === "1") vegFilter.checked = true;
        if (params.get("fav") === "1") favFilter.checked = true;
        if (params.get("michelin") === "1") michelinFilter.checked = true;
        if (params.get("lunch") === "1") lunchFilter.checked = true;
        if (params.get("dinner") === "1") dinnerFilter.checked = true;
        if (params.get("bookable") === "1") bookableFilter.checked = true;
        if (params.has("sort") && params.get("sort") !== "distance") sortBy.value = params.get("sort");
        updateActiveChip();
        if (params.get("view") === "map") {
            // delay till app is visible
            requestAnimationFrame(() => switchView("map"));
        }
    }

    function updateUrlState() {
        const params = new URLSearchParams();
        if (searchInput.value) params.set("q", searchInput.value);
        if (cuisineFilter.value) params.set("cuisine", cuisineFilter.value);
        if (neighbourhoodFilter.value) params.set("hood", neighbourhoodFilter.value);
        if (priceFilter.value) params.set("price", priceFilter.value);
        if (vegFilter.checked) params.set("veg", "1");
        if (favFilter.checked) params.set("fav", "1");
        if (michelinFilter.checked) params.set("michelin", "1");
        if (lunchFilter.checked) params.set("lunch", "1");
        if (dinnerFilter.checked) params.set("dinner", "1");
        if (bookableFilter.checked) params.set("bookable", "1");
        if (sortBy.value && sortBy.value !== "default" && sortBy.value !== "distance") params.set("sort", sortBy.value);
        if (currentView === "map") params.set("view", "map");
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
        history.replaceState(null, "", newUrl);
    }

    function findRestaurantByHash(hash) {
        if (!hash) return null;
        const value = hash.replace(/^#/, "").replace(/^r=/, "").trim();
        if (!value) return null;
        return (
            restaurants.find((r) => r.id === value) ||
            restaurants.find((r) => slugify(r.restaurant_name) === value) ||
            null
        );
    }

    function openFromHash() {
        const r = findRestaurantByHash(window.location.hash);
        if (r) openModal(r);
    }

    window.addEventListener("hashchange", openFromHash);

    // ---------- Theme ----------
    function loadTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
        updateThemeButton();
    }
    function toggleTheme() {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        if (isDark) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem(THEME_KEY, "light");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem(THEME_KEY, "dark");
        }
        updateThemeButton();
    }
    function updateThemeButton() {
        if (!themeBtn) return;
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        themeBtn.textContent = isDark ? "☀️" : "🌙";
    }
    themeBtn.addEventListener("click", toggleTheme);

    // ---------- Favorites ----------
    function loadFavorites() {
        const saved = localStorage.getItem(FAVS_KEY);
        if (saved) {
            try { favorites = new Set(JSON.parse(saved)); } catch {}
        }
    }
    function toggleFavorite(id) {
        if (favorites.has(id)) favorites.delete(id);
        else favorites.add(id);
        localStorage.setItem(FAVS_KEY, JSON.stringify([...favorites]));
        filterRestaurants();
    }

    // ---------- Filters ----------
    function populateFilters() {
        const cuisines = new Set();
        const hoods = new Set();
        const prices = new Set();

        restaurants.forEach((r) => {
            if (Array.isArray(r.cuisines)) r.cuisines.forEach((c) => cuisines.add(c));
            if (Array.isArray(r.neighbourhoods)) r.neighbourhoods.forEach((n) => hoods.add(n));
            if (r.Lunch && r.Lunch.price) prices.add("Lunch " + r.Lunch.price);
            if (r.Dinner && r.Dinner.price) prices.add("Dinner " + r.Dinner.price);
        });

        const sortedCuisines = [...cuisines].sort();
        const sortedHoods = [...hoods].sort();
        const sortedPrices = [...prices].sort((a, b) => {
            const typeA = a.split(" ")[0];
            const typeB = b.split(" ")[0];
            if (typeA !== typeB) return typeA === "Lunch" ? -1 : 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

        appendOptions(cuisineFilter, sortedCuisines);
        appendOptions(neighbourhoodFilter, sortedHoods);
        appendOptions(priceFilter, sortedPrices);

        [searchInput, cuisineFilter, neighbourhoodFilter, priceFilter, vegFilter, favFilter,
         michelinFilter, lunchFilter, dinnerFilter, bookableFilter, sortBy]
            .forEach((el) => el.addEventListener(el === searchInput ? "input" : "change", filterRestaurants));
    }

    function appendOptions(selectEl, items) {
        items.forEach((value) => {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value;
            selectEl.appendChild(opt);
        });
    }

    function hasAnyFilter() {
        return !!(
            searchInput.value ||
            cuisineFilter.value ||
            neighbourhoodFilter.value ||
            priceFilter.value ||
            vegFilter.checked ||
            favFilter.checked ||
            michelinFilter.checked ||
            lunchFilter.checked ||
            dinnerFilter.checked ||
            bookableFilter.checked
        );
    }

    function resetFilters() {
        searchInput.value = "";
        cuisineFilter.value = "";
        neighbourhoodFilter.value = "";
        priceFilter.value = "";
        vegFilter.checked = false;
        favFilter.checked = false;
        michelinFilter.checked = false;
        lunchFilter.checked = false;
        dinnerFilter.checked = false;
        bookableFilter.checked = false;
        sortBy.value = "default";
        updateActiveChip();
        filterRestaurants();
    }

    resetBtn.addEventListener("click", resetFilters);

    function filterRestaurants() {
        const term = searchInput.value.toLowerCase();
        const cuisine = cuisineFilter.value;
        const hood = neighbourhoodFilter.value;
        const price = priceFilter.value;
        const onlyVeg = vegFilter.checked;
        const onlyFav = favFilter.checked;
        const onlyMichelin = michelinFilter.checked;

        const filtered = restaurants.filter((r) => {
            if (!matchesSearch(r, term)) return false;
            if (cuisine && !(Array.isArray(r.cuisines) && r.cuisines.includes(cuisine))) return false;
            if (hood && !(Array.isArray(r.neighbourhoods) && r.neighbourhoods.includes(hood))) return false;
            if (price) {
                const [pType, pVal] = price.split(" ");
                const target = pType === "Lunch" ? r.Lunch : r.Dinner;
                if (!target || target.price !== pVal) return false;
            }
            if (onlyVeg && !hasVegOption(r.Lunch) && !hasVegOption(r.Dinner)) return false;
            if (onlyFav && !favorites.has(r.id)) return false;
            if (onlyMichelin && !isMichelin(r)) return false;
            if (lunchFilter.checked && !r.Lunch) return false;
            if (dinnerFilter.checked && !r.Dinner) return false;
            if (bookableFilter.checked && !isBookable(r)) return false;
            return true;
        });

        const sorted = sortRestaurants(filtered, sortBy.value);
        lastFiltered = sorted;

        updateActiveChip();
        updateUrlState();

        resultCount.textContent =
            sorted.length === restaurants.length
                ? `${sorted.length} restaurants`
                : `${sorted.length} of ${restaurants.length} restaurants`;
        resetBtn.hidden = !hasAnyFilter();

        if (currentView === "map") {
            renderGrid(sorted); // keep grid in sync for fast toggle
            updateMap(sorted);
        } else {
            renderGrid(sorted);
        }
    }

    // ---------- View switching ----------
    let currentView = "list";
    const btnListView = $("btnListView");
    const btnMapView = $("btnMapView");

    function switchView(view) {
        currentView = view;
        if (view === "map") {
            btnMapView.classList.add("active");
            btnListView.classList.remove("active");
            grid.style.display = "none";
            mapView.style.display = "block";
            initMap();
        } else {
            btnListView.classList.add("active");
            btnMapView.classList.remove("active");
            grid.style.display = "grid";
            mapView.style.display = "none";
        }
        filterRestaurants();
    }

    btnListView.addEventListener("click", () => switchView("list"));
    btnMapView.addEventListener("click", () => switchView("map"));

    // ---------- Grid ----------
    function renderGrid(data) {
        grid.innerHTML = "";
        if (data.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);";
            empty.innerHTML = `<p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No matches.</p>
                <button class="link-btn" id="emptyReset">Reset filters</button>`;
            grid.appendChild(empty);
            $("emptyReset").addEventListener("click", resetFilters);
            return;
        }
        const frag = document.createDocumentFragment();
        data.forEach((r) => frag.appendChild(buildCard(r)));
        grid.appendChild(frag);
    }

    function buildCard(r) {
        const meta = cuisineMeta(r);
        const name = r.restaurant_name || "Unknown Restaurant";
        const hood = Array.isArray(r.neighbourhoods) ? r.neighbourhoods[0] : r.neighbourhoods || "";
        const cuisineLabel = Array.isArray(r.cuisines) && r.cuisines.length ? r.cuisines[0] : "";
        const isFavorite = favorites.has(r.id);

        const lunchP = r.Lunch && r.Lunch.price;
        const dinnerP = r.Dinner && r.Dinner.price;

        const badges = [];
        if (cuisineLabel) badges.push(`<span class="badge cuisine">${escapeHtml(cuisineLabel)}</span>`);
        if (hood) badges.push(`<span class="badge hood">📍 ${escapeHtml(hood)}</span>`);
        if (r.__dist != null) badges.push(`<span class="badge distance" title="From your location">📏 ${escapeHtml(formatDistance(r.__dist))}</span>`);
        if (isMichelin(r)) badges.push(`<span class="badge michelin">⭐ Michelin</span>`);
        if (r.accessible_opt === "Yes") badges.push(`<span class="badge access" title="Wheelchair accessible">♿ Accessible</span>`);
        if (r.hotel_name) badges.push(`<span class="badge hotel" title="Inside ${escapeHtml(r.hotel_name)}">🏨 Hotel</span>`);
        if (hasVegOption(r.Lunch) || hasVegOption(r.Dinner)) badges.push(`<span class="badge veg">🥬 Veg-friendly</span>`);

        const socials = renderSocialIcons(r, "card");

        let descHtml = "";
        if (r.description) {
            const desc = String(r.description);
            const sentences = desc.match(/[^.!?]+[.!?]+/g) || [desc];
            const shortDesc = escapeHtml(sentences.slice(0, 2).join(" "));
            const fullDesc = escapeHtml(desc);
            const isLong = sentences.length > 2;
            descHtml = `
                <p class="description-text">
                    <span class="short-text">${shortDesc}</span>
                    ${isLong ? `<span class="full-text" style="display:none;">${fullDesc}</span> <span class="read-more">… more</span>` : ""}
                </p>`;
        }

        const menusHtml = `
            <div class="menus-summary">
                ${menuChip("Lunch", lunchP)}
                ${menuChip("Dinner", dinnerP)}
            </div>`;

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = r.id;
        card.style.setProperty("--c-from", meta.from);
        card.style.setProperty("--c-to", meta.to);
        card.innerHTML = `
            <button class="fav-btn ${isFavorite ? "active" : ""}" data-action="fav" aria-label="Toggle favorite" title="${isFavorite ? "Remove from favorites" : "Add to favorites"}">${isFavorite ? "❤" : "♡"}</button>
            <div class="card-hero" data-action="open">
                <div class="card-emoji">${meta.emoji}</div>
                <h3>${escapeHtml(name)}</h3>
            </div>
            <div class="card-body">
                <div class="badges-row">${badges.join("")}</div>
                ${descHtml}
                ${menusHtml}
                ${renderCardBooking(r)}
                <div class="card-actions">
                    <div class="card-actions-left">${socials}</div>
                    <button class="view-menu-btn" data-action="open">View menu →</button>
                </div>
            </div>
        `;

        // Read-more toggle
        const descEl = card.querySelector(".description-text");
        const moreEl = descEl && descEl.querySelector(".read-more");
        if (moreEl) {
            descEl.addEventListener("click", (e) => {
                if (!e.target.classList.contains("read-more")) return;
                e.stopPropagation();
                const full = descEl.querySelector(".full-text");
                const short = descEl.querySelector(".short-text");
                const expanded = full.style.display !== "none";
                full.style.display = expanded ? "none" : "inline";
                short.style.display = expanded ? "inline" : "none";
                moreEl.textContent = expanded ? "… more" : " less";
            });
        }

        return card;
    }

    function renderCardBooking(r) {
        const otL = reservationUrl(r.opentable_lunch) || reservationUrl(r.reservations_lunch);
        const otD = reservationUrl(r.opentable_dinner) || reservationUrl(r.reservations_dinner);
        if (!otL && !otD) return "";
        const btns = [];
        if (otL) btns.push(`<a class="book-btn" href="${escapeHtml(otL)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🍴 Book Lunch</a>`);
        if (otD) btns.push(`<a class="book-btn" href="${escapeHtml(otD)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🍷 Book Dinner</a>`);
        return `<div class="card-booking">${btns.join("")}</div>`;
    }

    function menuChip(label, price) {
        if (!price) {
            return `<div class="menu-chip"><span class="menu-chip-label">${label}</span><span class="menu-chip-empty">—</span></div>`;
        }
        return `<div class="menu-chip"><span class="menu-chip-label">${label}</span><span class="menu-chip-price">${escapeHtml(price)}</span></div>`;
    }

    function renderSocialIcons(r, context) {
        const items = [];
        const ig = safeUrl(r.instagram);
        const fb = safeUrl(r.facebook);
        const tw = safeUrl(r.twitter);
        const web = safeUrl(r.website);
        if (ig)  items.push(socialIcon(ig, "📷", "Instagram"));
        if (fb)  items.push(socialIcon(fb, "f",  "Facebook"));
        if (tw)  items.push(socialIcon(tw, "𝕏",  "Twitter / X"));
        if (web) items.push(socialIcon(web, "🌐", "Website"));
        if (r.EmailAddress && context === "modal") items.push(socialIcon(`mailto:${r.EmailAddress}`, "✉", "Email"));
        return items.join("");
    }

    function socialIcon(href, label, title) {
        return `<a class="social-icon" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()">${label}</a>`;
    }

    // Event delegation for card actions
    grid.addEventListener("click", (e) => {
        const card = e.target.closest(".card");
        if (!card) return;
        if (e.target.closest(".social-icon")) return; // let socials handle themselves
        const id = card.dataset.id;
        if (e.target.closest('[data-action="fav"]')) {
            toggleFavorite(id);
        } else if (e.target.closest('[data-action="open"]')) {
            const r = restaurants.find((x) => x.id === id);
            if (r) openModal(r);
        }
    });

    // ---------- Map ----------
    function initMap() {
        if (map) { map.invalidateSize(); return; }
        map = L.map("map-view").setView([43.6532, -79.3832], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        markerLayer = (typeof L.markerClusterGroup === "function")
            ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 45 })
            : L.layerGroup();
        map.addLayer(markerLayer);
    }

    function updateMap(data) {
        if (!map || !markerLayer) return;
        markerLayer.clearLayers();
        const bounds = L.latLngBounds();

        data.forEach((r) => {
            if (!r.geo_lat || !r.geo_long) return;
            const lat = parseFloat(r.geo_lat);
            const lng = parseFloat(r.geo_long);
            if (isNaN(lat) || isNaN(lng)) return;

            const meta = cuisineMeta(r);
            const popupEl = document.createElement("div");
            popupEl.style.minWidth = "180px";
            popupEl.innerHTML = `
                <div style="font-weight:700; margin-bottom:0.25rem;">${meta.emoji} ${escapeHtml(r.restaurant_name || "")}</div>
                <div style="font-size:0.82rem; color:#666; margin-bottom:0.4rem;">${escapeHtml(r.address || "")}</div>
                <button class="popup-view" style="background:var(--primary); color:white; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-weight:600;">View menu →</button>
            `;
            popupEl.querySelector(".popup-view").addEventListener("click", () => openModal(r));

            const marker = L.marker([lat, lng]).bindPopup(popupEl);
            markerLayer.addLayer(marker);
            bounds.extend([lat, lng]);
        });

        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
    }

    // ---------- Modal ----------
    function openModal(r) {
        const meta = cuisineMeta(r);
        const hero = $("modalHero");
        hero.style.setProperty("--c-from", meta.from);
        hero.style.setProperty("--c-to", meta.to);
        $("modalEmoji").textContent = meta.emoji;
        $("modalTitle").textContent = r.restaurant_name || "";

        const subParts = [];
        if (Array.isArray(r.cuisines) && r.cuisines.length) subParts.push(r.cuisines.join(" · "));
        if (Array.isArray(r.neighbourhoods) && r.neighbourhoods.length) subParts.push(r.neighbourhoods[0]);
        $("modalSubline").textContent = subParts.join(" · ");
        $("modalAddress").textContent = r.address || "";

        // Badges
        const badges = [];
        if (isMichelin(r)) badges.push(`<span class="badge michelin">⭐ Michelin</span>`);
        if (r.accessible_opt === "Yes") badges.push(`<span class="badge access">♿ Accessible</span>`);
        if (r.hotel_name) badges.push(`<span class="badge hotel">🏨 ${escapeHtml(r.hotel_name)}</span>`);
        if (hasVegOption(r.Lunch) || hasVegOption(r.Dinner)) badges.push(`<span class="badge veg">🥬 Veg-friendly</span>`);
        $("modalBadges").innerHTML = badges.join("");

        // Action bar
        const actions = [];
        const otL = reservationUrl(r.opentable_lunch) || reservationUrl(r.reservations_lunch);
        const otD = reservationUrl(r.opentable_dinner) || reservationUrl(r.reservations_dinner);
        if (otL) actions.push(actionLink(otL, "🍴 Book Lunch", "book"));
        if (otD) actions.push(actionLink(otD, "🍷 Book Dinner", "book"));
        if (!otL && !otD) {
            const q = encodeURIComponent((r.restaurant_name || "") + " Toronto reservation");
            actions.push(actionLink(`https://www.google.com/search?q=${q}`, "🔎 Find a reservation"));
        }
        if (r.geo_lat && r.geo_long) {
            const dest = encodeURIComponent(`${r.restaurant_name || ""} ${r.address || ""}`);
            actions.push(actionLink(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "🧭 Directions"));
        }
        const calUrl = calendarUrl(r);
        if (calUrl) actions.push(actionLink(calUrl, "📅 Add to Calendar"));
        const web = safeUrl(r.website);
        if (web) actions.push(actionLink(web, "🌐 Website"));
        if (r.phone) actions.push(actionLink(`tel:${r.phone.replace(/\s+/g, "")}`, `📞 ${r.phone}`));
        if (r.EmailAddress) actions.push(actionLink(`mailto:${r.EmailAddress}`, "✉ Email"));
        actions.push(`<button class="action-btn primary" id="shareBtn">🔗 Share</button>`);
        $("modalActions").innerHTML = actions.join("");

        // Wire share
        const shareBtn = $("shareBtn");
        if (shareBtn) shareBtn.addEventListener("click", () => shareRestaurant(r));

        // Menus
        renderMenuSection("lunchContent", r.Lunch, "Lunch");
        renderMenuSection("dinnerContent", r.Dinner, "Dinner");

        const tabLunch = $("tabLunch");
        const tabDinner = $("tabDinner");
        const lunchContent = $("lunchContent");
        const dinnerContent = $("dinnerContent");
        [tabLunch, tabDinner, lunchContent, dinnerContent].forEach((el) => el.classList.remove("active"));

        if (r.Lunch) {
            tabLunch.classList.add("active");
            lunchContent.classList.add("active");
            tabLunch.style.display = "block";
        } else {
            tabLunch.style.display = "none";
        }
        if (r.Dinner) {
            if (!r.Lunch) {
                tabDinner.classList.add("active");
                dinnerContent.classList.add("active");
            }
            tabDinner.style.display = "block";
        } else {
            tabDinner.style.display = "none";
        }
        if (!r.Lunch && !r.Dinner) {
            lunchContent.innerHTML = "<p>No menu information available.</p>";
            lunchContent.classList.add("active");
        }

        modalOverlay.style.display = "flex";
        document.body.style.overflow = "hidden";

        const slug = slugify(r.restaurant_name) || r.id;
        const desired = "#r=" + slug;
        if (window.location.hash !== desired) {
            history.replaceState(null, "", window.location.pathname + window.location.search + desired);
        }
    }

    function calendarUrl(r) {
        if (!seasonMeta || !seasonMeta.dates_start || !seasonMeta.dates_end) return "";
        // Google Calendar's date range is [start, end) — bump end by one day for all-day.
        const compact = (iso) => iso.replace(/-/g, "");
        const start = compact(seasonMeta.dates_start);
        const endDate = new Date(seasonMeta.dates_end + "T12:00:00");
        endDate.setDate(endDate.getDate() + 1);
        const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");
        const title = `${seasonMeta.label || "Licious"} — ${r.restaurant_name || ""}`;
        const slug = slugify(r.restaurant_name) || r.id;
        const link = `${window.location.origin}${window.location.pathname}#r=${slug}`;
        const details = [
            r.address ? `Address: ${r.address}` : "",
            r.phone ? `Phone: ${r.phone}` : "",
            `Menu: ${link}`,
        ].filter(Boolean).join("\n");
        const params = new URLSearchParams({
            action: "TEMPLATE",
            text: title,
            dates: `${start}/${end}`,
            details,
            location: r.address || "",
        });
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    function actionLink(href, label, kind = "") {
        return `<a class="action-btn ${kind}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    }

    function shareRestaurant(r) {
        const slug = slugify(r.restaurant_name) || r.id;
        const url = `${window.location.origin}${window.location.pathname}#r=${slug}`;
        const data = { title: r.restaurant_name, text: `${r.restaurant_name} — Winterlicious menu`, url };
        if (navigator.share) {
            navigator.share(data).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => toast("Link copied!"));
        } else {
            prompt("Copy link:", url);
        }
    }

    function renderMenuSection(containerId, menuData, type) {
        const container = $(containerId);
        container.innerHTML = "";
        if (!menuData) {
            container.innerHTML = `<p style="text-align:center; margin-top: 2rem; color: var(--text-muted);">No ${escapeHtml(type)} menu available.</p>`;
            return;
        }
        if (menuData.price) {
            const priceDiv = document.createElement("div");
            priceDiv.style.textAlign = "center";
            priceDiv.innerHTML = `<span class="price-badge">${escapeHtml(type)} · ${escapeHtml(menuData.price)}</span>`;
            container.appendChild(priceDiv);
        }

        const sections = [
            { key: "appetizers",  title: "Appetizers" },
            { key: "main_dishes", title: "Main Dishes" },
            { key: "desserts",    title: "Desserts" },
        ];

        sections.forEach((sec) => {
            const items = menuData[sec.key];
            if (!Array.isArray(items) || items.length === 0) return;
            const secDiv = document.createElement("div");
            secDiv.className = "menu-section";
            const h3 = document.createElement("h3");
            h3.textContent = sec.title;
            secDiv.appendChild(h3);
            items.forEach((item) => secDiv.appendChild(renderMenuItem(item)));
            container.appendChild(secDiv);
        });

        let notesHTML = "";
        ["appetizers_notes", "main_dishes_notes", "desserts_notes"].forEach((k) => {
            if (menuData[k]) {
                notesHTML += `<p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 1rem; font-style: italic;">* ${escapeHtml(menuData[k])}</p>`;
            }
        });
        if (notesHTML) {
            const notesDiv = document.createElement("div");
            notesDiv.style.borderTop = "1px dashed var(--border)";
            notesDiv.style.marginTop = "2rem";
            notesDiv.style.paddingTop = "1rem";
            notesDiv.innerHTML = notesHTML;
            container.appendChild(notesDiv);
        }
    }

    function renderMenuItem(item) {
        const itemDiv = document.createElement("div");
        itemDiv.className = "menu-item";
        const dietaryParts = [];
        if (item.vegetarian_opt === "Yes") dietaryParts.push(`<span class="dietary veg">Veg</span>`);
        if (item.vegan_opt === "Yes") dietaryParts.push(`<span class="dietary vegan">Vegan</span>`);
        if (item.gluten_opt === "Yes") dietaryParts.push(`<span class="dietary gf">GF</span>`);
        if (item.local_opt === "Yes") dietaryParts.push(`<span class="dietary local">Local</span>`);

        itemDiv.innerHTML = `
            <div class="item-header"><span class="item-name">${escapeHtml(item.name)}</span></div>
            <div class="item-desc">${escapeHtml(item.description || "")}</div>
            <div class="dietary-tags">${dietaryParts.join("")}</div>
        `;
        return itemDiv;
    }

    closeModalBtn.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modalOverlay.style.display === "flex") closeModal();
    });

    function closeModal() {
        modalOverlay.style.display = "none";
        document.body.style.overflow = "";
        if (window.location.hash) {
            history.replaceState(null, "", window.location.pathname + window.location.search);
        }
    }

    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetId = tab.dataset.target;
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".menu-content").forEach((c) => c.classList.remove("active"));
            tab.classList.add("active");
            $(targetId).classList.add("active");
        });
    });

    // Surprise me
    surpriseBtn.addEventListener("click", () => {
        const pool = lastFiltered.length ? lastFiltered : restaurants;
        if (!pool.length) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        openModal(pick);
    });
})();
