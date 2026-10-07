import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { File } from "expo-file-system";

export async function hashFile(file: File): Promise<string> {
  const hasher = sha256.create();
  const reader = file.readableStream().getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value) hasher.update(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return bytesToHex(hasher.digest());
}
