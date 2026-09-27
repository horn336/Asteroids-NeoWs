"use strict";

// NASA API key
const API_KEY = "Ic8DgDqHu1tike6NXkKgCMY5VLRco4JPDat9Dahd";
const BASE_URL = "https://api.nasa.gov/neo/rest/v1";
const MAX_DAYS = 7;

const getElement = selector => document.querySelector(selector);

let browsePage = 0;
let browseTotalPages = 0;

// ---------- helpers ----------

// format a Date as yyyy-mm-dd using local time
const toDateString = date => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
};

const formatNumber = value =>
    Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });

const formatDiameter = neo => {
    const meters = neo.estimated_diameter.meters;
    return `${formatNumber(meters.estimated_diameter_min)}–${formatNumber(meters.estimated_diameter_max)} m`;
};

const setStatus = (message, isError = false) => {
    const status = getElement("#status");
    status.textContent = message;
    status.classList.toggle("error", isError);
};

const clearResults = () => {
    getElement("#summary").textContent = "";
    getElement("#results thead").textContent = "";
    getElement("#results tbody").textContent = "";
    getElement("#results").hidden = true;
    getElement("#pager").hidden = true;
};

const setActiveLink = id => {
    for (const link of document.querySelectorAll("nav a")) {
        link.classList.toggle("active", link.id === id);
    }
};

// fetch a URL and parse the JSON, with friendly error messages
const fetchJson = async url => {
    const response = await fetch(url);
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("Too many requests. DEMO_KEY is rate limited, so add your own key in app.js or try again later.");
        }
        if (response.status === 403) {
            throw new Error("NASA rejected the API key. Check API_KEY in app.js.");
        }
        throw new Error(`NASA API error (status ${response.status}).`);
    }
    return await response.json();
};

// build the table: headers is an array of strings, rows is an array of arrays
// a cell can be plain text or an object like { text, className, href }
const renderTable = (headers, rows) => {
    const headRow = document.createElement("tr");
    for (const header of headers) {
        const th = document.createElement("th");
        th.textContent = header;
        headRow.appendChild(th);
    }
    getElement("#results thead").appendChild(headRow);

    const tbody = getElement("#results tbody");
    for (const row of rows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
            const td = document.createElement("td");
            if (typeof cell === "object") {
                if (cell.href) {
                    const link = document.createElement("a");
                    link.href = cell.href;
                    link.target = "_blank";
                    link.rel = "noopener";
                    link.textContent = cell.text;
                    td.appendChild(link);
                } else {
                    td.textContent = cell.text;
                }
                if (cell.className) td.className = cell.className;
            } else {
                td.textContent = cell;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    getElement("#results").hidden = false;
};

const hazardCell = neo => neo.is_potentially_hazardous_asteroid
    ? { text: "Yes", className: "hazard" }
    : { text: "No", className: "safe" };

// ---------- option 1: asteroids by closest approach date ----------

const loadFeed = async () => {
    const startDate = getElement("#start_date").value;
    const endDate = getElement("#end_date").value;

    // validate the date range (NASA allows up to 7 days)
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const days = (end - start) / (1000 * 60 * 60 * 24);

    clearResults();
    if (!startDate || !endDate) {
        setStatus("Please choose a start date and an end date.", true);
        return;
    }
    if (days < 0) {
        setStatus("The end date must be on or after the start date.", true);
        return;
    }
    if (days > MAX_DAYS) {
        setStatus(`Please choose a range of ${MAX_DAYS} days or less.`, true);
        return;
    }

    setStatus("Loading asteroids...");
    try {
        const url = `${BASE_URL}/feed?start_date=${startDate}&end_date=${endDate}&api_key=${API_KEY}`;
        const data = await fetchJson(url);

        // near_earth_objects is grouped by date, so combine the groups into one list
        const asteroids = Object.values(data.near_earth_objects).flat();
        asteroids.sort((a, b) =>
            a.close_approach_data[0].epoch_date_close_approach -
            b.close_approach_data[0].epoch_date_close_approach);

        const hazardous = asteroids.filter(neo => neo.is_potentially_hazardous_asteroid).length;
        setStatus("");
        getElement("#summary").textContent =
            `${data.element_count} asteroids make a close approach between ${startDate} and ${endDate} ` +
            `(${hazardous} potentially hazardous).`;

        const rows = asteroids.map(neo => {
            const approach = neo.close_approach_data[0];
            return [
                { text: neo.name, href: neo.nasa_jpl_url },
                approach.close_approach_date,
                formatDiameter(neo),
                `${formatNumber(approach.relative_velocity.kilometers_per_hour)} km/h`,
                `${formatNumber(approach.miss_distance.kilometers)} km`,
                hazardCell(neo)
            ];
        });

        renderTable(
            ["Name", "Approach Date", "Est. Diameter", "Speed", "Miss Distance", "Hazardous"],
            rows);
    } catch (error) {
        setStatus(error.message, true);
    }
};

// ---------- option 2: overall asteroid dataset ----------

const loadBrowse = async page => {
    clearResults();
    setStatus("Loading asteroid dataset...");
    try {
        const url = `${BASE_URL}/neo/browse?page=${page}&size=20&api_key=${API_KEY}`;
        const data = await fetchJson(url);

        browsePage = data.page.number;
        browseTotalPages = data.page.total_pages;

        setStatus("");
        getElement("#summary").textContent =
            `The dataset contains ${formatNumber(data.page.total_elements)} known near Earth objects.`;

        const rows = data.near_earth_objects.map(neo => [
            { text: neo.name, href: neo.nasa_jpl_url },
            formatDiameter(neo),
            neo.absolute_magnitude_h,
            neo.orbital_data?.first_observation_date ?? "n/a",
            neo.close_approach_data.length,
            hazardCell(neo)
        ]);

        renderTable(
            ["Name", "Est. Diameter", "Magnitude (H)", "First Observed", "Close Approaches", "Hazardous"],
            rows);

        // paging controls
        getElement("#page_label").textContent =
            `Page ${browsePage + 1} of ${formatNumber(browseTotalPages)}`;
        getElement("#prev_page").disabled = browsePage === 0;
        getElement("#next_page").disabled = browsePage >= browseTotalPages - 1;
        getElement("#pager").hidden = false;
    } catch (error) {
        setStatus(error.message, true);
    }
};

// ---------- event handlers ----------

document.addEventListener("DOMContentLoaded", () => {
    // default date range: today through 6 days from now
    const today = new Date();
    const later = new Date();
    later.setDate(today.getDate() + 6);
    getElement("#start_date").value = toDateString(today);
    getElement("#end_date").value = toDateString(later);

    getElement("#link_feed").addEventListener("click", async evt => {
        evt.preventDefault();
        setActiveLink("link_feed");
        getElement("#feed_form").hidden = false;
        await loadFeed();
    });

    getElement("#link_browse").addEventListener("click", async evt => {
        evt.preventDefault();
        setActiveLink("link_browse");
        getElement("#feed_form").hidden = true;
        await loadBrowse(0);
    });

    getElement("#feed_form").addEventListener("submit", async evt => {
        evt.preventDefault();
        await loadFeed();
    });

    getElement("#prev_page").addEventListener("click", async () => {
        if (browsePage > 0) await loadBrowse(browsePage - 1);
    });

    getElement("#next_page").addEventListener("click", async () => {
        if (browsePage < browseTotalPages - 1) await loadBrowse(browsePage + 1);
    });
});
