import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const uploadUrlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many photo upload requests. Try again later." },
});

router.post(
  "/storage/uploads/request-url",
  uploadUrlLimiter,
  async (req, res): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid photo details." });
      return;
    }

    try {
      const upload = await storage.createUpload();
      res.json(RequestUploadUrlResponse.parse(upload));
    } catch (error) {
      req.log.error({ err: error }, "Unable to create photo upload URL");
      res.status(503).json({ error: "Photo uploads are temporarily unavailable." });
    }
  },
);

router.get(
  "/storage/objects/*path",
  requireUser,
  async (req, res): Promise<void> => {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    try {
      const file = await storage.getObjectEntityFile(objectPath);
      if (
        !req.currentUser!.isAdmin &&
        !(await storage.canAccess(req.currentUser!.id, file))
      ) {
        res.status(403).json({ error: "You cannot access this image." });
        return;
      }

      const response = await storage.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Image not found." });
        return;
      }
      req.log.error({ err: error }, "Unable to serve profile image");
      res.status(500).json({ error: "Unable to load image." });
    }
  },
);

export default router;
