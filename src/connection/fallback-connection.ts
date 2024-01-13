import { Config } from "../types/types";

import { Method, JSONRPCRequestBody } from "../types/request";
import { Response } from "../types/response";
import { Entity } from "../types/types";
import { Connection, ConnectionState } from "./connection";
import makeDebug from "../debug";

let debug = makeDebug(false)("fallback-connection");

export class FallbackConnection extends Connection {
  buffer: string = "";

  constructor(config?: Config) {
    super();
    this.config = config || {};
    debug = makeDebug(config?.debug || false)("fallback-connection");
  }

  async initialize() {
    return new Promise<void>((resolve, reject) => {
      debug("initialize fallback");
      if (
        this.websocket !== undefined &&
        this.websocket.readyState == WebSocket.OPEN
      ) {
        throw "WebSocket is aleady alive";
      }
      this.state = ConnectionState.Initializing;

      const url = `ws://${this.config.ip}:${this.config.port}/ws`;
      this.websocket = new WebSocket(url);
      debug("websocket (fallback) created for " + url);

      this.websocket.onmessage = (message) => {
        let data:
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

        if ("error" in data) {
          const errorData: Response<Entity, Method<Entity>, "error"> = data;
          reject(errorData.error.message);
          this.handle(data);
        } else if ("result" in data) {
          this.handle(data);
        }
      };

      this.websocket.onerror = (error) => {
        this.state = ConnectionState.Closed;
        reject(error);
      };

      this.websocket.onopen = () => {
        debug("websocket (fallback) connection opened.");
        resolve();
        this.state = ConnectionState.Accepted;
      };

      this.websocket.onclose = () => {
        this.state = ConnectionState.Initializing;
        this.websocket = undefined;
        this.onclose();
        debug("fallback connection closed");
        reject("fallback connection closed");
      };

      debug("websocket (fallback) handlers are set");
    });
  }

  async sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<E, M>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">> {
    if (entity == "wallet") {
      throw "cannot sent to a wallet in fallback mode";
    }

    debug("sendSync (fallback):", { body });

    const id = this._send(entity, method, body);

    await this._checkResponse(id);
    const data = this.responses[id];

    debug("Response (fallback):");
    debug(data);

    delete this.responses[id];

    return data;
  }

  async close() {
    console.warn("closing fallback websocket", this.timeouts);

    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.websocket?.close();
  }

  onclose(): void {}

  //
  // Inactive methods
  //
}
