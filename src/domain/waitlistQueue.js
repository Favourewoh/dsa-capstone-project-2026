import { DomainError, ErrorCodes } from "./errors.js";

class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class WaitlistQueue {
  #head = null;
  #tail = null;
  #size = 0;

  enqueue(item) {
    if (item === undefined || item === null) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        "Waitlist entry cannot be null or undefined."
      );
    }

    const node = new QueueNode(item);
    if (!this.#tail) {
      this.#head = node;
      this.#tail = node;
    } else {
      this.#tail.next = node;
      this.#tail = node;
    }
    this.#size += 1;
    return this.#size;
  }

  dequeue() {
    if (!this.#head) {
      return undefined;
    }

    const removed = this.#head;
    this.#head = removed.next;
    removed.next = null;
    this.#size -= 1;

    if (!this.#head) {
      this.#tail = null;
    }

    return removed.value;
  }

  peek() {
    return this.#head ? this.#head.value : undefined;
  }

  get size() {
    return this.#size;
  }
}