export type UserStep = "waiting_pdf" | "waiting_password" | "processing";

export interface UserState {
  lastPdfFileId?: string;
  lastPdfFilePath: string | null;
  lastPdfFileName: string | null;
  step: "waiting_pdf" | "waiting_password" | "processing";
  attempts: number;
  startTime: number;
}

export interface StatusEmoji {
  [key: string]: string;
}

export interface StatusText {
  [key: string]: string;
}

export interface BotError extends Error {
  code?: string;
}
