import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";
import {
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type ObjectAclPolicy,
} from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";

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
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    }
    return dir.replace(/\/+$/, "");
  }

  async createUpload(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;
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

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/".length);
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
    const current = await getObjectAclPolicy(file);
    if (current && current.owner !== owner) {
      throw new ObjectOwnershipError();
    }
    await setObjectAclPolicy(file, { owner, visibility });
  }

  async deleteObject(objectPath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        throw error;
      }
    }
  }

  async downloadObject(file: File): Promise<Response> {
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

  async canAccess(userId: string, file: File): Promise<boolean> {
    return canAccessObject(userId, file);
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
