"use client";

import { createContext, useContext } from "react";
import { Role } from "./auth";

// Populated server-side (app/layout.tsx reads the role middleware attached
// to the request headers) and handed down via context so any client
// component can gate an Add/Delete control without threading a prop through
// every intermediate component.
const RoleContext = createContext<Role>("editor");

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}

// Convenience — most call sites only care "can this person add/delete", not
// the literal role string.
export function useIsEditor(): boolean {
  return useRole() === "editor";
}
