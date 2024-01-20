import {
  ErrorResponse,
  Response,
  Result,
  ResultResponse,
} from "./types/response";
import { Entity } from "./types/types";
import { Method } from "./types/request";
import "crypto";

/*
async function hash(message: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return buf2hex(hash);
}*/

function pseudoHash(message: string, length: number = 64) {
  message = new Array(64 - message.length)
    .fill(0)
    .map((_) => message)
    .join("");
  console.assert(message.length > 1, "message length must be > 1");
  return [...message]
    .map((char, i) =>
      Math.floor(char.charCodeAt(0) * ((7 + i) / (1 + (i % 7)))).toString(16)
    )
    .join("")
    .slice(0, 64);
}

/*
function buf2hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}*/

export function generateAppId(appName: string): string {
  return pseudoHash(appName);
}

export async function sleep(timems: number) {
  await new Promise((r) => setTimeout(r, timems));
}

export function to<
  E extends Entity,
  M extends Method<E>,
  R extends Result = Result
>(
  response: Response<E, M, R>
): [ErrorResponse | undefined, ResultResponse<E, M> | undefined] {
  return [
    "error" in response ? (response.error as ErrorResponse) : undefined,
    "result" in response
      ? (response.result as ResultResponse<E, M>)
      : undefined,
  ];
}
