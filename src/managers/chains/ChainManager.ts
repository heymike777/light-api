import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { PortfolioAsset } from "../../models/types";
import { Chain, kChains } from "../../services/solana/types";
import { ChainSolanaManager } from "./ChainSolanaManager";
import { ChainSonicManager } from "./ChainSonicManager";
import { ChainSvmManager } from "./ChainSvmManager";

export class ChainManager {

    static getChainTitle(chain: Chain): string {
        const chainConfig = kChains[chain];
        if (chainConfig && chainConfig.title) {
            return chainConfig.title;
        }
        return 'Solana';
    }

    static getBridgeUrl(chain: Chain): string | undefined {
        const chainConfig = kChains[chain];
        return chainConfig?.bridge?.url;
    }

    static async getPortfolio(chain: Chain, traderProfile?: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], lpAssets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        if (!traderProfile){
            return { values: undefined, assets: [], lpAssets: [], warning: undefined };
        }

        if (chain == Chain.SOLANA){
            return await ChainSolanaManager.getPortfolio(traderProfile);
        }
        else if (chain == Chain.SONIC ){
            return await ChainSonicManager.getPortfolio(traderProfile);
        }
        else if (chain == Chain.SOON_MAINNET || chain == Chain.SVMBNB_MAINNET || chain == Chain.SOONBASE_MAINNET){
            return await ChainSvmManager.getPortfolio(chain, traderProfile);
        }

        return { values: undefined, assets: [], lpAssets: [], warning: undefined };
    }

}