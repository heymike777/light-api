import BN from "bn.js";
import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { BadRequestError } from "../../errors/BadRequestError";
import { PortfolioAsset } from "../../models/types";
import { getNativeToken, kSolAddress } from "../../services/solana/Constants";
import { newConnectionByChain } from "../../services/solana/lib/solana";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { Chain } from "../../services/solana/types";
import { LogManager } from "../LogManager";
import { TokenManager } from "../TokenManager";

//TODO: SVM

export interface SvmAsset {
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: BN;
}

export class ChainSvmManager {

    static async getPortfolio(chain: Chain, traderProfile: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], lpAssets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        const kSOL = getNativeToken(chain);
        const values: {
            walletAddress?: string,
            totalPrice: number,
            pnl?: number,
        } = {
            walletAddress: traderProfile?.encryptedWallet?.publicKey, 
            totalPrice: 0, 
        };

        const assets: PortfolioAsset[] = [];
        if (traderProfile){
            let walletAddress = traderProfile.encryptedWallet?.publicKey;
            if (!walletAddress){
                // That's impossible. All "light" trader profiles should have a wallet
                throw new BadRequestError('Wallet not found');
            }

            const assetsData = await this.getAssetsByOwner(chain, walletAddress);
            let totalPrice = 0;

            for (const tmpAsset of assetsData) {
                const amount = tmpAsset.balance.toNumber();
                const uiAmount = amount / (10 ** tmpAsset.decimals);

                const pAsset: PortfolioAsset = {
                    address: tmpAsset.mint,
                    symbol: tmpAsset.symbol,
                    name: tmpAsset.name,
                    decimals: tmpAsset.decimals,
                    uiAmount: uiAmount,
                    amount: amount,
                };
                pAsset.isTradable = TokenManager.isTokenTradable(tmpAsset.mint);
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

        const solAsset = assets.find(a => a.address == kSolAddress && a.symbol == kSOL.symbol);

        if (!solAsset || solAsset.uiAmount < 0.01){
            warning = {
                message: `Send some ${kSOL.symbol} to your trading wallet to ape into memes and cover gas fee.`,
                backgroundColor: '#DC3545',
                textColor: '#FFFFFF',
            }
        }

        return { values, assets, lpAssets: [], warning };
    }

    static async getAssetsByOwner(chain: Chain, walletAddress: string): Promise<SvmAsset[]> {
        try{
            const solBalance = await SolanaManager.getWalletSolBalance(chain, walletAddress);
            const balances = await SolanaManager.getWalletTokensBalances(chain, walletAddress);
            const kSOL = getNativeToken(chain);
            const tokens: SvmAsset[] = [];
            tokens.push({
                mint: kSolAddress,
                symbol: kSOL.symbol,
                name: kSOL.name,
                decimals: kSOL.decimals,
                balance: solBalance?.amount || new BN(0),
            });
            tokens.push(...balances.map((balance) => {
                return {
                    mint: balance.mint,
                    symbol: balance.symbol || balance.mint,
                    name: balance.name || balance.mint,
                    decimals: balance.balance.decimals || 0,
                    balance: balance.balance.amount,
                };
            }));

            return tokens;
        }
        catch (e){
            LogManager.error('getAssetsByOwner', e);
            return [];
        }
    }

}