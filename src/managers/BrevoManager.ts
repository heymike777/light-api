import axios from "axios";

export interface BrevoContact {
    email: string;
}

export class BrevoManager {

    static baseUrl = 'https://api.brevo.com/v3';
    static allUsersListId = 10;

    static async createContact(contact: BrevoContact, listIds: number[] = [this.allUsersListId]): Promise<{brevoId: number} | undefined> {
        console.log(`Brevo createContact ${contact.email}`);
        
        const body = {
            email: contact.email,
            listIds: listIds,
        }

        try {
            const { data } = await axios({
                url: `${this.baseUrl}/contacts`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.BREVO_API_KEY
                },
                data: body
            });

            console.log(data);

            return data?.id ? {brevoId: data.id} : undefined;        
        }
        catch (e: any){
            console.error(e?.response?.data?.message);
        }

        return undefined;
    }


    static async sendAuthTransactionalEmail(email: string, code: string): Promise<{brevoId: number} | undefined> {
        console.log(`Brevo sendAuthTransactionalEmail: ${email} code: ${code}`);
        
        const body = {  
            "to":[  
               {  
                  "email":email,
               }
            ],
            "templateId": 11,
            "params":{  
               "code": code
            },
            "headers":{  
               "X-Mailin-custom":"custom_header_1:custom_value_1|custom_header_2:custom_value_2|custom_header_3:custom_value_3",
               "charset":"iso-8859-1"
            }
         }

        try {
            const { data } = await axios({
                url: `${this.baseUrl}/smtp/email`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.BREVO_API_KEY
                },
                data: body
            });

            console.log(data);

            return data?.id ? {brevoId: data.id} : undefined;        
        }
        catch (e: any){
            console.error(e?.response?.data?.message);
        }

        return undefined;
    }

}