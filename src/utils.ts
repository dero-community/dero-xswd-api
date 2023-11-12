import {
  ErrorResponse,
  Response,
  Result,
  ResultResponse,
} from "./types/response";
import { Entity } from "./types/types";
import { Method } from "./types/request";

async function hash(message: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return buf2hex(hash);
}
function buf2hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateAppId(appName: string): Promise<string> {
  return await hash(appName);
}

export async function sleep(timems: number) {
  await new Promise((r) => setTimeout(r, timems));
}

export function to<E extends Entity, M extends Method<E>, R extends Result>(
  response: Response<E, M, R>
): [ErrorResponse | undefined, ResultResponse<E, M> | undefined] {
  return [
    "error" in response ? (response.error as ErrorResponse) : undefined,
    "result" in response
      ? (response.result as ResultResponse<E, M>)
      : undefined,
  ];
}
