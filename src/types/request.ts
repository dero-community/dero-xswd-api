import { DVMString, Entity, EventType, Hash, Uint64 } from "./types";

export type JSONRPCRequest = {
  method: "POST";
  headers: {
    "Content-Type": "application/json";
  };
  body: JSONRPCRequestBody<Entity, Method<Entity>>;
};

export type JSONRPCRequestBody<E extends Entity, M extends Method<E>> = {
  jsonrpc: "2.0";
  id: string | number;
  method: M;
  params: Params<E, M>;
};

export type Method<E extends Entity> = E extends "daemon"
  ?
      | "DERO.Echo"
      | "DERO.Ping"
      | "DERO.GetInfo"
      | "DERO.GetBlock"
      | "DERO.GetBlockHeaderByTopoHeight"
      | "DERO.GetBlockHeaderByHash"
      | "DERO.GetTxPool"
      | "DERO.GetRandomAddress"
      | "DERO.GetTransaction"
      | "DERO.SendRawTransaction"
      | "DERO.GetHeight"
      | "DERO.GetBlockCount"
      | "DERO.GetLastBlockHeader"
      | "DERO.GetBlockTemplate"
      | "DERO.GetEncryptedBalance"
      | "DERO.GetSC"
      | "DERO.GetGasEstimate"
      | "DERO.NameToAddress"
  :
      | "Echo"
      | "GetAddress"
      | "GetBalance"
      | "GetHeight"
      | "GetTransferbyTXID"
      | "GetTransfers"
      | "MakeIntegratedAddress"
      | "SplitIntegratedAddress"
      | "QueryKey"
      | "transfer"
      | "scinvoke"
      | "Subscribe";

export type Params<
  E extends Entity,
  M extends Method<E>
> = M extends "DERO.Echo"
  ? Echo
  : M extends "DERO.Ping"
  ? undefined
  : M extends "DERO.GetInfo"
  ? undefined
  : M extends "DERO.GetBlock"
  ? DEROGetBlock
  : M extends "DERO.GetBlockHeaderByTopoHeight"
  ? DEROGetBlockHeaderByTopoHeight
  : M extends "DERO.GetBlockHeaderByHash"
  ? DEROGetBlockHeaderByHash
  : M extends "DERO.GetTxPool"
  ? undefined
  : M extends "DERO.GetRandomAddress"
  ? DEROGetRandomAddress
  : M extends "DERO.GetTransaction"
  ? DEROGetTransaction
  : M extends "DERO.SendRawTransaction"
  ? DEROSendRawTransaction
  : M extends "DERO.GetHeight"
  ? undefined
  : M extends "DERO.GetBlockCount"
  ? undefined
  : M extends "DERO.GetLastBlockHeader"
  ? undefined
  : M extends "DERO.GetBlockTemplate"
  ? DEROGetBlockTemplate
  : M extends "DERO.GetEncryptedBalance"
  ? DEROGetEncryptedBalance
  : M extends "DERO.GetSC"
  ? DEROGetSC
  : M extends "DERO.GetGasEstimate"
  ? DEROGetGasEstimate
  : M extends "DERO.NameToAddress"
  ? DERONameToAddress
  : M extends "GetAddress"
  ? undefined
  : M extends "GetBalance"
  ? GetBalance
  : M extends "GetHeight"
  ? undefined
  : M extends "GetTransferbyTXID"
  ? GetTransferbyTXID
  : M extends "GetTransfers"
  ? GetTransfers
  : M extends "MakeIntegratedAddress"
  ? MakeIntegratedAddress
  : M extends "SplitIntegratedAddress"
  ? SplitIntegratedAddress
  : M extends "QueryKey"
  ? QueryKey
  : M extends "transfer"
  ? Transfer
  : M extends "scinvoke"
  ? SCInvoke
  : M extends "Subscribe"
  ? { event: EventType }
  : Echo;

export type Echo = DVMString[];

export type WalletTransfer = {
  amount?: Uint64;
  burn?: Uint64;
  destination?: string;
  scid?: Hash;
  payload_rpc?: Arguments;
};

type ArgumentType = Uint64 | DVMString | Hash;
type Argument<AT extends ArgumentType> = {
  name: DVMString;
  datatype: AT extends Uint64
    ? "U"
    : AT extends Hash | String
    ? "H" | "S"
    : unknown;
  value: AT;
};

type Arguments = Argument<ArgumentType>[];

export type DEROGetBlock = {
  hash?: Hash;
  height?: Uint64;
};

export type DEROGetBlockHeaderByTopoHeight = {
  topoheight: Uint64;
};

export type DEROGetBlockHeaderByHash = {
  hash: Hash;
};

export type DEROGetRandomAddress = {
  scid?: Hash;
};

export type DEROGetTransaction = {
  txs_hashes: Hash[];
  decode_as_json?: Uint64;
};

export type DEROSendRawTransaction = {
  tx_as_hex: DVMString;
};

export type DEROGetBlockTemplate = {
  wallet_address: DVMString;
  block?: boolean;
  miner?: DVMString;
};

export type DEROGetEncryptedBalance = {
  address: DVMString;
  topoheight: Uint64;
  scid?: Hash;
  treehash?: Hash;
};

export type DEROGetSC = {
  scid: Hash;
  code?: boolean;
  variables?: boolean;
  topoheight?: Uint64;
  keysuint64?: Uint64[];
  keysstring?: DVMString[];
  keysbytes?: Int8Array[];
};

export function gasEstimateSCArgs(
  scid: Hash,
  entrypoint: string,
  args: { name: string; value: DVMString | Uint64 }[]
): Argument<ArgumentType>[] {
  return [
    {
      name: "SC_ACTION",
      datatype: "U",
      value: 0,
    },
    {
      name: "SC_ID",
      datatype: "H",
      value: scid,
    },
    ...scinvokeSCArgs(entrypoint, args),
  ];
}

export function scinvokeSCArgs(
  entrypoint: string,
  args: { name: string; value: DVMString | Uint64 }[]
): Argument<ArgumentType>[] {
  const formattedArgs: Argument<ArgumentType>[] = args.map(
    ({ name, value }) => ({
      name,
      datatype: typeof value == "number" ? "U" : "S", //? bigint?
      value,
    })
  );
  return [
    {
      name: "entrypoint",
      datatype: "S",
      value: entrypoint,
    },
    ...formattedArgs,
  ];
}

export type DEROGetGasEstimate = {
  transfers?: WalletTransfer[];
  sc?: string;
  sc_rpc?: Argument<ArgumentType>[];
  signer?: string;
};

export type DERONameToAddress = {
  name: DVMString;
  topoheight: Uint64;
};

export type GetBalance = {
  scid?: Hash;
};

export type GetTransferbyTXID = {
  hash?: Hash;
  txid?: Hash;
};

export type GetTransfers = {
  scid?: Hash;
  coinbase?: boolean;
  in?: boolean;
  out?: boolean;
  min_height?: Uint64;
  max_height?: Uint64;
  sender?: DVMString;
  receiver?: DVMString;
  dstport?: Uint64;
  srcport?: Uint64;
};

export type MakeIntegratedAddress = {
  address?: DVMString;
  payload_rpc?: Argument<ArgumentType>;
};

export type SplitIntegratedAddress = {
  integrated_address: DVMString;
};

export type QueryKey = { key_type: "mnemonic" };

export type Transfer = {
  transfers?: WalletTransfer[];
  sc?: DVMString;
  sc_rpc?: Arguments;
  ringsize?: Uint64;
  scid?: DVMString;
  fees?: Uint64;
  signer?: DVMString;
};

export type SCInvoke = {
  scid: DVMString;
  sc_rpc: Arguments;

  sc_dero_deposit?: Uint64;
  sc_token_deposit?: Uint64;
  ringsize?: Uint64;
};
