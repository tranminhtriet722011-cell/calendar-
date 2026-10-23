/** Shared status channel: views announce transient results into the shell's live region. */

import { createContext, useContext } from "react";

export type Tone = "info" | "success" | "error";

export interface StatusApi {
  announce: (message: string, tone?: Tone) => void;
}

export const StatusContext = createContext<StatusApi>({ announce: () => {} });

export function useStatus(): StatusApi {
  return useContext(StatusContext);
}
