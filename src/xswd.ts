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
  GetTrackedAssets,
} from "./types/request";
import { AppInfo, Config, EventType } from "./types/types";
import makeDebug from "./debug";
import { Entry, Balance, Topoheight } from "./types/response";
import { Connection } from "./connection/connection";
import { FallbackConnection } from "./connection/fallback-connection";
import { XSWDConnection } from "./connection/xswd-connexion";
import { public_nodes } from "./utils";

let debug = makeDebug(false)("xswd");

const DEFAULT_FALLBACK_CONFIG = public_nodes.community;

const DEFAULT_CONFIG = { ip: "localhost", port: 44326 };
const DEFAULT_TIMEOUT = {
  AUTH_TIMEOUT: undefined,
  METHOD_TIMEOUT: undefined,
  BLOCK_TIMEOUT: undefined,
};

export class Api {
  _connection: Connection;
  _xswd_connection: XSWDConnection;
  status: { initialized: false } | { initialized: true; fallback: boolean } = {
    initialized: false,
  };
  _fallback_connection: FallbackConnection | null = null;

  appInfo: AppInfo;
  config: Config;
  fallback_config: Config;

  constructor(
    appInfo: AppInfo,
    config?: Config,
    // if xswd fails to connect, at least connect to a public node
    fallback_config: Config = DEFAULT_FALLBACK_CONFIG // or the default fallback value
  ) {
    debug = makeDebug(config?.debug || false)("xswd");
    debug("creating connection");
    checkAppInfo(appInfo);
    this.appInfo = appInfo;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      timeout: { ...DEFAULT_TIMEOUT, ...(config?.timeout || {}) },
    };
    this._xswd_connection = new XSWDConnection(appInfo, config);
    this._connection = this._xswd_connection;

    this.fallback_config = fallback_config;
    if (fallback_config) {
      this._fallback_connection = new FallbackConnection(fallback_config);
      this._connection = this._fallback_connection;
      this.status = { initialized: false };
    }
    debug("configured fallback:", this.fallback_config);
  }

  async initialize() {
    return new Promise<void>(async (resolve, reject) => {
      debug("initializing");

      if (this._fallback_connection) {
        debug("initializing fallback");
        await this._fallback_connection
          .initialize()
          .then(() => {
            console.log("fallback initialized:");
            this.status = { initialized: true, fallback: true };
          })
          .catch((error) => {
            console.warn("failed to initialize fallback:", error);
          });
      }

      this._xswd_connection = new XSWDConnection(this.appInfo, this.config);

      debug("initializing xswd");

      this._xswd_connection
        .initialize()
        .then(() => {
          debug("xswd initialized");
          this._fallback_connection?.close();
          this.status = { initialized: true, fallback: false };
          this._connection = this._xswd_connection;
          resolve();
        })
        .catch((error) => {
          if (this.status.initialized == true && this.status.fallback) {
            console.warn("failed to initialize xswd. staying in fallback mode");
            debug("" + error);
            resolve();
          } else {
            console.error("failed to initialize xswd or fallback:", error);
            reject(error);
          }
        });
    });
  }

  async close() {
    if (this.status.initialized) {
      this._fallback_connection?.close();
      this._xswd_connection.close();
      //this._connection.close();
    }
  }

  async subscribe(
    { event, callback }: { event: EventType; callback?: any },
    subscriptionType: "auto" | "permanent" = "permanent"
  ) {
    if (this.status.initialized && this._connection instanceof XSWDConnection) {
      const subscription = await this._xswd_connection.sendSync(
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
          this._xswd_connection.events[event].subscribed = subscriptionType;
          // dont overwrite user callback
          if (subscriptionType == "permanent") {
            this._xswd_connection.events[event].callback = callback;
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
    if (this.status.initialized && this._connection instanceof XSWDConnection) {
      return await this._xswd_connection._checkEvent(event, predicate);
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

    async GetTrackedAssets(params: GetTrackedAssets) {
      return await this._api._connection.sendSync(
        "wallet",
        "GetTrackedAssets",
        {
          jsonrpc: "2.0",
          method: "GetTrackedAssets",
          params,
        }
      );
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
