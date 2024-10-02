import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { AuthManager } from "../../managers/AuthManager";

const router = express.Router();

router.post(
    '/api/v1/auth',
    [
        body('email').isEmail().withMessage('Email must be valid')
    ],
    validateRequest,
    async (req: Request, res: Response) => {
		const email = '' + req.body.email;

        const authId = await AuthManager.createAuth(email);

		const response = {
			id: authId
		};
	
		res.status(200).send(response);
    }
);

router.post(
    '/api/v1/auth/:requestId/validate',
    [
        body("code").notEmpty().withMessage('Invalid code'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const requestId = '' + req.params.requestId;
        const code = '' + req.body.code;

        const auth = await AuthManager.validate(requestId, code);
        const user = await AuthManager.findOrCreateUser(auth.email);
    
        const accessToken = AuthManager.createAccessToken(user);
        const jwtAccessToken = AuthManager.createJwtAccessToken(accessToken);
    
        const response = {
            accessToken: jwtAccessToken,
            user: user,
        }
    
        res.status(200).send(response);
    }
);

export { router as authRouter };
