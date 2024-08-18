export interface Message {
    text: string;
}

export const kStartMessage: Message = {
    text: 'Hey, I am Nova! I can help you with:\n' + 
          '- wallet tracker\n' + 
          '- trade tokens\n' +
          '- sniper\n' +
          '- tokens price tracker\n' +
          '- portfolio\n' +
          '- alpha notifications'
};