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
