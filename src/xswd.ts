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
  Method,
  JSONRPCRequestBody,
} from "./types/request";
import {
  AppInfo,
  Config,
  ConnectionState,
  Entity,
  EventType,
} from "./types/types";
import makeDebug from "./debug";
import {
  Response,
  Entry,
  Balance,
  Topoheight,
  Result,
  AuthResponse,
  EventResponse,
} from "./types/response";

import { Chan } from "@lesomnus/channel";
import { sleep } from "./utils";

let debug = makeDebug(false)("xswd");

const DEFAULT_CONFIG: Config = {
  address: "127.0.0.1",
  port: 44326,
  secure: false,
  debug: false,
};
const DEFAULT_TIMEOUT = {
  AUTH_TIMEOUT: undefined,
  METHOD_TIMEOUT: undefined,
  BLOCK_TIMEOUT: undefined,
};
const CHECK_INTERVAL = 500;

function checkConfig(config: Config) {
  if (!config.address) {
    throw "missing address in fallback config";
  }
}

enum ConnectionType {
  XSWD = "xswd",
  Fallback = "fallback",
}

export class Api {
  connection: { [ct in ConnectionType]: WebSocket | null } = {
    xswd: null,
    fallback: null,
  };

  state: { [ct in ConnectionType]: ConnectionState } = {
    xswd: ConnectionState.Closed,
    fallback: ConnectionState.Closed,
  };

  buffer: string = "";

  appInfo: AppInfo;
  config: {
    [k in ConnectionType]: k extends ConnectionType.XSWD
      ? Config
      : Config | null;
  };

  response: Chan<Response<Entity, Method<Entity>, Result>> = new Chan(0);
  subscriptions: {
    events: {
      [et in EventType]: {
        enabled: boolean;
        waiting: Chan<any>[]; // when using waitfor a channel is added here
        callback?: (eventValue?: any) => void; // callback defined on subscription
      };
    };
  } = {
    events: {
      new_topoheight: {
        enabled: false,
        waiting: [],
        callback: undefined,
      },
      new_entry: {
        enabled: false,
        waiting: [],
        callback: undefined,
      },
      new_balance: {
        enabled: false,
        waiting: [],
        callback: undefined,
      },
    },
  };

  private nextId: number = 1;

  public get mode(): ConnectionType {
    return this.state.xswd == ConnectionState.Accepted
      ? ConnectionType.XSWD
      : this.state.fallback != ConnectionState.Accepted
      ? ConnectionType.XSWD
      : ConnectionType.Fallback;
  }

  constructor(
    appInfo: AppInfo,
    config?: Config,
    // if xswd fails to connect, at least connect to a public node
    fallback_config: Config | null = null // no fallback setup by default
  ) {
    debug = makeDebug(config?.debug || false)("xswd");
    debug("creating connection");

    checkAppInfo(appInfo);
    this.appInfo = appInfo;
    if (fallback_config) {
      checkConfig(fallback_config);
      debug("configured fallback:", fallback_config);
    }

    this.config = {
      xswd: {
        ...DEFAULT_CONFIG,
        ...(config || {}),
        timeout: { ...DEFAULT_TIMEOUT, ...(config?.timeout || {}) },
      },
      fallback: fallback_config,
    };
  }

  // deprecated
  async initialize() {
    debug("initializing api");
    if (this.config.fallback) {
      await this.initializeFallback().finally(async () => {
        await this.initializeXSWD();
      });
    } else {
      await this.initializeXSWD();
    }
  }

  async initializeFallback() {
    return new Promise<void>(async (resolve, reject) => {
      debug("initializing fallback");

      if (this.config.fallback) {
        this._initializeWebsocket(ConnectionType.Fallback)
          .then(() => {
            debug("fallback intitialized");
            resolve();
          })
          .catch((error) => {
            console.warn("failed to initialize fallback:", error);
            reject(error);
          });
      } else {
        reject("fallback has no config");
      }
    });
  }

  async initializeXSWD() {
    return new Promise<void>(async (resolve, reject) => {
      debug("initializing xswd");

      this._initializeWebsocket(ConnectionType.XSWD)
        .then(() => {
          debug("xswd initialized");
          this.closeFallback();

          resolve();
        })
        .catch((error) => {
          if (this.state.fallback == ConnectionState.Accepted) {
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

  async _initializeWebsocket(connectionType: ConnectionType) {
    return new Promise<void>((resolve, reject) => {
      debug("initialize " + connectionType);
      const websocket = this.connection[connectionType];

      if (websocket !== null && websocket.readyState == WebSocket.OPEN) {
        throw "WebSocket is aleady alive";
      }

      this.state[connectionType] = ConnectionState.Initializing;
      const config = this.config[connectionType];
      if (config != null) {
        const protocol = config.secure ? "wss" : "ws";
        const port = config.port ? `:${config.port}` : "";
        const path = connectionType == ConnectionType.XSWD ? "xswd" : "ws";
        const url = `${protocol}://${config.address}${port}/${path}`;

        this.connection[connectionType] = new WebSocket(url);
        debug(connectionType + " websocket created for " + url);

        this._setupHandlers(connectionType, resolve, reject);
      }
    });
  }

  _handleFragmentedData(
    message: MessageEvent<any>
  ):
    | AuthResponse
    | EventResponse
    | Response<Entity, Method<Entity>, "error">
    | Response<Entity, Method<Entity>, "result">
    | null {
    //debug("WebSocket:onmessage", { message });
    // fragmented messages handling
    try {
      // default parsing a single message
      return JSON.parse(message.data.toString());
    } catch (error) {
      // sometimes the result is split in multiple message so we need to buffer
      this.buffer = this.buffer + message.data.toString();
      try {
        // we keep parsing the buffer after updating it to check if the result is complete
        const data = JSON.parse(this.buffer);
        // success => we empty the buffer
        this.buffer = "";
        return data;
      } catch (error) {
        // not parsable yet, better luck next message
        return null;
      }
    }
  }

  async _setupHandlers(
    connectionType: ConnectionType,
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (reason?: any) => void
  ) {
    const websocket = this.connection[connectionType];
    if (websocket) {
      websocket.onmessage = async (message) => {
        let data:
          | AuthResponse
          | EventResponse
          | Response<Entity, Method<Entity>, "error">
          | Response<Entity, Method<Entity>, "result">
          | null;

        data = this._handleFragmentedData(message); // some message are not received in a single frame, this function buffers until message is parsable
        if (data == null) return;

        if (connectionType == ConnectionType.XSWD) {
          if ("accepted" in data) {
            if (data.accepted === true) {
              this.state[ConnectionType.XSWD] = ConnectionState.Accepted;
              debug("connection accepted");
              resolve();
            } else if (data.accepted === false) {
              this.state[ConnectionType.XSWD] = ConnectionState.Refused;
              debug("connection refused", data);
              reject("connection refused: " + data.message);
            }
          }
        }

        if ("error" in data) {
          const errorData: Response<Entity, Method<Entity>, "error"> = data;
          await this.response.send(errorData);
          reject(errorData.error.message);
        } else if ("result" in data) {
          // event
          if (
            connectionType == ConnectionType.XSWD &&
            typeof data.result == "object" &&
            data.result != null &&
            "event" in data.result
          ) {
            const eventData = data as EventResponse;
            const eventType = eventData.result.event;
            const eventValue = eventData.result.value;

            if (this.subscriptions.events[eventType].enabled) {
              const callback = this.subscriptions.events[eventType].callback;
              if (callback !== undefined) callback(eventValue);

              this.subscriptions.events[eventType].waiting.forEach(
                (waitingChannel) => {
                  waitingChannel.send(eventValue);
                }
              );
              return;
            }
          }
          // normal response
          await this.response.send(data);
        }
      };

      websocket.onerror = (error) => {
        this.state[connectionType] = ConnectionState.Closed;
        reject(error);
      };

      websocket.onopen = () => {
        if (connectionType == ConnectionType.Fallback) {
          debug("fallback websocket connection opened.");
          resolve();
          this.state[connectionType] = ConnectionState.Accepted;
        } else {
          debug("xswd websocket connection opened, authorizing...");
          this.authorize(this.appInfo);
          this.state.xswd = ConnectionState.WaitingAuth;
          if (this.config.xswd.timeout?.AUTH_TIMEOUT) {
            setTimeout(
              () => reject("authorisation timeout"),
              this.config.xswd.timeout?.AUTH_TIMEOUT
            );
          }
        }
      };

      websocket.onclose = (ev) => {
        this.state[connectionType] = ConnectionState.Closed;
        this.connection[connectionType] = null;
        this.onclose(connectionType, ev);
        debug(connectionType + " connection closed");
        reject(connectionType + " connection closed");
      };

      debug(connectionType + " websocket handlers are set");
    }
  }

  // callback meant to be set by user
  onclose(connectionType: ConnectionType, ev: CloseEvent) {}

  async closeXSWD() {
    if (
      this.state.xswd == ConnectionState.Accepted ||
      this.state.xswd == ConnectionState.WaitingAuth
    ) {
      debug("closing xswd");
      this.connection.xswd?.close();
      this.state.xswd = ConnectionState.Closed;
    }
  }
  async closeFallback() {
    if (this.state.fallback == ConnectionState.Accepted) {
      debug("closing fallback");
      this.connection.fallback?.close();

      this.state.fallback = ConnectionState.Closed;
    }
  }

  async close() {
    this.closeFallback();
    this.closeXSWD();
  }

  async Send<E extends Entity, M extends Method<E>>( //! previously sendSync
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<E, M>, "id">
  ) {
    return new Promise<Response<E, M, "error"> | Response<E, M, "result">>(
      async (resolve, reject) => {
        if (this.mode == ConnectionType.Fallback && entity == "wallet") {
          reject("cannot send to wallet in fallback mode.");
        }

        debug("\n\n----------- REQUEST -------", entity, method, "\n");

        const websocket = this.connection[this.mode];

        if (this.state[this.mode] == ConnectionState.Accepted && websocket) {
          // assing id to the body
          const id = this.nextId;
          this.nextId += 1;
          const bodyWithId: JSONRPCRequestBody<typeof entity, typeof method> = {
            ...body,
            id,
          };

          /*this.config[this.mode]?.debug &&
            console.dir({ bodyWithId }, { depth: null });*/
          debug("sending", bodyWithId);

          // send data
          websocket.send(JSON.stringify(bodyWithId));

          // listen for the response
          for (;;) {
            const response = await this.response.recv();
            // if ids mismatch
            if (response.id != String(id)) {
              // send it back to the channel
              debug("id mismatch: ", response.id, String(id), ", resetting");
              await this.response.send(response);
              await sleep(CHECK_INTERVAL);
            } else {
              debug("id match");

              this.config[this.mode]?.debug &&
                console.dir({ response }, { depth: null });
              resolve(
                response as Response<E, M, "error"> | Response<E, M, "result">
              );
              return;
            }
          }
        } else {
          reject("sending without being connected");
          return;
        }
      }
    );
  }

  async subscribe({
    event,
    callback,
  }: {
    event: EventType;
    callback?: (value: any) => void;
  }) {
    if (
      this.state.xswd == ConnectionState.Accepted &&
      this.mode === ConnectionType.XSWD
    ) {
      const subscription = await this.Send("wallet", "Subscribe", {
        jsonrpc: "2.0",
        method: "Subscribe",
        params: { event },
      });
      if ("result" in subscription) {
        if (subscription.result) {
          this.subscriptions.events[event].enabled = true;
          this.subscriptions.events[event].callback = callback;
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
    if (this.mode == ConnectionType.Fallback) {
      throw "cannot wait for event in fallback mode";
    }

    if (!this.subscriptions.events[event].enabled) {
      throw `event ${event} has not been subscribed to`;
    }

    if (this.state.xswd == ConnectionState.Accepted) {
      const c = new Chan<any>();
      this.subscriptions.events[event].waiting.push(c);
      for (;;) {
        const value = await c.recv();
        if (predicate === undefined) {
          return value;
        } else if (predicate && predicate(value)) {
          return value;
        }
      }
    } else {
      throw "cannot wait for event if connection is not initialized";
    }
  }

  private authorize(appInfo: AppInfo) {
    const websocket = this.connection.xswd;
    if (websocket) {
      const data = { ...appInfo };
      debug("sending authorisation: ", { data });
      websocket.send(JSON.stringify(data));
    }
  }

  wallet = {
    _api: this as Api,

    async Echo(params: Echo) {
      return await this._api.Send("wallet", "Echo", {
        jsonrpc: "2.0",
        method: "Echo",
        params,
      });
    },
    async GetAddress() {
      return await this._api.Send("wallet", "GetAddress", {
        jsonrpc: "2.0",
        method: "GetAddress",
        params: undefined,
      });
    },
    async GetBalance(params: GetBalance = {}) {
      return await this._api.Send("wallet", "GetBalance", {
        jsonrpc: "2.0",
        method: "GetBalance",
        params,
      });
    },
    async GetHeight() {
      return await this._api.Send("wallet", "GetHeight", {
        jsonrpc: "2.0",
        method: "GetHeight",
        params: undefined,
      });
    },
    async GetTransferbyTXID(params: GetTransferbyTXID) {
      return await this._api.Send("wallet", "GetTransferbyTXID", {
        jsonrpc: "2.0",
        method: "GetTransferbyTXID",
        params,
      });
    },
    async GetTransfers(params: GetTransfers = {}) {
      return await this._api.Send("wallet", "GetTransfers", {
        jsonrpc: "2.0",
        method: "GetTransfers",
        params,
      });
    },

    async GetTrackedAssets(params: GetTrackedAssets) {
      return await this._api.Send("wallet", "GetTrackedAssets", {
        jsonrpc: "2.0",
        method: "GetTrackedAssets",
        params,
      });
    },

    async MakeIntegratedAddress(params: MakeIntegratedAddress) {
      return await this._api.Send("wallet", "MakeIntegratedAddress", {
        jsonrpc: "2.0",
        method: "MakeIntegratedAddress",
        params,
      });
    },
    async SplitIntegratedAddress(params: SplitIntegratedAddress) {
      return await this._api.Send("wallet", "SplitIntegratedAddress", {
        jsonrpc: "2.0",
        method: "SplitIntegratedAddress",
        params,
      });
    },
    async QueryKey(params: QueryKey) {
      return await this._api.Send("wallet", "QueryKey", {
        jsonrpc: "2.0",
        method: "QueryKey",
        params,
      });
    },
    async transfer(params: Transfer) {
      const response = await this._api.Send("wallet", "transfer", {
        jsonrpc: "2.0",
        method: "transfer",
        params,
      });
      return response;
    },
    async scinvoke(params: SCInvoke) {
      const response = await this._api.Send("wallet", "scinvoke", {
        jsonrpc: "2.0",
        method: "scinvoke",
        params,
      });

      if ("error" in response) {
        throw "could not scinvoke: " + response.error.message;
      }

      return response;
    },
  };
  node = {
    _api: this as Api,

    async Echo(params: Echo) {
      return await this._api.Send("daemon", "DERO.Echo", {
        jsonrpc: "2.0",
        method: "DERO.Echo",
        params,
      });
    },
    async Ping() {
      return await this._api.Send("daemon", "DERO.Ping", {
        jsonrpc: "2.0",
        method: "DERO.Ping",
        params: undefined,
      });
    },
    async GetInfo() {
      return await this._api.Send("daemon", "DERO.GetInfo", {
        jsonrpc: "2.0",
        method: "DERO.GetInfo",
        params: undefined,
      });
    },
    async GetBlock(params: DEROGetBlock) {
      return await this._api.Send("daemon", "DERO.GetBlock", {
        jsonrpc: "2.0",
        method: "DERO.GetBlock",
        params,
      });
    },
    async GetBlockHeaderByTopoHeight(params: DEROGetBlockHeaderByTopoHeight) {
      return await this._api.Send("daemon", "DERO.GetBlockHeaderByTopoHeight", {
        jsonrpc: "2.0",
        method: "DERO.GetBlockHeaderByTopoHeight",
        params,
      });
    },
    async GetBlockHeaderByHash(params: DEROGetBlockHeaderByHash) {
      return await this._api.Send("daemon", "DERO.GetBlockHeaderByHash", {
        jsonrpc: "2.0",
        method: "DERO.GetBlockHeaderByHash",
        params,
      });
    },
    async GetTxPool() {
      return await this._api.Send("daemon", "DERO.GetTxPool", {
        jsonrpc: "2.0",
        method: "DERO.GetTxPool",
        params: undefined,
      });
    },
    async GetRandomAddress(params: DEROGetRandomAddress = {}) {
      return await this._api.Send("daemon", "DERO.GetRandomAddress", {
        jsonrpc: "2.0",
        method: "DERO.GetRandomAddress",
        params,
      });
    },
    async GetTransaction(params: DEROGetTransaction) {
      return await this._api.Send("daemon", "DERO.GetTransaction", {
        jsonrpc: "2.0",
        method: "DERO.GetTransaction",
        params,
      });
    },
    /*async SendRawTransaction(params: DEROSendRawTransaction) {
      return await this._api.sendSync(
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
      return await this._api.Send("daemon", "DERO.GetHeight", {
        jsonrpc: "2.0",
        method: "DERO.GetHeight",
        params: undefined,
      });
    },
    async GetBlockCount() {
      return await this._api.Send("daemon", "DERO.GetBlockCount", {
        jsonrpc: "2.0",
        method: "DERO.GetBlockCount",
        params: undefined,
      });
    },
    async GetLastBlockHeader() {
      return await this._api.Send("daemon", "DERO.GetLastBlockHeader", {
        jsonrpc: "2.0",
        method: "DERO.GetLastBlockHeader",
        params: undefined,
      });
    },
    async GetBlockTemplate(params: DEROGetBlockTemplate) {
      return await this._api.Send("daemon", "DERO.GetBlockTemplate", {
        jsonrpc: "2.0",
        method: "DERO.GetBlockTemplate",
        params,
      });
    },
    async GetEncryptedBalance(params: DEROGetEncryptedBalance) {
      return await this._api.Send("daemon", "DERO.GetEncryptedBalance", {
        jsonrpc: "2.0",
        method: "DERO.GetEncryptedBalance",
        params,
      });
    },
    async GetSC(params: DEROGetSC, waitAfterNewBlock?: true) {
      if (waitAfterNewBlock) {
        debug("waiting for new block");
        this._api.subscribe({ event: "new_topoheight" });
        await this._api.waitFor("new_topoheight");
      }
      return await this._api.Send("daemon", "DERO.GetSC", {
        jsonrpc: "2.0",
        method: "DERO.GetSC",
        params,
      });
    },
    async GetGasEstimate(params: DEROGetGasEstimate) {
      // use gasEstimateSCArgs() to simplify usage
      return await this._api.Send("daemon", "DERO.GetGasEstimate", {
        jsonrpc: "2.0",
        method: "DERO.GetGasEstimate",
        params,
      });
    },
    async NameToAddress(params: DERONameToAddress) {
      return await this._api.Send("daemon", "DERO.NameToAddress", {
        jsonrpc: "2.0",
        method: "DERO.NameToAddress",
        params,
      });
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
