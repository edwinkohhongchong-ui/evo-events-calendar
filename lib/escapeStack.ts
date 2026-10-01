// Layered Escape handling: only the most recently registered handler runs, so
// a confirm dialog opened over a modal closes alone and leaves its parent open.
type Entry = { current: () => void };

const stack: Entry[] = [];

/** Registers an entry on top of the stack; returns its remover. */
export function pushEscapeHandler(entry: Entry): () => void {
  stack.push(entry);
  return () => {
    const i = stack.lastIndexOf(entry);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Runs the top-most handler. Returns true if one ran. */
export function dispatchEscape(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

export function escapeStackSize(): number {
  return stack.length;
}
