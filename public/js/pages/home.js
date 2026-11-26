import { listEvents, logout } from "../api.js";
import { isAuthenticated } from "../session.js";
import { el, clearChildren, formatPriceCents } from "../ui.js";

const form = document.querySelector("#filters-form");
const searchInput = document.querySelector("#search-input");
const citySelect = document.querySelector("#city-select");
const maxPriceInput = document.querySelector("#max-price-input");
const sortSelect = document.querySelector("#sort-select");
const resetBtn = document.querySelector("#reset-filters-btn");
const resultsCount = document.querySelector("#results-count");
const eventsList = document.querySelector("#events-list");
const errorBox = document.querySelector("#events-error");
const navAuthLink = document.querySelector("#nav-auth-link");

if (isAuthenticated() && navAuthLink) {
  navAuthLink.textContent = "Log Out";
  navAuthLink.href = "#logout";
  navAuthLink.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
    window.location.reload();
  });
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function populateCities(allEvents) {
  const current = citySelect.value;
  const cities = [...new Set(allEvents.map((e) => e.city).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  clearChildren(citySelect);
  citySelect.appendChild(el("option", { value: "", text: "All cities" }));
  for (const city of cities) {
    citySelect.appendChild(el("option", { value: city, text: city }));
  }
  if (cities.includes(current)) {
    citySelect.value = current;
  }
}

function renderEvents(events) {
  clearChildren(eventsList);
  resultsCount.textContent = `${events.length} ${events.length === 1 ? "event" : "events"} found`;

  if (events.length === 0) {
    eventsList.appendChild(
      el("p", { className: "muted", text: "No published events match your current filters." })
    );
    return;
  }

  for (const ev of events) {
    const dateLabel = new Date(ev.startsAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const tiers = Array.isArray(ev.tiers) ? ev.tiers : [];
    const totalSeatsLeft =
      typeof ev.totalSeatsLeft === "number"
        ? ev.totalSeatsLeft
        : tiers.reduce((sum, t) => sum + (Number(t.seatsLeft) || 0), 0);

    const minPriceCents =
      typeof ev.minPriceCents === "number"
        ? ev.minPriceCents
        : tiers.length > 0
          ? Math.min(...tiers.map((t) => Number(t.priceCents) || 0))
          : 0;

    const soldOut = totalSeatsLeft <= 0;
    const statusBadge = el("span", {
      className: soldOut ? "badge badge-soldout" : "badge badge-open",
      text: soldOut ? "Sold out" : `${totalSeatsLeft} seats left`,
    });

    const card = el("article", { className: "card event-card" }, [
      el("div", { className: "card-top" }, [
        el("span", { className: "muted event-city", text: ev.city }),
        statusBadge,
      ]),
      el("h2", { className: "event-title", text: ev.title }),
      el("p", { className: "muted event-meta", text: `${ev.venue} · ${dateLabel}` }),
      el("div", { className: "card-bottom" }, [
        el("span", { className: "price-tag", text: `From ${formatPriceCents(minPriceCents)}` }),
        el("a", {
          href: `/event.html?id=${encodeURIComponent(ev.id)}`,
          className: "btn btn-primary",
          text: "View Event",
        }),
      ]),
    ]);

    eventsList.appendChild(card);
  }
}

async function loadAndRender({ isInitial = false } = {}) {
  hideError();
  resultsCount.textContent = "Loading events...";

  const maxPriceNaira = Number(maxPriceInput.value);
  const hasMaxPrice =
    maxPriceInput.value !== "" && Number.isFinite(maxPriceNaira) && maxPriceNaira >= 0;

  try {
    const data = await listEvents({
      q: searchInput.value,
      city: citySelect.value,
      maxPriceCents: hasMaxPrice ? Math.round(maxPriceNaira * 100) : null,
      sortBy: sortSelect.value,
    });
    const events = Array.isArray(data?.events) ? data.events : [];
    if (isInitial) {
      populateCities(events);
    }
    renderEvents(events);
  } catch (err) {
    resultsCount.textContent = "Unable to load events.";
    showError(err.message || "Failed to load events.");
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadAndRender({ isInitial: false });
});

sortSelect.addEventListener("change", () => {
  loadAndRender({ isInitial: false });
});

resetBtn.addEventListener("click", () => {
  searchInput.value = "";
  citySelect.value = "";
  maxPriceInput.value = "";
  sortSelect.value = "date";
  loadAndRender({ isInitial: false });
});

await loadAndRender({ isInitial: true });