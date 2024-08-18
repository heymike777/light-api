export interface Message {
    text: string;
}

export const kStartCommandReplyMessage: Message = {
    text: 'Hey, I am Nova! I can help you with:\n' + 
            '- wallet tracker\n' + 
            '- trade tokens\n' +
            '- sniper\n' +
            '- tokens price tracker\n' +
            '- portfolio\n' +
            '- alpha notifications'
};

export const kAddWalletReplyMessage: Message = {
    text: 'Send me each wallet address on a new line.\n\n' + 
            'You can assign a nickname to any wallet, add it after a space following the wallet address.\n\n' + 
            'For example:\n' +
            'WalletAddress1 Name1\n' +
            'WalletAddress2 Name2\n' +
            'WalletAddress3 Name3'
};