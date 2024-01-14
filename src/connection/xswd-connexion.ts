import { AppInfo, Config, Entity, EventType } from "../types/types";
import { Connection, ConnectionState } from "./connection";
import { sleep } from "../utils";
import makeDebug from "../debug";
import { AuthResponse, EventResponse, Response } from "../types/response";
import { JSONRPCRequestBody, Method } from "../types/request";

let debug = makeDebug(false)("xswd-connection");

export class XSWDConnection extends Connection {
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

  constructor(appInfo: AppInfo, config?: Config) {
    super();
    debug = makeDebug(config?.debug || false)("xswd-connection");
    this.appInfo = appInfo;

    this.config = {
      ip: "localhost",
      port: 44326,
      secure: false,
      ...(config || {}),
    };

    this.AUTH_TIMEOUT = config?.timeout?.AUTH_TIMEOUT || null;
    this.BLOCK_TIMEOUT = config?.timeout?.BLOCK_TIMEOUT || null;
    this.METHOD_TIMEOUT = config?.timeout?.METHOD_TIMEOUT || null;
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

      const protocol = this.config.secure ? "wss" : "ws";
      const url = `${protocol}://${this.config.ip}:${this.config.port}/xswd`;
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
        reject(error);
      };

      this.websocket.onopen = () => {
        debug("websocket connection opened, authorizing...");
        this.authorize(this.appInfo);
        this.state = ConnectionState.WaitingAuth;
        if (this.AUTH_TIMEOUT) {
          setTimeout(() => reject("authorisation timeout"), this.AUTH_TIMEOUT);
        }
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

  private handleEvent(data: EventResponse) {
    this.events[data.result.event].value = data.result.value;
    this.events[data.result.event].processed = false;
    const callback = this.events[data.result.event].callback;
    debug("Handling event", { data, callback });

    if (callback) {
      callback(data.result.value);
    }
  }

  async sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">> {
    debug("sendSync:", { body });

    const id = this._send(entity, method, body);

    await this._checkResponse(id);
    const data = this.responses[id];

    debug("Response:");
    debug(data);
    /*if ("result" in data) {
      if ("stringkeys" in data.result) {
        if ("C" in data.result.stringkeys) {
          debug({
            ...data,
            result: {
              ...data.result,
              stringkeys: { ...data.result.stringkeys, C: "..." },
            },
          });
          //delete data.result.stringkeys.C;
        }
      }
    }*/

    delete this.responses[id];

    return data;
  }

  // TODO Typing
  _checkEvent(
    eventType: EventType,
    predicate?: (eventValue: any) => boolean
  ): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      let timeout: any;
      if (this.BLOCK_TIMEOUT) {
        // setup a timeout for event checking
        timeout = setTimeout(() => {
          // delete the timeout record
          this.timeouts.delete(timeout);
          reject("event check timeout");
        }, this.BLOCK_TIMEOUT);

        // record this timeout (if we close we need to clear the handles)
        this.timeouts.add(timeout);
      }
      // loop over time to see if the event has been received
      for (let attempts = 1; ; attempts++) {
        await sleep(this.INTERVAL * attempts); // double the time at each new attempts
        debug("checking event", eventType);

        // if there is no predicate or this is the target
        if (predicate === undefined || predicate(this.events[eventType].value))
          if (!this.events[eventType].processed) {
            // if event hasn't already been processed
            // handle
            this.events[eventType].processed = true;
            debug("checked event", eventType);
            if (timeout !== undefined) {
              this.timeouts.delete(timeout);
            }
            resolve(this.events[eventType].value);
            break;
          }
      }
    });
  }
}
