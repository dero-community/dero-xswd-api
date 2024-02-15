# DERO XSWD Web API
Disclaimer: Be aware that this API is still under development and might change.
## Getting started

### Install

```sh
# Using npm
npm install dero-xswd-api
```
```sh
# Using yarn
yarn add dero-xswd-api
```

### Usage
#### Initialisation
##### Typescript
```ts
import { Api, AppInfo, generateAppId } from "dero-xswd-api";

// Define a name
const name = "My application";

// Fill up some info, these fields must be non-empty
const appInfo: AppInfo = {
  id: generateAppId(name), // generates a hash automatically
  name,
  description: "My app's description",
  url: "https://myapp.com" // Optional
};

// Create the api object
const xswd = new Api(appInfo);

// Initialize the connection => Will require to confirm in your wallet
await xswd.initializeXSWD();
```
##### Javascript
```js
import { Api, generateAppId } from "dero-xswd-api";

const name = "My application";

const appInfo = {
  id: generateAppId(name),
  name,
  description: "My app's description",
  url: "https://myapp.com" // Optional
};

const xswd = new Api(appInfo);

await xswd.initializeXSWD();
```

#### Using custom configuration and fallback node connection

```ts
// Refer to Config type in "src/types/types.ts"
const config /*: Config */= {
  address: "127.0.0.1",
  port: 40000, // example for simulator wallet using xswd
  secure: false, // uses "wss://" prefix (secure websocket) when true. Useful to connect to a remote node under an "https://" scheme.
  debug: true, // debug mode enabled. will print a lot of messages to console.
};

// fallback should point to a node so that blockchain data or SC data can be pulled even if the wallet is not connected
const fallback_config /*: Config */ = { 
  address: "127.0.0.1",
  port: 20000, // example for simulator node
  secure: false, 
  // debug attribute here will be ignored
}
      
const xswd = new Api(appInfo, config, fallback_config);

await xswd.initializeFallback();
await xswd.initializeXSWD(); // if this one succeeds, the fallback connection will be closed.

```

#### Handle closing websocket

If the websocket connection is closed, the `onclose` callback will be called.

```js
// set a handler for the websocket closing
xswd.onclose = function(connectionType/* : ConnectionType */, closeEvent /* : CloseEvent */) {
  if (connectionType == "xswd" /* connectionType == ConnectionType.XSWD */) {
    console.error("Connection was closed!", closeEvent)
  }
}
```

#### Calls

For daemon calls use: `xswd.node.<command>`

For wallet calls use: `xswd.wallet.<command>`

>*Note:* calls like `xswd.wallet.transfer` & `xswd.wallet.scinvoke` should wait for a *new_entry* event after the call using the `xswd.waitFor` method (examples below).
>Also, the `xswd.node.GetSC` has an optional parameter in order to wait for a new block before it fetches the data (using `waitFor` underneath).

##### Example (Typescript)
```ts
import { to, Result } from "dero-xswd-api";

// call GetHeight method
const response = await xswd.node.GetHeight()

// handle response
if ('result' in response) {
  console.log(resultResponse.result.topoheight)
}
if ('error' in response) {
  console.error(response.error.message)
}

// or using the "to" function to get error and result separately
const [error, result] = 
  to<"daemon", "DERO.GetHeight", Result>(response);
if (result !== undefined) {
  console.log(result.topoheight)
}
```

check [tests](tests/index.test.ts) file for more examples.

#### Events

##### Subscribe to an event (Typescript)

```ts
import { EventType } from "dero-xswd-api";

// let the api subscribe to the event 
// "new_topoheight" | "new_balance" | "new_entry"
const eventType: EventType = "new_topoheight" 

await xswd.subscribe({
  event: "new_topoheight", // "new_topoheight" | "new_balance" | "new_entry"
});

// once subscribed you can wait for this event
await xswd.waitFor("new_balance")

// add a predicate
await xswd.waitFor("new_topoheight", 
  (new_height) => new_height > 2394
)

// you can add a callback to the subscription
await xswd.subscribe({
  event: "new_balance",
  callback: (balance) => {
    console.log(balance);
  },
});
```

# Roadmap

- [x] base protocol
- [x] fallback to public daemon if connection failed (by default, can be disabled)
- [x] implement GetTrackedAssets
- [ ] implement new node GetSC methods