import * as GrammyTypes from "grammy/types";

export type BotKeyboardMarkup = GrammyTypes.InlineKeyboardMarkup;// | GrammyTypes.ReplyKeyboardMarkup | GrammyTypes.ReplyKeyboardRemove | GrammyTypes.ForceReply;

export interface SendMessageData {
    chatId: number;
    text?: string;
    imageUrl?: string;
    inlineKeyboard?: BotKeyboardMarkup;
}

export const kAdminUsernames = [
    'heymike777'
]

export interface TgMessage {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name?: string;
        last_name?: string;
        username?: string;
        language_code?: string;
        is_premium?: boolean;
    };
    chat: {
        id: number;
        first_name?: string;
        username?: string;
        type: string;
    };
    voice?: {
        duration: number;
        mime_type: string;
        file_id: string;
        file_unique_id: string;
        file_size: number;
    };
    document?: {
        file_id: string;
        file_unique_id: string;
        thumb: {
            file_id: string;
            file_unique_id: string;
            file_size: number;
            width: number;
            height: number;
        };
        thumbnail: {
            file_id: string;
            file_unique_id: string;
            file_size: number;
            width: number;
            height: number;
        };
        file_name: string;
        mime_type: string;
        file_size: number;
    };
    photo?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
    }[];
    date: number;
    text: string;
    entities: any[];
}

export interface InlineButton {
    id: string;
    text: string;
    link?: string;
}