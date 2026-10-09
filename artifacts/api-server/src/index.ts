import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { Server } from "socket.io";
import { eq } from "drizzle-orm";
import app, { sessionMiddleware } from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/socket.io",
  serveClient: false,
});

io.engine.use(
  (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: Error) => void,
  ) => {
  sessionMiddleware(
    request as unknown as Request,
    response as unknown as Response,
    next as unknown as NextFunction,
  );
  },
);

io.use(async (socket, next) => {
  try {
    const session = (
      socket.request as typeof socket.request & {
        session?: { userId?: string };
      }
    ).session;
    const userId = session?.userId;
    if (!userId) {
      next(new Error("Authentication required."));
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id, isBanned: usersTable.isBanned })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user || user.isBanned) {
      next(new Error("Account unavailable."));
      return;
    }
    socket.data.userId = user.id;
    next();
  } catch (error) {
    logger.error({ err: error }, "Socket authentication failed");
    next(new Error("Authentication failed."));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.data.userId}`);
});
app.set("io", io);

httpServer.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
