import { IWallet, Wallet } from "../entities/Wallet";

export class WalletManager {

    static async addWallet(chatId: number, walletAddress: string, title?: string){
        const existingWallet = await Wallet.findOne({chatId: chatId, walletAddress: walletAddress});
        if (existingWallet){
            existingWallet.title = title;
            await existingWallet.save();
        }
        else {
            const wallet = new Wallet({
                chatId: chatId,
                walletAddress: walletAddress,
                title: title,
                isVerified: false,
                createdAt: new Date()
            });
            await wallet.save();    
        }
    }

    static async removeWallets(chatId: number, walletAddresses: string[]){
        await Wallet.deleteMany({chatId: chatId, walletAddress: {$in: walletAddresses}});
    }

    static async getWalletsByChatId(chatId: number): Promise<IWallet[]> {
        return Wallet.find({chatId: chatId});
    }

}