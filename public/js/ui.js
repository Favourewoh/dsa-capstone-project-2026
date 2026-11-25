const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

const wholeNairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/**
 * Formats integer cents into Naira (e.g. 250000 -> "₦2,500").
 */
export function formatPriceCents(priceCents) {
  const cents = Number(priceCents);
  if (!Number.isFinite(cents)) {
    return "₦0";
  }
  const naira = cents / 100;
  return Number.isInteger(naira)
    ? wholeNairaFormatter.format(naira)
    : nairaFormatter.format(naira);
}

/**
 * Creates a DOM element safely using textContent for text children.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;

    if (key === "className") {
      node.className = String(value);
    } else if (key === "text") {
      node.textContent = String(value);
    } else if (key === "disabled") {
      node.disabled = Boolean(value);
    } else if (key === "dataset" && typeof value === "object") {
      for (const [dataKey, dataVal] of Object.entries(value)) {
        node.dataset[dataKey] = String(dataVal);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, String(value));
    }
  }

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child === undefined || child === null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      node.appendChild(child);
    }
  }

  return node;
}

export function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}