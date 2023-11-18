import { Connection, FallbackConnection, XSWDConnection } from "./connection";
import {
  Echo,
  GetTransferbyTXID,
  GetTransfers,
  MakeIntegratedAddress,
  QueryKey,
  SplitIntegratedAddress,
  SCInvoke,
  DEROGetBlock,
  DEROGetBlockHeaderByHash,
  DEROGetBlockHeaderByTopoHeight,
  DEROGetBlockTemplate,
  DEROGetEncryptedBalance,
  DEROGetGasEstimate,
  DEROGetRandomAddress,
  DEROGetSC,
  DEROGetTransaction,
  DERONameToAddress,
  Transfer,
  GetBalance,
} from "./types/request";
import { AppInfo, EventType } from "./types/types";
import makeDebug from "./debug";
import { Entry, Balance, Topoheight } from "./types/response";

const debug = makeDebug("xswd");

const DEFAULT_FALLBACK_CONFIG = {
  ip: "dero-api.mysrv.cloud",
  port: 443,
};
// https://dero-api.mysrv.cloud/json_rpc
// dero-node-ca.mysrv.cloud:10102
// ams.derofoundation.org:11011
// 213.171.208.37:18089 (MySrvCloud)
// 5.161.123.196:11011 (MySrvCloud VA)
// 51.222.86.51:11011 (RabidMining Pool)
// 74.208.54.173:50404 (deronfts)
// 85.214.253.170:53387 (mmarcel-vps)
// 163.172.26.245:10505 (DeroStats)
// 44.198.24.170:20000 (pieswap)

export class Api {
  _connection: Connection;
  fallback_http_rpc: { ip: string; port: number } | null = null;
  initialized: boolean = false;
  appInfo: AppInfo;
  config: { ip: string; port: number } | undefined;
  constructor(
    appInfo: AppInfo,
    config?: {
      ip: string;
      port: number;
    },
    // if xswd fails to connect, at least connect to a public node
    fallback_http_rpc:
      | false // any falsy means deactivate fallback
      | null
      | undefined
      | {
          // else use the user defined config
          ip: string;
          port: number;
        } = DEFAULT_FALLBACK_CONFIG // or the default fallback value
  ) {
    debug("creating connection");
    checkAppInfo(appInfo);
    this.appInfo = appInfo;
    this.config = config;
    this._connection = new XSWDConnection(appInfo, config);

    if (fallback_http_rpc) {
      this.fallback_http_rpc = fallback_http_rpc;
    }
  }

  async initialize() {
    let initialisation = false;
    this._connection = new XSWDConnection(this.appInfo, this.config);

    try {
      initialisation = await this._connection.initialize();
      debug({ initialisation });
      this.initialized = initialisation;
    } catch (error) {
      debug({ error });
    } finally {
      if (!initialisation && this.fallback_http_rpc) {
        debug("falling back to public server", this.fallback_http_rpc);
        this._connection = new FallbackConnection(this.fallback_http_rpc);
      }
    }
    return initialisation;
  }

  async close() {
    if (this.initialized) {
      this._connection.close();
    }
  }

  async subscribe(
    { event, callback }: { event: EventType; callback?: any },
    subscriptionType: "auto" | "permanent" = "permanent"
  ) {
    if (this.initialized && this._connection instanceof XSWDConnection) {
      const subscription = await this._connection.sendSync(
        "wallet",
        "Subscribe",
        {
          jsonrpc: "2.0",
          method: "Subscribe",
          params: { event },
        }
      );
      if ("result" in subscription) {
        if (subscription.result) {
          this._connection.events[event].subscribed = subscriptionType;
          // dont overwrite user callback
          if (subscriptionType == "permanent") {
            this._connection.events[event].callback = callback;
          }
        }
        return subscription.result;
      }
      return false;
    }
    console.warn("cannot subscibe to events in fallback mode");
    return false;
  }

  async waitFor<
    ET extends EventType,
    EV = ET extends "new_balance"
      ? Balance
      : ET extends "new_topoheight"
      ? Topoheight
      : ET extends "new_entry"
      ? Entry
      : unknown
  >(event: ET, predicate?: (eventValue: EV) => boolean): Promise<EV> {
    if (this.initialized) {
      return await this._connection._checkEvent(event, predicate);
    }
    if (this._connection instanceof XSWDConnection) {
      throw "cannot wait for event if connection is not initialized";
    }
    throw "cannot wait for event in fallback mode";
  }

  wallet = {
    _api: this as Api,

    async Echo(params: Echo) {
      return await this._api._connection.sendSync("wallet", "Echo", {
        jsonrpc: "2.0",
        method: "Echo",
        params,
      });
    },
    async GetAddress() {
      return await this._api._connection.sendSync("wallet", "GetAddress", {
        jsonrpc: "2.0",
        method: "GetAddress",
        params: undefined,
      });
    },
    async GetBalance(params: GetBalance = {}) {
      return await this._api._connection.sendSync("wallet", "GetBalance", {
        jsonrpc: "2.0",
        method: "GetBalance",
        params,
      });
    },
    async GetHeight() {
      return await this._api._connection.sendSync("wallet", "GetHeight", {
        jsonrpc: "2.0",
        method: "GetHeight",
        params: undefined,
      });
    },
    async GetTransferbyTXID(params: GetTransferbyTXID) {
      return await this._api._connection.sendSync(
        "wallet",
        "GetTransferbyTXID",
        {
          jsonrpc: "2.0",
          method: "GetTransferbyTXID",
          params,
        }
      );
    },
    async GetTransfers(params: GetTransfers = {}) {
      return await this._api._connection.sendSync("wallet", "GetTransfers", {
        jsonrpc: "2.0",
        method: "GetTransfers",
        params,
      });
    },
    async MakeIntegratedAddress(params: MakeIntegratedAddress) {
      return await this._api._connection.sendSync(
        "wallet",
        "MakeIntegratedAddress",
        {
          jsonrpc: "2.0",
          method: "MakeIntegratedAddress",
          params,
        }
      );
    },
    async SplitIntegratedAddress(params: SplitIntegratedAddress) {
      return await this._api._connection.sendSync(
        "wallet",
        "SplitIntegratedAddress",
        {
          jsonrpc: "2.0",
          method: "SplitIntegratedAddress",
          params,
        }
      );
    },
    async QueryKey(params: QueryKey) {
      return await this._api._connection.sendSync("wallet", "QueryKey", {
        jsonrpc: "2.0",
        method: "QueryKey",
        params,
      });
    },
    async transfer(params: Transfer) {
      const response = await this._api._connection.sendSync(
        "wallet",
        "transfer",
        {
          jsonrpc: "2.0",
          method: "transfer",
          params,
        }
      );
      return response;
    },
    async scinvoke(params: SCInvoke) {
      const response = await this._api._connection.sendSync(
        "wallet",
        "scinvoke",
        {
          jsonrpc: "2.0",
          method: "scinvoke",
          params,
        }
      );

      if ("error" in response) {
        throw "could not scinvoke: " + response.error.message;
      }

      return response;
    },
  };
  node = {
    _api: this as Api,

    async Echo(params: Echo) {
      return await this._api._connection.sendSync("daemon", "DERO.Echo", {
        jsonrpc: "2.0",
        method: "DERO.Echo",
        params,
      });
    },
    async Ping() {
      return await this._api._connection.sendSync("daemon", "DERO.Ping", {
        jsonrpc: "2.0",
        method: "DERO.Ping",
        params: undefined,
      });
    },
    async GetInfo() {
      return await this._api._connection.sendSync("daemon", "DERO.GetInfo", {
        jsonrpc: "2.0",
        method: "DERO.GetInfo",
        params: undefined,
      });
    },
    async GetBlock(params: DEROGetBlock) {
      return await this._api._connection.sendSync("daemon", "DERO.GetBlock", {
        jsonrpc: "2.0",
        method: "DERO.GetBlock",
        params,
      });
    },
    async GetBlockHeaderByTopoHeight(params: DEROGetBlockHeaderByTopoHeight) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetBlockHeaderByTopoHeight",
        {
          jsonrpc: "2.0",
          method: "DERO.GetBlockHeaderByTopoHeight",
          params,
        }
      );
    },
    async GetBlockHeaderByHash(params: DEROGetBlockHeaderByHash) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetBlockHeaderByHash",
        {
          jsonrpc: "2.0",
          method: "DERO.GetBlockHeaderByHash",
          params,
        }
      );
    },
    async GetTxPool() {
      return await this._api._connection.sendSync("daemon", "DERO.GetTxPool", {
        jsonrpc: "2.0",
        method: "DERO.GetTxPool",
        params: undefined,
      });
    },
    async GetRandomAddress(params: DEROGetRandomAddress = {}) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetRandomAddress",
        {
          jsonrpc: "2.0",
          method: "DERO.GetRandomAddress",
          params,
        }
      );
    },
    async GetTransaction(params: DEROGetTransaction) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetTransaction",
        {
          jsonrpc: "2.0",
          method: "DERO.GetTransaction",
          params,
        }
      );
    },
    /*async SendRawTransaction(params: DEROSendRawTransaction) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.SendRawTransaction",
        {
          jsonrpc: "2.0",
          method: "DERO.SendRawTransaction",
          params,
        }
      );
    },*/
    async GetHeight() {
      return await this._api._connection.sendSync("daemon", "DERO.GetHeight", {
        jsonrpc: "2.0",
        method: "DERO.GetHeight",
        params: undefined,
      });
    },
    async GetBlockCount() {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetBlockCount",
        {
          jsonrpc: "2.0",
          method: "DERO.GetBlockCount",
          params: undefined,
        }
      );
    },
    async GetLastBlockHeader() {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetLastBlockHeader",
        {
          jsonrpc: "2.0",
          method: "DERO.GetLastBlockHeader",
          params: undefined,
        }
      );
    },
    async GetBlockTemplate(params: DEROGetBlockTemplate) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetBlockTemplate",
        {
          jsonrpc: "2.0",
          method: "DERO.GetBlockTemplate",
          params,
        }
      );
    },
    async GetEncryptedBalance(params: DEROGetEncryptedBalance) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetEncryptedBalance",
        {
          jsonrpc: "2.0",
          method: "DERO.GetEncryptedBalance",
          params,
        }
      );
    },
    async GetSC(params: DEROGetSC, waitAfterNewBlock?: true) {
      if (waitAfterNewBlock) {
        debug("waiting for new block");
        this._api.subscribe({ event: "new_topoheight" }, "auto");
        await this._api.waitFor("new_topoheight");
      }
      return await this._api._connection.sendSync("daemon", "DERO.GetSC", {
        jsonrpc: "2.0",
        method: "DERO.GetSC",
        params,
      });
    },
    async GetGasEstimate(params: DEROGetGasEstimate) {
      // use gasEstimateSCArgs() to simplify usage
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.GetGasEstimate",
        {
          jsonrpc: "2.0",
          method: "DERO.GetGasEstimate",
          params,
        }
      );
    },
    async NameToAddress(params: DERONameToAddress) {
      return await this._api._connection.sendSync(
        "daemon",
        "DERO.NameToAddress",
        {
          jsonrpc: "2.0",
          method: "DERO.NameToAddress",
          params,
        }
      );
    },
  };
}

function checkAppInfo(appInfo: AppInfo) {
  if (appInfo.name !== undefined && appInfo.name.length == 0) {
    throw "invalid app name";
  }
  if (appInfo.description !== undefined && appInfo.description.length == 0) {
    throw "invalid app description";
  }
  if (appInfo.id !== undefined && appInfo.id.length != 64) {
    throw "invalid app id";
  }
}
