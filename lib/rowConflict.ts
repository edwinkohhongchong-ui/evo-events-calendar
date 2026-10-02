// Thrown by the row writers when an update's optimistic lock (updated_at) no longer
// matches: someone else changed the row since it was read. Kept free of imports so
// pure code (the import runner and its tests) can recognise it.
export class RowConflictError extends Error {
  constructor(message = "Someone else changed this since you loaded it — please refresh and try again.") {
    super(message);
    this.name = "RowConflictError";
  }
}
