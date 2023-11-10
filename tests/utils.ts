export const NAME_SERVICE =
  "0000000000000000000000000000000000000000000000000000000000000001";
export const DERO =
  "0000000000000000000000000000000000000000000000000000000000000000";
export const ADDRESS_LENGTH = 66;

export async function installSC(wallet_url: string, code: string) {
  let buffer: string | Uint8Array = code;
  if (typeof code === "string") {
    buffer = new TextEncoder().encode(code);
  }
  return (
    await fetch(wallet_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    })
  ).json();
}
