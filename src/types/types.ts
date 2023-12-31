export type Uint64 = number; // bigint ?
export type DVMString = string;
export type Hash = string;
export type SCCode = string;
export type Address = string;
export type DataType = "S" | "U" | "H";

export type Stringkeys = { [key: string]: number | string };

export type Entity = "wallet" | "daemon";

export type AppInfo = {
  //! security threat => token based communication (generated by wallet)
  id: string; //TODO
  name: string;
  description: string;
  url?: string;
};

export type EventType = "new_topoheight" | "new_entry" | "new_balance";
