// Shared table recipe for the list screens (Holidays, Seasons, Checklist,
// Categories): white 16px card on the canvas, quiet header row, 1px dividers,
// hover tint. Row actions use TRASH button classes below.
export const TABLE_CARD = "overflow-x-auto rounded-card border border-line bg-surface";
export const TABLE = "w-full whitespace-nowrap text-ui";
export const TH = "px-4 py-2.5 text-left text-micro font-medium uppercase tracking-wide text-ink-3";
export const TD = "px-4 py-2.5";
export const TR = "group border-t border-line first:border-t-0 cursor-pointer transition-colors duration-fast hover:bg-canvas";
export const EMPTY_CELL = "px-4 py-8 text-center text-ink-2";
// Icon actions stay visible on touch / small screens, fade in on row hover on desktop.
export const ROW_ACTION = "md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-fast";
export const TOOLBAR_SELECT =
  "min-h-[32px] rounded-pill border border-line-strong bg-white px-3 text-body text-ink";
