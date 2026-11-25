import { listEvents } from "../api.js";
import { el, clearChildren, formatPriceCents } from "../ui.js";

const form = document.querySelector("#filters-form");
const searchInput = document.querySelector("#search-input");
const citySelect = document.querySelector("#city-select");
const maxPriceInput = document.querySelector("#max-price-input");
const sortSelect = document.querySelector("#sort-select");
const resetBtn = document.querySelector("#reset-filters-btn");
const resultsCount = document.querySelector("#results-count");
const eventsList = document.querySelector("#events-list");

function populateCities(allEvents) {
  const current = citySelect.value;
  const cities = [...new Set(allEvents.map((e) => e.city))].sort((a, b) =>
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

    const soldOut = ev.totalSeatsLeft <= 0;
    const statusBadge = el("span", {
      className: soldOut ? "badge badge-soldout" : "badge badge-open",
      text: soldOut ? "Sold out" : `${ev.totalSeatsLeft} seats left`,
    });

    const card = el("article", { className: "card event-card" }, [
      el("div", { className: "card-top" }, [
        el("span", { className: "muted event-city", text: ev.city }),
        statusBadge,
      ]),
      el("h2", { className: "event-title", text: ev.title }),
      el("p", { className: "muted event-meta", text: `${ev.venue} · ${dateLabel}` }),
      el("div", { className: "card-bottom" }, [
        el("span", { className: "price-tag", text: `From ${formatPriceCents(ev.minPriceCents)}` }),
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

async function loadAndRender() {
  const maxPriceNaira = Number(maxPriceInput.value);
  const hasMaxPrice = maxPriceInput.value !== "" && Number.isFinite(maxPriceNaira) && maxPriceNaira >= 0;

  const { events } = await listEvents({
    q: searchInput.value,
    city: citySelect.value,
    maxPriceCents: hasMaxPrice ? Math.round(maxPriceNaira * 100) : null,
    sortBy: sortSelect.value,
  });

  renderEvents(events);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadAndRender();
});

sortSelect.addEventListener("change", () => {
  loadAndRender();
});

resetBtn.addEventListener("click", () => {
  searchInput.value = "";
  citySelect.value = "";
  maxPriceInput.value = "";
  sortSelect.value = "date";
  loadAndRender();
});

const { events: initialAll } = await listEvents();
populateCities(initialAll);
renderEvents(initialAll);