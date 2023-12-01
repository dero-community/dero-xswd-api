import { Method, JSONRPCRequestBody } from "./types/request";
import { AuthResponse, EventResponse, Response } from "./types/response";
import { AppInfo, Entity, EventType } from "./types/types";

import makeDebug from "./debug";
import { sleep } from "./utils";
let debug = makeDebug(false)("connection");

export enum ConnectionState {
  Initializing = "initializing",
  WaitingAuth = "waitingAuth",
  Accepted = "accepted",
  Refused = "refused",
  Closed = "closed",
}

// TODO programmable timeouts
const AUTH_TIMEOUT = 40000;
const METHOD_TIMEOUT = 20000;
const BLOCK_TIMEOUT = 30000;
const INTERVAL = 100;

abstract class Connection {
  id = 1;
  constructor() {}
  abstract initialize(): Promise<void>;
  abstract close(): void;
  abstract onclose(): void;

  abstract sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">>;

  abstract _checkEvent(
    eventType: EventType,
    predicate?: (eventValue: any) => boolean
  ): Promise<any>;
}

class XSWDConnection extends Connection {
  websocket: WebSocket | undefined;
  ip: string;
  port: number;
  state = ConnectionState.Initializing;
  responses: { [id: number]: null | any } = {};
  events: {
    [eventType: EventType | string]: {
      processed: boolean;
      value: any;
      subscribed: false | "auto" | "permanent";
      callback?: (value: any) => void;
    };
  } = {
    new_topoheight: {
      processed: true,
      value: 0,
      subscribed: false,
    },
    new_balance: {
      processed: true,
      value: 0,
      subscribed: false,
    },
    new_entry: {
      processed: true,
      value: "",
      subscribed: false,
    },
  };
  appInfo: AppInfo;
  buffer: string = "";
  timeouts: Set<any> = new Set();

  constructor(
    appInfo: AppInfo,
    config?: { ip?: string; port?: number; debug?: boolean }
  ) {
    super();
    debug = makeDebug(config?.debug || false)("connection");
    this.appInfo = appInfo;

    this.ip = config?.ip || "localhost";
    this.port = config?.port || 44326;
  }
  async close() {
    console.warn("closing websocket", this.timeouts);

    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.websocket?.close();
  }

  onclose(): void {}

  async initialize() {
    return new Promise<void>((resolve, reject) => {
      debug("initialize");
      if (
        this.websocket !== undefined &&
        this.websocket.readyState == WebSocket.OPEN
      ) {
        throw "WebSocket is aleady alive";
      }
      this.state = ConnectionState.Initializing;

      const url = `ws://${this.ip}:${this.port}/xswd`;
      this.websocket = new WebSocket(url);
      debug("websocket created for " + url);

      this.websocket.onmessage = (message) => {
        let data:
          | AuthResponse
          | EventResponse
          | Response<Entity, Method<Entity>, "error">
          | Response<Entity, Method<Entity>, "result">;

        // fragmented messages handling
        try {
          // default parsing a single message
          data = JSON.parse(message.data.toString());
          debug("WebSocket:onmessage", { data });
        } catch (error) {
          // sometimes the result is split in multiple message so we need to buffer
          this.buffer = this.buffer + message.data.toString();
          try {
            // we keep parsing the buffer after updating it to check if the result is complete
            data = JSON.parse(this.buffer);
            // success => we empty the buffer
            this.buffer = "";
          } catch (error) {
            // not parsable yet, better luck next message
            return;
          }
        }

        if ("accepted" in data) {
          if (data.accepted === true) {
            this.state = ConnectionState.Accepted;
            debug("connection accepted");
            resolve();
          } else if (data.accepted === false) {
            this.state = ConnectionState.Refused;
            debug("connection refused", data);
            reject("connection refused: " + data.message);
          }
        } else if ("error" in data) {
          const errorData: Response<Entity, Method<Entity>, "error"> = data;
          console.error(errorData.error.message);
          reject(errorData.error.message);
          this.handle(data);
        } else if ("result" in data) {
          if (
            typeof data.result == "object" &&
            data.result !== null &&
            "event" in data.result
          ) {
            this.handleEvent(data as EventResponse);
          } else {
            this.handle(data);
          }
        }
      };

      this.websocket.onerror = (error) => {
        this.state = ConnectionState.Closed;
        console.error(error);
        reject(error);
      };

      this.websocket.onopen = () => {
        debug("websocket connection opened, authorizing...");
        this.authorize(this.appInfo);
        this.state = ConnectionState.WaitingAuth;
        setTimeout(() => reject("authorisation timeout"), AUTH_TIMEOUT);
      };

      this.websocket.onclose = () => {
        this.state = ConnectionState.Initializing;
        this.websocket = undefined;
        this.onclose();
        debug("connection closed");
        reject("connection closed");
      };

      debug("websocket handlers are set");
    });
  }

  private authorize(appInfo: AppInfo) {
    const data = { ...appInfo };
    debug("sending authorisation: ", { data });
    this.websocket?.send(JSON.stringify(data));
  }
  private handle(data: any) {
    this.responses[Number(data.id)] = data;
  }

  private handleEvent(data: EventResponse) {
    this.events[data.result.event].value = data.result.value;
    this.events[data.result.event].processed = false;
    const callback = this.events[data.result.event].callback;
    debug("Handling event", { data, callback });

    if (callback) {
      callback(data.result.value);
    }
  }

  private send(
    entity: Entity,
    method: Method<typeof entity>,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): number {
    console.log("\n\n----------- REQUEST -------", entity, method, "\n");
    if (this.state == ConnectionState.Accepted) {
      const id = this.id;
      this.id += 1;
      const bodyWithId: JSONRPCRequestBody<typeof entity, typeof method> = {
        ...body,
        id,
      };

      this.websocket?.send(JSON.stringify(bodyWithId));
      this.responses[id] = null;
      return id;
    } else {
      throw "sending without being connected";
    }
  }

  async sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">> {
    debug("sendSync:", { body });

    const id = this.send(entity, method, body);

    await this._checkResponse(id);
    const data = this.responses[id];

    console.log("Response:");
    console.log(data);

    delete this.responses[id];

    return data;
  }

  private _checkResponse(id: number) {
    return new Promise<void>(async (resolve, reject) => {
      // setup a timeout for response checking
      const timeout = setTimeout(() => {
        // delete the timeout record
        this.timeouts.delete(timeout);
        reject("request timeout");
      }, METHOD_TIMEOUT);

      // record this timeout (if we close we need to clear the handles)
      this.timeouts.add(timeout);

      // loop over time to see if the event has been received
      for (let attempts = 1; ; attempts++) {
        await sleep(INTERVAL * attempts); // double the time at each new attempts
        debug("checking response", id);

        // if event hasn't already been processed
        if (this.responses[id] !== null && this.responses[id] !== undefined) {
          // handle
          debug(`response ${id}`, this.responses[id]);
          this.timeouts.delete(timeout);
          resolve();
          break;
        }
      }
    });
  }

  // TODO Typing
  _checkEvent(
    eventType: EventType,
    predicate?: (eventValue: any) => boolean
  ): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      // setup a timeout for event checking
      const timeout = setTimeout(() => {
        // delete the timeout record
        this.timeouts.delete(timeout);
        reject("event check timeout");
      }, BLOCK_TIMEOUT);

      // record this timeout (if we close we need to clear the handles)
      this.timeouts.add(timeout);

      // loop over time to see if the event has been received
      for (let attempts = 1; ; attempts++) {
        await sleep(INTERVAL * attempts); // double the time at each new attempts
        debug("checking event", eventType);

        // if there is no predicate or this is the target
        if (predicate === undefined || predicate(this.events[eventType].value))
          if (!this.events[eventType].processed) {
            // if event hasn't already been processed
            // handle
            this.events[eventType].processed = true;
            debug("checked event", eventType);
            this.timeouts.delete(timeout);
            resolve(this.events[eventType].value);
            break;
          }
      }
    });
  }
}

class FallbackConnection extends Connection {
  url: string;
  events = {};

  constructor(url: string, config?: { debug?: boolean }) {
    super();
    debug = makeDebug(config?.debug || false)("connection");
    this.url = `${url}/json_rpc`;
  }

  async sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<E, M>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">> {
    const id = this.id++;
    const bodyWithId: JSONRPCRequestBody<Entity, Method<Entity>> = {
      ...body,
      id,
    };

    debug({ bodyWithId });
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyWithId),
    });

    const json = await response.json();

    debug({ response: json }); // TODO

    return json;
  }

  //
  // Inactive methods
  //

  initialize(): Promise<void> {
    throw "Connection.initialize() shall not be used in fallback mode";
  }
  close(): void {}
  onclose(): void {}
  send(
    entity: Entity,
    method: Method<Entity>,
    body: Omit<JSONRPCRequestBody<Entity, Method<Entity>>, "id">
  ): number {
    throw "Connection.send() shall not be used in fallback mode";
  }
  _checkEvent(
    eventType: EventType,
    predicate?: ((eventValue: any) => boolean) | undefined
  ): Promise<any> {
    throw "Connection._checkEvent() shall not be used in fallback mode";
  }
}

export { XSWDConnection, Connection, FallbackConnection };
