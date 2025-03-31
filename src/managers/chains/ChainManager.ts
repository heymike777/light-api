import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { PortfolioAsset } from "../../models/types";
import { Chain } from "../../services/solana/types";
import { ChainSolanaManager } from "./ChainSolanaManager";
import { ChainSonicManager } from "./ChainSonicManager";

export class ChainManager {

    static getChainTitle(chain: Chain): string {
        switch (chain) {
            case Chain.SOLANA:
                return 'Solana';
            case Chain.SONIC:
                return 'Sonic SVM';
            case Chain.SONIC_TESTNET:
                return 'Sonic SVM Testnet';
            default:
                return 'Solana';
        }
    }

    static async getPortfolio(chain: Chain, traderProfile?: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], lpAssets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        if (!traderProfile){
            return { values: undefined, assets: [], lpAssets: [], warning: undefined };
        }

        if (chain == Chain.SOLANA){
            return await ChainSolanaManager.getPortfolio(traderProfile);
        }
        else if (chain == Chain.SONIC){
            return await ChainSonicManager.getPortfolio(traderProfile);
        }

        return { values: undefined, assets: [], lpAssets: [], warning: undefined };
    }

}