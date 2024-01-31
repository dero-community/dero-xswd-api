import { describe, expect, beforeAll, test, afterAll } from "@jest/globals";
import { Api, AppInfo, Result, sleep, to } from "../src";

import WebSocket from "ws";
import fetch from "node-fetch";

Object.assign(global, { TextDecoder, TextEncoder, WebSocket, fetch });

const TIMEOUT = 40000;

const appName = "test";

const appInfo: AppInfo = {
  id: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  name: appName,
  description: "A brief testing application",
  url: "http://localhost",
};
let xswd = new Api(
  appInfo,
  { debug: false, address: "localhost", port: 40000 },
  { address: "localhost", port: 20000, secure: false }
);

beforeAll(async () => {
  await xswd.initialize(); // TODO use xswd.initializeFallback()
}, TIMEOUT);

afterAll(async () => {
  await xswd.close();
});

describe("public daemon", () => {
  test(
    "GetInfo",
    async () => {
      const response = await xswd.node.GetInfo();
      const [error, result] = to<"daemon", "DERO.GetInfo", Result>(response);
      console.log({ error, result });

      expect(error).toBeUndefined();
    },
    TIMEOUT
  );

  test("close", async () => {
    await xswd.close();
    await sleep(200);
  });
});
