import { unzip } from "fflate";

type ZipEntry = { name: string; bytes: Uint8Array };

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const input = new Uint8Array(event.data);
    unzip(input, (err, files) => {
      if (err) {
        self.postMessage({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      const entries: ZipEntry[] = Object.entries(files as Record<string, Uint8Array>).map(([name, bytes]) => ({
        name,
        bytes,
      }));
      const transfers = entries.map((entry) => entry.bytes.buffer);
      self.postMessage({ entries }, transfers);
    });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
