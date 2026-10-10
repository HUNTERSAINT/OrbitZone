import demoManPhoto from "@assets/generated_images/orbit-zone-demo-man-1.jpg";
import demoWomanOnePhoto from "@assets/generated_images/orbit-zone-demo-woman-1.jpg";
import demoWomanTwoPhoto from "@assets/generated_images/orbit-zone-demo-woman-2.jpg";

const demoPhotos: Record<string, string> = {
  "orbit-zone-demo-man-1.jpg": demoManPhoto,
  "orbit-zone-demo-woman-1.jpg": demoWomanOnePhoto,
  "orbit-zone-demo-woman-2.jpg": demoWomanTwoPhoto,
};

export function profilePhotoUrl(path?: string): string {
  if (!path) return "";
  if (path.startsWith("demo:/")) {
    return demoPhotos[path.slice("demo:/".length)] ?? "";
  }
  return `/api/storage${path}`;
}
