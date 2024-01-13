import { Method, JSONRPCRequestBody } from "../types/request";
import { Response } from "../types/response";
import { Config, Entity } from "../types/types";

import makeDebug from "../debug";
let debug = makeDebug(false)("connection");

import { sleep } from "../utils";

export enum ConnectionState {
  Initializing = "initializing",
  WaitingAuth = "waitingAuth",
  Accepted = "accepted",
  Refused = "refused",
  Closed = "closed",
}

export abstract class Connection {
  id = 1;
  AUTH_TIMEOUT: number | null = null;
  METHOD_TIMEOUT: number | null = null;
  BLOCK_TIMEOUT: number | null = null;
  INTERVAL = 100;

  websocket: WebSocket | undefined;
  config: Config;
  state = ConnectionState.Initializing;
  responses: { [id: number]: null | any } = {};
  timeouts: Set<any> = new Set();

  constructor(config?: Config) {
    this.config = config || {};
  }
  abstract initialize(): Promise<void>;
  abstract close(): void;
  abstract onclose(): void;

  abstract sendSync<E extends Entity, M extends Method<E>>(
    entity: E,
    method: M,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): Promise<Response<E, M, "error"> | Response<E, M, "result">>;

  protected handle(data: any) {
    this.responses[Number(data.id)] = data;
  }

  protected _checkResponse(id: number) {
    return new Promise<void>(async (resolve, reject) => {
      // setup a timeout for response checking
      let timeout: any;
      if (this.METHOD_TIMEOUT) {
        timeout = setTimeout(() => {
          // delete the timeout record
          this.timeouts.delete(timeout);
          reject("request timeout");
        }, this.METHOD_TIMEOUT);

        // record this timeout (if we close we need to clear the handles)
        this.timeouts.add(timeout);
      }
      // loop over time to see if the event has been received
      for (let attempts = 1; ; attempts++) {
        await sleep(this.INTERVAL * attempts); // double the time at each new attempts
        debug("checking response", id);

        // if event hasn't already been processed
        if (this.responses[id] !== null && this.responses[id] !== undefined) {
          // handle
          debug(`response ${id}`, this.responses[id]);
          if (timeout !== undefined) {
            this.timeouts.delete(timeout);
          }
          resolve();
          break;
        }
      }
    });
  }

  _send(
    entity: Entity,
    method: Method<typeof entity>,
    body: Omit<JSONRPCRequestBody<typeof entity, typeof method>, "id">
  ): number {
    debug("\n\n----------- REQUEST -------", entity, method, "\n");
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
}
