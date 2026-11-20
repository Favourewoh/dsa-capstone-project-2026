export const ErrorCodes = Object.freeze({
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  SOLD_OUT: "SOLD_OUT",
  CONFLICT: "CONFLICT",
});

export class DomainError extends Error {
  constructor(code, message, details = undefined) {
    if (typeof code !== "string" || code.trim() === "") {
      throw new TypeError("DomainError requires a non-empty string error code.");
    }
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, DomainError);
  }
}