import type { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export async function setObjectAclPolicy(
  file: File,
  policy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error("Object not found.");
  }

  await file.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(policy),
    },
  });
}

export async function getObjectAclPolicy(
  file: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await file.getMetadata();
  const raw = metadata.metadata?.[ACL_POLICY_METADATA_KEY];
  if (typeof raw !== "string") {
    return null;
  }

  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("owner" in value) ||
    typeof value.owner !== "string" ||
    !("visibility" in value) ||
    (value.visibility !== "public" && value.visibility !== "private")
  ) {
    return null;
  }

  return { owner: value.owner, visibility: value.visibility };
}

export async function canAccessObject(
  userId: string,
  file: File,
): Promise<boolean> {
  const policy = await getObjectAclPolicy(file);
  return !!policy && (policy.visibility === "public" || policy.owner === userId);
}
