export type SeatbeltMode = "observe" | "protect" | "strict";

export interface SeatbeltOptions {
  mode: SeatbeltMode;
  root: string;
  allowlistPaths: string[];
}
