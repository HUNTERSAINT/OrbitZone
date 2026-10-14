import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";
import {
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type ObjectAclPolicy,
} from "./objectAcl";
import {
  ObjectNotFoundError,
  ObjectOwnershipError,
} from "./objectStorageErrors";
import {
  isRailwayStoredObject,
  RailwayObjectStorage,
  type RailwayStoredObject,
} from "./railwayObjectStorage";

const SIDECAR = "http://127.0.0.1:1106";
const railwayObjectStorage = new RailwayObjectStorage();

export { ObjectNotFoundError, ObjectOwnershipError };

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

type StoredObject = File | RailwayStoredObject;

export class ObjectStorageService {
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    }
    return dir.replace(/\/+$/, "");
  }

  async createUpload(
    contentType = "application/octet-stream",
  ): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;

    if (railwayObjectStorage.enabled) {
      return {
        uploadURL: await railwayObjectStorage.createUpload(
          objectPath,
          contentType,
        ),
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

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }

    if (railwayObjectStorage.enabled) {
      return railwayObjectStorage.getObject(objectPath);
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
    const object = await this.getObjectEntityFile(objectPath);
    if (isRailwayStoredObject(object)) {
      await railwayObjectStorage.claimObject(object, owner, visibility);
      return;
    }

    const current = await getObjectAclPolicy(object);
    if (current && current.owner !== owner) {
      throw new ObjectOwnershipError();
    }
    await setObjectAclPolicy(object, { owner, visibility });
  }

  async deleteObject(objectPath: string): Promise<void> {
    try {
      const object = await this.getObjectEntityFile(objectPath);
      if (isRailwayStoredObject(object)) {
        await railwayObjectStorage.deleteObject(object);
      } else {
        await object.delete({ ignoreNotFound: true });
      }
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        throw error;
      }
    }
  }

  async downloadObject(object: StoredObject): Promise<Response> {
    if (isRailwayStoredObject(object)) {
      return railwayObjectStorage.downloadObject(object);
    }

    const [metadata] = await object.getMetadata();
    const stream = Readable.toWeb(object.createReadStream()) as ReadableStream;
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

  async canAccess(userId: string, object: StoredObject): Promise<boolean> {
    if (isRailwayStoredObject(object)) {
      return railwayObjectStorage.canAccess(userId, object);
    }
    return canAccessObject(userId, object);
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
