import {
  ErrorResponse,
  Response,
  Result,
  ResultResponse,
} from "./types/response";
import { Entity } from "./types/types";
import { Method } from "./types/request";

export const public_nodes = {
  community: { ip: "145.239.102.246", port: 10102 },
  community_testnet: { ip: "145.239.102.246", port: 40402 },
  official: { ip: "dero-api.mysrv.cloud", port: 80 },
  official2: { ip: "dero-node-ca.mysrv.cloud", port: 10102 },
  foundation: { ip: "ams.derofoundation.org", port: 11011 },
  MySrvCloud: { ip: "213.171.208.37", port: 18089 },
  MySrvCloud_VA: { ip: "5.161.123.196", port: 11011 },
  RabidMining_Pool: { ip: "51.222.86.51", port: 11011 },
  deronfts: { ip: "74.208.54.173", port: 50404 },
  mmarcel_vps: { ip: "85.214.253.170", port: 53387 },
  DeroStats: { ip: "163.172.26.245", port: 10505 },
  pieswap: { ip: "44.198.24.170", port: 20000 },
};

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
