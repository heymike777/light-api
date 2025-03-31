import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { BadRequestError } from "../../errors/BadRequestError";
import { PortfolioAsset } from "../../models/types";
import { kSolAddress } from "../../services/solana/Constants";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { Chain } from "../../services/solana/types";
import { LogManager } from "../LogManager";
import { TokenManager } from "../TokenManager";

export class ChainSonicManager {

    static async getPortfolio(traderProfile: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], lpAssets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        const chain = Chain.SOLANA;

        const values: {
            walletAddress?: string,
            totalPrice: number,
            pnl?: number,
        } = {
            walletAddress: traderProfile?.wallet?.publicKey, 
            totalPrice: 0, 
        };

        const assets: PortfolioAsset[] = [];
        if (traderProfile){
            let walletAddress = traderProfile.wallet?.publicKey;
            if (!walletAddress){
                // That's impossible. All "light" trader profiles should have a wallet
                throw new BadRequestError('Wallet not found');
            }

            const assetsData = await SolanaManager.getAssetsByOwner(walletAddress);
            const tmpAssets = assetsData.assets;

            const mints = tmpAssets.map(a => a.address);
            const tokens = await TokenManager.getTokens(chain, mints);
            let totalPrice = 0;

            for (const tmpAsset of tmpAssets) {
                const token = tokens.find(t => t.address == tmpAsset.address);
                LogManager.log('!token', token);

                const pAsset: PortfolioAsset = tmpAsset;
                pAsset.isVerified = token?.isVerified || false;
                pAsset.isTradable = TokenManager.isTokenTradable(token?.address);
                pAsset.tags = token?.tags || undefined;
                pAsset.tagsList = token?.tagsList || [];

                // const rand = Helpers.getRandomInt(1, 3);
                // pAsset.pnl = rand == 1 ? 1234 : (rand == 2 ? -1234 : undefined);
                assets.push(pAsset);

                totalPrice += pAsset.priceInfo?.totalPrice || 0;
            }

            values.totalPrice = Math.round(totalPrice * 100) / 100;

        }

        let warning: {
            message: string,
            backgroundColor: string,
            textColor: string,
        } | undefined = undefined;

        const solAsset = assets.find(a => a.address == kSolAddress && a.symbol == 'SOL');

        if (!solAsset || solAsset.uiAmount < 0.01){
            warning = {
                message: 'Send some SOL to your trading wallet to ape into memes and cover gas fee.',
                backgroundColor: '#DC3545',
                textColor: '#FFFFFF',
            }
        }

        return { values, assets, lpAssets: [], warning };
    }

}