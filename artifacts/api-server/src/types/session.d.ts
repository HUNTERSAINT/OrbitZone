import "express-session";
import "http";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace NodeJS {
    interface IncomingMessage {
      rawBody?: Buffer;
    }
  }
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export {};
