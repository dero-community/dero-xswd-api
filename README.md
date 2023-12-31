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
  id: await generateAppId(name), // generates a hash automatically
  name,
  description: "My app's description",
  url: "https://myapp.com" // Optional
};

// Create the api object
const xswd = new Api(appInfo);

// Initialize the connection => Will require to confirm in your wallet
await xswd.initialize();
```
##### Javascript
```js
/* Javascript */
import { Api, generateAppId } from "dero-xswd-api";

const name = "My application";

const appInfo = {
  id: await generateAppId(name),
  name,
  description: "My app's description",
};

const xswd = new Api(appInfo);

await xswd.initialize();
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