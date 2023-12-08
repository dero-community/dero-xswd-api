import { describe, expect, beforeAll, test } from "@jest/globals";
import { Api } from "../src/xswd";
import { AppInfo, Hash } from "../src/types/types";
import { sleep, to } from "../src/utils";
import { ADDRESS_LENGTH, DERO, NAME_SERVICE, installSC } from "./utils";
import { gasEstimateSCArgs, scinvokeSCArgs } from "../src/types/request";
import { TextEncoder, TextDecoder } from "util";
import WebSocket from "ws";
Object.assign(global, { TextDecoder, TextEncoder, WebSocket });

const TIMEOUT = 40000;

const skip = (a: any, b: any) => {};

const appName = "test";

const appInfo: AppInfo = {
  id: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  name: appName,
  description: "A brief testing application",
  url: "http://localhost",
};

const TEST_SC = `
Function Initialize() Uint64
  10 RETURN 0
End Function
`;

async function installTestSC(): Promise<{ txid: string }> {
  return installSC("http://127.0.0.1:30000/install_sc", TEST_SC);
}
//! Need to fill with another valid address to test transfers
let address2 =
  "deto1qyre7td6x9r88y4cavdgpv6k7lvx6j39lfsx420hpvh3ydpcrtxrxqg8v8e3z";
let xswd = new Api(appInfo);
let scid: Hash;
let address: string;

async function createCaptainName() {
  const response = await xswd.wallet.scinvoke({
    scid: NAME_SERVICE,
    ringsize: 2,
    sc_rpc: [
      {
        name: "entrypoint",
        datatype: "S",
        value: "Register",
      },
      {
        name: "name",
        datatype: "S",
        value: "captain",
      },
    ],
  });
  const [error, result] = to<"wallet", "scinvoke">(response);
  if (error || result === undefined) {
    throw error?.message;
  }

  await xswd.waitFor("new_entry", (v) => v.txid == result?.txid);
}

beforeAll(async () => {
  await xswd.initialize();
  console.log({ status: xswd.status });

  console.log("Installing SC");

  const { txid } = await installTestSC();
  scid = txid;
  const addressResponse = await xswd.wallet.GetAddress();
  address = "result" in addressResponse ? addressResponse.result.address : "";
  await xswd.subscribe({ event: "new_entry" });
  await xswd.subscribe({ event: "new_topoheight" });
  await xswd.subscribe({ event: "new_balance" });
  await createCaptainName();
}, TIMEOUT * 2);

describe("commands", () => {
  describe("node", () => {
    test("wrong format", async () => {
      //@ts-ignore
      const response = await xswd.node.Echo({});
      expect("error" in response).toBe(true);
    });

    test("DERO.Echo", async () => {
      const echoStrings = ["hello", "world"];
      const response = await xswd.node.Echo(echoStrings);
      expect(response).toMatchObject({
        result: `DERO ${echoStrings.join(" ")}`,
      });
    });

    test("DERO.Ping", async () => {
      const response = await xswd.node.Ping();
      expect(response).toMatchObject({ result: "Pong " });
    });

    test("DERO.GetInfo", async () => {
      const response = await xswd.node.GetInfo();

      const [error, result] = to<"daemon", "DERO.GetInfo">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetBlock", async () => {
      const response = await xswd.node.GetBlock({});
      const [error, result] = to<"daemon", "DERO.GetBlock">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetBlockHeaderByTopoHeight", async () => {
      const response = await xswd.node.GetBlockHeaderByTopoHeight({
        topoheight: 0,
      });
      const [error, result] = to<"daemon", "DERO.GetBlockHeaderByTopoHeight">(
        response
      );
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetBlockHeaderByHash", async () => {
      const hashResponse = await xswd.node.GetBlockHeaderByTopoHeight({
        topoheight: 0,
      });
      if ("result" in hashResponse) {
        const hash = hashResponse.result.block_header.hash;
        const response = await xswd.node.GetBlockHeaderByHash({
          hash,
        });
        const [error, result] = to<"daemon", "DERO.GetBlockHeaderByHash">(
          response
        );
        expect(error).toBeUndefined();
        expect(result?.status).toBe("OK");
      } else {
        throw "GetBlockHeaderByTopoHeight failed for GetBlockHeaderByHash";
      }
    });

    test("DERO.GetTxPool", async () => {
      const response = await xswd.node.GetTxPool();
      const [error, result] = to<"daemon", "DERO.GetTxPool">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetRandomAddress", async () => {
      const response = await xswd.node.GetRandomAddress();
      const [error, result] = to<"daemon", "DERO.GetRandomAddress">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetTransaction", async () => {
      const response = await xswd.node.GetTransaction({
        txs_hashes: [],
      });
      const [error, result] = to<"daemon", "DERO.GetTransaction">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
      expect(result?.txs).toBeDefined();
    });

    test("DERO.SendRawTransaction", async () => {
      // TODO untested
    });

    test("DERO.GetHeight", async () => {
      const response = await xswd.node.GetHeight();
      const [error, result] = to<"daemon", "DERO.GetHeight">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetBlockCount", async () => {
      const response = await xswd.node.GetBlockCount();
      const [error, result] = to<"daemon", "DERO.GetBlockCount">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetLastBlockHeader", async () => {
      const response = await xswd.node.GetLastBlockHeader();
      const [error, result] = to<"daemon", "DERO.GetLastBlockHeader">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetBlockTemplate", async () => {
      const response = await xswd.node.GetBlockTemplate({
        wallet_address: address,
        block: true,
        miner: address,
      });

      const [error, result] = to<"daemon", "DERO.GetBlockTemplate">(response);
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test("DERO.GetEncryptedBalance", async () => {
      const response = await xswd.node.GetEncryptedBalance({
        address,
        topoheight: -1,
      });

      const [error, result] = to<"daemon", "DERO.GetEncryptedBalance">(
        response
      );
      expect(error).toBeUndefined();
      expect(result?.status).toBe("OK");
    });

    test(
      "DERO.GetSC",
      async () => {
        const response = await xswd.node.GetSC(
          {
            scid,
            code: true,
            variables: true,
          },
          true
        );

        const [error, result] = to<"daemon", "DERO.GetSC">(response);

        expect(error).toBeUndefined();
        expect(result?.code == TEST_SC);
      },
      TIMEOUT * 3
    );

    test("DERO.GetGasEstimate", async () => {
      const response = await xswd.node.GetGasEstimate({
        sc_rpc: gasEstimateSCArgs(scid, "Initialize", []),
        signer: address,
      });

      const [error, result] = to<"daemon", "DERO.GetGasEstimate">(response);

      expect(error).toBeUndefined();
      expect(result?.gasstorage).toBeGreaterThan(0);
    });

    test("DERO.NameToAddress", async () => {
      const response = await xswd.node.NameToAddress({
        name: "captain",
        topoheight: -1,
      });
      const [error, result] = to<"daemon", "DERO.NameToAddress">(response);
      expect(error).toBeUndefined();
      expect(result?.address).toBe(address);
    });
  });

  describe("wallet", () => {
    test("Echo", async () => {
      const echoStrings = ["hello", "world"];
      const response = await xswd.wallet.Echo(echoStrings);
      expect(response).toMatchObject({
        result: `WALLET ${echoStrings.join(" ")}`,
      });
    });
    test("GetAddress", async () => {
      const response = await xswd.wallet.GetAddress();

      const [error, result] = to<"wallet", "GetAddress">(response);
      expect(error).toBeUndefined();
      expect(result?.address.length).toBe(ADDRESS_LENGTH);
    });
    test("GetBalance", async () => {
      const response = await xswd.wallet.GetBalance();

      const [error, result] = to<"wallet", "GetBalance">(response);
      expect(error).toBeUndefined();
      expect(result?.balance).toBeGreaterThan(0);
    });
    test("GetHeight", async () => {
      const response = await xswd.wallet.GetHeight();
      const [error, result] = to<"wallet", "GetHeight">(response);
      expect(error).toBeUndefined();
      expect(result?.height).toBeGreaterThanOrEqual(0);
    });
    test("GetTransferbyTXID", async () => {
      const transferResponse = await xswd.wallet.transfer({
        transfers: [
          {
            scid: DERO,
            amount: 10000,
            destination: address2,
          },
        ],
      });
      const [transferError, transferResult] = to<"wallet", "transfer">(
        transferResponse
      );
      if (transferError || transferResult === undefined) {
        throw transferError?.message;
      }

      await xswd.waitFor("new_entry", (v) => v.txid === transferResult.txid);

      const response = await xswd.wallet.GetTransferbyTXID({
        txid: transferResult.txid,
      });

      const [error /*resultResponse*/] = to<"wallet", "GetTransferbyTXID">(
        response
      );
      expect(error).toBeUndefined();
      //expect(resultResponse?.result.) // TODO
    });
    test("GetTransfers", async () => {
      const response = await xswd.wallet.GetTransfers({
        out: true,
        in: true,
      });

      const [error, result] = to<"wallet", "GetTransfers">(response);
      expect(error).toBeUndefined();
      expect(result?.entries).not.toBeUndefined();
    });

    skip("MakeIntegratedAddress", async () => {
      const response = await xswd.wallet.MakeIntegratedAddress({
        address,
        payload_rpc: {
          name: "Comment",
          datatype: "S",
          value: "Hello from integrated address !",
        },
      }); //! Unsolved Error invalid parameters // TODO

      const [error /*resultResponse*/] = to<"wallet", "MakeIntegratedAddress">(
        response
      );
      expect(error).toBeUndefined();
      //expect(resultResponse?.result.entries).toBeEmpty(); // TODO
    });
    //TIMEOUT

    skip("SplitIntegratedAddress", async () => {});

    test("QueryKey", async () => {
      const response = await xswd.wallet.QueryKey({
        key_type: "mnemonic",
      });

      const [error /*resultResponse*/] = to<"wallet", "QueryKey">(response);
      expect(error).toBeUndefined();
      //expect(resultResponse?.result.entries).toBeEmpty(); // TODO
    });

    test(
      "scinvoke",
      async () => {
        const response = await xswd.wallet.scinvoke({
          scid,
          sc_rpc: scinvokeSCArgs("Initialize", []),
        });

        const [error /*resultResponse*/] = to<"wallet", "scinvoke">(response);

        expect(error).toBeUndefined();
        // expect(resultResponse) // TODO
      },
      TIMEOUT
    );

    test(
      "transfer",
      async () => {
        const response = await xswd.wallet.transfer({
          transfers: [
            {
              scid: DERO,
              amount: 1000,
              destination: address2,
            },
          ],
        });

        const [error /*resultResponse*/] = to<"wallet", "transfer">(response);
        expect(error).toBeUndefined();
        // expect(resultResponse) // TODO
      },
      TIMEOUT
    );

    test(
      "transfer2",
      async () => {
        const response = await xswd.wallet.transfer({
          transfers: [],
          sc_rpc: scinvokeSCArgs("Initialize", []),
          ringsize: 32,
        });

        const [error /*resultResponse*/] = to<"wallet", "transfer">(response);
        expect(error).toBeUndefined();
        // expect(resultResponse) // TODO
      },
      TIMEOUT
    );

    test(
      "getTrackedAssets",
      async () => {
        const response = await xswd.wallet.GetTrackedAssets({
          skip_balance_check: false,
          only_positive_balances: false,
        });
        const [error, resultResponse] = to<"wallet", "GetTrackedAssets">(
          response
        );
        console.warn("GetTrackedAssets", { resultResponse });

        expect(error).toBeUndefined();
      },
      TIMEOUT
    );
  });
});
describe("events", () => {
  test(
    "new_topoheight",
    async () => {
      xswd.subscribe({
        event: "new_topoheight",
        callback: () => {
          expect(true).toBe(true);
        },
      });

      await xswd.waitFor("new_topoheight");
    },
    TIMEOUT
  );

  test(
    "new_balance",
    async () => {
      const response = await xswd.wallet.GetBalance();
      if ("error" in response) {
        throw "cannot get balance: " + response.error.message;
      }
      console.log("initial balance: " + response.result.balance);

      await xswd.subscribe({
        event: "new_balance",
        callback: (result: any) => {
          console.warn(result);
        },
      });

      await xswd.wallet.transfer({
        transfers: [{ amount: 100000, destination: address2 }],
      });

      await xswd.waitFor("new_balance");
    },
    TIMEOUT
  );

  test("(convenience)", async () => {
    await sleep(4000);
  });
});

describe("end", () => {
  test("close", async () => {
    xswd.close();
    await sleep(5000);
  }, 10000);
});
