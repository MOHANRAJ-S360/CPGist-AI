import { unzipSync } from "fflate";

type ZipEntry = { name: string; bytes: Uint8Array };

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; wanted: string[] }>) => {
  try {
    const input = new Uint8Array(event.data.buffer);
    const wanted = new Set((event.data.wanted || []).map(x => x.toLowerCase()));
    const files = unzipSync(input, {
      filter(file: any) {
        const name = String(file?.name || "").split("/").pop()?.toLowerCase() || "";
        return wanted.size === 0 || wanted.has(name);
      },
    });
    const entries: ZipEntry[] = Object.entries(files as Record<string, Uint8Array>).map(([name, bytes]) => ({
      name,
      bytes,
    }));
    const transfers = entries.map((entry) => entry.bytes.buffer);
    self.postMessage({ entries }, transfers);
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
