import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectAclPolicy } from "./objectAcl";
import {
  ObjectNotFoundError,
  ObjectOwnershipError,
} from "./objectStorageErrors";

const REQUIRED_VARIABLES = [
  "BUCKET",
  "ACCESS_KEY_ID",
  "SECRET_ACCESS_KEY",
  "ENDPOINT",
  "REGION",
] as const;

const OBJECT_PATH_PATTERN = /^\/objects\/uploads\/([0-9a-f-]{36})$/i;
const ACL_OWNER_TAG = "orbitzone-acl-owner";
const ACL_VISIBILITY_TAG = "orbitzone-acl-visibility";

export type RailwayStoredObject = {
  backend: "railway-s3";
  key: string;
};

type RailwayS3Configuration = {
  bucket: string;
  client: S3Client;
};

export function isRailwayStoredObject(
  object: unknown,
): object is RailwayStoredObject {
  return (
    !!object &&
    typeof object === "object" &&
    "backend" in object &&
    object.backend === "railway-s3" &&
    "key" in object &&
    typeof object.key === "string"
  );
}

export class RailwayObjectStorage {
  readonly enabled: boolean;
  private readonly configuration: RailwayS3Configuration | null;

  constructor() {
    const values = Object.fromEntries(
      REQUIRED_VARIABLES.map((name) => [name, process.env[name]?.trim() ?? ""]),
    ) as Record<(typeof REQUIRED_VARIABLES)[number], string>;
    const hasAnyConfiguration = Object.values(values).some(Boolean);

    if (!hasAnyConfiguration) {
      if (process.env.RAILWAY_ENVIRONMENT_ID) {
        throw new Error(
          "Railway S3 bucket variables must be configured before the API server starts.",
        );
      }
      this.enabled = false;
      this.configuration = null;
      return;
    }

    const missing = REQUIRED_VARIABLES.filter((name) => !values[name]);
    if (missing.length) {
      throw new Error(
        `Railway S3 bucket configuration is incomplete: ${missing.join(", ")}.`,
      );
    }

    this.configuration = {
      bucket: values.BUCKET,
      client: new S3Client({
        endpoint: values.ENDPOINT,
        region: values.REGION,
        forcePathStyle: false,
        credentials: {
          accessKeyId: values.ACCESS_KEY_ID,
          secretAccessKey: values.SECRET_ACCESS_KEY,
        },
      }),
    };
    this.enabled = true;
  }

  async createUpload(objectPath: string, contentType: string): Promise<string> {
    const key = this.objectKey(objectPath);
    const { bucket, client } = this.requireConfiguration();
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 900 },
    );
  }

  async getObject(objectPath: string): Promise<RailwayStoredObject> {
    const key = this.objectKey(objectPath);
    const { bucket, client } = this.requireConfiguration();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (this.isMissingObject(error)) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
    return { backend: "railway-s3", key };
  }

  async claimObject(
    object: RailwayStoredObject,
    owner: string,
    visibility: ObjectAclPolicy["visibility"],
  ): Promise<void> {
    const { bucket, client } = this.requireConfiguration();
    const current = await this.getAclPolicy(object.key);
    if (current && current.owner !== owner) {
      throw new ObjectOwnershipError();
    }
    await client.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: object.key,
        Tagging: {
          TagSet: [
            { Key: ACL_OWNER_TAG, Value: owner },
            { Key: ACL_VISIBILITY_TAG, Value: visibility },
          ],
        },
      }),
    );
  }

  async deleteObject(object: RailwayStoredObject): Promise<void> {
    const { bucket, client } = this.requireConfiguration();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: object.key }),
    );
  }

  async downloadObject(object: RailwayStoredObject): Promise<Response> {
    const { bucket, client } = this.requireConfiguration();
    const storedObject = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: object.key }),
    );
    const headers = new Headers({
      "Content-Type": storedObject.ContentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (storedObject.ContentLength != null) {
      headers.set("Content-Length", String(storedObject.ContentLength));
    }
    return new Response(storedObject.Body?.transformToWebStream() ?? null, {
      headers,
    });
  }

  async canAccess(
    userId: string,
    object: RailwayStoredObject,
  ): Promise<boolean> {
    const policy = await this.getAclPolicy(object.key);
    return (
      !!policy && (policy.visibility === "public" || policy.owner === userId)
    );
  }

  private async getAclPolicy(key: string): Promise<ObjectAclPolicy | null> {
    const { bucket, client } = this.requireConfiguration();
    const result = await client.send(
      new GetObjectTaggingCommand({ Bucket: bucket, Key: key }),
    );
    const tags = new Map(
      (result.TagSet ?? [])
        .filter(
          (tag): tag is { Key: string; Value: string } =>
            typeof tag.Key === "string" && typeof tag.Value === "string",
        )
        .map((tag) => [tag.Key, tag.Value]),
    );
    const owner = tags.get(ACL_OWNER_TAG);
    const visibility = tags.get(ACL_VISIBILITY_TAG);
    if (
      !owner ||
      (visibility !== "public" && visibility !== "private")
    ) {
      return null;
    }
    return { owner, visibility };
  }

  private objectKey(objectPath: string): string {
    const match = OBJECT_PATH_PATTERN.exec(objectPath);
    if (!match) {
      throw new ObjectNotFoundError();
    }
    return `uploads/${match[1]}`;
  }

  private requireConfiguration(): RailwayS3Configuration {
    if (!this.configuration) {
      throw new Error("Railway S3 bucket storage is not configured.");
    }
    return this.configuration;
  }

  private isMissingObject(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const detail = error as {
      name?: unknown;
      $metadata?: { httpStatusCode?: unknown };
    };
    return (
      detail.name === "NotFound" ||
      detail.name === "NoSuchKey" ||
      detail.$metadata?.httpStatusCode === 404
    );
  }
}
