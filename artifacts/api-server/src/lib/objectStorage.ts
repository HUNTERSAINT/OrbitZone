import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";
import {
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type ObjectAclPolicy,
} from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";
const LOCAL_UPLOAD_TTL_MS = 15 * 60 * 1000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface LocalObjectFile {
  kind: "local";
  filePath: string;
  metadataPath: string;
}

type StoredObjectFile = File | LocalObjectFile;

interface LocalObjectMetadata {
  contentType?: string;
  owner?: string;
  visibility?: ObjectAclPolicy["visibility"];
}

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found.");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectOwnershipError extends Error {
  constructor() {
    super("The uploaded image is already owned by another account.");
    this.name = "ObjectOwnershipError";
  }
}

export class ObjectStorageService {
  private getLocalObjectDir(): string | undefined {
    const dir =
      process.env.UPLOADS_DIR?.trim() ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
    return dir ? path.resolve(dir) : undefined;
  }

  isLocalStorageEnabled(): boolean {
    return this.getLocalObjectDir() !== undefined;
  }

  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    }
    return dir.replace(/\/+$/, "");
  }

  async createUpload(
    contentType: string,
  ): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;
    const localObjectDir = this.getLocalObjectDir();
    if (localObjectDir) {
      const expiresAt = Date.now() + LOCAL_UPLOAD_TTL_MS;
      const signature = this.createLocalUploadSignature(
        objectId,
        expiresAt,
        contentType,
      );
      return {
        uploadURL: `/api/storage/uploads/${objectId}?expiresAt=${expiresAt}&contentType=${encodeURIComponent(contentType)}&signature=${signature}`,
        objectPath,
      };
    }

    const { bucketName, objectName } = this.parseObjectPath(
      `${this.getPrivateObjectDir()}/uploads/${objectId}`,
    );
    const uploadURL = await this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
    return { uploadURL, objectPath };
  }

  async saveLocalUpload(
    uploadId: string,
    expiresAtValue: string,
    contentType: string,
    signature: string,
    data: Buffer,
  ): Promise<void> {
    const root = this.getLocalObjectDir();
    if (!root) {
      throw new Error("Railway volume storage is not configured.");
    }
    if (
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !ACCEPTED_IMAGE_TYPES.has(contentType) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new ObjectNotFoundError();
    }

    const expiresAt = Number(expiresAtValue);
    if (
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt > Date.now() + LOCAL_UPLOAD_TTL_MS + 5_000
    ) {
      throw new ObjectNotFoundError();
    }

    const expectedSignature = this.createLocalUploadSignature(
      uploadId,
      expiresAt,
      contentType,
    );
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
      throw new ObjectNotFoundError();
    }

    const object = this.createLocalObject(root, uploadId);
    await mkdir(path.dirname(object.filePath), { recursive: true, mode: 0o700 });
    await writeFile(object.filePath, data, { flag: "wx", mode: 0o600 });
    await this.writeLocalMetadata(object, { contentType });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObjectFile> {
    if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/".length);
    const localObjectDir = this.getLocalObjectDir();
    if (localObjectDir) {
      const object = this.createLocalObject(localObjectDir, entityId.slice("uploads/".length));
      try {
        await access(object.filePath);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new ObjectNotFoundError();
        }
        throw error;
      }
      return object;
    }

    const { bucketName, objectName } = this.parseObjectPath(
      `${this.getPrivateObjectDir()}/${entityId}`,
    );
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  async claimObject(
    objectPath: string,
    owner: string,
    visibility: ObjectAclPolicy["visibility"],
  ): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    if (this.isLocalObjectFile(file)) {
      const current = await this.readLocalMetadata(file);
      if (current.owner && current.owner !== owner) {
        throw new ObjectOwnershipError();
      }
      await this.writeLocalMetadata(file, { ...current, owner, visibility });
      return;
    }

    const current = await getObjectAclPolicy(file);
    if (current && current.owner !== owner) {
      throw new ObjectOwnershipError();
    }
    await setObjectAclPolicy(file, { owner, visibility });
  }

  async deleteObject(objectPath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      if (this.isLocalObjectFile(file)) {
        await Promise.all([
          rm(file.filePath, { force: true }),
          rm(file.metadataPath, { force: true }),
        ]);
        return;
      }
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        throw error;
      }
    }
  }

  async downloadObject(file: StoredObjectFile): Promise<Response> {
    if (this.isLocalObjectFile(file)) {
      const [metadata, fileStats] = await Promise.all([
        this.readLocalMetadata(file),
        stat(file.filePath),
      ]);
      const stream = Readable.toWeb(createReadStream(file.filePath)) as ReadableStream;
      const headers = new Headers({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      headers.set("Content-Length", String(fileStats.size));
      return new Response(stream, { headers });
    }

    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers = new Headers({
      "Content-Type": String(metadata.contentType || "application/octet-stream"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (metadata.size) {
      headers.set("Content-Length", String(metadata.size));
    }
    return new Response(stream, { headers });
  }

  async canAccess(userId: string, file: StoredObjectFile): Promise<boolean> {
    if (this.isLocalObjectFile(file)) {
      const policy = await this.readLocalMetadata(file);
      return !!policy.owner && (policy.visibility === "public" || policy.owner === userId);
    }
    return canAccessObject(userId, file);
  }

  private createLocalObject(root: string, uploadId: string): LocalObjectFile {
    const uploadsDir = path.join(root, "uploads");
    return {
      kind: "local",
      filePath: path.join(uploadsDir, uploadId),
      metadataPath: path.join(uploadsDir, `${uploadId}.metadata.json`),
    };
  }

  private isLocalObjectFile(file: StoredObjectFile): file is LocalObjectFile {
    return "kind" in file && file.kind === "local";
  }

  private createLocalUploadSignature(
    uploadId: string,
    expiresAt: number,
    contentType: string,
  ): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error("SESSION_SECRET must be set before creating upload URLs.");
    }
    return createHmac("sha256", secret)
      .update(`${uploadId}:${expiresAt}:${contentType}`)
      .digest("hex");
  }

  private async readLocalMetadata(
    file: LocalObjectFile,
  ): Promise<LocalObjectMetadata> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file.metadataPath, "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
    if (!value || typeof value !== "object") {
      return {};
    }

    const metadata = value as Record<string, unknown>;
    return {
      contentType:
        typeof metadata.contentType === "string" ? metadata.contentType : undefined,
      owner: typeof metadata.owner === "string" ? metadata.owner : undefined,
      visibility:
        metadata.visibility === "public" || metadata.visibility === "private"
          ? metadata.visibility
          : undefined,
    };
  }

  private async writeLocalMetadata(
    file: LocalObjectFile,
    metadata: LocalObjectMetadata,
  ): Promise<void> {
    await writeFile(file.metadataPath, JSON.stringify(metadata), {
      mode: 0o600,
    });
  }

  private parseObjectPath(path: string): {
    bucketName: string;
    objectName: string;
  } {
    const parts = path.replace(/^\/+/, "").split("/");
    const bucketName = parts.shift();
    if (!bucketName || parts.length === 0 || parts.some((part) => part === "..")) {
      throw new Error("Invalid object storage path.");
    }
    return { bucketName, objectName: parts.join("/") };
  }

  private async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Unable to create a signed upload URL (${response.status}).`);
    }
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("signed_url" in body) ||
      typeof body.signed_url !== "string"
    ) {
      throw new Error("Object storage returned an invalid signed URL.");
    }
    return body.signed_url;
  }
}
