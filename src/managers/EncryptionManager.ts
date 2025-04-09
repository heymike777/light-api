import crypto from 'crypto';
import { EncryptedWalletModel, WalletModel } from '../services/solana/types';

const algorithm = 'aes-256-gcm'; // Strong symmetric encryption
const ivLength = 12; // For GCM mode

export class EncryptionManager {

    static encryptPrivateKey(privateKey: string, encryptionKey: string): { encryptedData: string; iv: string; tag: string } {
        const iv = crypto.randomBytes(ivLength);
        const encryptionKeyBuffer = Buffer.from(encryptionKey, 'utf8');
        const cipher = crypto.createCipheriv(algorithm, encryptionKeyBuffer, iv);
        const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return {
          encryptedData: encrypted.toString('hex'),
          iv: iv.toString('hex'),
          tag: tag.toString('hex'),
        };
    }
      
    static decryptPrivateKey(encryptedData: string, iv: string, tag: string, encryptionKey: string): string {
        const encryptionKeyBuffer = Buffer.from(encryptionKey, 'utf8');
        const decipher = crypto.createDecipheriv(algorithm, encryptionKeyBuffer, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(encryptedData, 'hex')),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }

    static encryptWallet(wallet: WalletModel, encryptionKey: string): EncryptedWalletModel {
        const data = this.encryptPrivateKey(wallet.privateKey, encryptionKey);
        const encryptedWallet: EncryptedWalletModel = {
            publicKey: wallet.publicKey,
            data: data.encryptedData,
            iv: data.iv,
            tag: data.tag,
        };
        return encryptedWallet;
    }

}