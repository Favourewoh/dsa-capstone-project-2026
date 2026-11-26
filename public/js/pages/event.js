import { getEvent, createBooking, pay, logout } from "../api.js";
import { isAuthenticated } from "../session.js";
import { el, clearChildren, formatPriceCents } from "../ui.js";

const eventDetailsEl = document.querySelector("#event-details");
const tiersListEl = document.querySelector("#tiers-list");
const tierSelectEl = document.querySelector("#tier-select");
const quantityInputEl = document.querySelector("#quantity-input");
const attendeeNameInputEl = document.querySelector("#attendee-name-input");
const estimatedTotalEl = document.querySelector("#estimated-total");
const bookingFormEl = document.querySelector("#booking-form");
const bookBtnEl = document.querySelector("#book-btn");
const navAuthLink = document.querySelector("#nav-auth-link");

const pageAlertEl = document.querySelector("#page-alert");
const checkoutEmptyEl = document.querySelector("#checkout-empty");
const checkoutActiveEl = document.querySelector("#checkout-active");
const countdownDisplayEl = document.querySelector("#countdown-display");
const bookingRefEl = document.querySelector("#booking-ref");
const bookingAttendeeEl = document.querySelector("#booking-attendee");
const bookingQtyEl = document.querySelector("#booking-qty");
const bookingTotalEl = document.querySelector("#booking-total");
const bookingStatusEl = document.querySelector("#booking-status");

const paymentFormEl = document.querySelector("#payment-form");
const cardLast4InputEl = document.querySelector("#card-last4-input");
const simulateDeclineCheckboxEl = document.querySelector("#simulate-decline-checkbox");
const paymentErrorEl = document.querySelector("#payment-error");
const payBtnEl = document.querySelector("#pay-btn");
const paymentConfirmedEl = document.querySelector("#payment-confirmed");
const confirmedMessageEl = document.querySelector("#confirmed-message");
const confirmedTxEl = document.querySelector("#confirmed-tx");

if (isAuthenticated() && navAuthLink) {
  navAuthLink.textContent = "Log Out";
  navAuthLink.href = "#logout";
  navAuthLink.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
    window.location.href = "/login.html";
  });
}

let currentEvent = null;
let activeBooking = null;
let countdownTimerId = null;

function showPageError(message) {
  pageAlertEl.textContent = message;
  pageAlertEl.className = "alert alert-error";
  pageAlertEl.classList.remove("hidden");
}

function showPaymentError(message) {
  paymentErrorEl.textContent = message;
  paymentErrorEl.classList.remove("hidden");
}

function hidePaymentError() {
  paymentErrorEl.textContent = "";
  paymentErrorEl.classList.add("hidden");
}

function formatCountdown(seconds) {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(clamped / 60)).padStart(2, "0");
  const secs = String(clamped % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function stopCountdown() {
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
}

function startCountdown(expiresAtIso) {
  stopCountdown();
  const expiresMs = expiresAtIso ? new Date(expiresAtIso).getTime() : Date.now() + 10 * 60 * 1000;

  const tick = () => {
    const remainingSec = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
    countdownDisplayEl.textContent = formatCountdown(remainingSec);

    if (remainingSec <= 0) {
      stopCountdown();
      if (activeBooking && activeBooking.status === "pending") {
        payBtnEl.disabled = true;
        showPaymentError("Seat hold countdown expired. Please reserve tickets again.");
      }
    }
  };

  tick();
  countdownTimerId = setInterval(tick, 1000);
}

function getSelectedTier() {
  return currentEvent?.tiers.find((t) => t.id === tierSelectEl.value) || null;
}

function syncQuantityLimits() {
  const tier = getSelectedTier();
  const maxAllowed = tier ? Math.max(0, Math.min(10, tier.seatsLeft)) : 10;

  if (!tier || maxAllowed === 0) {
    quantityInputEl.max = "1";
    quantityInputEl.value = "1";
    quantityInputEl.disabled = true;
    bookBtnEl.disabled = true;
    estimatedTotalEl.textContent = formatPriceCents(0);
    return;
  }

  quantityInputEl.disabled = false;
  quantityInputEl.max = String(maxAllowed);
  let qty = Number(quantityInputEl.value);
  if (!Number.isInteger(qty) || qty < 1) {
    qty = 1;
  } else if (qty > maxAllowed) {
    qty = maxAllowed;
  }
  quantityInputEl.value = String(qty);
  bookBtnEl.disabled = false;
  estimatedTotalEl.textContent = formatPriceCents(tier.priceCents * qty);
}

function renderEventAndTiers() {
  clearChildren(eventDetailsEl);
  clearChildren(tiersListEl);
  clearChildren(tierSelectEl);

  const dateText = new Date(currentEvent.startsAt).toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });

  eventDetailsEl.appendChild(
    el("div", {}, [
      el("p", { className: "muted event-city", text: `${currentEvent.city} · ${dateText}` }),
      el("h1", { text: currentEvent.title }),
      el("p", { className: "muted", text: currentEvent.venue }),
    ])
  );

  const tiers = Array.isArray(currentEvent.tiers) ? currentEvent.tiers : [];

  for (const tier of tiers) {
    const isSoldOut = tier.seatsLeft <= 0;

    const option = el("option", {
      value: tier.id,
      disabled: isSoldOut,
      text: isSoldOut
        ? `${tier.name} — Sold out`
        : `${tier.name} — ${formatPriceCents(tier.priceCents)} (${tier.seatsLeft} left)`,
    });
    tierSelectEl.appendChild(option);

    const selectBtn = el("button", {
      type: "button",
      className: isSoldOut ? "btn btn-secondary" : "btn btn-primary",
      disabled: isSoldOut,
      text: isSoldOut ? "Sold out" : "Select tier",
      onClick: () => {
        if (isSoldOut) return;
        tierSelectEl.value = tier.id;
        syncQuantityLimits();
        quantityInputEl.focus();
      },
    });

    const tierCard = el(
      "div",
      { className: isSoldOut ? "card tier-card sold-out" : "card tier-card" },
      [
        el("div", { className: "tier-info" }, [
          el("div", { className: "tier-header" }, [
            el("h3", { text: tier.name }),
            el("span", {
              className: isSoldOut ? "badge badge-soldout" : "badge badge-open",
              text: isSoldOut ? "Sold out" : `${tier.seatsLeft} seats left`,
            }),
          ]),
          el("p", { className: "price-tag", text: formatPriceCents(tier.priceCents) }),
        ]),
        selectBtn,
      ]
    );

    tiersListEl.appendChild(tierCard);
  }

  const firstAvailable = tiers.find((t) => t.seatsLeft > 0);
  if (firstAvailable) {
    tierSelectEl.value = firstAvailable.id;
  }

  syncQuantityLimits();
}

function renderCheckoutBooking(booking) {
  activeBooking = booking;
  checkoutEmptyEl.classList.add("hidden");
  checkoutActiveEl.classList.remove("hidden");

  bookingRefEl.textContent = booking.reference;
  bookingAttendeeEl.textContent = booking.attendeeName;
  bookingQtyEl.textContent = String(booking.quantity);
  bookingTotalEl.textContent = formatPriceCents(booking.totalCents);
  bookingStatusEl.textContent = booking.status;

  hidePaymentError();

  if (booking.status === "paid") {
    stopCountdown();
    countdownDisplayEl.textContent = "00:00";
    payBtnEl.disabled = true;
    paymentConfirmedEl.classList.remove("hidden");
    confirmedMessageEl.textContent = `Tickets confirmed for ${booking.attendeeName} (${booking.reference}).`;
    confirmedTxEl.textContent = `Transaction ID: ${booking.paymentTransactionId || "approved"}`;
  } else {
    payBtnEl.disabled = false;
    paymentConfirmedEl.classList.add("hidden");
    const fallbackExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    startCountdown(booking.expiresAt || fallbackExpiry);
  }
}

tierSelectEl.addEventListener("change", syncQuantityLimits);
quantityInputEl.addEventListener("input", syncQuantityLimits);

bookingFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  hidePaymentError();

  if (!isAuthenticated()) {
    showPaymentError("Please log in first before reserving tickets.");
    return;
  }

  const tierId = tierSelectEl.value;
  const quantity = Number(quantityInputEl.value);
  const attendeeName = attendeeNameInputEl.value;

  bookBtnEl.disabled = true;
  bookBtnEl.textContent = "Holding seats...";

  try {
    const data = await createBooking({ tierId, quantity, attendeeName });
    const booking = data?.booking || data;
    const refreshed = await getEvent(currentEvent.id);
    currentEvent = refreshed?.event || refreshed;
    renderEventAndTiers();
    renderCheckoutBooking(booking);
  } catch (err) {
    showPaymentError(err.message || "Could not create booking.");
  } finally {
    bookBtnEl.disabled = false;
    bookBtnEl.textContent = "Hold Seats & Checkout";
    syncQuantityLimits();
  }
});

paymentFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeBooking) return;

  hidePaymentError();
  payBtnEl.disabled = true;
  payBtnEl.textContent = "Processing...";

  try {
    const result = await pay(activeBooking.reference, {
      decline: simulateDeclineCheckboxEl.checked,
      cardLast4: cardLast4InputEl.value,
    });
    renderCheckoutBooking(result.booking || result);
  } catch (err) {
    payBtnEl.disabled = false;
    showPaymentError(err.message || "Payment was declined. Please try again.");
  } finally {
    payBtnEl.textContent = "Pay Now";
  }
});

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

if (!eventId) {
  clearChildren(eventDetailsEl);
  showPageError("Missing event ID in URL.");
} else {
  try {
    const data = await getEvent(eventId);
    currentEvent = data?.event || data;
    document.title = `${currentEvent.title} — Event Ticketing`;
    renderEventAndTiers();
  } catch (err) {
    clearChildren(eventDetailsEl);
    showPageError(err.message || "Unable to load event.");
  }
}