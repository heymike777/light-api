import { SwapDex } from "../../entities/payments/Swap";
import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { BadRequestError } from "../../errors/BadRequestError";
import { PortfolioAsset } from "../../models/types";
import { kSolAddress } from "../../services/solana/Constants";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { Chain } from "../../services/solana/types";
import { LogManager } from "../LogManager";
import { TokenManager } from "../TokenManager";
import { TraderProfilesManager } from "../TraderProfilesManager";

export class ChainSolanaManager {

    static async getPortfolio(traderProfile: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], lpAssets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        const chain = Chain.SOLANA;

        const values: {
            walletAddress?: string,
            totalPrice: number,
            pnl?: number,
        } = {
            walletAddress: traderProfile?.encryptedWallet?.publicKey, 
            totalPrice: 0, 
        };

        const assets: PortfolioAsset[] = [];
        const lpAssets: PortfolioAsset[] = [];
        if (traderProfile){
            let walletAddress = traderProfile.encryptedWallet?.publicKey;
            if (!walletAddress){
                // That's impossible. All "light" trader profiles should have a wallet
                throw new BadRequestError('Wallet not found');
            }

            const assetsData = await SolanaManager.getAssetsByOwner(walletAddress);
            const tmpAssets = assetsData.assets;
            const lpTokens = assetsData.lpTokens;

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

            // for each lpToken in lpTokens, build lpAsset. Find info about token by lpMint, and calculate $ value of LP
            if (lpTokens.length > 0){
                const lpMints = lpTokens.map(a => a.lpMint);
                const tokens = await TokenManager.findTokensByLpMints(chain, lpMints);

                for (const token of tokens) {
                    const lpToken = lpTokens.find(a => a.lpMint == token.lpMint);
                    if (!lpToken){
                        continue;
                    }
                    const lpMintAddress = token.lpMint;
                    const lpMintSupply = lpToken.supply;
                    const lpMintBalance = lpToken.amount;
                    const lpMintDecimals = lpToken.decimals;

                    console.log(`lpTokens LP TOKEN (${token.symbol}): ${lpMintAddress}, supply: ${lpMintSupply}, balance: ${lpMintBalance}, decimals: ${lpMintDecimals}`);


                    const lpBalances = await TraderProfilesManager.fetchTokenLpMintBalance(chain, SwapDex.RAYDIUM_AMM, token.address, walletAddress);
                    let lpAmounts: {mint: string, uiAmount: number}[] | undefined = undefined;
                    let amount = 0;
                    const decimals = token.decimals || lpToken.decimals || 0;
                    const priceInfo = {
                        pricePerToken: token.price || 0,
                        totalPrice: 0, 
                    };


                    if (lpBalances && lpBalances.balances.length > 0){
                        const solBalance = lpBalances.balances.find(b => b.mint == kSolAddress);
                        const tokenBalance = lpBalances.balances.find(b => b.mint == token.address);
                        const usdValue = (tokenBalance?.uiAmount || 0) * (token.price || 0) + (solBalance?.uiAmount || 0) * TokenManager.getSolPrice();
                        totalPrice += usdValue;
                        amount = tokenBalance?.uiAmount || 0;

                        lpAmounts = [
                            {
                                mint: token.address,
                                uiAmount: tokenBalance?.uiAmount || 0,
                            },
                            {
                                mint: kSolAddress,
                                uiAmount: solBalance?.uiAmount || 0,
                            }
                        ];

                        priceInfo.totalPrice = usdValue;
                    }
                    else {
                        LogManager.log(`!message for ${token.symbol}`, 'lpBalances not found');
                    }

                    const pAsset: PortfolioAsset = {
                        address: token.address,

                        amount: amount,
                        uiAmount: amount / (10 ** decimals),
                        lpAmounts: lpAmounts,

                        decimals: decimals,
                        symbol: token.symbol || 'UNKNOWN',

                        name: token.name,
                        description: token.description,
                        logo: token.logo,
                        supply: +(token.supply || 0),

                        priceInfo: priceInfo,
                    };


                    pAsset.isVerified = token?.isVerified || false;
                    pAsset.isTradable = TokenManager.isTokenTradable(token?.address);
                    pAsset.tags = token?.tags || undefined;
                    pAsset.tagsList = token?.tagsList || [];
    
                    // const rand = Helpers.getRandomInt(1, 3);
                    // pAsset.pnl = rand == 1 ? 1234 : (rand == 2 ? -1234 : undefined);
                    lpAssets.push(pAsset);
                }

                //TODO: xxx
            }

            values.totalPrice = Math.round(totalPrice * 100) / 100;

            //TODO: calc PnL for this wallet (existing and OLD, which I've already sold)
            // values.pnl = 1000; 

            //TODO: calc PnL for each token in this wallet
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

        return { values, assets, lpAssets, warning };
    }

}