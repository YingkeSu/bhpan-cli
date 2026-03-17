import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { getCertFile } from "./config.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly payload: unknown,
  ) {
    super(message);
  }
}

export interface ResponseData {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

const httpsAgent = new https.Agent({
  ca: fs.readFileSync(getCertFile(), "utf8"),
  keepAlive: false,
});

function getClient(url: URL): typeof http | typeof https {
  return url.protocol === "https:" ? https : http;
}

function getAgent(url: URL): http.Agent | https.Agent | undefined {
  return url.protocol === "https:" ? httpsAgent : undefined;
}

export async function request(
  urlText: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string | Readable;
    timeoutMs?: number;
  } = {},
): Promise<ResponseData> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30000;
  const timer = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const body =
      options.body instanceof Readable
        ? (Readable.toWeb(options.body) as ReadableStream)
        : Buffer.isBuffer(options.body)
          ? new Uint8Array(options.body)
        : options.body;
    const response = await fetch(urlText, {
      method: options.method || "GET",
      headers: options.headers,
      body,
      redirect: "manual",
      signal: controller.signal,
      ...(options.body instanceof Readable ? { duplex: "half" as const } : {}),
    });
    const headers: http.IncomingHttpHeaders = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getSetCookie === "function") {
      const cookies = getSetCookie.call(response.headers);
      if (cookies.length) {
        headers["set-cookie"] = cookies;
      }
    }
    return {
      statusCode: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  } = {},
): Promise<T> {
  const response = await request(url, options);
  const text = response.body.toString("utf8");
  const payload = text ? (JSON.parse(text) as T) : (null as T);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(`HTTP ${response.statusCode}`, response.statusCode, payload);
  }
  return payload;
}

export async function followRedirects(
  url: string,
  maxRedirects = 10,
): Promise<ResponseData> {
  let next = url;
  for (let i = 0; i < maxRedirects; i += 1) {
    const response = await request(next);
    const location = response.headers.location;
    if (
      location &&
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      !location.startsWith("anyshare://")
    ) {
      next = new URL(location, next).toString();
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects");
}

export async function putFile(
  url: string,
  headers: Record<string, string>,
  body: Readable | Buffer | string,
): Promise<void> {
  const response = await request(url, {
    method: "PUT",
    headers,
    body,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Upload failed with status ${response.statusCode}`);
  }
}

export async function downloadToFile(
  urlText: string,
  output: fs.WriteStream,
): Promise<void> {
  const url = new URL(urlText);
  const client = getClient(url);
  await new Promise<void>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        agent: getAgent(url),
      },
      async (res) => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        try {
          await pipeline(res, output);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function downloadToWritable(
  urlText: string,
  writable: NodeJS.WritableStream,
): Promise<void> {
  const url = new URL(urlText);
  const client = getClient(url);
  await new Promise<void>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        agent: getAgent(url),
      },
      async (res) => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        try {
          await pipeline(
            res,
            new Transform({
              transform(chunk, _enc, cb) {
                writable.write(chunk);
                cb();
              },
            }),
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export function streamFromFile(filePath: string): Readable {
  return fs.createReadStream(filePath);
}
