import { DomainError, ErrorCodes } from "./errors.js";

function defaultCompare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function merge(left, right, compare) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    // Strictly `<` so ties (`compare(left[i], right[j]) === 0`) take from `left` first, preserving stability.
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i += 1;
  }

  while (j < right.length) {
    result.push(right[j]);
    j += 1;
  }

  return result;
}

export function mergeSort(items, compare = defaultCompare) {
  if (!Array.isArray(items)) {
    throw new DomainError(ErrorCodes.VALIDATION, "items must be an array.");
  }
  if (typeof compare !== "function") {
    throw new DomainError(ErrorCodes.VALIDATION, "compare must be a function.");
  }

  if (items.length <= 1) {
    return items.slice();
  }

  const mid = Math.floor(items.length / 2);
  const leftSorted = mergeSort(items.slice(0, mid), compare);
  const rightSorted = mergeSort(items.slice(mid), compare);

  return merge(leftSorted, rightSorted, compare);
}