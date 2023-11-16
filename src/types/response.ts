import { Method } from "./request";
import { DVMString, Entity, EventType, Hash, SCCode, Uint64 } from "./types";

export type Result = "error" | "result";

export type ErrorResponse = { message: string; code: number };

export type ResultResponse<E extends Entity, M extends Method<E>> = M extends
  | "DEROEcho"
  | "Echo"
  ? string[]
  : M extends "DERO.Ping"
  ? "Pong "
  : M extends "DERO.GetInfo"
  ? DEROGetInfoResult
  : M extends "DERO.GetBlock"
  ? DEROGetBlockResult
  : M extends "DERO.GetBlockHeaderByTopoHeight" | "DERO.GetBlockHeaderByHash"
  ? DEROGetBlockHeaderResult
  : M extends "DERO.GetTxPool"
  ? DEROGetTxPoolResult
  : M extends "DERO.GetRandomAddress"
  ? { address: string[]; status: "OK" }
  : M extends "DERO.GetTransaction"
  ? DEROGetTransactionResult
  : M extends "DERO.GetHeight"
  ? DEROGetHeightResult
  : M extends "DERO.GetBlockCount"
  ? DEROGetBlockCountResult
  : M extends "DERO.GetLastBlockHeader"
  ? DEROGetBlockResult
  : M extends "DERO.GetSC"
  ? DEROGetSCResult
  : M extends "DERO.GetGasEstimate"
  ? DEROGetGasEstimateResult
  : M extends "DERO.GetBlockTemplate"
  ? DEROGetBlockTemplateResult
  : M extends "DERO.GetEncryptedBalance"
  ? DEROGetEncryptedBalanceResult
  : M extends "DERO.NameToAddress"
  ? DERONameToAddressResult
  : M extends "GetAddress"
  ? { address: string }
  : M extends "GetBalance"
  ? GetBalanceResult
  : M extends "GetHeight"
  ? { height: Uint64 }
  : M extends "GetTransfers"
  ? GetTransfersResult
  : M extends "QueryKey"
  ? { key: string }
  : M extends "Subscribe"
  ? boolean
  : M extends "transfer" | "scinvoke"
  ? { txid: string }
  : M extends "GetTransferbyTXID"
  ? GetTransferByTXIDResult
  : unknown;

export type Response<
  E extends Entity,
  M extends Method<E>,
  R extends Result
> = {
  jsonrpc: "2.0";
  id: string;
} & (R extends "error"
  ? {
      error: ErrorResponse;
    }
  : {
      result: ResultResponse<E, M>;
    });

export type AuthResponse = {
  accepted: boolean;
  message: string;
};

export type EventResponse = {
  jsonrpc: "2.0";
  id: string;
  result: {
    event: EventType;
    value: any;
  };
};

type Network = "Simulator" | "Testnet" | "Mainnet";
type Status = { status: "OK" };

type DEROGetInfoResult = {
  alt_blocks_count: Uint64;
  difficulty: Uint64;
  grey_peerlist_size: number;
  height: Uint64;
  stableheight: Uint64;
  topoheight: Uint64;
  treehash: Hash;
  averageblocktime50: number;
  incoming_connections_count: number;
  outgoing_connections_count: number;
  target: number;
  target_height: Uint64;
  testnet: boolean;
  network: Network;
  top_block_hash: Hash;
  tx_count: number;
  tx_pool_size: number;
  dynamic_fee_per_kb: number;
  total_supply: number;
  median_block_size: number;
  white_peerlist_size: number;
  version: string;
  connected_miners: number;
  miniblocks_in_memory: number;
  blocks_count: number;
  miniblocks_accepted_count: number;
  miniblocks_rejected_count: number;
  mining_velocity: number;
  uptime: number;
  hashrate_1hr: number;
  hashrate_1d: number;
  hashrate_7d: number;
} & Status;

type DEROGetBlockResult = {
  blob: string;
  json: string;
  block_header: {
    depth: number;
    difficulty: string;
    hash: Hash;
    height: Uint64;
    topoheight: Uint64;
    major_version: number;
    minor_version: number;
    nonce: number;
    orphan_status: boolean;
    syncblock: boolean;
    sideblock: boolean;
    txcount: number;
    miners: null | unknown;
    reward: number;
    tips: null | unknown;
    timestamp: number;
  };
} & Status;

type DEROGetBlockHeaderResult = {
  block_header: {
    depth: Uint64;
    difficulty: string;
    hash: Hash;
    height: Uint64;
    topoheight: Uint64;
    major_version: number;
    minor_version: number;
    nonce: number;
    orphan_status: boolean;
    syncblock: boolean;
    sideblock: boolean;
    txcount: number;
    miners: null | unknown;
    reward: Uint64;
    tips: null | unknown;
    timestamp: number;
  };
} & Status;

type DEROGetTxPoolResult = {} & Status;

type DEROGetTransactionResult = {
  txs_as_hex: null;
  txs: null;
} & Status;

type DEROGetHeightResult = {
  height: Uint64;
  stableheight: Uint64;
  topoheight: Uint64;
} & Status;

type DEROGetBlockCountResult = { count: Uint64 } & Status;

type DERONameToAddressResult = {
  name: string;
  address: string;
} & Status;

type GetBalanceResult = { balance: Uint64; unlocked_balance: Uint64 };

export type Entry = {
  height: Uint64;
  topoheight: Uint64;
  blockhash: Hash;
  minerreward: number;
  tpos: number;
  pos: number;
  coinbase: boolean;
  incoming: boolean;
  txid: Hash;
  destination: string;
  amount: Uint64;
  fees: Uint64;
  proof: string;
  status: number;
  time: string;
  ewdata: string;
  data: string;
  payloadtype: number;
  payload: string;
  payload_rpc: {
    name: string;
    datatype: "S" | "U";
    value: DVMString | Uint64;
  }[];
  sender: string;
  dstport: number;
  srcport: number;
};

export type Topoheight = Uint64;
export type Balance = Uint64;

type GetTransfersResult = {
  entries: Entry[];
};

type GetTransferByTXIDResult = {
  entry: Entry;
  scid: Hash;
};

type DEROGetSCResult = {
  valuesuint64: DVMString[];
  valuesstring: DVMString[];
  valuesbytes: DVMString[];
  stringkeys: {
    C: SCCode;
    [k: string]: DVMString | Uint64;
  };
  uint64keys: {
    [k: Uint64]: DVMString | Uint64;
  };
  balances: {
    [scid: Hash]: Uint64;
  };
  balance: Uint64;
  code: DVMString;
} & Status;

type DEROGetGasEstimateResult = {
  gascompute: Uint64;
  gasstorage: Uint64;
} & Status;

type DEROGetBlockTemplateResult = {
  jobid: string;
  blocktemplate_blob: string;
  blockhashing_blob: string;
  difficulty: DVMString;
  difficultyuint64: Uint64;
  height: Uint64;
  prev_hash: Hash;
  epochmilli: number;
  blocks: Uint64;
  miniblocks: Uint64;
  rejected: Uint64;
  lasterror: string;
} & Status;

type DEROGetEncryptedBalanceResult = {
  scid: Hash;
  data: string;
  registration: Uint64;
  bits: number;
  height: Uint64;
  topoheight: Uint64;
  blockhash: Hash;
  treehash: Hash;
  dheight: Uint64;
  dtopoheight: Uint64;
  dtreehash: Hash;
} & Status;
