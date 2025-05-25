import {
  ConfirmedSignaturesForAddress2Options,
  Connection,
  ConnectionConfig,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";
import { Chain, kChains } from "../../types";

export const maxSupportedTransactionVersion = 2;

export function newConnection(fixedRpc?: string): Connection {
  const config: ConnectionConfig = {};
  if (process.env.SOLANA_RPC_KEY_SECRET) {
    config.httpHeaders = { Authorization: process.env.SOLANA_RPC_KEY_SECRET };
  }

  const rpcHttp = fixedRpc || getRpc().http;
  return new Connection(rpcHttp, config);
}

export function newConnectionByChain(chain: Chain): Connection {
    const rpc = getRpc(chain);
    const config: ConnectionConfig = {
        commitment: 'confirmed',
        wsEndpoint: rpc.ws,
    };  
    return new Connection(rpc.http, config);
}

export function newConnectionForLandingTxs(chain: Chain): Connection {
    const rpc = getRpc(chain, true);
    const config: ConnectionConfig = {
        commitment: 'confirmed',
    };  
    return new Connection(rpc.http, config);
}

export function getRpc(chain?: Chain, isForLandingTxs = false): {http: string, ws: string} {
    if (chain && chain !== Chain.SOLANA) {
        return {
            http: kChains[chain].rpc,
            ws: kChains[chain].websocket,
        }
    }

    // SOLANA
    if (isForLandingTxs){
        return { http: process.env.HELIUS_STAKED_CONNECTIONS_URL || "", ws: '' };
    }
    return { http: process.env.SOLANA_RPC || "", ws: '' };
}

export function getSharedRpc(chain?: Chain): {http: string, ws: string} {
    if (!chain || chain == Chain.SOLANA){
        return { http: process.env.HELIUS_SHARED_RPC || "", ws: '' };
    }
    
    return getRpc(chain);
}

interface Opt extends ConfirmedSignaturesForAddress2Options {
  onTransaction?: (tx: ParsedTransactionWithMeta) => Promise<void>;
}

export async function fetchWeb3Transactions(
  conn: Connection,
  account: string,
  opt?: Opt
): Promise<ParsedTransactionWithMeta[] | null> {
  const signatures = await conn.getSignaturesForAddress(
    new PublicKey(account),
    {
      limit: opt?.limit,
      before: opt?.before,
      until: opt?.until,
    },
    "finalized"
  );

  if (signatures) {
    const txs: ParsedTransactionWithMeta[] = [];
    const oldestToLatest = signatures.reverse();

    for (let i = 0; i < oldestToLatest.length; i++) {
      const signature = oldestToLatest[i];
      const tx = await conn.getParsedTransaction(signature.signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion,
      });
      if (!tx) {
        continue;
      }
      opt?.onTransaction && (await opt.onTransaction(tx));

      txs.push(tx);
    }
    return txs;
  }
  return null;
}
